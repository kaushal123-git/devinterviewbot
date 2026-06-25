import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS for frontend dev server
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true
}));

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_FILE = path.join(__dirname, 'users.json');

// Memory storage for OTPs
const otps = new Map(); // email -> { code, expires }

// Helper: load users database
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data || '{}');
    }
  } catch (err) {
    console.error('Error reading users file:', err);
  }
  return {};
}

// Helper: save users database
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing users file:', err);
  }
}

// Route: Request OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 5 * 60 * 1000; // 5 minutes validity
  otps.set(email.toLowerCase(), { code, expires });

  console.log(`\n===========================================`);
  console.log(`[AUTH] Generating OTP for ${email}`);
  console.log(`[AUTH] Verification OTP Code: ${code}`);
  console.log(`===========================================\n`);

  let testMessageUrl = null;
  let sentWithGmail = false;

  try {
    const smtpEmail = process.env.SMTP_EMAIL;
    const smtpPassword = process.env.SMTP_PASSWORD;

    let transporter;

    if (smtpEmail && smtpPassword) {
      console.log('[Auth] Dispatching OTP via Gmail SMTP...');
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpEmail,
          pass: smtpPassword
        }
      });
      sentWithGmail = true;
    } else {
      console.log('[Auth] SMTP credentials not set. Bootstrapping Ethereal test inbox...');
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    }

    const mailOptions = {
      from: smtpEmail ? `"DevInterview AI" <${smtpEmail}>` : '"DevInterview AI Sandbox" <no-reply@devinterview.ai>',
      to: email,
      subject: 'Your DevInterview AI Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e4e7; border-radius: 8px; background-color: #ffffff; color: #18181b;">
          <h2 style="color: #09090b; border-bottom: 2px solid #27272a; padding-bottom: 10px;">DevInterview.AI Verification</h2>
          <p>Hello,</p>
          <p>Thank you for logging in to your DevInterview.AI learning session. Use the following verification code to authenticate your account:</p>
          <div style="margin: 24px 0; text-align: center;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 12px 24px; border: 1px dashed #a1a1aa; border-radius: 4px; background-color: #f4f4f5; display: inline-block;">${code}</span>
          </div>
          <p style="color: #71717a; font-size: 12px;">This code is valid for the next 5 minutes. If you did not request this code, please ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="font-size: 11px; color: #a1a1aa; text-align: center;">DevInterview.AI Workspace &bull; Sandbox Mode</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);

    if (!sentWithGmail) {
      testMessageUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[Auth] Ethereal Inbox Link: ${testMessageUrl}`);
    }

    return res.json({ 
      success: true, 
      message: 'OTP sent successfully.', 
      previewUrl: testMessageUrl,
      debugCode: code // send debug code for instant client integration in sandbox/testing
    });

  } catch (err) {
    console.error('[Auth] Failed to send email via SMTP:', err);
    // In local sandbox mode, return success with debugCode so the user is never blocked
    return res.json({ 
      success: true, 
      message: 'OTP dispatched (logged in server console).', 
      previewUrl: null,
      debugCode: code
    });
  }
});

// Route: Verify OTP and Login
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and OTP code are required.' });
  }

  const record = otps.get(email.toLowerCase());
  if (!record) {
    return res.status(400).json({ error: 'No OTP requested or session expired. Please request a new code.' });
  }

  if (Date.now() > record.expires) {
    otps.delete(email.toLowerCase());
    return res.status(400).json({ error: 'OTP code has expired. Please request a new one.' });
  }

  if (record.code !== code.trim()) {
    return res.status(400).json({ error: 'Invalid verification code. Please try again.' });
  }

  // OTP verified successfully
  otps.delete(email.toLowerCase());

  const users = loadUsers();
  const lowerEmail = email.toLowerCase();

  if (!users[lowerEmail]) {
    // Create new profile if it doesn't exist
    users[lowerEmail] = {
      email: lowerEmail,
      xp: 0,
      problemsSolved: 0,
      mockInterviews: 0,
      successRate: 0,
      languages: { python: 0, typescript: 0, c: 0, cpp: 0, java: 0 },
      activities: [
        {
          id: `welcome-${Date.now()}`,
          type: 'achievement',
          title: 'Account Activated',
          detail: 'Created new profile on DevInterview.AI',
          timestamp: Date.now()
        }
      ],
      savedCode: {}
    };
    saveUsers(users);
  }

  return res.json({
    success: true,
    user: users[lowerEmail]
  });
});

// Route: Get User Progress
app.get('/api/user/progress', (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: 'Email query parameter is required.' });
  }

  const users = loadUsers();
  const user = users[email.toString().toLowerCase()];

  if (!user) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  return res.json({ user });
});

// Route: Solve coding problem
app.post('/api/user/progress/solve', (req, res) => {
  const { email, problemId, language } = req.body;
  if (!email || !problemId || !language) {
    return res.status(400).json({ error: 'Missing required parameters: email, problemId, language' });
  }

  const users = loadUsers();
  const lowerEmail = email.toLowerCase();
  const user = users[lowerEmail];

  if (!user) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  // Friendly title mapping
  const titleMap = {
    'two-sum': 'Two Sum',
    'valid-palindrome': 'Valid Palindrome',
    'reverse-linked-list': 'Reverse Linked List',
    'valid-parentheses': 'Valid Parentheses',
    'merge-intervals': 'Merge Intervals'
  };
  const problemTitle = titleMap[problemId] || problemId;

  // Update statistics
  user.xp = (user.xp || 0) + 20;
  user.problemsSolved = (user.problemsSolved || 0) + 1;
  
  if (!user.languages) user.languages = { python: 0, typescript: 0, c: 0, cpp: 0, java: 0 };
  const cleanLangKey = language.toLowerCase();
  user.languages[cleanLangKey] = (user.languages[cleanLangKey] || 0) + 1;

  // Success rate formula (simulates realistic progress, scaling up towards 95%+)
  const baseSuccess = 85;
  const variance = Math.floor(Math.random() * 11); // 0-10
  user.successRate = Math.min(100, baseSuccess + variance);

  // Add recent activity
  user.activities.unshift({
    id: `solve-${Date.now()}`,
    type: 'solve',
    title: `Solved ${problemTitle}`,
    detail: `${language.charAt(0).toUpperCase() + language.slice(1)} - Easy`,
    timestamp: Date.now()
  });

  // Keep activity feed to max 20 entries
  if (user.activities.length > 20) {
    user.activities = user.activities.slice(0, 20);
  }

  saveUsers(users);

  return res.json({
    success: true,
    user
  });
});

// Route: Save code state
app.post('/api/user/save-state', (req, res) => {
  const { email, problemId, language, code } = req.body;
  if (!email || !problemId || !language) {
    return res.status(400).json({ error: 'Missing parameters to save state.' });
  }

  const users = loadUsers();
  const lowerEmail = email.toLowerCase();
  const user = users[lowerEmail];

  if (!user) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  if (!user.savedCode) user.savedCode = {};
  if (!user.savedCode[problemId]) user.savedCode[problemId] = {};
  
  user.savedCode[problemId][language] = code;
  saveUsers(users);

  return res.json({ success: true });
});

// Route: Load code state
app.get('/api/user/load-state', (req, res) => {
  const { email, problemId, language } = req.query;
  if (!email || !problemId || !language) {
    return res.status(400).json({ error: 'Missing parameters to load state.' });
  }

  const users = loadUsers();
  const lowerEmail = email.toString().toLowerCase();
  const user = users[lowerEmail];

  if (!user || !user.savedCode || !user.savedCode[problemId.toString()]) {
    return res.json({ code: null });
  }

  const code = user.savedCode[problemId.toString()][language.toString()] || null;
  return res.json({ code });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Express listening on http://0.0.0.0:${PORT}`);
});

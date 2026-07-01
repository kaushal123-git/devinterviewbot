import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

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

// Route: Check Email & password availability
app.post('/api/auth/check-email', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const users = loadUsers();
  const lowerEmail = email.toLowerCase();
  const user = users[lowerEmail];
  if (user) {
    return res.json({
      exists: true,
      hasPassword: !!user.passwordHash
    });
  }
  return res.json({
    exists: false,
    hasPassword: false
  });
});

// Route: Register / Set password
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const users = loadUsers();
  const lowerEmail = email.toLowerCase();
  let user = users[lowerEmail];

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const sessionToken = crypto.randomBytes(32).toString('hex');

  if (user) {
    if (user.passwordHash) {
      return res.status(400).json({ error: 'Account already exists with a password. Please sign in.' });
    }
    // Update existing OTP-created profile with password
    user.passwordHash = passwordHash;
    user.sessionToken = sessionToken;
  } else {
    // Create new profile
    users[lowerEmail] = {
      email: lowerEmail,
      passwordHash,
      sessionToken,
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
    user = users[lowerEmail];
  }

  saveUsers(users);

  // Return user without passwordHash
  const { passwordHash: _, ...safeUser } = user;
  return res.json({
    success: true,
    user: safeUser,
    sessionToken
  });
});

// Route: Login with password
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const users = loadUsers();
  const lowerEmail = email.toLowerCase();
  const user = users[lowerEmail];

  if (!user || !user.passwordHash) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  user.sessionToken = sessionToken;
  saveUsers(users);

  const { passwordHash: _, ...safeUser } = user;
  return res.json({
    success: true,
    user: safeUser,
    sessionToken
  });
});

// Route: Validate Session Token
app.post('/api/auth/validate-token', (req, res) => {
  const { sessionToken } = req.body;
  if (!sessionToken) {
    return res.status(400).json({ error: 'Token is required.' });
  }

  const users = loadUsers();
  // Find user by sessionToken
  const user = Object.values(users).find(u => u.sessionToken === sessionToken);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  const { passwordHash: _, ...safeUser } = user;
  return res.json({
    success: true,
    user: safeUser
  });
});

// Route: Logout
app.post('/api/auth/logout', (req, res) => {
  const { sessionToken } = req.body;
  if (sessionToken) {
    const users = loadUsers();
    const user = Object.values(users).find(u => u.sessionToken === sessionToken);
    if (user) {
      delete user.sessionToken;
      saveUsers(users);
    }
  }
  return res.json({ success: true });
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

// Route: Run code locally
app.post('/api/run-code', async (req, res) => {
  const { code, language } = req.body;
  if (!code || !language) {
    return res.status(400).json({ error: 'Missing code or language.' });
  }

  const tmpDir = os.tmpdir();
  const startTime = Date.now();

  // Language config: filename, compile cmd (optional), run cmd
  const configs = {
    python: {
      filename: 'main.py',
      compile: null,
      run: (f) => `python "${f}"`
    },
    typescript: {
      filename: 'main.ts',
      compile: null,
      run: (f) => `npx ts-node --skipProject "${f}"`
    },
    c: {
      filename: 'main.c',
      compile: (f, out) => `gcc "${f}" -o "${out}"`,
      run: (_, out) => `"${out}"`
    },
    cpp: {
      filename: 'main.cpp',
      compile: (f, out) => `g++ "${f}" -o "${out}"`,
      run: (_, out) => `"${out}"`
    },
    java: {
      filename: 'Main.java',
      compile: (f) => `javac "${f}"`,
      run: (f) => `java -cp "${path.dirname(f)}" Main`
    }
  };

  const cfg = configs[language];
  if (!cfg) {
    return res.status(400).json({ error: `Unsupported language: ${language}` });
  }

  // Write code to temp file
  const srcFile = path.join(tmpDir, `devint_${Date.now()}_${cfg.filename}`);
  const outFile = srcFile.replace(/\.[^.]+$/, process.platform === 'win32' ? '.exe' : '.out');

  try {
    fs.writeFileSync(srcFile, code, 'utf8');
  } catch (e) {
    return res.status(500).json({ error: 'Failed to write code to temp file.' });
  }

  const runCmd = (cmd) => new Promise((resolve) => {
    exec(cmd, { timeout: 10000, maxBuffer: 1024 * 512 }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || '', stderr: stderr || '', code: error?.code ?? 0 });
    });
  });

  try {
    let compileStderr = '';

    // Compile step (C, C++, Java)
    if (cfg.compile) {
      const compileCmd = cfg.compile(srcFile, outFile);
      const compileResult = await runCmd(compileCmd);
      if (compileResult.error && compileResult.code !== 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        cleanup(srcFile, outFile);
        return res.json({
          stdout: '',
          stderr: compileResult.stderr || compileResult.stdout,
          exitCode: compileResult.code ?? 1,
          time: `${elapsed}s`
        });
      }
      compileStderr = compileResult.stderr;
    }

    // Run step
    const runCommand = cfg.run(srcFile, outFile);
    const runResult = await runCmd(runCommand);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    cleanup(srcFile, outFile);
    return res.json({
      stdout: runResult.stdout,
      stderr: runResult.stderr || compileStderr,
      exitCode: runResult.error?.code ?? 0,
      time: `${elapsed}s`
    });

  } catch (err) {
    cleanup(srcFile, outFile);
    return res.status(500).json({ error: err.message || 'Execution failed.' });
  }
});

function cleanup(...files) {
  files.forEach(f => {
    try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Express listening on http://0.0.0.0:${PORT}`);
});

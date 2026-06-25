import React, { useState, useRef, useEffect } from 'react';
import { Mail, ShieldCheck, X, Loader2, ArrowRight } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (userData: any) => void;
}

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [otpCells, setOtpCells] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sandboxLink, setSandboxLink] = useState<string | null>(null);
  const [debugOtpCode, setDebugOtpCode] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first OTP cell when transition occurs
  useEffect(() => {
    if (step === 2 && inputRefs.current[0]) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  if (!isOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSandboxLink(null);
    setDebugOtpCode(null);

    try {
      const host = window.location.hostname;
      const apiHost = host === 'localhost' ? '127.0.0.1' : host;
      const res = await fetch(`http://${apiHost}:3002/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      if (data.success) {
        setStep(2);
        if (data.previewUrl) {
          setSandboxLink(data.previewUrl);
        }
        if (data.debugCode) {
          setDebugOtpCode(data.debugCode);
        }
      } else {
        setError(data.error || 'Failed to dispatch verification code.');
      }
    } catch (err) {
      setError('Cannot connect to authentication server. Make sure node server.js is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '').slice(-1);
    const newCells = [...otpCells];
    newCells[index] = cleaned;
    setOtpCells(newCells);

    // Auto-focus next cell
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpCells[index] && index > 0) {
      // Focus previous cell and clear it
      const newCells = [...otpCells];
      newCells[index - 1] = '';
      setOtpCells(newCells);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otpCells.join('');
    if (fullOtp.length < 6) {
      setError('Please enter all 6 digits of the OTP.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const host = window.location.hostname;
      const apiHost = host === 'localhost' ? '127.0.0.1' : host;
      const res = await fetch(`http://${apiHost}:3002/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: fullOtp })
      });
      const data = await res.json();

      if (data.success) {
        onLoginSuccess(data.user);
        onClose();
      } else {
        setError(data.error || 'Verification failed. Please try again.');
      }
    } catch (err) {
      setError('Connection error. Verification server unreachable.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md p-8 bg-panel/90 border border-subtle rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 transform scale-100 flex flex-col gap-6">
        
        {/* Glow decoration */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-secondary/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-subtle">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-secondary animate-pulse" />
            <span className="text-sm font-semibold tracking-wide text-primary">Verification Hub</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 hover:bg-subtle/30 rounded text-secondary hover:text-primary transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body content */}
        {step === 1 ? (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <div className="text-center py-2">
              <h3 className="text-lg font-medium text-primary">Login with Gmail</h3>
              <p className="text-xs text-secondary mt-1">We will send you a one-time verification password to confirm your profile.</p>
            </div>

            <div className="relative mt-2">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@gmail.com"
                className="w-full pl-10 pr-4 py-2.5 bg-app border border-subtle rounded-lg text-sm text-primary placeholder-secondary/50 focus:border-primary transition-all focus:ring-1 focus:ring-primary/20"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full py-2.5 bg-primary text-accent-contrast rounded-lg text-sm font-medium hover:bg-opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Send OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
            <div className="text-center py-2">
              <h3 className="text-lg font-medium text-primary">Verify Your Identity</h3>
              <p className="text-xs text-secondary mt-1">
                Enter the 6-digit OTP code sent to <br />
                <span className="font-semibold text-primary">{email}</span>
              </p>
            </div>

            {/* Digit Cells */}
            <div className="flex justify-between gap-2 py-2">
              {otpCells.map((val, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={val}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  maxLength={1}
                  className="w-12 h-14 bg-app border border-subtle rounded-lg text-center text-xl font-bold text-primary focus:border-primary transition-all focus:ring-2 focus:ring-primary/10"
                  disabled={isLoading}
                />
              ))}
            </div>



            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400">
                {error}
              </div>
            )}

            <div className="flex gap-3 mt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-2.5 border border-subtle text-secondary rounded-lg text-sm hover:text-primary transition-all hover:bg-subtle/10"
                disabled={isLoading}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-2.5 bg-primary text-accent-contrast rounded-lg text-sm font-medium hover:bg-opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Verify Code</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

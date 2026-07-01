import React, { useState } from 'react';
import { Mail, Lock, X, Loader2, ArrowRight, UserPlus, LogIn, ShieldAlert } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (userData: any, sessionToken: string) => void;
}

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [isNewUser, setIsNewUser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const getApiBase = () => {
    const host = window.location.hostname;
    const ip = host === 'localhost' ? '127.0.0.1' : host;
    return `http://${ip}:3002`;
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${getApiBase()}/api/auth/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      
      const data = await res.json();
      if (res.ok) {
        setIsNewUser(!data.exists || !data.hasPassword);
        setStep('password');
      } else {
        setError(data.error || 'Failed to check account state.');
      }
    } catch (err) {
      setError('Cannot connect to authentication server. Make sure `node server.js` is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const endpoint = isNewUser ? '/api/auth/register' : '/api/auth/login';

    try {
      const res = await fetch(`${getApiBase()}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        onLoginSuccess(data.user, data.sessionToken);
        onClose();
        // Reset state
        setEmail('');
        setPassword('');
        setStep('email');
      } else {
        setError(data.error || 'Authentication failed. Please try again.');
      }
    } catch (err) {
      setError('Connection error. Authentication server unreachable.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md p-8 bg-panel border border-subtle rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 transform scale-100 flex flex-col gap-6">
        
        {/* Glow decoration */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-[#6366F1]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-[#6366F1]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-subtle">
          <div className="flex items-center gap-2">
            {isNewUser && step === 'password' ? (
              <UserPlus className="w-5 h-5 text-[#6366F1]" />
            ) : (
              <LogIn className="w-5 h-5 text-[#6366F1]" />
            )}
            <span className="text-sm font-black tracking-wider uppercase text-primary">
              {step === 'email' ? 'Welcome Back' : isNewUser ? 'Create Account' : 'Sign In'}
            </span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 hover:bg-subtle/30 rounded text-secondary hover:text-primary transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body content */}
        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
            <div className="text-center py-1">
              <h3 className="text-lg font-bold text-primary tracking-tight">Login or Register</h3>
              <p className="text-xs text-secondary mt-1">Enter your email address to continue to your workspace.</p>
            </div>

            <div className="relative mt-2">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@gmail.com"
                className="w-full pl-11 pr-4 py-3 bg-app border border-subtle rounded-xl text-sm text-primary placeholder-secondary/40 focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10 transition-all outline-none"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs text-rose-400 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full py-3 bg-[#6366F1] hover:bg-[#5558e3] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#6366F1]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <div className="text-center py-1">
              <h3 className="text-lg font-bold text-primary tracking-tight">
                {isNewUser ? 'Set your password' : 'Enter your password'}
              </h3>
              <p className="text-xs text-secondary mt-1">
                {isNewUser 
                  ? 'Create a secure password (min 6 characters) to register.' 
                  : `Please enter the password for ${email}.`}
              </p>
            </div>

            <div className="relative mt-2">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-app border border-subtle rounded-xl text-sm text-primary placeholder-secondary/40 focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/10 transition-all outline-none"
                disabled={isLoading}
                autoFocus
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs text-rose-400 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setPassword('');
                  setError(null);
                }}
                className="flex-1 py-3 border border-subtle text-secondary rounded-xl text-sm font-semibold hover:text-primary transition-all hover:bg-subtle/10"
                disabled={isLoading}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-3 bg-[#6366F1] hover:bg-[#5558e3] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#6366F1]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>{isNewUser ? 'Register' : 'Sign In'}</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

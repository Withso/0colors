import { useState, useCallback } from 'react';
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import { getSupabaseClient, SERVER_BASE } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuth: (session: { accessToken: string; userId: string; email: string; name: string }) => void;
}

export function AuthModal({ isOpen, onClose, onAuth }: AuthModalProps) {
  if (!isOpen) return null;
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Call server to create user
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      const signupRes = await fetch(`${SERVER_BASE}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const signupData = await signupRes.json();
      if (!signupRes.ok) {
        setError(signupData.error || 'Sign up failed');
        setLoading(false);
        return;
      }

      // 2. Sign in to get session
      const supabase = getSupabaseClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !data?.session) {
        setError(`Account created but sign in failed: ${signInError?.message || 'Unknown error'}`);
        setLoading(false);
        return;
      }

      onAuth({
        accessToken: data.session.access_token,
        userId: data.session.user.id,
        email: email.trim(),
        name: name.trim() || email.split('@')[0],
      });
    } catch (e) {
      setError(`Network error during sign up: ${e}`);
      console.log(`Sign up error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [email, password, name, onAuth]);

  const handleSignIn = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const supabase = getSupabaseClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !data?.session) {
        setError(signInError?.message || 'Sign in failed');
        setLoading(false);
        return;
      }

      onAuth({
        accessToken: data.session.access_token,
        userId: data.session.user.id,
        email: email.trim(),
        name: data.session.user.user_metadata?.name || email.split('@')[0],
      });
    } catch (e) {
      setError(`Network error during sign in: ${e}`);
      console.log(`Sign in error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [email, password, onAuth]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup') handleSignUp();
    else handleSignIn();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-[380px] " style={{ animation: 'slideUp 0.2s ease-out' }}>
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(10px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}} />

        {/* Logo / Brand */}
        <div className="text-center mb-8 relative z-10">
          <h1 className="text-[28px] font-semibold text-white tracking-tight">
            0<span className="text-[#888]">colors</span>
          </h1>
          <p className="mt-2 text-[13px] text-[#555]">
            Design token color system
          </p>
        </div>

        {/* Auth Card */}
        <div
          className="rounded-2xl p-6 relative z-10 shadow-2xl"
          style={{
            background: '#111111',
            border: '1px solid #1e1e1e',
          }}
        >
          {/* Close button inside card (optional) */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full text-[#666] hover:text-white hover:bg-[#222] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          {/* Toggle */}
          <div
            className="flex rounded-lg mb-6 p-1"
            style={{ background: '#0a0a0a', border: '1px solid #1a1a1a' }}
          >
            <button
              onClick={() => { setMode('signin'); setError(''); }}
              className="flex-1 py-2 rounded-md text-[13px] font-medium transition-all duration-200"
              style={{
                background: mode === 'signin' ? '#1a1a1a' : 'transparent',
                color: mode === 'signin' ? '#e5e5e5' : '#555',
                border: mode === 'signin' ? '1px solid #282828' : '1px solid transparent',
              }}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className="flex-1 py-2 rounded-md text-[13px] font-medium transition-all duration-200"
              style={{
                background: mode === 'signup' ? '#1a1a1a' : 'transparent',
                color: mode === 'signup' ? '#e5e5e5' : '#555',
                border: mode === 'signup' ? '1px solid #282828' : '1px solid transparent',
              }}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: '#444' }}
                />
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg text-[13px] text-white placeholder-[#444] outline-none focus:ring-1 focus:ring-[#333] transition-all"
                  style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}
                />
              </div>
            )}

            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: '#444' }}
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg text-[13px] text-white placeholder-[#444] outline-none focus:ring-1 focus:ring-[#333] transition-all"
                style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}
                required
                autoComplete="email"
              />
            </div>

            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: '#444' }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg text-[13px] text-white placeholder-[#444] outline-none focus:ring-1 focus:ring-[#333] transition-all"
                style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>

            {error && (
              <div
                className="px-3 py-2 rounded-lg text-[12px]"
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200"
              style={{
                background: loading ? '#1a1a1a' : '#e5e5e5',
                color: loading ? '#555' : '#0a0a0a',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {mode === 'signup' ? 'Create account' : 'Sign in'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
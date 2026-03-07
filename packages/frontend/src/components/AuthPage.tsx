import { useState, useCallback, useEffect, useRef } from 'react';
import { Mail, Lock, User, ArrowRight, Loader2, X, KeyRound, CheckCircle2, MailCheck, RefreshCw } from 'lucide-react';
import { getSupabaseClient } from '../utils/supabase/client';

interface AuthPageProps {
  onAuth: (session: { accessToken: string; userId: string; email: string; name: string }) => void;
  onSkip: () => void;
}

type ViewMode = 'signin' | 'signup' | 'forgot' | 'reset-sent' | 'verify-email';

export function AuthPage({ onAuth, onSkip }: AuthPageProps) {
  const [mode, setMode] = useState<ViewMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // ── Countdown timer effect — ticks every second while cooldown > 0 ──
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown > 0]); // Only re-run when transitioning to/from active cooldown

  // ── Start cooldown when entering verify-email mode (email was just sent) ──
  useEffect(() => {
    if (mode === 'verify-email' && resendCooldown === 0) {
      setResendCooldown(60);
    }
  }, [mode]);

  // ── Escape key to close ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSkip]);

  // ── Sign Up ──
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
      // Use supabase.auth.signUp() directly — this triggers Supabase's
      // built-in email verification flow via the configured SMTP (ZeptoMail).
      // The old approach used admin.createUser() on the backend, which
      // creates users silently without sending verification emails.
      const supabase = getSupabaseClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim() || email.split('@')[0] },
          emailRedirectTo: window.location.origin,
        },
      });

      if (signUpError) {
        setError(signUpError.message || 'Sign up failed');
        setLoading(false);
        return;
      }

      // Detect "user already exists" — Supabase returns a fake success with
      // an empty identities array to prevent email enumeration. In that case,
      // signUp() does NOT send a verification email, so we must call resend().
      const userAlreadyExists = data.user && (!data.user.identities || data.user.identities.length === 0);

      if (userAlreadyExists) {
        console.log('[Auth] User already exists — calling resend() to trigger verification email');
        const { error: resendErr } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin },
        });
        if (resendErr) {
          console.log(`[Auth] resend() error: ${resendErr.message}`);
          // Don't block — still show verify screen, user can manually resend
        } else {
          console.log('[Auth] resend() succeeded — verification email should be sent via SMTP');
        }
        setMode('verify-email');
        setLoading(false);
        return;
      }

      // If email confirmation is enabled, signUp returns a user but no session.
      // The user needs to click the verification link in their email first.
      if (!data?.session) {
        setMode('verify-email');
        setLoading(false);
        return;
      }

      // If email confirmation is disabled (auto-confirmed), we get a session immediately
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

  // ── Sign In ──
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
        const msg = signInError?.message?.toLowerCase() || '';
        if (msg.includes('email not confirmed') || msg.includes('not confirmed') || msg.includes('confirm')) {
          // User exists but isn't verified — trigger a resend so they get an email
          console.log('[Auth] Sign in rejected: email not confirmed — auto-triggering resend()');
          const { error: resendErr } = await supabase.auth.resend({
            type: 'signup',
            email: email.trim(),
            options: { emailRedirectTo: window.location.origin },
          });
          if (resendErr) {
            console.log(`[Auth] resend() during sign-in error: ${resendErr.message}`);
          } else {
            console.log('[Auth] resend() during sign-in succeeded');
          }
          setMode('verify-email');
          setLoading(false);
          return;
        }
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

  // ── Forgot Password ──
  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) {
      setError('Enter your email address first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const supabase = getSupabaseClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });

      if (resetError) {
        setError(resetError.message || 'Failed to send reset email');
        setLoading(false);
        return;
      }

      setMode('reset-sent');
    } catch (e) {
      setError(`Network error: ${e}`);
      console.log(`Forgot password error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [email]);

  // Start a 60-second cooldown (Supabase rate-limits resend to 1 per 60s)
  const startCooldown = useCallback(() => {
    setResendCooldown(60);
  }, []);

  // ── Resend Verification Email ──
  const handleResendVerificationEmail = useCallback(async () => {
    if (!email.trim()) {
      setError('Enter your email address first');
      return;
    }
    if (resendCooldown > 0) return; // Still in cooldown

    setResending(true);
    setError('');

    try {
      const supabase = getSupabaseClient();
      console.log(`[Auth] Calling resend({ type: 'signup', email: '${email.trim()}' })`);
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (resendError) {
        console.log(`[Auth] resend error: ${resendError.message} (status: ${(resendError as any)?.status})`);
        // Supabase returns 429 for rate limiting
        if (resendError.message?.includes('rate') || resendError.message?.includes('429') || (resendError as any)?.status === 429) {
          setError('Please wait before requesting another email.');
          startCooldown();
        } else {
          setError(resendError.message || 'Failed to resend verification email');
        }
        setResending(false);
        return;
      }

      console.log('[Auth] resend() returned success');
      setResendSuccess(true);
      startCooldown(); // Start cooldown on success too
    } catch (e) {
      setError(`Network error: ${e}`);
      console.log(`Resend verification email error: ${e}`);
    } finally {
      setResending(false);
    }
  }, [email, resendCooldown, startCooldown]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup') handleSignUp();
    else if (mode === 'forgot') handleForgotPassword();
    else handleSignIn();
  };

  // ── Reusable success/confirmation screen ──
  const renderConfirmationScreen = (
    icon: React.ReactNode,
    title: string,
    description: string,
    actionLabel: string,
    onAction: () => void,
  ) => (
    <div className="px-6 pb-6 pt-5 text-center">
      <div className="flex justify-center mb-4">{icon}</div>
      <h3 className="text-[15px] font-semibold text-white mb-1.5">{title}</h3>
      <p className="text-[12px] text-[#555] leading-relaxed mb-5 max-w-[280px] mx-auto">{description}</p>
      <button
        onClick={onAction}
        className="w-full py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 cursor-pointer"
        style={{
          background: '#e5e5e5',
          color: '#0a0a0a',
          boxShadow: '0 2px 12px rgba(255,255,255,0.06)',
        }}
      >
        {actionLabel}
      </button>
    </div>
  );

  const isFormMode = mode === 'signin' || mode === 'signup' || mode === 'forgot';

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onSkip(); }}
      style={{
        background: mounted ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
        backdropFilter: mounted ? 'blur(12px)' : 'blur(0px)',
        WebkitBackdropFilter: mounted ? 'blur(12px)' : 'blur(0px)',
        transition: 'background 300ms ease, backdrop-filter 300ms ease',
      }}
    >
      {/* Popup card */}
      <div
        ref={cardRef}
        className="relative w-full max-w-[380px] mx-4"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          transition: 'opacity 280ms ease, transform 280ms ease',
        }}
      >
        {/* Glow ring */}
        <div
          className="absolute -inset-px rounded-[22px] pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(107,133,152,0.15) 0%, rgba(106,171,138,0.08) 50%, rgba(107,133,152,0.05) 100%)',
          }}
        />

        {/* Card body */}
        <div
          className="relative rounded-[21px] overflow-hidden"
          style={{
            background: '#111111',
            border: '1px solid #1e1e1e',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset',
          }}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-6 pt-5 pb-1">
            <div>
              <h2 className="text-[20px] font-semibold text-white tracking-tight">
                0<span className="text-[#555]">colors</span>
              </h2>
              <p className="text-[11px] text-[#444] mt-0.5">Design token color system</p>
            </div>
            <button
              onClick={onSkip}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#555] hover:text-[#aaa] hover:bg-[#1a1a1a] transition-all cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Reset link sent ── */}
          {mode === 'reset-sent' ? (
            renderConfirmationScreen(
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(106,171,138,0.1)', border: '1px solid rgba(106,171,138,0.15)' }}>
                <CheckCircle2 className="w-6 h-6 text-[#6aab8a]" />
              </div>,
              'Check your inbox',
              `We sent a password reset link to ${email}. Click the link in the email to set a new password.`,
              'Back to Sign in',
              () => { setMode('signin'); setError(''); },
            )

          /* ── Email verification notice ── */
          ) : mode === 'verify-email' ? (
            <div className="px-6 pb-6 pt-5 text-center">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(107,133,152,0.1)', border: '1px solid rgba(107,133,152,0.15)' }}>
                  <MailCheck className="w-6 h-6 text-[#6b8598]" />
                </div>
              </div>
              <h3 className="text-[15px] font-semibold text-white mb-1.5">Verify your email</h3>
              <p className="text-[12px] text-[#555] leading-relaxed mb-5 max-w-[280px] mx-auto">
                We sent a verification link to <span className="text-[#888]">{email}</span>. Please check your inbox (and spam folder) and click the link to activate your account.
              </p>

              {/* Error from resend */}
              {error && (
                <div
                  className="px-3 py-2 rounded-xl text-[12px] mb-3"
                  style={{ background: 'rgba(212, 114, 114, 0.08)', border: '1px solid rgba(212, 114, 114, 0.15)', color: '#d47272' }}
                >
                  {error}
                </div>
              )}

              {/* Resend button with cooldown */}
              <button
                onClick={() => { setResendSuccess(false); handleResendVerificationEmail(); }}
                disabled={resending || resendCooldown > 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 mb-3 cursor-pointer"
                style={{
                  background: resendSuccess ? 'rgba(106,171,138,0.1)' : 'rgba(107,133,152,0.08)',
                  color: resendSuccess ? '#6aab8a' : (resendCooldown > 0 ? '#555' : '#6b8598'),
                  border: resendSuccess ? '1px solid rgba(106,171,138,0.2)' : '1px solid rgba(107,133,152,0.15)',
                  cursor: (resending || resendCooldown > 0) ? 'not-allowed' : 'pointer',
                  opacity: (resendCooldown > 0 && !resendSuccess) ? 0.6 : 1,
                }}
              >
                {resending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : resendSuccess && resendCooldown > 0 ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Sent! Resend available in {resendCooldown}s
                  </>
                ) : resendCooldown > 0 ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Resend available in {resendCooldown}s
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Resend verification email
                  </>
                )}
              </button>

              {/* Already verified? Sign in directly */}
              <button
                onClick={() => { setMode('signin'); setError(''); setResendSuccess(false); setResendCooldown(0); }}
                className="w-full py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 mb-2 cursor-pointer"
                style={{
                  background: '#e5e5e5',
                  color: '#0a0a0a',
                  boxShadow: '0 2px 12px rgba(255,255,255,0.06)',
                }}
              >
                Already verified? Sign in
              </button>

              {/* Continue without account */}
              <div className="text-center mt-1">
                <button
                  onClick={onSkip}
                  className="text-[11px] text-[#3a3a3a] hover:text-[#666] transition-colors cursor-pointer"
                >
                  Continue without account
                </button>
              </div>
            </div>

          /* ── Form views (signin / signup / forgot) ── */
          ) : (
            <div className="px-6 pb-5 pt-4">
              {/* Toggle tabs — shown for signin/signup, hidden for forgot */}
              {mode !== 'forgot' ? (
                <div
                  className="flex rounded-xl mb-5 p-1"
                  style={{ background: '#0a0a0a', border: '1px solid #1a1a1a' }}
                >
                  <button
                    onClick={() => { setMode('signin'); setError(''); }}
                    className="flex-1 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer"
                    style={{
                      background: mode === 'signin' ? '#1a1a1a' : 'transparent',
                      color: mode === 'signin' ? '#e5e5e5' : '#505050',
                      border: mode === 'signin' ? '1px solid #282828' : '1px solid transparent',
                      boxShadow: mode === 'signin' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => { setMode('signup'); setError(''); }}
                    className="flex-1 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer"
                    style={{
                      background: mode === 'signup' ? '#1a1a1a' : 'transparent',
                      color: mode === 'signup' ? '#e5e5e5' : '#505050',
                      border: mode === 'signup' ? '1px solid #282828' : '1px solid transparent',
                      boxShadow: mode === 'signup' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                    }}
                  >
                    Sign up
                  </button>
                </div>
              ) : (
                /* Forgot password sub-header */
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <KeyRound className="w-4 h-4 text-[#6b8598]" />
                    <span className="text-[14px] font-medium text-white">Reset password</span>
                  </div>
                  <p className="text-[11px] text-[#555] leading-relaxed">
                    Enter your email and we'll send you a link to reset your password.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Name — signup only */}
                {mode === 'signup' && (
                  <div className="relative">
                    <User
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                      style={{ color: '#3a3a3a' }}
                    />
                    <input
                      type="text"
                      placeholder="Name (optional)"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3a] outline-none focus:ring-1 focus:ring-[#333] transition-all"
                      style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}
                    />
                  </div>
                )}

                {/* Email — always shown */}
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: '#3a3a3a' }}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3a] outline-none focus:ring-1 focus:ring-[#333] transition-all"
                    style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                {/* Password — hidden in forgot mode */}
                {mode !== 'forgot' && (
                  <div className="relative">
                    <Lock
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                      style={{ color: '#3a3a3a' }}
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3a] outline-none focus:ring-1 focus:ring-[#333] transition-all"
                      style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}
                      required
                      minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                  </div>
                )}

                {/* Forgot password link — sign in mode only */}
                {mode === 'signin' && (
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); }}
                      className="text-[11px] text-[#6b8598]/70 hover:text-[#6b8598] transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div
                    className="px-3 py-2 rounded-xl text-[12px]"
                    style={{ background: 'rgba(212, 114, 114, 0.08)', border: '1px solid rgba(212, 114, 114, 0.15)', color: '#d47272' }}
                  >
                    {error}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200"
                  style={{
                    background: loading ? '#1a1a1a' : '#e5e5e5',
                    color: loading ? '#555' : '#0a0a0a',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: loading ? 'none' : '0 2px 12px rgba(255,255,255,0.06)',
                  }}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Back to sign in — forgot mode only */}
              {mode === 'forgot' && (
                <div className="text-center mt-3">
                  <button
                    type="button"
                    onClick={() => { setMode('signin'); setError(''); }}
                    className="text-[11px] text-[#555] hover:text-[#888] transition-colors cursor-pointer"
                  >
                    Back to sign in
                  </button>
                </div>
              )}

              {/* Skip link */}
              <div className="text-center mt-4 pt-3" style={{ borderTop: '1px solid #1a1a1a' }}>
                <button
                  onClick={onSkip}
                  className="text-[11px] text-[#3a3a3a] hover:text-[#666] transition-colors cursor-pointer"
                >
                  Continue without account (local only)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
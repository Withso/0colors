import { useState, useCallback, useEffect, useRef } from 'react';
import { Mail, Lock, User, ArrowRight, Loader2, X, KeyRound, CheckCircle2, MailCheck, RefreshCw } from 'lucide-react';
import {
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
  resendVerification,
} from '@0zerosdesign/auth-client';
import { logger } from '../utils/logger';
import './AuthPage.css';

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
      const result = await signUpWithEmail(
        email.trim(),
        password,
        name.trim() || undefined,
        window.location.origin,
      );

      if (result.error) {
        setError(result.error || 'Sign up failed');
        setLoading(false);
        return;
      }

      // Supabase returns a fake success with an empty identities array for
      // already-registered emails. auth-client surfaces this as
      // userAlreadyExists and does NOT send a verification email on signup,
      // so we trigger resendVerification() explicitly.
      if (result.userAlreadyExists) {
        logger.debug('[Auth] User already exists — calling resendVerification()');
        const { error: resendErr } = await resendVerification(
          email.trim(),
          window.location.origin,
        );
        if (resendErr) {
          logger.debug(`[Auth] resendVerification error: ${resendErr}`);
          // Don't block — user can manually resend from the verify screen
        }
        setMode('verify-email');
        setLoading(false);
        return;
      }

      // Email confirmation enabled → go wait for the verification email.
      if (result.requiresVerification || !result.session) {
        setMode('verify-email');
        setLoading(false);
        return;
      }

      // Email confirmation disabled → session is already established.
      onAuth({
        accessToken: result.session.accessToken,
        userId: result.session.userId,
        email: result.session.email || email.trim(),
        name: result.session.name || name.trim() || email.split('@')[0],
      });
    } catch (e) {
      setError(`Network error during sign up: ${e}`);
      logger.debug(`Sign up error: ${e}`);
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
      const { session, error: signInError } = await signInWithEmail(
        email.trim(),
        password,
      );

      if (signInError || !session) {
        const msg = signInError?.toLowerCase() || '';
        if (msg.includes('email not confirmed') || msg.includes('not confirmed') || msg.includes('confirm')) {
          // User exists but isn't verified — trigger a resend so they get an email
          logger.debug('[Auth] Sign in rejected: email not confirmed — auto-triggering resendVerification()');
          await resendVerification(email.trim(), window.location.origin);
          setMode('verify-email');
          setLoading(false);
          return;
        }
        setError(signInError || 'Sign in failed');
        setLoading(false);
        return;
      }

      onAuth({
        accessToken: session.accessToken,
        userId: session.userId,
        email: session.email || email.trim(),
        name: session.name || email.split('@')[0],
      });
    } catch (e) {
      setError(`Network error during sign in: ${e}`);
      logger.debug(`Sign in error: ${e}`);
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
      const { error: resetError } = await resetPassword(
        email.trim(),
        window.location.origin,
      );

      if (resetError) {
        setError(resetError || 'Failed to send reset email');
        setLoading(false);
        return;
      }

      setMode('reset-sent');
    } catch (e) {
      setError(`Network error: ${e}`);
      logger.debug(`Forgot password error: ${e}`);
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
      logger.debug(`[Auth] Calling resendVerification for ${email.trim()}`);
      const { error: resendError } = await resendVerification(
        email.trim(),
        window.location.origin,
      );

      if (resendError) {
        logger.debug(`[Auth] resendVerification error: ${resendError}`);
        // Supabase returns "rate" / 429 for rate limiting
        if (resendError.includes('rate') || resendError.includes('429')) {
          setError('Please wait before requesting another email.');
          startCooldown();
        } else {
          setError(resendError || 'Failed to resend verification email');
        }
        setResending(false);
        return;
      }

      logger.debug('[Auth] resendVerification succeeded');
      setResendSuccess(true);
      startCooldown(); // Start cooldown on success too
    } catch (e) {
      setError(`Network error: ${e}`);
      logger.debug(`Resend verification email error: ${e}`);
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
    <div className="auth-confirmation">
      <div className="auth-confirmation-icon-wrap">{icon}</div>
      <h3 className="auth-confirmation-title">{title}</h3>
      <p className="auth-confirmation-desc">{description}</p>
      <button onClick={onAction} className="auth-action-btn" data-testid="auth-confirmation-action-button">
        {actionLabel}
      </button>
    </div>
  );

  const isFormMode = mode === 'signin' || mode === 'signup' || mode === 'forgot';

  return (
    <div
      className="auth-overlay"
      data-testid="auth-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onSkip(); }}
      style={{
        background: mounted
          ? 'var(--surface-overlay)'
          : 'transparent',
        backdropFilter: mounted ? 'blur(12px)' : 'blur(0px)',
        WebkitBackdropFilter: mounted ? 'blur(12px)' : 'blur(0px)',
        transition: 'background 300ms ease, backdrop-filter 300ms ease',
      }}
    >
      {/* Popup card */}
      <div
        ref={cardRef}
        className="auth-card-wrapper"
        data-testid="auth-modal-card"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          transition: 'opacity 280ms ease, transform 280ms ease',
        }}
      >
        {/* Glow ring */}
        <div
          className="auth-glow-ring"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 15%, transparent) 0%, color-mix(in srgb, var(--status-success) 8%, transparent) 50%, color-mix(in srgb, var(--accent-primary) 5%, transparent) 100%)',
          }}
        />

        {/* Card body */}
        <div className="auth-card" data-testid="auth-modal-content">
          {/* Header with close button */}
          <div className="auth-header">
            <div className="auth-header-info">
              <h2 className="auth-brand-title">
                0<span className="auth-brand-title-dim">colors</span>
              </h2>
              <p className="auth-brand-subtitle">Design token color system</p>
            </div>
            <button onClick={onSkip} className="auth-close-btn" title="Close (Esc)" data-testid="auth-close-button">
              <X className="auth-close-btn-icon" />
            </button>
          </div>

          {/* ── Reset link sent ── */}
          {mode === 'reset-sent' ? (
            renderConfirmationScreen(
              <div className="auth-confirmation-icon-box auth-confirmation-icon-box-success">
                <CheckCircle2 className="auth-confirmation-icon-success" />
              </div>,
              'Check your inbox',
              `We sent a password reset link to ${email}. Click the link in the email to set a new password.`,
              'Back to Sign in',
              () => { setMode('signin'); setError(''); },
            )

          /* ── Email verification notice ── */
          ) : mode === 'verify-email' ? (
            <div className="auth-verify">
              <div className="auth-verify-icon-wrap">
                <div className="auth-confirmation-icon-box auth-confirmation-icon-box-brand">
                  <MailCheck className="auth-confirmation-icon-brand" />
                </div>
              </div>
              <h3 className="auth-verify-title">Verify your email</h3>
              <p className="auth-verify-desc">
                We sent a verification link to <span className="auth-verify-email-highlight">{email}</span>. Please check your inbox (and spam folder) and click the link to activate your account.
              </p>

              {/* Error from resend */}
              {error && (
                <div className="auth-error auth-error-verify">
                  {error}
                </div>
              )}

              {/* Resend button with cooldown */}
              <button
                onClick={() => { setResendSuccess(false); handleResendVerificationEmail(); }}
                disabled={resending || resendCooldown > 0}
                className="auth-resend-btn"
                data-testid="auth-resend-verification-button"
                style={{
                  background: resendSuccess ? 'var(--surface-success-subtle)' : 'var(--surface-info-subtle)',
                  color: resendSuccess ? 'var(--text-success)' : (resendCooldown > 0 ? 'var(--text-disabled)' : 'var(--text-info)'),
                  opacity: (resendCooldown > 0 && !resendSuccess) ? 0.6 : 1,
                }}
              >
                {resending ? (
                  <Loader2 className="auth-resend-btn-icon-spin" />
                ) : resendSuccess && resendCooldown > 0 ? (
                  <>
                    <CheckCircle2 className="auth-resend-btn-icon" />
                    Sent! Resend available in {resendCooldown}s
                  </>
                ) : resendCooldown > 0 ? (
                  <>
                    <RefreshCw className="auth-resend-btn-icon" />
                    Resend available in {resendCooldown}s
                  </>
                ) : (
                  <>
                    <RefreshCw className="auth-resend-btn-icon" />
                    Resend verification email
                  </>
                )}
              </button>

              {/* Already verified? Sign in directly */}
              <button
                onClick={() => { setMode('signin'); setError(''); setResendSuccess(false); setResendCooldown(0); }}
                className="auth-verified-signin-btn"
                data-testid="auth-already-verified-button"
              >
                Already verified? Sign in
              </button>

              {/* Continue without account */}
              <div className="auth-skip-wrap">
                <button onClick={onSkip} className="auth-skip-btn" data-testid="auth-skip-button">
                  Continue without account
                </button>
              </div>
            </div>

          /* ── Form views (signin / signup / forgot) ── */
          ) : (
            <div className="auth-form-container">
              {/* Toggle tabs — shown for signin/signup, hidden for forgot */}
              {mode !== 'forgot' ? (
                <div className="auth-tabs">
                  <button
                    onClick={() => { setMode('signin'); setError(''); }}
                    className={`auth-tab${mode === 'signin' ? ' auth-tab--selected' : ''}`}
                    data-testid="auth-tab-signin"
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => { setMode('signup'); setError(''); }}
                    className={`auth-tab${mode === 'signup' ? ' auth-tab--selected' : ''}`}
                    data-testid="auth-tab-signup"
                  >
                    Sign up
                  </button>
                </div>
              ) : (
                /* Forgot password sub-header */
                <div className="auth-forgot-header">
                  <div className="auth-forgot-header-row">
                    <KeyRound className="auth-forgot-header-icon" />
                    <span className="auth-forgot-header-title">Reset password</span>
                  </div>
                  <p className="auth-forgot-header-desc">
                    Enter your email and we'll send you a link to reset your password.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="auth-form">
                {/* Name — signup only */}
                {mode === 'signup' && (
                  <div className="auth-field">
                    <User className="auth-field-icon" />
                    <input
                      type="text"
                      placeholder="Name (optional)"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="auth-input"
                      data-testid="auth-input-name"
                    />
                  </div>
                )}

                {/* Email — always shown */}
                <div className="auth-field">
                  <Mail className="auth-field-icon" />
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="auth-input"
                    required
                    autoComplete="email"
                    autoFocus
                    data-testid="auth-input-email"
                  />
                </div>

                {/* Password — hidden in forgot mode */}
                {mode !== 'forgot' && (
                  <div className="auth-field">
                    <Lock className="auth-field-icon" />
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="auth-input"
                      required
                      minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      data-testid="auth-input-password"
                    />
                  </div>
                )}

                {/* Forgot password link — sign in mode only */}
                {mode === 'signin' && (
                  <div className="auth-forgot-link-wrap">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); }}
                      className="auth-forgot-link"
                      data-testid="auth-forgot-password-link"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div className="auth-error">
                    {error}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                className="auth-submit-btn"
                data-testid="auth-submit-button"
                style={{
                    background: loading ? 'var(--surface-3)' : 'var(--on-surface-1)',
                    color: loading ? 'var(--text-disabled)' : 'var(--on-surface-inverse)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? (
                    <Loader2 className="auth-submit-btn-spinner" />
                  ) : (
                    <>
                      {mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
                      <ArrowRight className="auth-submit-btn-icon" />
                    </>
                  )}
                </button>
              </form>

              {/* Back to sign in — forgot mode only */}
              {mode === 'forgot' && (
                <div className="auth-back-link-wrap">
                  <button
                    type="button"
                    onClick={() => { setMode('signin'); setError(''); }}
                    className="auth-back-link"
                  >
                    Back to sign in
                  </button>
                </div>
              )}

              {/* Skip link */}
              <div className="auth-footer">
                <button onClick={onSkip} className="auth-footer-skip-btn" data-testid="auth-footer-skip-button">
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

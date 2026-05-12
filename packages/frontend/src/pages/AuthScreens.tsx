// ============================================================================
// Local auth screens: setup wizard, login, accept-invite.
//
// Each screen is a self-contained page that renders OUTSIDE the AppShell (so
// useAuthBridge doesn't run for these routes). All three share a small card
// layout from auth-screens.css.
// ============================================================================

import { useEffect, useState, FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useStore } from '../store';
import {
  setupAdmin, login, signup, getSignupStatus, lookupInvite, acceptInvite,
  type AuthedUser, type InviteLookup,
} from '../api/auth';
import './auth-screens.css';

// ── Shared helpers ───────────────────────────────────────────────────────────

function applyAuthSession(setAuthSession: (s: any) => void, user: AuthedUser) {
  setAuthSession({
    accessToken: '', // session lives in HttpOnly cookie now
    userId: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    isTemplateAdmin: user.isAdmin,
  });
}

function PasswordField(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="auth-field-row">
      <input
        type={show ? 'text' : 'password'}
        className="auth-input"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder ?? 'Password'}
        minLength={props.minLength ?? 8}
        autoComplete={props.autoComplete}
        required
      />
      <button
        type="button"
        className="auth-input-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

// ── Setup wizard (first-run) ─────────────────────────────────────────────────

export function SetupScreen() {
  const navigate = useNavigate();
  const setAuthSession = useStore((s) => s.setAuthSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const user = await setupAdmin({ email, password, name });
      applyAuthSession(setAuthSession, user);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">0<span className="auth-brand-dim">colors</span></div>
        <h1 className="auth-title">Welcome</h1>
        <p className="auth-subtitle">
          You're the first to set up this install. Create your admin account to continue.
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label className="auth-label">
            Your name
            <input
              type="text"
              className="auth-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              autoFocus
            />
          </label>
          <label className="auth-label">
            Email
            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="auth-label">
            Password
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>
          <label className="auth-label">
            Confirm password
            <PasswordField
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create admin account'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Login ────────────────────────────────────────────────────────────────────

export function LoginScreen() {
  const navigate = useNavigate();
  const setAuthSession = useStore((s) => s.setAuthSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupAllowed, setSignupAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSignupStatus().then((status) => {
      if (!cancelled) setSignupAllowed(status.allowPublicSignup);
    });
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      applyAuthSession(setAuthSession, user);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">0<span className="auth-brand-dim">colors</span></div>
        <h1 className="auth-title">Sign in</h1>
        <form onSubmit={onSubmit} className="auth-form">
          <label className="auth-label">
            Email
            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </label>
          <label className="auth-label">
            Password
            <PasswordField
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          {signupAllowed && (
            <p className="auth-altlink">
              Don't have an account? <Link to="/signup">Sign up</Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

// ── Public signup ────────────────────────────────────────────────────────────

export function SignupScreen() {
  const navigate = useNavigate();
  const setAuthSession = useStore((s) => s.setAuthSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupAllowed, setSignupAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSignupStatus().then((status) => {
      if (cancelled) return;
      setSignupAllowed(status.allowPublicSignup);
      if (!status.allowPublicSignup) {
        navigate('/login', { replace: true });
      }
    });
    return () => { cancelled = true; };
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const user = await signup({ email, password, name });
      applyAuthSession(setAuthSession, user);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  if (signupAllowed === null) {
    return (
      <div className="auth-screen">
        <div className="auth-card"><div className="auth-loading">Loading…</div></div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">0<span className="auth-brand-dim">colors</span></div>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">Pick a name, email, and a password of at least 8 characters.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <label className="auth-label">
            Your name
            <input
              type="text"
              className="auth-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              autoFocus
            />
          </label>
          <label className="auth-label">
            Email
            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="auth-label">
            Password
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>
          <label className="auth-label">
            Confirm password
            <PasswordField
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
          <p className="auth-altlink">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

// ── Accept invite ────────────────────────────────────────────────────────────

export function AcceptInviteScreen() {
  const navigate = useNavigate();
  const { token = '' } = useParams<{ token: string }>();
  const setAuthSession = useStore((s) => s.setAuthSession);

  const [lookup, setLookup] = useState<InviteLookup | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    lookupInvite(token).then((result) => {
      if (!cancelled) setLookup(result);
    });
    return () => { cancelled = true; };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const user = await acceptInvite(token, password);
      applyAuthSession(setAuthSession, user);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Failed to accept invite');
    } finally {
      setLoading(false);
    }
  }

  if (!lookup) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-loading">Loading invite…</div>
        </div>
      </div>
    );
  }

  if (!lookup.valid) {
    const reason =
      lookup.reason === 'expired' ? 'This invite has expired.' :
      lookup.reason === 'already-activated' ? 'This invite has already been accepted.' :
      'Invite link is invalid or has been revoked.';
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">0<span className="auth-brand-dim">colors</span></div>
          <h1 className="auth-title">Invite unavailable</h1>
          <p className="auth-subtitle">{reason}</p>
          <button className="auth-submit" onClick={() => navigate('/login')}>
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">0<span className="auth-brand-dim">colors</span></div>
        <h1 className="auth-title">Accept invite</h1>
        <p className="auth-subtitle">
          You were invited as <strong>{lookup.email}</strong>. Pick a password to finish setting up your account.
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label className="auth-label">
            Password
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>
          <label className="auth-label">
            Confirm password
            <PasswordField
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Activating…' : 'Activate account'}
          </button>
        </form>
      </div>
    </div>
  );
}

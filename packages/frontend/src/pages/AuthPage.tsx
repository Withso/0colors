// ============================================================================
// AuthPage — Phase 1 stub.
//
// The previous implementation used the @0zerosdesign/auth-client SDK to talk
// to accounts.zeros.design. That SDK is gone. Phase 2 rebuilds this page as a
// local login form + first-run setup wizard backed by the local users table.
// Until then this stub renders a placeholder so any code path that still
// lazy-imports AuthPage compiles cleanly.
// ============================================================================

interface AuthPageProps {
  onAuth: (session: { accessToken: string; userId: string; email: string; name: string }) => void;
  onSkip: () => void;
}

export function AuthPage(_props: AuthPageProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--surface-0)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
      }}
    >
      Local auth coming in the next phase.
    </div>
  );
}

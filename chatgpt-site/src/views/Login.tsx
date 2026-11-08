import type { Session } from '../api/types';

const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const signOutHref = '/signout-with-chatgpt?return_to=%2F';

/** Sign-in has to be a top-level navigation; Sites owns these routes and the session behind them. */
export function LoginView({ session }: { session: Session | null }) {
  if (session?.forbidden) {
    return (
      <main className="gate">
        <div className="gate-card">
          <div className="mark">O</div>
          <h1>Not your workspace</h1>
          <p>{session.user?.email ?? 'This account'} is signed in, but this workspace belongs to another account.</p>
          <a className="btn btn-primary" href={signOutHref} target="_top">Sign out</a>
        </div>
      </main>
    );
  }
  return (
    <main className="gate">
      <div className="gate-card">
        <div className="mark">O</div>
        <h1>Sign in</h1>
        <p>This private workspace uses your ChatGPT account.</p>
        <a className="btn btn-primary" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(here())}`} target="_top">Sign in with ChatGPT</a>
      </div>
    </main>
  );
}

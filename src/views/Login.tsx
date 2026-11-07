import { useState, type FormEvent } from 'react';
import { api, errorText } from '../api/client';
import { Button, Field, Notice } from '../components/common';

export function LoginView({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.session.login(token);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={e => void submit(e)}>
        <div className="mark">O</div>
        <h1>Sign in</h1>
        <p>This server requires its API token. It is exchanged for a 7-day session cookie and is not stored in the browser.</p>
        {error && <Notice tone="alert">{error}</Notice>}
        <Field label="API token">
          <input type="password" autoComplete="current-password" autoFocus required value={token} onChange={e => setToken(e.target.value)} />
        </Field>
        <Button variant="primary" type="submit" busy={busy} disabled={!token}>Sign in</Button>
      </form>
    </main>
  );
}

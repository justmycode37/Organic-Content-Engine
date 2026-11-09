import {useState,type FormEvent} from 'react';
import {api,errorText} from '../api/client';
import {Button,Field,Notice} from '../components/common';
import type { Session } from '../api/types';

const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const signOutHref = '/signout-with-chatgpt?return_to=%2F';

/** Sign-in has to be a top-level navigation; Sites owns these routes and the session behind them. */
export function LoginView({session,onDone}:{session:Session|null;onDone:()=>void}) {
  const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);try{await api.session.login(password);onDone();}catch(error){setError(errorText(error));}finally{setBusy(false);}};
  if(session?.passwordRequired)return <main className="gate"><form className="gate-card" onSubmit={e=>void submit(e)}><div className="mark">O</div><h1>Private workspace</h1><p>Enter the password to open Organic Content Engine.</p>{error&&<Notice tone="alert">{error}</Notice>}<Field label="Password"><input type="password" autoComplete="current-password" autoFocus required value={password} onChange={e=>setPassword(e.target.value)}/></Field><Button variant="primary" type="submit" busy={busy}>Open workspace</Button></form></main>;
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

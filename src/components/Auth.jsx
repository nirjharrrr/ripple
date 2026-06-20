import { useState } from 'react';
import { login, register } from '../lib/api';
import RippleLogo from './RippleLogo';

// Login / register screen. Accounts live in the Users sheet (hashed + salted).
export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login'); // login | register
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      onAuthed();
    } catch (err) {
      setError(String(err.message || err).replace(/^Error:\s*/, ''));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><RippleLogo size={52} /></div>
        <div className="auth-tagline">Create momentum.</div>
        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">
          {isRegister ? 'Your tasks stay private to your account.' : 'Sign in to your tasks.'}
        </p>

        {isRegister && (
          <input
            className="auth-input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        )}
        <input
          className="auth-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          className="auth-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
        />

        {error && <div className="auth-error">{error}</div>}

        <button className="btn-primary auth-submit" disabled={busy}>
          {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
        </button>

        <button
          type="button"
          className="auth-switch"
          onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(''); }}
        >
          {isRegister ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </form>
    </div>
  );
}

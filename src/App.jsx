import { useEffect, useState } from 'react';
import { isConfigured, isLoggedIn } from './lib/api';
import Setup from './components/Setup';
import Auth from './components/Auth';
import Workspace from './components/Workspace';
import './App.css';

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());

  // Stash an invite token from an emailed accept link (?invite=…) so it survives
  // the login screen — Workspace redeems it once the user is signed in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (!token) return;
    localStorage.setItem('ripple_pending_invite', token);
    params.delete('invite');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  if (!isConfigured()) return <Setup />;
  if (!authed) return <Auth onAuthed={() => setAuthed(true)} />;
  return <Workspace onSignOut={() => setAuthed(false)} />;
}

import { useState } from 'react';
import { isConfigured, isLoggedIn } from './lib/api';
import Setup from './components/Setup';
import Auth from './components/Auth';
import Workspace from './components/Workspace';
import './App.css';

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  if (!isConfigured()) return <Setup />;
  if (!authed) return <Auth onAuthed={() => setAuthed(true)} />;
  return <Workspace onSignOut={() => setAuthed(false)} />;
}

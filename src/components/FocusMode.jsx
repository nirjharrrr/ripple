import { useEffect, useRef, useState } from 'react';
import { subtasksFor } from '../lib/store';

const WORK = 25 * 60;
const BREAK = 5 * 60;

export default function FocusMode({ store, task, onClose }) {
  const subs = subtasksFor(store.data, task.id);
  const [mode, setMode] = useState('work'); // work | break
  const [left, setLeft] = useState(WORK);
  const [running, setRunning] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          const nextMode = mode === 'work' ? 'break' : 'work';
          setMode(nextMode);
          return nextMode === 'work' ? WORK : BREAK;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current);
  }, [running, mode]);

  function reset() { setRunning(false); setLeft(mode === 'work' ? WORK : BREAK); }

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const total = mode === 'work' ? WORK : BREAK;
  const pct = ((total - left) / total) * 100;

  return (
    <div className="focus">
      <button className="focus-exit" onClick={onClose}>✕ Exit focus</button>

      <div className="focus-inner">
        <div className={`focus-mode ${mode}`}>{mode === 'work' ? 'Focus' : 'Break'}</div>
        <h1 className="focus-task">{task.title}</h1>

        <div className="focus-ring" style={{ '--pct': pct + '%' }}>
          <div className="focus-time">{mm}:{ss}</div>
        </div>

        <div className="focus-controls">
          <button className="btn-primary" onClick={() => setRunning((r) => !r)}>{running ? 'Pause' : 'Start'}</button>
          <button className="btn-ghost" onClick={reset}>Reset</button>
          <button className="btn-ghost" onClick={() => { setMode(mode === 'work' ? 'break' : 'work'); setLeft(mode === 'work' ? BREAK : WORK); setRunning(false); }}>
            {mode === 'work' ? 'Skip to break' : 'Back to focus'}
          </button>
        </div>

        {subs.length > 0 && (
          <div className="focus-subs">
            {subs.map((s) => (
              <label key={s.id} className={`focus-sub ${s.done ? 'done' : ''}`}>
                <button className={`check sm ${s.done ? 'checked' : ''}`} onClick={() => store.toggleSubtask(s.id)} />
                <span>{s.title}</span>
              </label>
            ))}
          </div>
        )}

        <button className="focus-complete" onClick={() => { store.toggleTask(task.id); onClose(); }}>
          ✓ Mark task complete
        </button>
      </div>
    </div>
  );
}

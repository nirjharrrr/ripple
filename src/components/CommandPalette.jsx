import { useEffect, useMemo, useRef, useState } from 'react';

// Generic command palette. `commands` = [{ id, label, hint, icon, run, keywords }].
export default function CommandPalette({ commands, onClose }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) =>
      (c.label + ' ' + (c.hint || '') + ' ' + (c.keywords || '')).toLowerCase().includes(s)
    );
  }, [q, commands]);

  useEffect(() => { setActive(0); }, [q]);

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = results[active]; if (c) { c.run(); onClose(); } }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div className="cmd" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input"
          placeholder="Type a command or search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="cmd-list">
          {results.length === 0 && <div className="cmd-empty">No matches</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              className={`cmd-item ${i === active ? 'on' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => { c.run(); onClose(); }}
            >
              <span className="cmd-ico">{c.icon}</span>
              <span className="cmd-label">{c.label}</span>
              {c.hint && <span className="cmd-hint">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

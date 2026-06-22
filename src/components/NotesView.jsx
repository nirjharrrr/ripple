import { useEffect, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';

export default function NotesView({ store }) {
  const notes = [...store.data.notes].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  const [selId, setSelId] = useState(notes[0]?.id || null);
  const sel = notes.find((n) => n.id === selId) || null;
  // notes often arrive after first render (async sync) — select the first one once available
  useEffect(() => { if (!sel && notes.length) setSelId(notes[0].id); }, [sel, notes]);

  function newNote() {
    const n = store.addNote('Untitled', '');
    setSelId(n.id);
  }

  return (
    <section className="main notes-main">
      <div className="notes-list">
        <div className="notes-list-head">
          <h1>Notes</h1>
          <button className="sb-add" onClick={newNote}>＋</button>
        </div>
        {notes.length === 0 && <div className="placeholder">No notes yet.</div>}
        {notes.map((n) => (
          <button key={n.id} className={`note-item ${selId === n.id ? 'on' : ''}`} onClick={() => setSelId(n.id)}>
            <div className="note-item-title">{n.title || 'Untitled'}</div>
            <div className="note-item-prev">{(n.body || '').slice(0, 60) || 'Empty'}</div>
          </button>
        ))}
      </div>

      <div className="note-editor">
        {sel ? (
          <NoteEditor key={sel.id} note={sel} store={store} onDelete={() => { store.deleteNote(sel.id); setSelId(notes.find((n) => n.id !== sel.id)?.id || null); }} />
        ) : (
          <div className="placeholder">Select or create a note.</div>
        )}
      </div>
    </section>
  );
}

function NoteEditor({ note, store, onDelete }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body || '');
  const [editing, setEditing] = useState(!(note.body || '').trim()); // new/empty → start in edit

  function saveBody() { if (body !== (note.body || '')) store.updateNote(note.id, { body }); }

  return (
    <div className="note-edit-wrap">
      <div className="note-edit-toolbar">
        <span className="dp-muted">{note.updated_at && !isNaN(new Date(note.updated_at)) ? `Edited ${new Date(note.updated_at).toLocaleString()}` : ''}</span>
        <span className="row-spacer" />
        <div className="seg note-seg">
          <button className={editing ? 'on' : ''} onClick={() => setEditing(true)}>Write</button>
          <button className={!editing ? 'on' : ''} onClick={() => { saveBody(); setEditing(false); }}>Preview</button>
        </div>
        <button className="act danger small" onClick={onDelete}>Delete</button>
      </div>
      <input
        className="note-title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== note.title && store.updateNote(note.id, { title })}
        placeholder="Untitled"
      />
      {editing ? (
        <textarea
          className="note-body-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={saveBody}
          placeholder="Start writing…  (Markdown — # headings, - lists, **bold**, *italic*, `code`, [link](url), > quote)"
        />
      ) : (
        <div className="note-rendered md" onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(body) || '<p class="dp-muted">Nothing yet — click to write.</p>' }} />
      )}
    </div>
  );
}

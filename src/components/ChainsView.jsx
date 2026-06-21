import { buildChains, taskMap, isLocked, rippleBurst } from '../lib/chains';
import Icon from './Icon';

export default function ChainsView({ store, onSelect, selectedId }) {
  const tasks = store.data.tasks.filter((t) => !t.archived);
  const m = taskMap(tasks);
  const chains = buildChains(store.data.tasks);

  return (
    <section className="main">
      <header className="main-head">
        <div><h1>Ripple Chains</h1><div className="main-sub">Tasks that unlock the next — complete one to send a ripple</div></div>
      </header>

      {chains.length === 0 && (
        <div className="placeholder">No chains yet. Open any task and set <b>“Depends on”</b> to chain it after another — they’ll flow here.</div>
      )}

      <div className="chains">
        {chains.map((chain, ci) => (
          <div className="chain" key={ci}>
            {chain.map((t, i) => {
              const locked = isLocked(t, m);
              const state = t.done ? 'done' : locked ? 'locked' : 'ready';
              return (
                <div className="chain-step" key={t.id}>
                  {i > 0 && <div className={`chain-link ${chain[i - 1].done ? 'flow' : ''}`} />}
                  <div className={`chain-node ${state} ${selectedId === t.id ? 'sel' : ''}`} onClick={() => onSelect(t.id)}>
                    <button
                      className={`check ${t.done ? 'checked' : ''}`}
                      title={locked ? 'Locked until the previous task is done' : t.done ? 'Completed' : 'Mark done'}
                      onClick={(e) => { e.stopPropagation(); if (!t.done) rippleBurst(e.currentTarget); store.toggleTask(t.id); }}
                    />
                    <span className="chain-node-title">{t.title}</span>
                    <span className="chain-state">
                      {state === 'done' ? '✓ Done' : state === 'locked' ? <><Icon name="settings" size={11} /> Locked</> : '→ Ready'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

import Icon from './Icon';

// Bottom navigation for mobile — Today · Tasks · Add · Rooms · Profile.
export default function MobileNav({ view, onSelectView, onAdd, onProfile }) {
  const Item = ({ type, label, icon }) => (
    <button className={`mn-item ${view.type === type ? 'on' : ''}`} onClick={() => onSelectView({ type })}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="mobilenav">
      <Item type="today" label="Today" icon="today" />
      <Item type="mytasks" label="Tasks" icon="mytasks" />
      <button className="mn-add" onClick={onAdd} aria-label="Add"><Icon name="plus" size={24} /></button>
      <Item type="rooms" label="Rooms" icon="rooms" />
      <button className="mn-item" onClick={onProfile}><Icon name="settings" size={20} /><span>Profile</span></button>
    </nav>
  );
}

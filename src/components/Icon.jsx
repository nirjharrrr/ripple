// Clean line icons (Asana / Linear style) — stroked, inherit currentColor.
const P = {
  inbox: 'M3 13l3 0 1.5 2.5h9L18 13h3M5 5h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z',
  today: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 9h16M9 3v3M15 3v3',
  upcoming: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 9h16M9 3v3M15 3v3M12 13l2 2-2 2',
  mytasks: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12l2.5 2.5 4.5-5',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 9h16M9 3v3M15 3v3M8 13h2M14 13h2M8 17h2M14 17h2',
  notes: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 12h6M9 16h6',
  all: 'M4 6h16M4 12h16M4 18h16',
  board: 'M4 4h6v16H4zM14 4h6v9h-6z',
  timeline: 'M4 7h10M4 12h14M4 17h7',
  completed: 'M5 12l5 5 9-11',
  goals: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h0',
  habits: 'M4 9a8 8 0 0 1 13-3l3 3M20 4v5h-5M20 15a8 8 0 0 1-13 3l-3-3M4 20v-5h5',
  templates: 'M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z',
  analytics: 'M5 20V10M12 20V4M19 20v-7M3 20h18',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6 6 0 0 0-4-5.6',
  rooms: 'M4 10l8-5 8 5M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 20v-6h4v6',
  chain: 'M9 12a3 3 0 0 1 3-3h2.5a3 3 0 0 1 0 6H13M15 12a3 3 0 0 1-3 3H9.5a3 3 0 0 1 0-6H11',
  chevron: 'M9 6l6 6-6 6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 2h-5l-.4 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.5h5l.4-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z',
  signout: 'M15 12H4M4 12l4-4M4 12l4 4M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l4.5 4.5',
  plus: 'M12 5v14M5 12h14',
};

export default function Icon({ name, size = 17, className = '' }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

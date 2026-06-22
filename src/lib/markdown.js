// Tiny, dependency-free Markdown → HTML for notes. Deliberately a safe subset:
// everything is HTML-escaped first, then a handful of inline/block rules are
// applied, so user text can never inject markup. No external libs (stays free
// + offline, per Ripple's constraints).

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline: **bold**, *italic*/_italic_, `code`, [text](url), bare links.
function inline(s) {
  let t = s;
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  // [label](http…) — only http(s) urls allowed
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) => `<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`);
  // bare urls not already inside an <a …>
  t = t.replace(/(^|[\s])(https?:\/\/[^\s<]+)/g,
    (_, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`);
  return t;
}

export function renderMarkdown(src) {
  const lines = esc(String(src || '')).split('\n');
  const out = [];
  let list = null;     // 'ul' | 'ol' | null
  let para = [];

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); closeList(); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushPara(); closeList(); const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }

    // note: '>' was HTML-escaped to '&gt;' above, so match that
    if (/^&gt;\s?/.test(line)) { flushPara(); closeList(); out.push(`<blockquote>${inline(line.replace(/^&gt;\s?/, ''))}</blockquote>`); continue; }

    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const want = ul ? 'ul' : 'ol';
      if (list !== want) { closeList(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }

    closeList();
    para.push(line.trim());
  }
  flushPara(); closeList();
  return out.join('\n');
}

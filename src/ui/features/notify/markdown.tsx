import type { ReactNode } from 'react';

const INLINE =
  /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|~~([^~\n]+)~~|`([^`\n]+)`|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s)]+)/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    const k = `${key}-${n++}`;
    const [, label, href, bold, underline, em1, em2, strike, code, angle, bare] = m;
    if (label && href) {
      out.push(
        <a key={k} className="dc-link" href={href} target="_blank" rel="noreferrer noopener">
          {inline(label, k)}
        </a>,
      );
    } else if (bold) out.push(<strong key={k}>{inline(bold, k)}</strong>);
    else if (underline) out.push(<u key={k}>{inline(underline, k)}</u>);
    else if (em1 || em2) out.push(<em key={k}>{inline(em1 ?? em2 ?? '', k)}</em>);
    else if (strike) out.push(<s key={k}>{inline(strike, k)}</s>);
    else if (code) {
      out.push(
        <code key={k} className="dc-code">
          {code}
        </code>,
      );
    } else {
      const url = angle ?? bare ?? '';
      out.push(
        <a key={k} className="dc-link" href={url} target="_blank" rel="noreferrer noopener">
          {url}
        </a>,
      );
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export function DiscordMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {inline(line, String(i))}
          {i < lines.length - 1 && '\n'}
        </span>
      ))}
    </>
  );
}

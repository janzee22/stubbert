const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? time.format(d) : dateTime.format(d);
}

export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - now;
  const text = span(Math.abs(diff));
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

function span(ms: number): string {
  if (ms < 60_000) return '<1 min';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
  return `${Math.round(ms / 86_400_000)} d`;
}

export function duration(from: string, to: string | undefined): string {
  if (!to) return '';
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

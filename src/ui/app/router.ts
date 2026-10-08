import { useEffect, useState } from 'react';
import type { PageName } from '../layout/index.js';
import { isMessageKind, type MessageKind } from '../lib/api.js';

export type Page =
  | { name: Exclude<PageName, 'runs' | 'notifications'> }
  | { name: 'runs'; id?: string }
  | { name: 'notifications'; template?: MessageKind };

export function parseHash(hash: string): Page {
  const [name, id, sub] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'preview' || name === 'settings') return { name };
  if (name === 'runs') return { name, id: id ? decodeURIComponent(id) : undefined };
  if (name === 'notifications') {
    return { name, template: id === 'template' && isMessageKind(sub) ? sub : undefined };
  }
  return { name: 'categories' };
}

export function useHashPage(): Page {
  const [page, setPage] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      setPage(parseHash(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return page;
}

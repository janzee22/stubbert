import { useState, type ReactNode } from 'react';
import { api } from '../lib/api.js';
import { usePosters } from '../state/posters.js';

export type PosterSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

export function PosterThumb({
  file,
  name,
  size = 'sm',
  children,
}: {
  file?: string;
  name: string;
  size?: PosterSize;
  children?: ReactNode;
}) {
  const { posters, posterVersion } = usePosters();
  const [brokenSrc, setBrokenSrc] = useState<string>();
  const exists = !!file && posters.some((p) => p.file === file);
  const src = file && api.posterUrl(file, posterVersion[file]);
  if (src && exists && src !== brokenSrc) {
    return (
      <img
        className={`poster poster--${size}`}
        src={src}
        alt={`Poster: ${name}`}
        loading="lazy"
        onError={() => setBrokenSrc(src)}
      />
    );
  }
  return (
    <div
      className={`poster poster--${size} poster--empty`}
      role="img"
      aria-label={file ? `Poster ${file} is missing` : 'No poster yet'}
    >
      {size !== 'xs' && <div className="poster__title">{initials(name)}</div>}
      {children}
    </div>
  );
}

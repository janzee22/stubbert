import { useState } from 'react';
import type { PreviewResult } from '../../lib/api.js';
import { initials } from '../../components/index.js';
import { DiscordMarkdown } from './markdown.js';

export type DiscordTheme = 'dark' | 'light';

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function Thumb({ src, name, mini }: { src: string | null; name: string; mini?: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (src && src !== broken) {
    return (
      <img
        className="dc-thumb dc-thumb--img"
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(src)}
      />
    );
  }
  return (
    <div className="poster dc-thumb" aria-hidden="true">
      {!mini && <div className="poster__title">{initials(name)}</div>}
    </div>
  );
}

function useNow(): string {
  const [now] = useState(() => time.format(new Date()));
  return now;
}

export function DiscordPreview({
  preview,
  theme,
  posterName,
  mini,
}: {
  preview: PreviewResult;
  theme: DiscordTheme;
  posterName: string;
  mini?: boolean;
}) {
  const now = useNow();
  const embed = preview.embed;
  if (!embed) return null;
  const image = embed.image;
  const thumb = image === 'poster' && (
    <Thumb src={preview.imageUrl} name={posterName} mini={mini} />
  );
  const body = (
    <div
      className={`dc-embed${image === 'poster' ? '' : ' dc-embed--noimg'}`}
      style={{ ['--dc-accent' as string]: hex(embed.color) }}
    >
      <div className="col gap-0 min-w-0">
        {embed.title && <div className="dc-title">{embed.title}</div>}
        {embed.description && (
          <div className="dc-desc">
            <DiscordMarkdown text={embed.description} />
          </div>
        )}
        {image === 'backdrop' && preview.imageUrl && (
          <img className="dc-backdrop" src={preview.imageUrl} alt="" loading="lazy" />
        )}
      </div>
      {thumb}
    </div>
  );
  if (mini) {
    return (
      <div className="dc dc--mini" data-dtheme={theme} aria-hidden="true">
        {body}
      </div>
    );
  }
  return (
    <div
      className="dc"
      data-dtheme={theme}
      role="group"
      aria-label={`Preview of the Discord message: ${embed.title || 'without a title'}`}
    >
      <div className="dc-msg">
        <img className="dc-avatar" src="/stubbert-avatar.png" alt="" />
        <div className="min-w-0">
          <div className="dc-head">
            <span className="dc-name">{preview.username}</span>
            <span className="dc-app">APP</span>
            <span className="dc-time">Today at {now}</span>
          </div>
          {preview.mention && (
            <div className="dc-lead">
              <span className="dc-mention">
                {preview.mention.startsWith('<@&') ? '@role' : preview.mention}
              </span>
            </div>
          )}
          {body}
        </div>
      </div>
    </div>
  );
}

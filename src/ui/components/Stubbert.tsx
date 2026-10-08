import type { ReactNode } from 'react';

export type Mood = 'smile' | 'worried' | 'party' | 'searching' | 'sleepy';

const BODY =
  'M12 4h96a8 8 0 0 1 8 8v18a10 10 0 0 0 0 20v18a8 8 0 0 1-8 8H12a8 8 0 0 1-8-8V50a10 10 0 0 0 0-20V12a8 8 0 0 1 8-8z';

const MOODS: Record<Mood, { behind?: ReactNode; face: ReactNode }> = {
  smile: {
    face: (
      <>
        <circle className="stubbert__fill" cx="46" cy="36" r="4.5" />
        <circle className="stubbert__fill" cx="68" cy="36" r="4.5" />
        <path
          className="stubbert__line"
          d="M47 49q10 9 20 0"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </>
    ),
  },
  worried: {
    behind: <path d="M112 14q4 8 0 12q-4-4 0-12z" fill="#6FB4F0" />,
    face: (
      <>
        <circle className="stubbert__fill" cx="46" cy="38" r="4.5" />
        <circle className="stubbert__fill" cx="68" cy="38" r="4.5" />
        <path
          className="stubbert__line"
          d="M39 28l11 3M75 28l-11 3"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          className="stubbert__line"
          d="M46 55q5-5 11 0t11 0"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </>
    ),
  },
  party: {
    behind: (
      <>
        <path
          d="M-6 30l-10-14M126 30l10-14"
          className="stubbert__line"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="-8" cy="-2" r="4" fill="#E0503D" />
        <circle cx="132" cy="-6" r="4" fill="#3E7BE0" />
        <rect
          x="112"
          y="-18"
          width="7"
          height="7"
          rx="1.5"
          fill="#3E9A77"
          transform="rotate(20 115 -14)"
        />
        <rect
          x="-2"
          y="-22"
          width="7"
          height="7"
          rx="1.5"
          fill="#9B6BE0"
          transform="rotate(-15 1 -18)"
        />
      </>
    ),
    face: (
      <>
        <path
          className="stubbert__line"
          d="M41 37q5-6 10 0M63 37q5-6 10 0"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path className="stubbert__fill" d="M46 47h22q-2 12-11 12t-11-12z" />
      </>
    ),
  },
  searching: {
    behind: (
      <>
        <circle cx="132" cy="58" r="14" fill="none" className="stubbert__line" strokeWidth="5" />
        <path d="M142 68l10 10" className="stubbert__line" strokeWidth="6" strokeLinecap="round" />
        <path d="M118 50l-6 4" className="stubbert__line" strokeWidth="5" strokeLinecap="round" />
      </>
    ),
    face: (
      <>
        <circle className="stubbert__fill" cx="50" cy="36" r="4.5" />
        <circle className="stubbert__fill" cx="72" cy="36" r="4.5" />
        <path
          className="stubbert__line"
          d="M52 52h14"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </>
    ),
  },
  sleepy: {
    behind: (
      <>
        <text x="104" y="-4" className="stubbert__fill stubbert__z" fontSize="20">
          z
        </text>
        <text x="118" y="-18" className="stubbert__fill stubbert__z" fontSize="14">
          z
        </text>
      </>
    ),
    face: (
      <>
        <path
          className="stubbert__line"
          d="M40 38q6 5 12 0M62 38q6 5 12 0"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <ellipse className="stubbert__fill" cx="57" cy="53" rx="5" ry="4" />
      </>
    ),
  },
};

export function Stubbert({ mood = 'smile', width = 130 }: { mood?: Mood; width?: number }) {
  const { behind, face } = MOODS[mood];
  return (
    <svg
      className={`stubbert stubbert--${mood}`}
      width={width}
      height={Math.round(width * 0.8)}
      viewBox="-24 -28 172 132"
      aria-hidden="true"
      overflow="visible"
    >
      {behind}
      <path className="stubbert__body" d={BODY} strokeWidth="4" />
      <path
        d="M92 8v64"
        className="stubbert__line"
        strokeWidth="3"
        strokeDasharray="4 5"
        fill="none"
      />
      {face}
      <path
        d="M40 77v11M76 77v11"
        className="stubbert__line"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.7)} viewBox="0 0 120 80" aria-hidden="true">
      <path className="stubbert__body" d={BODY} strokeWidth="6" />
      <path d="M92 10v60" className="stubbert__line" strokeWidth="4" strokeDasharray="5 6" />
      <circle className="stubbert__fill" cx="46" cy="35" r="6" />
      <circle className="stubbert__fill" cx="68" cy="35" r="6" />
      <path
        d="M45 49q12 11 24 0"
        className="stubbert__line"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

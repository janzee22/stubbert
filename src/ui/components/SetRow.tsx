import type { ReactNode } from 'react';

export function SetRow({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="set-row" id={id} aria-labelledby={`${id}-title`}>
      <div className="set-row__head">
        <h2 className="h2" id={`${id}-title`}>
          {title}
        </h2>
        <p className="small muted">{intro}</p>
      </div>
      <div className="set-row__body">{children}</div>
    </section>
  );
}

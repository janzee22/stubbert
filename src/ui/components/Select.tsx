import { type SelectHTMLAttributes } from 'react';
import { Icon } from './Icon.js';

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`input-wrap input-wrap--select ${className ?? ''}`}>
      <select className="input" {...props} />
      <Icon name="chevronDown" />
    </div>
  );
}

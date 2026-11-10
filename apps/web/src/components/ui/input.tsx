import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
}

const ADDON = 'pointer-events-none absolute inset-y-0 flex items-center text-sm text-slate-400';

export function Input({ leading, trailing, className = '', ...props }: InputProps) {
  return (
    <div className="relative">
      {leading && (
        <span aria-hidden className={`${ADDON} left-3`}>
          {leading}
        </span>
      )}
      <input
        className={`input ${leading ? 'pl-7' : ''} ${trailing ? 'pr-12' : ''} ${className}`}
        {...props}
      />
      {trailing && (
        <span aria-hidden className={`${ADDON} right-3`}>
          {trailing}
        </span>
      )}
    </div>
  );
}

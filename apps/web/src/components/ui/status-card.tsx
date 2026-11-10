import type { ReactNode } from 'react';

interface StatusCardProps {
  title: string;
  message: string;
  action: ReactNode;
  footnote?: string;
  role?: 'alert';
}

export function StatusCard({ title, message, action, footnote, role }: StatusCardProps) {
  return (
    <div role={role} className="card mx-auto mt-6 max-w-lg space-y-4 p-10 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{message}</p>
      {footnote && <p className="font-mono text-xs text-slate-400">{footnote}</p>}
      {action}
    </div>
  );
}

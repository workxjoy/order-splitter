import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}

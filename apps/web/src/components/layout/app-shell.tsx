import { ChartPie } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLink } from './nav-link';
import { APP_NAME, AppRoute } from '@/lib/constants';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={AppRoute.NEW_ORDER} className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <ChartPie className="size-4" aria-hidden />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
          </Link>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink href={AppRoute.NEW_ORDER}>New order</NavLink>
            <NavLink href={AppRoute.HISTORY}>Order history</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
    </>
  );
}

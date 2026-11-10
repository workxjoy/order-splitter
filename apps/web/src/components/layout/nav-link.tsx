'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppRoute } from '@/lib/constants';

function isActive(pathname: string, href: string): boolean {
  return href === AppRoute.NEW_ORDER ? pathname === href : pathname.startsWith(href);
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const active = isActive(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </Link>
  );
}

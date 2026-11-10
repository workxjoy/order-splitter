import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { APP_NAME } from '@/lib/constants';
import './globals.css';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Split model-portfolio investments into per-stock orders and review order history.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppRoute } from '@/lib/constants';
import RootLayout from './layout';

vi.mock('next/navigation', () => ({ usePathname: () => AppRoute.NEW_ORDER }));

/** <html> cannot be mounted inside a test container, so the layout is rendered to a document. */
function renderDocument(): Document {
  const html = renderToStaticMarkup(
    <RootLayout>
      <p>Page content</p>
    </RootLayout>,
  );
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('RootLayout', () => {
  it('declares the document language and renders each page inside the app shell', () => {
    const page = renderDocument();

    // A parsed document has no window, so jest-dom matchers do not apply: plain DOM checks instead.
    expect(page.documentElement.lang).toBe('en');
    expect(page.querySelector('main')?.textContent).toBe('Page content');
    const links = page.querySelectorAll('nav[aria-label="Main"] a');
    expect(Array.from(links, (link) => link.textContent)).toEqual(['New order', 'Order history']);
  });
});

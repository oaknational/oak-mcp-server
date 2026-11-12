import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BrandBanner } from './BrandBanner.js';

const OAK_URL = 'https://www.thenational.academy';

describe('BrandBanner', () => {
  it('carries the brand name as a single text node inside the link', () => {
    render(<BrandBanner onOpenLink={() => undefined} />);

    // One node carries the whole accessible name (brand + new-tab hint), so
    // the name is exact by construction — no whitespace-join dependency
    // across nodes. Scoped through the link so the location claim is what
    // the query proves; hiding is a CSS fact jsdom cannot see, so the
    // browser-scale a11y suite owns that half.
    const link = screen.getByRole('link', { name: /oak national academy/iu });

    expect(within(link).getByText('Oak National Academy (opens in a new tab)')).toBeTruthy();
  });

  it('wraps the wordmark in a single link to the Oak website', () => {
    render(<BrandBanner onOpenLink={() => undefined} />);

    const link = screen.getByRole('link', { name: /oak national academy/iu });

    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(OAK_URL);
  });

  it('renders an inline SVG wordmark that is hidden from assistive technology', () => {
    render(<BrandBanner onOpenLink={() => undefined} />);

    const link = screen.getByRole('link', { name: /oak national academy/iu });
    const svg = link.querySelector('svg');

    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
  });

  it('renders the wide wordmark, not the acorn', () => {
    render(<BrandBanner onOpenLink={() => undefined} />);

    const link = screen.getByRole('link', { name: /oak national academy/iu });
    const svg = link.querySelector('svg');

    // The viewBox is the discriminating fixture: nothing else in the suite
    // distinguishes the wide lockup from the old 32x42 acorn.
    expect(svg?.getAttribute('viewBox')).toBe('0 0 3600 368.16');
  });

  it('carries no fill in any form, so CSS currentColor reaches the geometry', () => {
    render(<BrandBanner onOpenLink={() => undefined} />);

    const link = screen.getByRole('link', { name: /oak national academy/iu });
    const svg = link.querySelector('svg');

    // The asset is bare geometry and the widget colours it with CSS
    // `fill: currentColor` (inherited). A fill added upstream in ANY form
    // — a fill attribute, an inline style, or a <style> sheet (the
    // Illustrator default-export form) — would defeat inheritance and
    // render the wordmark black in every theme, invisible on the dark
    // accent panel.
    expect(svg?.querySelectorAll('[fill]')).toHaveLength(0);
    expect(svg?.querySelectorAll('[style*="fill"]')).toHaveLength(0);
    expect(svg?.querySelectorAll('style')).toHaveLength(0);
  });

  it('calls onOpenLink with the Oak URL and the click event', () => {
    const calls: { url: string; eventType: string }[] = [];

    render(
      <BrandBanner
        onOpenLink={(url, event) => {
          calls.push({ url, eventType: event.type });
        }}
      />,
    );

    const link = screen.getByRole('link', { name: /oak national academy/iu });

    fireEvent.click(link);

    expect(calls).toStrictEqual([{ url: OAK_URL, eventType: 'click' }]);
  });

  it('renders inside a header landmark', () => {
    render(<BrandBanner onOpenLink={() => undefined} />);

    const header = screen.getByRole('banner');

    expect(header).toBeTruthy();
  });

  it("exposes only the brand name as the link's accessible name", () => {
    render(<BrandBanner onOpenLink={() => undefined} />);

    expect(
      screen.getByRole('link', { name: 'Oak National Academy (opens in a new tab)' }),
    ).toBeTruthy();
  });
});

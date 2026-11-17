import type { Metadata } from 'next';

import { Bullets, Link, P, Page, Section } from '../../components/page.tsx';
import { NEW_ISSUE_URL, OAK_HELP_URL } from '../../components/site.ts';

export const metadata: Metadata = { title: 'Accessibility statement' };

export default function AccessibilityPage() {
  return (
    <Page title="Accessibility statement">
      <P>
        This statement covers this documentation site. We want everyone to be able to use it,
        including people who use a keyboard, a screen reader, magnification or high contrast.
      </P>
      <Section id="standard" title="Our standard">
        <P>
          We build the site to meet the{' '}
          <Link href="https://www.w3.org/TR/WCAG22/">
            Web Content Accessibility Guidelines (WCAG) 2.2
          </Link>{' '}
          at level AA. We also aim for a text contrast ratio of at least 7:1, which goes beyond AA.
        </P>
      </Section>
      <Section id="testing" title="How we test">
        <P>Every change to the site runs automated checks before it can be released. They check:</P>
        <Bullets>
          <li>every page against WCAG 2.2 AA, in the light and dark themes</li>
          <li>text contrast against our 7:1 target</li>
          <li>pages at 320 pixels wide and at 200% zoom, with no sideways scrolling</li>
          <li>keyboard access, with a visible focus indicator</li>
        </Bullets>
        <P>
          Automated checks can&apos;t find every barrier. We haven&apos;t yet tested the site with
          screen readers, and we&apos;ll update this statement when we have.
        </P>
      </Section>
      <Section id="known-issues" title="Known limitations">
        <Bullets>
          <li>The client tabs on the Connect page need JavaScript to switch.</li>
          <li>Links to AI providers&apos; own documentation go to sites we don&apos;t control.</li>
        </Bullets>
      </Section>
      <Section id="report" title="Report a barrier">
        <P>If something on this site stops you using it, tell us. You can:</P>
        <Bullets>
          <li>
            <Link href={NEW_ISSUE_URL}>open an issue on GitHub</Link>, which needs a GitHub account
          </li>
          <li>
            <Link href={OAK_HELP_URL}>contact us through Oak&apos;s help centre</Link>
          </li>
        </Bullets>
        <P>
          Tell us the page, what you were trying to do, and the device or assistive technology you
          use.
        </P>
        <P>
          If you&apos;re not happy with how we respond, contact the{' '}
          <Link href="https://www.equalityadvisoryservice.com/">
            Equality Advisory and Support Service (EASS)
          </Link>
          .
        </P>
      </Section>
      <Section id="oak-website" title="Oak's main website">
        <P>
          This statement covers this site only.{' '}
          <Link href="https://www.thenational.academy/legal/accessibility-statement">
            Read the accessibility statement for Oak&apos;s main website
          </Link>
          .
        </P>
      </Section>
      <Section id="prepared" title="About this statement">
        <P>We prepared this statement in November 2026.</P>
      </Section>
    </Page>
  );
}

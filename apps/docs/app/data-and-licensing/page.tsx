import type { Metadata } from 'next';

import { Bullets, Link, P, Page, Section } from '../../components/page.tsx';
import { REPO_URL } from '../../components/site.ts';

export const metadata: Metadata = { title: 'Data and licensing' };

const OGL_URL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
const EEF_URL =
  'https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit';

export default function DataAndLicensingPage() {
  return (
    <Page title="Data and licensing">
      <P>
        The server&apos;s code and the curriculum content it returns are licensed separately. Check
        which one you&apos;re reusing.
      </P>
      <Section id="content" title="Curriculum content">
        <P>
          The server gets all curriculum content through the{' '}
          <Link href="https://open-api.thenational.academy/">Oak Open Curriculum API</Link>. The API
          filters out third-party content we can&apos;t share, so the server only returns what the
          API allows.
        </P>
        <P>
          Lesson content from the API is available under the{' '}
          <Link href={OGL_URL}>Open Government Licence v3.0</Link>, except where stated. When you
          reuse it, include this attribution:
        </P>
        <P>
          &quot;Contains public sector information licensed under the Open Government Licence
          v3.0.&quot;
        </P>
        <P>For the full terms, read:</P>
        <Bullets>
          <li>
            <Link href="https://www.thenational.academy/legal/terms-and-conditions-api-version">
              Oak Curriculum API terms
            </Link>
          </li>
          <li>
            <Link href="https://open-api.thenational.academy/docs/about-oaks-api/terms">
              Oak API documentation terms
            </Link>
          </li>
        </Bullets>
        <P>
          Some content includes third-party rights or trademarks that the Open Government Licence
          doesn&apos;t cover. Check the API terms before you reuse it.
        </P>
      </Section>
      <Section id="other-data" title="Other data sources">
        <P>
          Curriculum structure data derived from the{' '}
          <Link href="https://github.com/oaknational/oak-curriculum-ontology">
            Oak Curriculum Ontology
          </Link>{' '}
          is licensed under the Open Government Licence v3.0. Attribute it as: &quot;Contains
          curriculum structure data derived from the Oak Curriculum Ontology, licensed under the
          Open Government Licence v3.0.&quot;
        </P>
        <P>
          Data from the <Link href={EEF_URL}>EEF Teaching and Learning Toolkit</Link> is published
          by the Education Endowment Foundation. When you cite it, credit the Education Endowment
          Foundation and link to the toolkit.
        </P>
      </Section>
      <Section id="code" title="The server's code">
        <P>
          The code is open source under the MIT licence. The licence covers the code only, not the
          curriculum content. <Link href={REPO_URL}>Read the source on GitHub</Link>.
        </P>
      </Section>
    </Page>
  );
}

'use client';

import { OakFlex, OakHeading, OakLink, OakP } from '@oaknational/oak-components';

export default function NotFound() {
  return (
    <OakFlex $flexDirection="column" $gap="spacing-16">
      <OakHeading tag="h1" $font={['heading-5', 'heading-4']}>
        Page not found
      </OakHeading>
      <OakP $font="body-1">This page does not exist.</OakP>
      <OakP $font="body-1">
        <OakLink href="/">Go to the home page</OakLink>
      </OakP>
    </OakFlex>
  );
}

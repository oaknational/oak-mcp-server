'use client';

import { OakFlex, OakP, OakSmallSecondaryButton } from '@oaknational/oak-components';
import { useState } from 'react';

interface CopyButtonProps {
  readonly text: string;
  readonly label: string;
}

export function CopyButton({ text, label }: CopyButtonProps) {
  const [message, setMessage] = useState('');

  const copy = async () => {
    setMessage('');
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copied to your clipboard.');
    } catch {
      setMessage("We couldn't copy that. Select the text and copy it yourself.");
    }
  };

  return (
    <OakFlex $flexWrap="wrap" $alignItems="center" $gap="spacing-16">
      <OakSmallSecondaryButton type="button" onClick={() => void copy()}>
        {label}
      </OakSmallSecondaryButton>
      <OakP $font="body-2" role="status" aria-live="polite">
        {message}
      </OakP>
    </OakFlex>
  );
}

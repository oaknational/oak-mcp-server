'use client';

import { OakSmallSecondaryToggleButton } from '@oaknational/oak-components';

import { useThemeControls } from './theme.tsx';

export function ThemeToggle() {
  const { theme, toggle } = useThemeControls();
  return (
    <OakSmallSecondaryToggleButton
      type="button"
      toggleOn={theme === 'dark'}
      aria-pressed={theme === 'dark'}
      onClick={toggle}
    >
      Dark theme
    </OakSmallSecondaryToggleButton>
  );
}

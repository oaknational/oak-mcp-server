'use client';

import { oakDarkTheme, oakDefaultTheme, OakThemeProvider } from '@oaknational/oak-components';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'oak-mcp-docs-theme';

interface ThemeControls {
  readonly theme: ThemeName;
  readonly toggle: () => void;
}

const ThemeContext = createContext<ThemeControls | null>(null);

export function useThemeControls(): ThemeControls {
  const controls = useContext(ThemeContext);
  if (controls === null) {
    throw new Error('useThemeControls must run inside ThemeController');
  }
  return controls;
}

function readStoredTheme(): ThemeName | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: ThemeName): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

export function ThemeController({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>('light');

  useEffect(() => {
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(readStoredTheme() ?? preferred);
  }, []);

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    writeStoredTheme(next);
  }, [theme]);

  const controls = useMemo(() => ({ theme, toggle }), [theme, toggle]);

  return (
    <ThemeContext value={controls}>
      <OakThemeProvider theme={theme === 'dark' ? oakDarkTheme : oakDefaultTheme}>
        {children}
      </OakThemeProvider>
    </ThemeContext>
  );
}

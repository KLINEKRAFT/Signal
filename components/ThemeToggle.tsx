'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'signal-theme';

/**
 * Applies a theme before React exists.
 *
 * Runs as a blocking inline script in <head>, so the attribute is on <html>
 * before the first paint. Without it the page renders dark, hydrates, and then
 * snaps to light — a flash on every navigation for anyone who chose light.
 *
 * Stringified into the document, so it must stay dependency-free and valid on
 * its own. 'system' deliberately writes no attribute: the CSS already resolves
 * that case from prefers-color-scheme, and stamping a value would freeze the
 * choice against a system that later changes.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`.trim();

/** The order the button cycles through. */
const ORDER: Theme[] = ['system', 'light', 'dark'];

const LABEL: Record<Theme, string> = {
  system: 'AUTO',
  light: 'LIGHT',
  dark: 'DARK',
};

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing refuses storage; the theme still applies for this page.
  }
}

/**
 * Three states rather than two, because "follow the system" is a real choice
 * and a two-way switch silently destroys it the first time you touch it.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('system');

  // Read the stored value after mount. Server and first client render must
  // agree, so the button starts at AUTO and corrects itself immediately —
  // rendering the real value on the server is impossible, it is in localStorage.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    } catch {
      // Nothing stored, nothing to restore.
    }
  }, []);

  const cycle = useCallback(() => {
    setTheme((current) => {
      const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      apply(next);
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      onClick={cycle}
      className={`label transition-colors hover:text-paper ${className}`}
      // The visible text is three letters of jargon; the accessible name says
      // what the control does and what it will do next.
      aria-label={`Theme: ${LABEL[theme].toLowerCase()}. Switch to ${LABEL[
        ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
      ].toLowerCase()}.`}
      title="Switch theme"
    >
      {LABEL[theme]}
    </button>
  );
}

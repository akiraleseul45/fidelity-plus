/**
 * Theme tokens — single source of truth for colors, spacing, radius, typography.
 *
 * We expose:
 *   - `colors` (the default, currently light) — kept for backward compat
 *   - `lightColors` and `darkColors` — full palettes
 *   - `useThemeColors()` — returns the right palette based on system / user pref
 *
 * Spacing/radius/typography are mode-independent.
 */

import { useColorScheme } from 'react-native';
import { useThemeStore } from '../stores/themeStore';

const lightColors = {
  bg: '#FFFFFF',
  surface: '#F4F7FB',
  text: '#0B1220',
  textMuted: '#5B6472',
  border: '#E6E9EF',

  primary: '#1E90FF',
  primaryPressed: '#0A6ED1',
  onPrimary: '#FFFFFF',

  accent: '#FFB02E',
  accentPressed: '#E59517',
  onAccent: '#0B1220',

  heroBg: '#1E90FF',
  heroText: '#FFFFFF',

  success: '#16A34A',
  danger: '#E11D2E',
} as const;

const darkColors = {
  bg: '#0B1220',
  surface: '#1A2333',
  text: '#F5F7FA',
  textMuted: '#9BA3B0',
  border: '#2A3344',

  primary: '#3DA5FF',
  primaryPressed: '#1E90FF',
  onPrimary: '#FFFFFF',

  accent: '#FFB02E',
  accentPressed: '#E59517',
  onAccent: '#0B1220',

  heroBg: '#0F2647',
  heroText: '#FFFFFF',

  success: '#22C55E',
  danger: '#F87171',
} as const;

// Default export = light (kept for non-themed callers; will be replaced
// by `useThemeColors()` over time).
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 34, fontWeight: '700' as const },
  h2: { fontSize: 24, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  mega: { fontSize: 96, fontWeight: '800' as const },
};

/**
 * Hook that returns the active palette. Resolves in order:
 *   1. user override in themeStore (if not 'system')
 *   2. system color scheme via useColorScheme()
 *   3. light (fallback)
 */
export function useThemeColors() {
  const systemScheme = useColorScheme();
  const userPref = useThemeStore((s) => s.preference);
  const effective =
    userPref === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : userPref;
  return effective === 'dark' ? darkColors : lightColors;
}

export { lightColors, darkColors };

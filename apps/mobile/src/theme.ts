import type { ParkingRequestStatus } from '@cargovibe/shared';

/**
 * A very small design token set. Not a design system - just enough shared
 * constants that spacing and colour stay consistent across screens without
 * every component inventing its own values.
 */
export const colors = {
  background: '#f4f6f8',
  surface: '#ffffff',
  border: '#dfe3e8',
  text: '#16202a',
  textMuted: '#63707d',
  primary: '#1b64d1',
  primaryText: '#ffffff',
  danger: '#c0392b',
  success: '#1e7a45',
  warning: '#a06000',
  overlay: 'rgba(15, 23, 32, 0.45)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = { sm: 6, md: 10, lg: 14 } as const;

/** Layout switches to the wide variant at this width (tablet / desktop browser). */
export const WIDE_LAYOUT_BREAKPOINT = 720;
export const CONTENT_MAX_WIDTH = 880;

export const statusColors: Record<ParkingRequestStatus, { bg: string; fg: string }> = {
  pending: { bg: '#fff3d6', fg: '#8a5b00' },
  approved: { bg: '#dcecff', fg: '#14509e' },
  rejected: { bg: '#fde0dd', fg: '#a12d1f' },
  checked_in: { bg: '#d8f2e3', fg: '#136137' },
  checked_out: { bg: '#e6e9ec', fg: '#48555f' },
};

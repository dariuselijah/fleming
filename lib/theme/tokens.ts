/**
 * Clinical Calm design tokens.
 *
 * CSS custom properties in `app/globals.css` are the runtime source of truth.
 * These values document the intended scale for TypeScript consumers and tests.
 *
 * - Typography: 11px is the smallest supported UI text.
 * - Spacing: a 4px base rhythm; touch controls are at least 44px.
 * - Elevation: borders and two restrained shadow levels.
 * - Motion: short, non-spring transitions for state changes.
 * - Z-index: named layers prevent local stacking-context escalation.
 */
export const clinicalCalmTokens = {
  typography: {
    micro: { fontSize: 11, lineHeight: 16 },
    caption: { fontSize: 12, lineHeight: 18 },
    body: { fontSize: 14, lineHeight: 22 },
  },
  spacing: {
    unit: 4,
    touchTarget: 44,
    shellHeader: 56,
  },
  elevation: {
    base: "none",
    raised: "var(--elevation-raised)",
    floating: "var(--elevation-floating)",
  },
  motion: {
    instant: 80,
    fast: 140,
    calm: 200,
    easing: "var(--motion-ease-calm)",
  },
  zIndex: {
    content: 0,
    sticky: 20,
    navigation: 40,
    popover: 60,
    modal: 100,
    critical: 200,
  },
} as const

export type ClinicalCalmTokens = typeof clinicalCalmTokens

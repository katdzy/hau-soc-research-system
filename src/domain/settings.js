// Global settings the System Administrator changes at run time. One document,
// `settings/global`. Anything not set there falls back to its flag in flags.js.

import { FLAGS } from './flags.js'

export const SETTINGS_ID = 'global'

export const settingsOf = (snap) => (snap?.settings ?? []).find(s => s.id === SETTINGS_ID) ?? null

/**
 * Revision countdown length in days (S7.6: "minor 7 days, major 14 days —
 * configurable"). Read when a verdict is recorded; the deadline is stored on
 * the defense, so a change applies to verdicts recorded afterwards only.
 */
export const revisionDaysOf = (snap) => ({ ...FLAGS.REVISION_DAYS, ...(settingsOf(snap)?.revisionDays ?? {}) })

export const REVISION_DAYS_LIMITS = { min: 1, max: 60 }

// Display formatting. Everything is shown in UTC, matching the data.

const DASH = '–'

/** 1840 -> "1.84 GW", 820 -> "820 MW", null -> "–". */
export function formatPower(mw: number | null, { signed = false } = {}): string {
  if (mw === null || !Number.isFinite(mw)) return DASH
  const sign = signed && mw > 0 ? '+' : mw < 0 ? '−' : ''
  const abs = Math.abs(mw)
  const text = abs >= 1000 ? `${(abs / 1000).toFixed(2)} GW` : `${Math.round(abs)} MW`
  return sign + text
}

/** 4 -> "4h", 4.5 -> "4.5h". */
export function formatHours(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})
const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })

/** "Sat 10 Jan, 12:00" (UTC). */
export function formatDateTime(value: string | number): string {
  return dateTimeFormat.format(new Date(value))
}

/** Axis tick label: the date at midnight, otherwise the time of day ("06:00"). */
export function formatAxisTick(value: number): string {
  const date = new Date(value)
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 ? dayFormat.format(date) : timeFormat.format(date)
}

// <input type="datetime-local"> has no time zone; we read and write it as UTC.

/** "2026-01-01T00:00:00Z" -> "2026-01-01T00:00". */
export function isoToInput(iso: string): string {
  return iso.slice(0, 16)
}

/** "2026-01-01T00:00" -> "2026-01-01T00:00:00Z". */
export function inputToIso(value: string): string {
  return `${value}:00Z`
}

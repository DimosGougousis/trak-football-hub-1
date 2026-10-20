/**
 * TRAK-189: a colour at an opacity, for a role token (`rgb(var(--t-brand))`) or a
 * hex code alike. Gluing hex digits onto a colour (`${color}40`) only worked
 * for hex, and silently drew nothing once the colour became a token.
 */
export function withAlpha(color: string, alpha: number): string
export function withAlpha(color: string | null | undefined, alpha: number): string | undefined
export function withAlpha(color: string | null | undefined, alpha: number): string | undefined {
  if (!color) return undefined
  const token = /^rgb\(var\((--[\w-]+)\)\)$/.exec(color.trim())
  if (token) return `rgb(var(${token[1]}) / ${alpha})`
  if (/^#[0-9a-f]{6}$/i.test(color.trim())) return color.trim() + Math.round(alpha * 255).toString(16).padStart(2, '0')
  return color
}

// TRAK-268: Play It Right's content, read from its own page. The page builds it in
// code (each moment's week is worked out there), so this runs those lines, and only
// those, in a sandbox: from `const CODE = [` up to `const BY_ID`, plus `const SENIOR`.
import vm from 'node:vm'

export function readPlayItRight(html) {
  const lines = html.split('\n')
  const at = start => {
    const i = lines.findIndex(l => l.startsWith(start))
    if (i < 0) throw new Error(`"${start}" is not in play-it-right.html`)
    return i
  }
  const content = lines.slice(at('const CODE = ['), at('const BY_ID')).join('\n')
  const senior = lines.slice(at('const SENIOR = {'), at('/* ---------- pure helpers')).join('\n')
  const { code, moments, seniorTrack } = vm.runInNewContext(`${content}\n${senior}\n;({ code: CODE, moments: ACADEMY, seniorTrack: SENIOR })`, {}, { timeout: 2000 })
  return JSON.parse(JSON.stringify({ code, moments, senior: seniorTrack }))
}

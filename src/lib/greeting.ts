/** "Good morning" / "Good afternoon" / "Good evening" for the device's local time.
 *  No trailing comma: the name moved into the Home header (TRAK-163). */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

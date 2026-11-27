/** TRAK-616 (Kostas, 27 Nov): Home's greeting by the device's hour. Morning from 05:00, afternoon from 12:00, and evening
 *  from 18:00 through the night until 05:00 (before, it said Good morning at night). */
export function greetingFor(hour: number): 'coachHome:greetMorning' | 'coachHome:greetAfternoon' | 'coachHome:greetEvening' {
  return hour >= 5 && hour < 12 ? 'coachHome:greetMorning' : hour >= 12 && hour < 18 ? 'coachHome:greetAfternoon' : 'coachHome:greetEvening'
}

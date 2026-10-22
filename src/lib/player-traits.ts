/* TRAK-260 (Imad, 22 Oct): what a coach can say about how a player plays, from a
   fixed list only, so nothing free-text is written about a player. Imad's list,
   names only; where it paired two options with a slash, each is its own trait.
   "Knocks ball past opponent" is already in Movement, so the passing pair keeps
   only "Ball to feet". The database checks the same list
   (supabase/migrations/20261022200000_coach_player_profiles.sql); a test keeps
   the two equal. */

export const PLAYER_TRAIT_GROUPS = [
  { group: 'Movement', traits: [
    'Gets forward whenever possible', 'Stays back at all times', 'Comes deep to get the ball',
    'Dribbles down left', 'Dribbles down right', 'Dribbles down center',
    'Runs with ball often', 'Runs with ball occasionally', 'Hugs touchline', 'Cuts inside',
    'Gets into opposition area', 'Arrives late in opposition area', 'Beats the offside trap',
    'Plays with back to goal', 'Stays inside penalty area', 'Moves into channels', 'Plays one-twos',
    'Tries to knock ball past opponent',
  ] },
  { group: 'Passing', traits: [
    'Tries killer balls often', 'Does not try killer balls', 'Tries long range passes', 'Plays short simple passes',
    'Slows down pace', 'Dwells on ball', 'Looks for pass rather than finishing', 'Dictates tempo',
    'Switches ball to wide areas', 'Ball to feet',
  ] },
  { group: 'Finishing and shooting', traits: [
    'Shoots from distance', 'Refrains from long shots', 'Lobs the keeper', 'Rounds the keeper', 'Shoots with power',
    'Places shots', 'First time shots', 'Tries overhead kicks', 'Tries power free kicks', 'Tries long range free kicks',
  ] },
  { group: 'Defending and tackling', traits: ['Dives into tackles', 'Does not dive into tackles', 'Marks opponent tightly'] },
  { group: 'Technique and general', traits: [
    'Brings ball out of defense', 'Plays out of trouble', 'Tries tricks', 'Curls balls', 'Uses outside of foot',
    'Likes to beat opponent repeatedly', 'Adjusts foot before attempting strike', 'Avoids weaker foot', 'Uses weaker foot',
    'Long flat throw', 'Uses long throw to start counter-attacks',
  ] },
] as const

export const PLAYER_TRAITS: readonly string[] = PLAYER_TRAIT_GROUPS.flatMap(entry => entry.traits)

/** Picking one of a pair unpicks the other; the database refuses both together. */
export const OPPOSITE_TRAITS: readonly (readonly [string, string])[] = [
  ['Gets forward whenever possible', 'Stays back at all times'],
  ['Runs with ball often', 'Runs with ball occasionally'],
  ['Tries killer balls often', 'Does not try killer balls'],
  ['Shoots from distance', 'Refrains from long shots'],
  ['Dives into tackles', 'Does not dive into tackles'],
  ['Avoids weaker foot', 'Uses weaker foot'],
]

/** The picked traits after tapping `trait`: on or off, and its opposite off. Kept in list order. */
export function toggleTrait(picked: readonly string[], trait: string): string[] {
  if (picked.includes(trait)) return picked.filter(entry => entry !== trait)
  const opposite = OPPOSITE_TRAITS.find(pair => pair.includes(trait))?.find(entry => entry !== trait)
  const next = new Set([...picked.filter(entry => entry !== opposite), trait])
  return PLAYER_TRAITS.filter(entry => next.has(entry))
}

export type PreferredFoot = 'left' | 'right' | 'both'

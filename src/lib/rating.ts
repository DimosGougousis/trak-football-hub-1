// Computed rating engine — full position-specific modifiers from prototype v3

export interface MatchInputs {
  position: string;
  competition: string;
  venue: string;
  teamScore: number | '';
  opponentScore: number | '';
  ageGroup: string;
  minutesPlayed: number | '';
  cardReceived: string;
  bodyCondition: string;
  selfRating: string;
  goals: number | '';
  assists: number | '';
  // Position-specific inputs
  positionInputs: Record<string, string | number | ''>;
  midRole?: string; // 'cdm' | 'cm' | 'cam'
}

export const AGE_GROUP_MAX_MINUTES: Record<string, number> = {
  'U13': 60, 'U14': 70, 'U15/U16': 70, 'U17/U18': 80, 'U19+': 90,
};

export const MATCH_AGE_GROUPS = ['U13', 'U14', 'U15/U16', 'U17/U18', 'U19+'] as const;
export const COMPETITIONS = ['League', 'Tournament', 'Friendly'] as const;
export const VENUES = ['Home', 'Away'] as const;
export const CARDS = ['None', 'Yellow', 'Red'] as const;
export const BODY_CONDITIONS = [
  { label: 'Fresh' },
  { label: 'Good' },
  { label: 'Tired' },
  { label: 'Knock' },
] as const;
export const SELF_RATINGS = ['Poor', 'Average', 'Good', 'Excellent'] as const;

export const POSITION_QUESTIONS: Record<string, { id: string; label: string; options: string[]; cols?: number }[]> = {
  Goalkeeper: [
    { id: 'saves', label: 'Saves Made', options: ['0', '1–2', '3–5', '6+'] },
    { id: 'setpieces', label: 'Set Pieces Faced', options: ['None', '1–3', '4–6', '7+'] },
    { id: 'clearances', label: 'Clearances Made', options: ['None', '1–2', '3–5', '6+'] },
    { id: 'error', label: 'Critical Error Leading to Goal?', options: ['No', 'Yes'], cols: 2 },
    { id: 'distribution', label: 'Distribution Today', options: ['Poor', 'Average', 'Good', 'Excellent'] },
  ],
  Defender: [
    { id: 'aerialduels', label: 'Aerial Duels', options: ['Won most', 'Mixed', 'Lost most'], cols: 3 },
    { id: 'groundduels', label: 'Ground Duels', options: ['Won most', 'Mixed', 'Lost most'], cols: 3 },
    { id: 'keyblock', label: 'Block or Clearance Preventing a Goal?', options: ['No', 'Yes'], cols: 2 },
    { id: 'error', label: 'Critical Error Leading to Goal?', options: ['No', 'Yes'], cols: 2 },
    { id: 'defrating', label: 'Overall Defensive Performance', options: ['Poor', 'Average', 'Good', 'Dominant'] },
  ],
  Midfielder: [
    { id: 'midrole', label: 'Midfielder Type', options: ['Defensive', 'Box-to-box', 'Attacking'], cols: 3 },
  ],
  Attacker: [
    { id: 'shots', label: 'Shots on Target', options: ['0', '1–2', '3–4', '5+'] },
    { id: 'shotsoff', label: 'Shots off Target', options: ['0', '1–2', '3–4', '4+'] },
    { id: 'bigchance', label: 'Missed Big Chance?', options: ['No', 'Yes, one', 'Multiple'], cols: 3 },
    { id: 'penalty', label: 'Won a Penalty?', options: ['No', 'Yes'], cols: 2 },
    { id: 'attackthreat', label: 'Overall Attacking Threat', options: ['Quiet', 'Present', 'Dangerous', 'Dominant'] },
  ],
};

export const MID_ROLE_QUESTIONS: Record<string, { id: string; label: string; options: string[]; cols?: number }[]> = {
  cdm: [
    { id: 'interceptions', label: 'Interceptions', options: ['None', '1–2', '3–4', '5+'] },
    { id: 'aerialduels', label: 'Aerial Duels', options: ['Won most', 'Mixed', 'Lost most'], cols: 3 },
    { id: 'groundduels', label: 'Ground Duels / Tackles', options: ['Won most', 'Mixed', 'Lost most'], cols: 3 },
    { id: 'balllosses', label: 'Ball Losses in Dangerous Areas', options: ['Never', '1–2', '3–4', 'Frequently'] },
    { id: 'keydefense', label: 'Key Defensive Contribution?', options: ['No', 'Yes'], cols: 2 },
    { id: 'error', label: 'Critical Error Leading to Goal?', options: ['No', 'Yes'], cols: 2 },
    { id: 'passing', label: 'Passing Today', options: ['Poor', 'Average', 'Good', 'Dominant'] },
  ],
  cm: [
    { id: 'interceptions', label: 'Interceptions', options: ['None', '1–2', '3–4', '5+'] },
    { id: 'balllosses', label: 'Ball Losses in Dangerous Areas', options: ['Never', '1–2', '3–4', 'Frequently'] },
    { id: 'keydefense', label: 'Key Defensive Contribution?', options: ['No', 'Yes'], cols: 2 },
    { id: 'error', label: 'Critical Error Leading to Goal?', options: ['No', 'Yes'], cols: 2 },
    { id: 'passing', label: 'Passing Today', options: ['Poor', 'Average', 'Good', 'Dominant'] },
  ],
  cam: [
    { id: 'shots', label: 'Shots on Target', options: ['0', '1–2', '3–4', '5+'] },
    { id: 'keychance', label: 'Key Chance Created (not converted)?', options: ['No', 'Yes, one', 'Multiple'], cols: 3 },
    { id: 'balllosses', label: 'Ball Losses in Dangerous Areas', options: ['Never', '1–2', '3–4', 'Frequently'] },
    { id: 'error', label: 'Critical Error Leading to Goal?', options: ['No', 'Yes'], cols: 2 },
    { id: 'passing', label: 'Passing & Creativity Today', options: ['Poor', 'Average', 'Good', 'Dominant'] },
    { id: 'attackthreat', label: 'Overall Attacking Threat', options: ['Quiet', 'Present', 'Dangerous', 'Dominant'] },
  ],
};

const MID_ROLE_MAP: Record<string, string> = { 'Defensive': 'cdm', 'Box-to-box': 'cm', 'Attacking': 'cam' };

export function hasAnyInput(inputs: MatchInputs): boolean {
  return !!(
    inputs.competition || inputs.venue ||
    inputs.ageGroup || inputs.cardReceived !== 'None' ||
    inputs.bodyCondition || inputs.selfRating ||
    inputs.teamScore !== '' || inputs.opponentScore !== '' ||
    inputs.minutesPlayed !== '' || inputs.goals !== '' || inputs.assists !== '' ||
    Object.values(inputs.positionInputs).some(v => v !== '' && v !== undefined)
  );
}

export function computeRating(inputs: MatchInputs): number | null {
  if (!hasAnyInput(inputs)) return null;

  let score = 6.5;
  const us = inputs.teamScore !== '' ? Number(inputs.teamScore) : NaN;
  const them = inputs.opponentScore !== '' ? Number(inputs.opponentScore) : NaN;
  const hasScore = !isNaN(us) && !isNaN(them) && us >= 0 && them >= 0;
  const cleanSheet = hasScore && them === 0;
  const fm = inputs.competition === 'Friendly' ? 0.8 : 1.0;
  const goals = inputs.goals !== '' ? Number(inputs.goals) : 0;
  const assists = inputs.assists !== '' ? Number(inputs.assists) : 0;
  const p = inputs.positionInputs;
  const get = (id: string) => (p[id] as string) || '';

  // Universal modifiers
  if (hasScore) { if (us > them) score += 0.2 * fm; else if (us < them) score -= 0.1 * fm; }
  if (inputs.venue === 'Away') score += 0.1 * fm;

  const max = inputs.ageGroup ? (AGE_GROUP_MAX_MINUTES[inputs.ageGroup] || 90) : 90;
  const mins = inputs.minutesPlayed !== '' ? Number(inputs.minutesPlayed) : 0;
  const pct = max > 0 ? mins / max : 0;
  if (pct >= 1.0) score += 0.3 * fm;
  else if (pct >= 0.75) score += 0.1 * fm;
  else if (pct > 0 && pct < 0.5) score -= 0.1 * fm;

  const card = inputs.cardReceived;
  if (card === 'Yellow') score -= 0.2;
  if (card === 'Red') score -= 0.6;

  if (inputs.bodyCondition === 'Fresh') score += 0.05;
  if (inputs.bodyCondition === 'Knock') score -= 0.05;

  if (inputs.selfRating === 'Poor') score -= 0.2;
  else if (inputs.selfRating === 'Good') score += 0.1;
  else if (inputs.selfRating === 'Excellent') score += 0.2;

  // Position-specific modifiers
  const pos = inputs.position;

  if (pos === 'Goalkeeper') {
    if (cleanSheet) score += 0.7 * fm;
    const saves = get('saves');
    if (saves === '1–2') score += 0.2 * fm;
    else if (saves === '3–5') score += 0.4 * fm;
    else if (saves === '6+') score += 0.6 * fm;
    const sp = get('setpieces');
    if (sp === '7+') score += (cleanSheet ? 0.2 : -0.1) * fm;
    const cl = get('clearances');
    if (cl === '3–5') score += 0.1 * fm;
    else if (cl === '6+') score += 0.2 * fm;
    const pf = p['penFaced'] !== '' && p['penFaced'] !== undefined ? Number(p['penFaced']) : 0;
    const ps = p['penSaved'] !== '' && p['penSaved'] !== undefined ? Number(p['penSaved']) : 0;
    if (ps > 0) score += ps * 0.4 * fm;
    if (pf - ps > 0) score += (pf - ps) * -0.3 * fm;
    if (get('error') === 'Yes') score -= 0.5 * fm;
    const dist = get('distribution');
    if (dist === 'Poor') score -= 0.2;
    else if (dist === 'Good') score += 0.1;
    else if (dist === 'Excellent') score += 0.2;
    if (cleanSheet && score < 7.0) score = 7.0;
    if (hasScore && them >= 4) score = Math.min(score, saves === '6+' ? 7.0 : 6.5);

  } else if (pos === 'Defender') {
    if (cleanSheet) score += 0.6 * fm;
    if (goals > 0) score += goals * 0.5 * fm;
    if (assists > 0) score += assists * 0.3 * fm;
    const aer = get('aerialduels');
    if (aer === 'Won most') score += 0.3 * fm;
    else if (aer === 'Lost most') score -= 0.2 * fm;
    const gnd = get('groundduels');
    if (gnd === 'Won most') score += 0.3 * fm;
    else if (gnd === 'Lost most') score -= 0.2 * fm;
    if (get('keyblock') === 'Yes') score += 0.4 * fm;
    if (get('error') === 'Yes') score -= 0.5 * fm;
    const dr = get('defrating');
    if (dr === 'Poor') score -= 0.2;
    else if (dr === 'Good') score += 0.1;
    else if (dr === 'Dominant') score += 0.2;
    if (cleanSheet && aer === 'Won most' && gnd === 'Won most' && score < 7.2) score = 7.2;
    if (get('error') === 'Yes' && (aer === 'Lost most' || gnd === 'Lost most') && score > 6.5) score = Math.min(score, 6.5);

  } else if (pos === 'Midfielder') {
    if (goals > 0) score += goals * 0.5 * fm;
    if (assists > 0) score += assists * 0.35 * fm;
    const midRoleRaw = get('midrole') || inputs.midRole || '';
    const role = MID_ROLE_MAP[midRoleRaw] || midRoleRaw;

    if (role === 'cdm') {
      const int = get('interceptions');
      if (int === '1–2') score += 0.1 * fm;
      else if (int === '3–4') score += 0.25 * fm;
      else if (int === '5+') score += 0.4 * fm;
      const aer = get('aerialduels');
      if (aer === 'Won most') score += 0.25 * fm;
      else if (aer === 'Lost most') score -= 0.15 * fm;
      const gnd = get('groundduels');
      if (gnd === 'Won most') score += 0.25 * fm;
      else if (gnd === 'Lost most') score -= 0.15 * fm;
      const bl = get('balllosses');
      if (bl === 'Never') score += 0.2 * fm;
      else if (bl === '3–4') score -= 0.2 * fm;
      else if (bl === 'Frequently') score -= 0.4 * fm;
      if (get('keydefense') === 'Yes') score += 0.2 * fm;
      if (get('error') === 'Yes') score -= 0.4 * fm;
      const pass = get('passing');
      if (pass === 'Poor') score -= 0.2;
      else if (pass === 'Good') score += 0.15;
      else if (pass === 'Dominant') score += 0.3;
      if (cleanSheet) score += 0.2 * fm;
      if (goals === 0 && assists === 0 && int === 'None' && bl === 'Frequently' && score > 5.8) score = Math.min(score, 5.8);

    } else if (role === 'cm') {
      const int = get('interceptions');
      if (int === '1–2') score += 0.1 * fm;
      else if (int === '3–4') score += 0.25 * fm;
      else if (int === '5+') score += 0.4 * fm;
      const bl = get('balllosses');
      if (bl === 'Never') score += 0.2 * fm;
      else if (bl === '3–4') score -= 0.2 * fm;
      else if (bl === 'Frequently') score -= 0.4 * fm;
      if (get('keydefense') === 'Yes') score += 0.2 * fm;
      if (get('error') === 'Yes') score -= 0.4 * fm;
      const pass = get('passing');
      if (pass === 'Poor') score -= 0.2;
      else if (pass === 'Good') score += 0.15;
      else if (pass === 'Dominant') score += 0.3;
      if (cleanSheet) score += 0.1 * fm;
      if (goals > 0 && assists > 0 && (int === '3–4' || int === '5+') && bl === 'Never' && score < 8.5) score = 8.5;
      if (goals === 0 && assists === 0 && int === 'None' && bl === 'Frequently' && score > 5.8) score = Math.min(score, 5.8);

    } else if (role === 'cam') {
      const son = get('shots');
      if (son === '0') score -= 0.1 * fm;
      else if (son === '1–2') score += 0.1 * fm;
      else if (son === '3–4') score += 0.2 * fm;
      else if (son === '5+') score += 0.3 * fm;
      const kc = get('keychance');
      if (kc === 'Yes, one') score += 0.15 * fm;
      else if (kc === 'Multiple') score += 0.25 * fm;
      const bl = get('balllosses');
      if (bl === 'Never') score += 0.15 * fm;
      else if (bl === '3–4') score -= 0.2 * fm;
      else if (bl === 'Frequently') score -= 0.35 * fm;
      if (get('error') === 'Yes') score -= 0.4 * fm;
      const pass = get('passing');
      if (pass === 'Poor') score -= 0.2;
      else if (pass === 'Good') score += 0.15;
      else if (pass === 'Dominant') score += 0.3;
      const at = get('attackthreat');
      if (at === 'Quiet') score -= 0.2;
      else if (at === 'Dangerous') score += 0.15;
      else if (at === 'Dominant') score += 0.3;
      if (cleanSheet) score += 0.05 * fm;
    }

  } else if (pos === 'Attacker') {
    if (goals > 0) score += goals * 0.6 * fm;
    if (assists > 0) score += assists * 0.35 * fm;
    if (goals >= 3) score = Math.max(score, 9.0);
    const son = get('shots');
    if (son === '0') score -= 0.1 * fm;
    else if (son === '1–2') score += 0.1 * fm;
    else if (son === '3–4') score += 0.2 * fm;
    else if (son === '5+') score += 0.3 * fm;
    const soff = get('shotsoff');
    if (soff === '1–2') score -= 0.1 * fm;
    else if (soff === '3–4') score -= 0.15 * fm;
    else if (soff === '4+') score -= 0.2 * fm;
    const bc = get('bigchance');
    if (bc === 'Yes, one') score -= 0.3 * fm;
    else if (bc === 'Multiple') score -= 0.5 * fm;
    if (get('penalty') === 'Yes') score += 0.25 * fm;
    const at = get('attackthreat');
    if (at === 'Quiet') score -= 0.2;
    else if (at === 'Dangerous') score += 0.15;
    else if (at === 'Dominant') score += 0.3;
    if (son === '0' && bc !== 'No' && at === 'Quiet' && score > 6.2) score = Math.min(score, 6.2);
  }

  // Red card hard cap
  if (card === 'Red') score = Math.min(score, 6.0);

  // Clamp 4.0–10.0
  score = Math.max(4.0, Math.min(10.0, Math.round(score * 10) / 10));
  return score;
}

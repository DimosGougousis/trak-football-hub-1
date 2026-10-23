-- TRAK-260 (TRAK-258 E, Imad, 22 Oct): what a coach knows about each of their
-- players beyond the roster: preferred foot, nationality and traits, entered by
-- the coach, and the date of birth the academy's roster already holds.
--
-- squad_player_profiles: one row per squad row. Only that row's coach reads or
-- writes it (squad_player_is_mine: their own row, not departed, in their
-- academy), so a colleague, the player, a guardian and a visitor read nothing.
-- Foot, nationality and traits come from fixed lists checked here, so nothing
-- free-text is ever written about a child (as TRAK-249 does for absences). The
-- trait list is Imad's (src/lib/player-traits.ts holds the same list; a test
-- keeps them equal) and the nationalities are the signup list
-- (src/lib/constants.ts NATIONALITIES). Nobody deletes a row; it goes with its
-- squad row.
--
-- coach_player_birth_dates: the academy roster's date of birth, for the
-- caller's own players only. roster_children itself stays service-role only.
--
-- notification_settings: the coach's two in-app switches (TRAK-261, TRAK-262),
-- on unless turned off, beside the reminder switch the same person already owns.

CREATE TABLE public.squad_player_profiles (
  squad_player_id uuid PRIMARY KEY REFERENCES public.squad_players(id) ON DELETE CASCADE,
  preferred_foot  text CHECK (preferred_foot IN ('left', 'right', 'both')),
  nationality     text CONSTRAINT squad_player_profiles_nationality_listed CHECK (nationality = ANY (ARRAY[
    'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
    'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas',
    'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize',
    'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil',
    'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon',
    'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China',
    'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba',
    'Curacao', 'Cyprus', 'Czech Republic', 'Democratic Republic of the Congo', 'Denmark', 'Djibouti',
    'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'England',
    'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji',
    'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany',
    'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau',
    'Guyana', 'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland',
    'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel',
    'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan',
    'Kenya', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia',
    'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania',
    'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali',
    'Malta', 'Mauritania', 'Mauritius', 'Mexico', 'Moldova', 'Monaco',
    'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia',
    'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria',
    'North Korea', 'North Macedonia', 'Northern Ireland', 'Norway', 'Oman', 'Pakistan',
    'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
    'Poland', 'Portugal', 'Puerto Rico', 'Qatar', 'Romania', 'Russia',
    'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino',
    'Sao Tome and Principe', 'Saudi Arabia', 'Scotland', 'Senegal', 'Serbia', 'Seychelles',
    'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
    'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan',
    'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan',
    'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago',
    'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine', 'United Arab Emirates',
    'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Venezuela', 'Vietnam',
    'Wales', 'Yemen', 'Zambia', 'Zimbabwe'
  ]::text[])),
  traits          text[] NOT NULL DEFAULT '{}' CONSTRAINT squad_player_profiles_traits_listed CHECK (traits <@ ARRAY[
    'Gets forward whenever possible', 'Stays back at all times', 'Comes deep to get the ball',
    'Dribbles down left', 'Dribbles down right', 'Dribbles down center',
    'Runs with ball often', 'Runs with ball occasionally', 'Hugs touchline',
    'Cuts inside', 'Gets into opposition area', 'Arrives late in opposition area',
    'Beats the offside trap', 'Plays with back to goal', 'Stays inside penalty area',
    'Moves into channels', 'Plays one-twos', 'Tries to knock ball past opponent',
    'Tries killer balls often', 'Does not try killer balls', 'Tries long range passes',
    'Plays short simple passes', 'Slows down pace', 'Dwells on ball',
    'Looks for pass rather than finishing', 'Dictates tempo', 'Switches ball to wide areas',
    'Ball to feet', 'Shoots from distance', 'Refrains from long shots',
    'Lobs the keeper', 'Rounds the keeper', 'Shoots with power',
    'Places shots', 'First time shots', 'Tries overhead kicks',
    'Tries power free kicks', 'Tries long range free kicks', 'Dives into tackles',
    'Does not dive into tackles', 'Marks opponent tightly', 'Brings ball out of defense',
    'Plays out of trouble', 'Tries tricks', 'Curls balls',
    'Uses outside of foot', 'Likes to beat opponent repeatedly', 'Adjusts foot before attempting strike',
    'Avoids weaker foot', 'Uses weaker foot', 'Long flat throw',
    'Uses long throw to start counter-attacks'
  ]::text[]),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Picking one of a pair unpicks the other in the app; both together are refused here.
  CONSTRAINT squad_player_profiles_traits_not_opposite CHECK (NOT (
    traits @> ARRAY['Gets forward whenever possible', 'Stays back at all times']::text[] OR
    traits @> ARRAY['Runs with ball often', 'Runs with ball occasionally']::text[] OR
    traits @> ARRAY['Tries killer balls often', 'Does not try killer balls']::text[] OR
    traits @> ARRAY['Shoots from distance', 'Refrains from long shots']::text[] OR
    traits @> ARRAY['Dives into tackles', 'Does not dive into tackles']::text[] OR
    traits @> ARRAY['Avoids weaker foot', 'Uses weaker foot']::text[]
  ))
);
ALTER TABLE public.squad_player_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.squad_player_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.squad_player_profiles TO authenticated;

CREATE POLICY "Coaches read their own players' profiles" ON public.squad_player_profiles
  FOR SELECT TO authenticated USING (public.squad_player_is_mine(squad_player_id));
CREATE POLICY "Coaches add their own players' profiles" ON public.squad_player_profiles
  FOR INSERT TO authenticated WITH CHECK (public.squad_player_is_mine(squad_player_id));
CREATE POLICY "Coaches change their own players' profiles" ON public.squad_player_profiles
  FOR UPDATE TO authenticated
  USING (public.squad_player_is_mine(squad_player_id))
  WITH CHECK (public.squad_player_is_mine(squad_player_id));

CREATE TRIGGER squad_player_profiles_updated_at
  BEFORE UPDATE ON public.squad_player_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The academy roster's date of birth for the caller's own current squad rows,
-- optionally one squad. A row with no roster entry (made before the roster) has
-- none.
CREATE FUNCTION public.coach_player_birth_dates(p_squad text DEFAULT NULL)
RETURNS TABLE (squad_player_id uuid, date_of_birth date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT sp.id, rc.date_of_birth
  FROM public.squad_players sp
  JOIN public.roster_children rc ON rc.squad_player_id = sp.id
  WHERE sp.coach_user_id = (SELECT auth.uid())
    AND public.squad_player_is_mine(sp.id)
    AND (p_squad IS NULL OR sp.age_group = p_squad)
  ORDER BY sp.id;
$fn$;
REVOKE ALL ON FUNCTION public.coach_player_birth_dates(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_player_birth_dates(text) TO authenticated;

ALTER TABLE public.notification_settings
  ADD COLUMN cant_make_it_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN needs_you           boolean NOT NULL DEFAULT true;

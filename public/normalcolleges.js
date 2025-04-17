/**
 * Normalize any college name or alias into a consistent key.
 * - Keeps ampersands (&) so that "A&M" → "a&m"
 * - Strips out other punctuation
 * - Lowercases everything
 * - Removes leading "University of" / "College of"
 * - Unifies "St." / "St" → "state"
 * - Strips trailing "university" when it leaves at least two words
 */
export function normalizeCollege(str) {
  // 1. Lowercase, remove all punctuation except ampersand (&), trim whitespace
  let s = str
    .replace(/[^\w\s&]/gi, '')  // allow letters, numbers, spaces, and '&'
    .toLowerCase()
    .trim();

  // 2. Remove leading "university of " or "college of "
  if (s.startsWith('university of ')) {
    s = s.slice('university of '.length).trim();
  } else if (s.startsWith('college of ')) {
    s = s.slice('college of '.length).trim();
  }

  // 3. Split into tokens and unify any trailing "st" or "st." → "state"
  let tokens = s.split(/\s+/);
  if (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (last === 'st' || last === 'st.') {
      tokens[tokens.length - 1] = 'state';
    }
  }
  s = tokens.join(' ');

  // 4. If it ends with " university" and dropping that
  //    leaves at least two words, remove the trailing " university"
  if (s.endsWith(' university')) {
    const withoutUniv = s.slice(0, s.lastIndexOf(' university')).trim();
    if (withoutUniv.split(/\s+/).length >= 2) {
      s = withoutUniv;
    }
  }

  // 5. Do NOT strip off trailing "college", "state", "tech", or "a&m"
  //    — they remain part of the normalized key.

  return s;
}

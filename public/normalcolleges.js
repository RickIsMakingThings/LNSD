function normalizeCollege(str) {
  // 1. Remove punctuation and lowercase.
  let s = str.replace(/[^\w\s]/gi, "").toLowerCase().trim();

  // 2. Remove leading "university of" or "college of".
  if (s.startsWith("university of ")) {
    s = s.slice("university of ".length).trim();
  } else if (s.startsWith("college of ")) {
    s = s.slice("college of ".length).trim();
  }

  // 3. Split into tokens to unify "St." / "St" / "St" => "state"
  let tokens = s.split(/\s+/);
  if (tokens.length > 1) {
    let last = tokens[tokens.length - 1];
    // If last token is "st", "st." => unify to "state"
    if (["st", "st."].includes(last)) {
      tokens[tokens.length - 1] = "state";
    }
    // If last token is "state", do nothing (already "state").
  }
  s = tokens.join(" ");

  // 4. If the string ends with "university" and removing it 
  //    won't leave a single token, remove it.
  if (s.endsWith(" university")) {
    let tmp = s.slice(0, s.lastIndexOf(" university")).trim();
    if (tmp.split(/\s+/).length >= 2) {
      s = tmp;
    }
  }

  // We do NOT remove trailing "college," "state," "tech," or "a&m"
  // to respect the user's request for them to remain intact.

  return s;
}

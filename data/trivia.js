/*
  ============================================================
  REELWISE — MASTER TRIVIA VAULT
  ============================================================

  All curated Reelwise trivia modules are combined here.

  Trivia Vault = PRIMARY source
  Wikipedia = FALLBACK source

  To add or correct trivia, edit the appropriate era file.
*/

import TRIVIA_CLASSICS from "./trivia-classics.js";
import TRIVIA_80S from "./trivia-80s.js";
import TRIVIA_90S from "./trivia-90s.js";
import TRIVIA_2000S from "./trivia-2000s.js";
import TRIVIA_2010S from "./trivia-2010s.js";
import TRIVIA_2020S from "./trivia-2020s.js";

const TRIVIA_VAULT = {
  ...TRIVIA_CLASSICS,
  ...TRIVIA_80S,
  ...TRIVIA_90S,
  ...TRIVIA_2000S,
  ...TRIVIA_2010S,
  ...TRIVIA_2020S
};

export default TRIVIA_VAULT;

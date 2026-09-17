/*
  ============================================================
  REELWISE — MASTER TRIVIA VAULT
  ============================================================

  All curated Reelwise trivia modules are combined here.

  Trivia Vault = PRIMARY source
  Wikipedia = FALLBACK source

  To expand Reelwise, add trivia to the appropriate era file.
*/

import TRIVIA_CLASSICS from "./trivia-classics.js";
import TRIVIA_80S from "./trivia-80s.js";
import TRIVIA_90S from "./trivia-90s.js";
import TRIVIA_2000S from "./trivia-2000s.js";
import TRIVIA_2010S from "./trivia-2010s.js";


const TRIVIA_VAULT = {

  // Classic movies through the 1970s
  ...TRIVIA_CLASSICS,

  // 1980–1989
  ...TRIVIA_80S,

  // 1990–1999
  ...TRIVIA_90S,

  // 2000–2009
  ...TRIVIA_2000S,

  // 2010–2019
  ...TRIVIA_2010S

};


export default TRIVIA_VAULT;

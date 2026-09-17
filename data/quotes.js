/*
  ============================================================
  REELWISE — MASTER QUOTE VAULT
  ============================================================

  All curated Reelwise quote modules are combined here.

  The Quote Vault is organized by era so Reelwise can keep
  growing without creating one enormous file.

  To add or correct quotes, edit the appropriate era file.
*/

import QUOTES_CLASSICS from "./quotes-classics.js";
import QUOTES_80S from "./quotes-80s.js";
import QUOTES_90S from "./quotes-90s.js";
import QUOTES_2000S from "./quotes-2000s.js";
import QUOTES_2010S from "./quotes-2010s.js";
import QUOTES_2020S from "./quotes-2020s.js";


const QUOTE_VAULT = {

  // Classics through 1979
  ...QUOTES_CLASSICS,

  // 1980–1989
  ...QUOTES_80S,

  // 1990–1999
  ...QUOTES_90S,

  // 2000–2009
  ...QUOTES_2000S,

  // 2010–2019
  ...QUOTES_2010S,

  // 2020–2029
  ...QUOTES_2020S

};


export default QUOTE_VAULT;

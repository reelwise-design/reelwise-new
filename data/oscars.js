/*
  ============================================================
  REELWISE OSCAR VAULT
  ============================================================

  Purpose:
  Store Academy Award records Reelwise has explicitly confirmed so
  the Accolades page does not depend entirely on a live third-party
  request.

  IMPORTANT:
  - A record with confirmed:true and history:[] means confirmed ZERO.
  - Do not add an actor unless the Oscar record has been verified.
  - Live Academy/Wikipedia/Wikidata lookups remain available for actors
    not yet in this vault.
  ============================================================
*/

const OSCAR_VAULT = {
  "bruce willis": {
    confirmed: true,
    found: false,
    wins: 0,
    nominations: 0,
    history: []
  },

  "edward norton": {
    confirmed: true,
    found: true,
    wins: 0,
    nominations: 4,
    history: [
      { year: "2025", movie: "A Complete Unknown", category: "Best Supporting Actor", winner: false },
      { year: "2015", movie: "Birdman", category: "Best Supporting Actor", winner: false },
      { year: "1999", movie: "American History X", category: "Best Actor", winner: false },
      { year: "1997", movie: "Primal Fear", category: "Best Supporting Actor", winner: false }
    ]
  },

  "meryl streep": {
    confirmed: true,
    found: true,
    wins: 3,
    nominations: 21,
    history: null
  }
};

function normalizeOscarVaultName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function getOscarVaultRecord(name = "") {
  const record =
    OSCAR_VAULT[
      normalizeOscarVaultName(name)
    ];

  if (!record) return null;

  /*
    A totals-only entry is intentionally not returned as a complete
    record. It can be expanded later without risking an incomplete
    nomination list on the site.
  */
  if (!Array.isArray(record.history)) {
    return null;
  }

  const history =
    record.history.map(item => ({
      ...item
    }));

  const academyAwards =
    history.map(item => ({
      award: item.category,
      result: item.winner ? "Winner" : "Nominee",
      year: item.year,
      work: item.movie,
      ceremony: ""
    }));

  return {
    confirmed: true,
    found: Boolean(record.found),
    wins: Number(record.wins) || 0,
    nominations: Number(record.nominations) || 0,
    history,
    academy_awards: academyAwards,
    academyAwards,
    accolades: academyAwards,
    source: "Reelwise Oscar Vault"
  };
}

export default OSCAR_VAULT;

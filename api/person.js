const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE PERSON API
  ============================================================

  Handles Reelwise star profiles AND Academy Awards.

  Normal:
    /api/person?id=123

  Academy Awards:
    /api/person?id=123&mode=accolades

  The accolades response always returns valid JSON in the shape
  expected by Reelwise:
    found
    wins
    nominations
    history
  ============================================================
*/

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/\[\d+\]/g, "")
    .trim();
}

function removeWikipediaEnding(text = "") {
  return text
    .replace(/\s*References\s*$/i, "")
    .replace(/\s*External links\s*$/i, "")
    .trim();
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Expected JSON response.");
  }

  return response.json();
}

/*
  ============================================================
  WIKIPEDIA BIOGRAPHY
  ============================================================
*/

async function getWikipediaBiography(name) {
  try {
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: name,
        format: "json",
        origin: "*"
      });

    const searchData = await fetchJSON(searchUrl);
    const results = searchData?.query?.search || [];

    if (!results.length) return "";

    const exactMatch = results.find(
      item =>
        item.title &&
        item.title.toLowerCase() === String(name).toLowerCase()
    );

    const pageTitle = exactMatch?.title || results[0]?.title;

    if (!pageTitle) return "";

    const summaryUrl =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(pageTitle);

    const summaryData = await fetchJSON(summaryUrl);

    let bio = cleanText(summaryData?.extract || "");
    bio = removeWikipediaEnding(bio);

    if (
      summaryData?.type === "disambiguation" ||
      bio.length < 80
    ) {
      return "";
    }

    return bio;
  } catch (error) {
    console.error("Wikipedia biography error:", error);
    return "";
  }
}

/*
  ============================================================
  TMDB
  ============================================================
*/

async function getPersonDetails(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${encodeURIComponent(personId)}` +
    "?language=en-US";

  return fetchJSON(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      accept: "application/json"
    }
  });
}

async function getMovieCredits(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${encodeURIComponent(personId)}/movie_credits` +
    "?language=en-US";

  const data = await fetchJSON(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      accept: "application/json"
    }
  });

  return data?.cast || [];
}

/*
  ============================================================
  ACADEMY AWARDS / WIKIDATA
  ============================================================

  OscarBase has been removed.

  Flow:
  1. Resolve the exact Wikidata person using the TMDB ID (P4947).
  2. Read award received (P166) and nominated for (P1411).
  3. Keep only Academy Award categories.
  4. Read point in time (P585), for work (P1686), and ceremony
     information when available.
  5. Return the same Reelwise response shape already expected by
     index.html.

  Wikidata models:
    P166  = award received
    P1411 = nominated for
    P585  = point in time
    P1686 = for work
    P805  = statement is subject of
    P31   = instance of
    Q19020 = Academy Awards
  ============================================================
*/

function emptyAccolades(personId, unavailable = false) {
  return {
    found: false,
    tmdb_person_id: Number(personId) || null,
    wins: 0,
    nominations: 0,
    history: [],
    academy_awards: [],
    academyAwards: [],
    accolades: [],
    unavailable,
    source: "Wikidata"
  };
}

async function wikidataEntitySearchByTmdb(personId) {
  const sparql = `
    SELECT ?person WHERE {
      ?person wdt:P4947 "${String(personId).replace(/"/g, '\\"')}" .
    }
    LIMIT 2
  `;

  const url =
    "https://query.wikidata.org/sparql?" +
    new URLSearchParams({
      query: sparql,
      format: "json"
    });

  const data = await fetchJSON(url, {
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": "Reelwise/1.0 (movie information website)"
    }
  });

  const value =
    data?.results?.bindings?.[0]?.person?.value || "";

  const match = value.match(/\/(Q\d+)$/);

  return match ? match[1] : "";
}

async function getWikidataEntity(qid) {
  if (!qid) return null;

  const url =
    "https://www.wikidata.org/wiki/Special:EntityData/" +
    encodeURIComponent(qid) +
    ".json";

  const data = await fetchJSON(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Reelwise/1.0 (movie information website)"
    }
  });

  return data?.entities?.[qid] || null;
}

function entityEnglishLabel(entity, fallback = "") {
  return cleanText(
    entity?.labels?.en?.value ||
    entity?.labels?.["en-gb"]?.value ||
    fallback
  );
}

function claimItemId(claim) {
  const value =
    claim?.mainsnak?.datavalue?.value;

  return value?.id || "";
}

function qualifierItemId(claim, property) {
  const value =
    claim?.qualifiers?.[property]?.[0]?.datavalue?.value;

  return value?.id || "";
}

function qualifierYear(claim) {
  const value =
    claim?.qualifiers?.P585?.[0]?.datavalue?.value;

  const time = value?.time || "";

  const match = String(time).match(/[+-](\d{4,})-/);

  return match ? Number(match[1]) : null;
}

async function loadEntities(qids = []) {
  const unique = [...new Set(qids.filter(Boolean))];

  if (!unique.length) return {};

  const output = {};

  for (let i = 0; i < unique.length; i += 40) {
    const batch = unique.slice(i, i + 40);

    const url =
      "https://www.wikidata.org/w/api.php?" +
      new URLSearchParams({
        action: "wbgetentities",
        ids: batch.join("|"),
        props: "labels|claims",
        languages: "en",
        format: "json",
        origin: "*"
      });

    const data = await fetchJSON(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Reelwise/1.0 (movie information website)"
      }
    });

    Object.assign(output, data?.entities || {});
  }

  return output;
}

function isAcademyAwardEntity(entity) {
  if (!entity) return false;

  const label =
    entityEnglishLabel(entity).toLowerCase();

  if (
    label.includes("academy award") ||
    label.includes("academy honorary award") ||
    label.includes("scientific and technical award")
  ) {
    return true;
  }

  const instanceClaims =
    entity?.claims?.P31 || [];

  return instanceClaims.some(
    claim => claimItemId(claim) === "Q19020"
  );
}

function academyAwardResult({
  claim,
  winner,
  awardEntities,
  relatedEntities
}) {
  const awardId = claimItemId(claim);

  if (!awardId) return null;

  const awardEntity = awardEntities[awardId];

  if (!isAcademyAwardEntity(awardEntity)) {
    return null;
  }

  const workId =
    qualifierItemId(claim, "P1686");

  const ceremonyId =
    qualifierItemId(claim, "P805");

  let year = qualifierYear(claim);

  const ceremonyEntity =
    relatedEntities[ceremonyId];

  if (!year && ceremonyEntity) {
    const ceremonyTime =
      ceremonyEntity?.claims?.P585?.[0];

    const value =
      ceremonyTime?.mainsnak?.datavalue?.value;

    const match =
      String(value?.time || "").match(/[+-](\d{4,})-/);

    if (match) {
      year = Number(match[1]);
    }
  }

  return {
    year,
    category:
      entityEnglishLabel(
        awardEntity,
        "Academy Award"
      ),
    movie:
      entityEnglishLabel(
        relatedEntities[workId],
        ""
      ),
    winner: Boolean(winner)
  };
}

function dedupeAcademyHistory(items = []) {
  const map = new Map();

  for (const item of items) {
    if (!item?.category) continue;

    const key = [
      item.year || "",
      cleanText(item.category).toLowerCase(),
      cleanText(item.movie).toLowerCase()
    ].join("|");

    const existing = map.get(key);

    /*
      P166 proves a win. If Wikidata also contains the same event
      as P1411, keep the winning version instead of counting twice.
    */
    if (!existing || item.winner) {
      map.set(key, item);
    }
  }

  return [...map.values()].sort((a, b) => {
    return (b.year || 0) - (a.year || 0);
  });
}

async function getAccolades(personId) {
  try {
    const qid =
      await wikidataEntitySearchByTmdb(personId);

    /*
      Failure to resolve the TMDB ID is different from a confirmed
      zero-Oscar record, so report the source as unavailable.
    */
    if (!qid) {
      return emptyAccolades(personId, true);
    }

    const person =
      await getWikidataEntity(qid);

    if (!person) {
      return emptyAccolades(personId, true);
    }

    const winClaims =
      Array.isArray(person?.claims?.P166)
        ? person.claims.P166
        : [];

    const nominationClaims =
      Array.isArray(person?.claims?.P1411)
        ? person.claims.P1411
        : [];

    const allClaims = [
      ...winClaims,
      ...nominationClaims
    ];

    /*
      No P166/P1411 statements means Wikidata has no award record
      to inspect. For Reelwise this is returned as a clean zero
      record instead of a transport/API error.
    */
    if (!allClaims.length) {
      return emptyAccolades(personId, false);
    }

    const awardIds =
      allClaims.map(claimItemId);

    const awardEntities =
      await loadEntities(awardIds);

    const academyWinClaims =
      winClaims.filter(claim =>
        isAcademyAwardEntity(
          awardEntities[claimItemId(claim)]
        )
      );

    const academyNominationClaims =
      nominationClaims.filter(claim =>
        isAcademyAwardEntity(
          awardEntities[claimItemId(claim)]
        )
      );

    const academyClaims = [
      ...academyWinClaims,
      ...academyNominationClaims
    ];

    if (!academyClaims.length) {
      return emptyAccolades(personId, false);
    }

    const relatedIds = [];

    for (const claim of academyClaims) {
      relatedIds.push(
        qualifierItemId(claim, "P1686"),
        qualifierItemId(claim, "P805")
      );
    }

    const relatedEntities =
      await loadEntities(relatedIds);

    const history =
      dedupeAcademyHistory([
        ...academyWinClaims.map(claim =>
          academyAwardResult({
            claim,
            winner: true,
            awardEntities,
            relatedEntities
          })
        ),
        ...academyNominationClaims.map(claim =>
          academyAwardResult({
            claim,
            winner: false,
            awardEntities,
            relatedEntities
          })
        )
      ].filter(Boolean));

    const wins =
      history.filter(item => item.winner).length;

    const academyAwards =
      history.map(item => ({
        award: item.category,
        category: item.category,
        result:
          item.winner
            ? "Winner"
            : "Nominee",
        winner: item.winner,
        year: item.year,
        work: item.movie,
        movie: item.movie,
        ceremony: ""
      }));

    return {
      found: history.length > 0,
      tmdb_person_id:
        Number(personId) || null,
      person: {
        name:
          entityEnglishLabel(person, ""),
        tmdb_person_id:
          Number(personId) || null,
        wikidata_id: qid
      },
      wins,
      nominations: history.length,
      history,
      academy_awards: academyAwards,
      academyAwards,
      accolades: academyAwards,
      unavailable: false,
      source: "Wikidata"
    };
  } catch (error) {
    console.error(
      "Reelwise Wikidata accolades error:",
      error
    );

    return emptyAccolades(personId, true);
  }
}

/*
  ============================================================
  KNOWN FOR
  ============================================================
*/

function buildKnownFor(credits = []) {
  const seen = new Set();

  return credits
    .filter(movie => {
      if (!movie?.id || !movie?.title) return false;
      if (seen.has(movie.id)) return false;

      seen.add(movie.id);
      return true;
    })
    .sort((a, b) => {
      const scoreA =
        (Number(a.popularity) || 0) +
        Math.log10((Number(a.vote_count) || 0) + 1) * 10;

      const scoreB =
        (Number(b.popularity) || 0) +
        Math.log10((Number(b.vote_count) || 0) + 1) * 10;

      return scoreB - scoreA;
    })
    .slice(0, 12)
    .map(movie => ({
      id: movie.id,
      title: movie.title,
      character: movie.character || "",
      release_date: movie.release_date || "",
      poster_path: movie.poster_path || null,
      backdrop_path: movie.backdrop_path || null,
      popularity: movie.popularity || 0,
      vote_average: movie.vote_average || 0,
      vote_count: movie.vote_count || 0
    }));
}

/*
  ============================================================
  API HANDLER
  ============================================================
*/

export default async function handler(req, res) {
  try {
    if (!TOKEN) {
      return res.status(500).json({
        error: "TMDB_READ_ACCESS_TOKEN is missing."
      });
    }

    const personId =
      req.query.id ||
      req.query.personId ||
      req.query.person_id;

    if (!personId) {
      return res.status(400).json({
        error: "Person ID is required."
      });
    }

    const mode =
      String(req.query.mode || "").toLowerCase();

    /*
      ----------------------------------------------------------
      ACADEMY AWARDS MODE
      ----------------------------------------------------------
      This is the request made by the Academy Awards screen.
    */
    if (mode === "accolades") {
      const awardsData = await getAccolades(personId);

      res.setHeader(
        "Cache-Control",
        "no-store, max-age=0"
      );

      return res.status(200).json(awardsData);
    }

    /*
      ----------------------------------------------------------
      NORMAL STAR PROFILE MODE
      ----------------------------------------------------------
    */
    const [person, credits] = await Promise.all([
      getPersonDetails(personId),
      getMovieCredits(personId)
    ]);

    const wikipediaBio =
      await getWikipediaBiography(person.name);

    const tmdbBio =
      cleanText(person.biography || "");

    const biography =
      wikipediaBio ||
      tmdbBio ||
      `${person.name} is a film actor and filmmaker.`;

    const knownFor = buildKnownFor(credits);

    /*
      Awards are included here too for compatibility, but a failure
      cannot stop the star profile from loading.
    */
    const awardsData =
      await getAccolades(personId);

    res.setHeader(
      "Cache-Control",
      "no-store, max-age=0"
    );

    return res.status(200).json({
      id: person.id,

      name: person.name || "",

      birthday: person.birthday || null,

      deathday: person.deathday || null,

      place_of_birth:
        person.place_of_birth || "",

      biography,

      profile_path:
        person.profile_path || null,

      homepage:
        person.homepage || null,

      imdb_id:
        person.imdb_id || null,

      known_for_department:
        person.known_for_department || "",

      popularity:
        person.popularity || 0,

      known_for: knownFor,

      knownFor,

      movies: knownFor,

      reelwise_academy_awards: {
        wins: awardsData.wins,
        nominations: awardsData.nominations
      },

      academy_awards:
        awardsData.academy_awards,

      academyAwards:
        awardsData.academyAwards,

      accolades:
        awardsData.accolades
    });
  } catch (error) {
    console.error(
      "Reelwise person API error:",
      error
    );

    return res.status(500).json({
      error: "Unable to load star profile.",
      details: error.message
    });
  }
}

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
  ACADEMY AWARDS / WIKIPEDIA + WIKIDATA ACTION API
  ============================================================

  IMPORTANT:
  - OscarBase is removed.
  - Wikidata SPARQL is removed.
  - We resolve the person's exact Wikipedia page, obtain its
    wikibase_item QID, then use Wikidata's Action API directly.
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

function diagnosticAccolades(personId, stage, error, extra = {}) {
  return {
    found: false,
    tmdb_person_id: Number(personId) || null,
    wins: 0,
    nominations: 0,
    history: [],
    academy_awards: [],
    academyAwards: [],
    accolades: [],
    unavailable: true,
    source: "Wikidata",
    diagnostic: {
      stage,
      message:
        error instanceof Error
          ? error.message
          : String(error || "Unknown error"),
      ...extra
    }
  };
}

async function getPersonExternalIds(personId) {
  return fetchJSON(
    `https://api.themoviedb.org/3/person/${encodeURIComponent(personId)}/external_ids`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        accept: "application/json"
      }
    }
  );
}

async function getWikipediaIdentity(name) {
  const searchUrl =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: name,
      gsrlimit: "5",
      prop: "pageprops|info",
      ppprop: "wikibase_item",
      inprop: "url",
      format: "json",
      origin: "*"
    });

  const data = await fetchJSON(searchUrl);
  const pages = Object.values(data?.query?.pages || {});

  if (!pages.length) return null;

  const normalize = value =>
    cleanText(value)
      .toLowerCase()
      .replace(/[.,'’"-]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const wanted = normalize(name);

  const exact =
    pages.find(page => normalize(page?.title) === wanted) ||
    pages.find(page =>
      normalize(page?.title).startsWith(wanted + " (")
    ) ||
    pages[0];

  const qid = exact?.pageprops?.wikibase_item || "";

  if (!qid) return null;

  return {
    title: exact?.title || name,
    qid
  };
}

async function getWikidataEntities(ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];

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
        accept: "application/json"
      }
    });

    Object.assign(output, data?.entities || {});
  }

  return output;
}

function englishLabel(entity, fallback = "") {
  return cleanText(
    entity?.labels?.en?.value ||
    entity?.labels?.["en-gb"]?.value ||
    fallback
  );
}

function claimItemId(claim) {
  return (
    claim?.mainsnak?.datavalue?.value?.id ||
    ""
  );
}

function qualifierItemId(claim, property) {
  return (
    claim?.qualifiers?.[property]?.[0]?.datavalue?.value?.id ||
    ""
  );
}

function timeValueToYear(value) {
  const time = value?.time || "";
  const match = String(time).match(/[+-](\d{4,})-/);
  return match ? Number(match[1]) : null;
}

function claimYear(claim) {
  const direct =
    claim?.qualifiers?.P585?.[0]?.datavalue?.value;

  return timeValueToYear(direct);
}

function isAcademyAwardEntity(entity) {
  if (!entity) return false;

  const label = englishLabel(entity).toLowerCase();

  /*
    Oscar category labels in Wikidata normally contain
    "Academy Award", e.g. Academy Award for Best Actor.
  */
  return (
    label.includes("academy award") ||
    label.includes("academy honorary award") ||
    label.includes("scientific and technical award")
  );
}

function dedupeHistory(items = []) {
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
      If a nomination statement and an award-received statement
      describe the same event, preserve the winning version.
    */
    if (!existing || item.winner) {
      map.set(key, item);
    }
  }

  return [...map.values()].sort(
    (a, b) => (b.year || 0) - (a.year || 0)
  );
}

async function getAccolades(personId, personName = "") {
  let stage = "start";
  let name = "";
  let qid = null;

  try {
    stage = "resolve_tmdb_name";

    name = cleanText(personName);

    if (!name) {
      const tmdbPerson = await getPersonDetails(personId);
      name = cleanText(tmdbPerson?.name || "");
    }

    if (!name) {
      return diagnosticAccolades(
        personId,
        stage,
        "TMDB returned no person name."
      );
    }

    stage = "tmdb_external_ids";

    const externalIds =
      await getPersonExternalIds(personId);

    qid = cleanText(externalIds?.wikidata_id || "");

    if (!qid) {
      return diagnosticAccolades(
        personId,
        stage,
        "TMDB returned no Wikidata ID for this person.",
        { name }
      );
    }

    stage = "wikidata_person_entity";

    const personEntities =
      await getWikidataEntities([qid]);

    const personEntity =
      personEntities[qid];

    if (!personEntity || personEntity.missing !== undefined) {
      return diagnosticAccolades(
        personId,
        stage,
        "Wikidata person entity was missing.",
        { name, qid }
      );
    }

    stage = "read_award_claims";

    const winClaims =
      Array.isArray(personEntity?.claims?.P166)
        ? personEntity.claims.P166
        : [];

    const nominationClaims =
      Array.isArray(personEntity?.claims?.P1411)
        ? personEntity.claims.P1411
        : [];

    const allClaims = [
      ...winClaims,
      ...nominationClaims
    ];

    if (!allClaims.length) {
      return {
        ...emptyAccolades(personId, false),
        person: {
          name,
          tmdb_person_id: Number(personId) || null,
          wikidata_id: qid
        },
        diagnostic: {
          stage: "complete_zero_award_claims",
          message:
            "TMDB and Wikidata resolved successfully, but Wikidata contains no P166/P1411 award claims for this person.",
          name,
          qid
        }
      };
    }

    stage = "load_award_entities";

    const awardIds =
      [...new Set(allClaims.map(claimItemId).filter(Boolean))];

    const awardEntities =
      await getWikidataEntities(awardIds);

    stage = "filter_academy_awards";

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
      return {
        ...emptyAccolades(personId, false),
        person: {
          name,
          tmdb_person_id: Number(personId) || null,
          wikidata_id: qid
        },
        diagnostic: {
          stage: "complete_zero_academy_awards",
          message:
            "TMDB and Wikidata resolved successfully, but none of the person's award claims matched an Academy Award category.",
          name,
          qid,
          total_award_claims: allClaims.length
        }
      };
    }

    stage = "load_award_details";

    const relatedIds = [];

    for (const claim of academyClaims) {
      relatedIds.push(
        qualifierItemId(claim, "P1686"),
        qualifierItemId(claim, "P805")
      );
    }

    const relatedEntities =
      await getWikidataEntities(
        [...new Set(relatedIds.filter(Boolean))]
      );

    stage = "build_award_history";

    function buildHistoryItem(claim, winner) {
      const awardId = claimItemId(claim);
      const awardEntity = awardEntities[awardId];

      if (!isAcademyAwardEntity(awardEntity)) {
        return null;
      }

      const workId =
        qualifierItemId(claim, "P1686");

      const ceremonyId =
        qualifierItemId(claim, "P805");

      let year = claimYear(claim);

      if (!year && ceremonyId) {
        const ceremony =
          relatedEntities[ceremonyId];

        const ceremonyDateClaim =
          ceremony?.claims?.P585?.[0];

        year = timeValueToYear(
          ceremonyDateClaim?.mainsnak?.datavalue?.value
        );
      }

      return {
        year,
        category:
          englishLabel(
            awardEntity,
            "Academy Award"
          ),
        movie:
          englishLabel(
            relatedEntities[workId],
            ""
          ),
        winner: Boolean(winner)
      };
    }

    const history =
      dedupeHistory([
        ...academyWinClaims.map(claim =>
          buildHistoryItem(claim, true)
        ),
        ...academyNominationClaims.map(claim =>
          buildHistoryItem(claim, false)
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
      tmdb_person_id: Number(personId) || null,
      person: {
        name,
        tmdb_person_id: Number(personId) || null,
        wikidata_id: qid
      },
      wins,
      nominations: history.length,
      history,
      academy_awards: academyAwards,
      academyAwards,
      accolades: academyAwards,
      unavailable: false,
      source: "TMDB + Wikidata",
      diagnostic: {
        stage: "complete",
        message: "Academy Awards lookup completed.",
        qid
      }
    };
  } catch (error) {
    console.error(
      "Reelwise accolades diagnostic error:",
      stage,
      error
    );

    return diagnosticAccolades(
      personId,
      stage,
      error,
      {
        name,
        qid
      }
    );
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

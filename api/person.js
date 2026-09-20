const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE PERSON API
  ============================================================

  Handles:
  - Star profiles
  - Wikipedia biographies
  - Known For movies
  - Academy Awards / Accolades

  Normal:
    /api/person?id=123

  Academy Awards:
    /api/person?id=123&mode=accolades

  ACCOLADES CONTRACT:

  Successful completed lookup:
    confirmed: true

  Genuine technical failure:
    confirmed: false
    unavailable: true

  IMPORTANT:
  Oscar winning claims sometimes omit the film/work in Wikidata.

  Reelwise now attempts to recover that missing film from the
  matching nomination record for the same Oscar category/year.
  ============================================================
*/


/* ============================================================
   TEXT HELPERS
   ============================================================ */

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/\[\d+\]/g, "")
    .trim();
}

function removeWikipediaEnding(text = "") {
  return String(text)
    .replace(/\s*References\s*$/i, "")
    .replace(/\s*External links\s*$/i, "")
    .trim();
}


/* ============================================================
   FETCH
   ============================================================ */

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);

  const contentType =
    response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status}`
    );
  }

  if (
    !contentType
      .toLowerCase()
      .includes("application/json")
  ) {
    throw new Error(
      "Expected JSON response."
    );
  }

  return response.json();
}


/* ============================================================
   WIKIPEDIA BIOGRAPHY
   ============================================================ */

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

    const searchData =
      await fetchJSON(searchUrl);

    const results =
      searchData?.query?.search || [];

    if (!results.length) {
      return "";
    }

    const exactMatch =
      results.find(
        item =>
          item.title &&
          item.title.toLowerCase() ===
            String(name).toLowerCase()
      );

    const pageTitle =
      exactMatch?.title ||
      results[0]?.title;

    if (!pageTitle) {
      return "";
    }

    const summaryUrl =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(pageTitle);

    const summaryData =
      await fetchJSON(summaryUrl);

    let bio =
      cleanText(
        summaryData?.extract || ""
      );

    bio =
      removeWikipediaEnding(bio);

    if (
      summaryData?.type === "disambiguation" ||
      bio.length < 80
    ) {
      return "";
    }

    return bio;

  } catch (error) {
    console.error(
      "Wikipedia biography error:",
      error
    );

    return "";
  }
}


/* ============================================================
   TMDB
   ============================================================ */

async function getPersonDetails(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${encodeURIComponent(personId)}` +
    "?language=en-US";

  return fetchJSON(url, {
    headers: {
      Authorization:
        `Bearer ${TOKEN}`,
      accept: "application/json"
    }
  });
}


async function getMovieCredits(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${encodeURIComponent(personId)}/movie_credits` +
    "?language=en-US";

  const data =
    await fetchJSON(url, {
      headers: {
        Authorization:
          `Bearer ${TOKEN}`,
        accept: "application/json"
      }
    });

  return data?.cast || [];
}


async function getPersonExternalIds(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${encodeURIComponent(personId)}/external_ids`;

  return fetchJSON(url, {
    headers: {
      Authorization:
        `Bearer ${TOKEN}`,
      accept: "application/json"
    }
  });
}


/* ============================================================
   ACCOLADES RESPONSE HELPERS
   ============================================================ */

function emptyAccolades(
  personId,
  unavailable = false,
  confirmed = true
) {
  return {
    confirmed,

    found: false,

    tmdb_person_id:
      Number(personId) || null,

    wins: 0,

    nominations: 0,

    history: [],

    academy_awards: [],

    academyAwards: [],

    accolades: [],

    unavailable,

    source:
      "TMDB + Wikidata"
  };
}


function diagnosticAccolades(
  personId,
  stage,
  error,
  extra = {}
) {
  return {
    confirmed: false,

    found: false,

    tmdb_person_id:
      Number(personId) || null,

    wins: 0,

    nominations: 0,

    history: [],

    academy_awards: [],

    academyAwards: [],

    accolades: [],

    unavailable: true,

    source:
      "TMDB + Wikidata",

    diagnostic: {
      stage,

      message:
        error instanceof Error
          ? error.message
          : String(
              error ||
              "Unknown error"
            ),

      ...extra
    }
  };
}


/* ============================================================
   WIKIDATA
   ============================================================ */

async function getWikidataEntities(ids = []) {
  const unique =
    [
      ...new Set(
        ids.filter(Boolean)
      )
    ];

  if (!unique.length) {
    return {};
  }

  const output = {};

  for (
    let i = 0;
    i < unique.length;
    i += 40
  ) {
    const batch =
      unique.slice(i, i + 40);

    const url =
      "https://www.wikidata.org/w/api.php?" +
      new URLSearchParams({
        action: "wbgetentities",

        ids:
          batch.join("|"),

        props:
          "labels|claims",

        languages:
          "en",

        format:
          "json",

        origin:
          "*"
      });

    const data =
      await fetchJSON(
        url,
        {
          headers: {
            accept:
              "application/json"
          }
        }
      );

    Object.assign(
      output,
      data?.entities || {}
    );
  }

  return output;
}


function englishLabel(
  entity,
  fallback = ""
) {
  return cleanText(
    entity?.labels?.en?.value ||
    entity?.labels?.["en-gb"]?.value ||
    fallback
  );
}


function claimItemId(claim) {
  return (
    claim
      ?.mainsnak
      ?.datavalue
      ?.value
      ?.id ||
    ""
  );
}


function qualifierItemId(
  claim,
  property
) {
  return (
    claim
      ?.qualifiers
      ?.[property]
      ?.[0]
      ?.datavalue
      ?.value
      ?.id ||
    ""
  );
}


function timeValueToYear(value) {
  const time =
    value?.time || "";

  const match =
    String(time).match(
      /[+-](\d{4,})-/
    );

  return match
    ? Number(match[1])
    : null;
}


function claimYear(claim) {
  const pointInTime =
    claim
      ?.qualifiers
      ?.P585
      ?.[0]
      ?.datavalue
      ?.value;

  let year =
    timeValueToYear(
      pointInTime
    );

  if (year) {
    return year;
  }

  const startTime =
    claim
      ?.qualifiers
      ?.P580
      ?.[0]
      ?.datavalue
      ?.value;

  year =
    timeValueToYear(
      startTime
    );

  return year;
}


/* ============================================================
   OSCAR IDENTIFICATION
   ============================================================ */

function isAcademyAwardEntity(entity) {
  if (!entity) {
    return false;
  }

  const label =
    englishLabel(entity)
      .toLowerCase();

  if (!label) {
    return false;
  }

  return (
    label.includes(
      "academy award"
    ) ||

    label.includes(
      "academy honorary award"
    ) ||

    label.includes(
      "honorary academy award"
    ) ||

    label.includes(
      "scientific and technical award"
    ) ||

    label.includes(
      "special achievement academy award"
    )
  );
}


/* ============================================================
   HISTORY HELPERS
   ============================================================ */

function normalizeCategory(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


/*
  Oscar claims can occasionally disagree about year formatting.

  This helper considers:
    exact year
    one-year difference

  A one-year difference is allowed because Wikidata records may
  represent either the film year or the ceremony year.
*/

function yearsMatch(a, b) {
  if (!a || !b) {
    return false;
  }

  return (
    Number(a) === Number(b) ||
    Math.abs(
      Number(a) - Number(b)
    ) === 1
  );
}


/*
  ============================================================
  RECOVER MISSING WINNING FILMS
  ============================================================

  Example:

  WIN CLAIM:
    1995
    Academy Award for Best Actor
    movie: ""

  NOMINATION CLAIM:
    1995
    Academy Award for Best Actor
    movie: "Forrest Gump"

  Result:

    1995
    Academy Award for Best Actor
    movie: "Forrest Gump"
    winner: true
*/

function recoverMissingWinningFilms(items = []) {
  const output =
    items.map(item => ({
      ...item
    }));

  const nominees =
    output.filter(
      item =>
        !item.winner &&
        cleanText(item.movie)
    );

  for (const winner of output) {
    if (!winner.winner) {
      continue;
    }

    if (cleanText(winner.movie)) {
      continue;
    }

    const winnerCategory =
      normalizeCategory(
        winner.category
      );

    /*
      First try:
      Same category + exact year.
    */

    let match =
      nominees.find(
        nominee =>
          normalizeCategory(
            nominee.category
          ) === winnerCategory &&
          Number(nominee.year) ===
            Number(winner.year)
      );


    /*
      Second try:
      Same category + adjacent year.

      This covers ceremony-year vs film-year
      differences in Wikidata.
    */

    if (!match) {
      match =
        nominees.find(
          nominee =>
            normalizeCategory(
              nominee.category
            ) === winnerCategory &&
            yearsMatch(
              nominee.year,
              winner.year
            )
        );
    }


    /*
      Only copy a real film title.
    */

    if (
      match &&
      cleanText(match.movie)
    ) {
      winner.movie =
        cleanText(match.movie);
    }
  }

  return output;
}


/* ============================================================
   DEDUPE HISTORY
   ============================================================ */

function dedupeHistory(items = []) {
  const map =
    new Map();

  for (const item of items) {
    if (!item?.category) {
      continue;
    }

    const key = [
      item.year || "",

      normalizeCategory(
        item.category
      ),

      cleanText(
        item.movie
      ).toLowerCase()

    ].join("|");

    const existing =
      map.get(key);

    if (
      !existing ||
      item.winner
    ) {
      map.set(
        key,
        item
      );
    }
  }

  return [
    ...map.values()
  ].sort(
    (a, b) =>
      (b.year || 0) -
      (a.year || 0)
  );
}


/* ============================================================
   MERGE DUPLICATE WIN / NOMINATION EVENTS
   ============================================================ */

function mergeWinningDuplicates(items = []) {
  const winners =
    items.filter(
      item => item.winner
    );

  const output = [];

  for (const item of items) {
    /*
      If this is a nomination and there is a
      winning version for the same category,
      year and movie, the winning version wins.
    */

    if (!item.winner) {
      const duplicateWinner =
        winners.find(
          winner =>
            normalizeCategory(
              winner.category
            ) ===
              normalizeCategory(
                item.category
              ) &&

            yearsMatch(
              winner.year,
              item.year
            ) &&

            cleanText(
              winner.movie
            ).toLowerCase() ===
              cleanText(
                item.movie
              ).toLowerCase() &&

            cleanText(
              item.movie
            )
        );

      if (duplicateWinner) {
        continue;
      }
    }

    output.push(item);
  }

  return output;
}


/* ============================================================
   ACADEMY AWARDS LOOKUP
   ============================================================ */

async function getAccolades(
  personId,
  personName = ""
) {
  let stage =
    "start";

  let name =
    cleanText(personName);

  let qid =
    "";

  try {

    /*
      ----------------------------------------------------------
      STEP 1
      Resolve TMDB person.
      ----------------------------------------------------------
    */

    stage =
      "resolve_tmdb_person";

    if (!name) {
      const tmdbPerson =
        await getPersonDetails(
          personId
        );

      name =
        cleanText(
          tmdbPerson?.name || ""
        );
    }

    if (!name) {
      return diagnosticAccolades(
        personId,
        stage,
        "TMDB returned no person name."
      );
    }


    /*
      ----------------------------------------------------------
      STEP 2
      Exact Wikidata ID from TMDB.
      ----------------------------------------------------------
    */

    stage =
      "tmdb_external_ids";

    const externalIds =
      await getPersonExternalIds(
        personId
      );

    qid =
      cleanText(
        externalIds
          ?.wikidata_id ||
        ""
      );

    if (!qid) {
      return diagnosticAccolades(
        personId,
        stage,
        "TMDB returned no Wikidata ID for this person.",
        {
          name
        }
      );
    }


    /*
      ----------------------------------------------------------
      STEP 3
      Wikidata person entity.
      ----------------------------------------------------------
    */

    stage =
      "wikidata_person_entity";

    const personEntities =
      await getWikidataEntities(
        [qid]
      );

    const personEntity =
      personEntities[qid];

    if (
      !personEntity ||
      personEntity.missing !== undefined
    ) {
      return diagnosticAccolades(
        personId,
        stage,
        "Wikidata person entity was missing.",
        {
          name,
          qid
        }
      );
    }


    /*
      ----------------------------------------------------------
      STEP 4
      Award claims.

      P166 = award received
      P1411 = nominated for
      ----------------------------------------------------------
    */

    stage =
      "read_award_claims";

    const winClaims =
      Array.isArray(
        personEntity
          ?.claims
          ?.P166
      )
        ? personEntity.claims.P166
        : [];

    const nominationClaims =
      Array.isArray(
        personEntity
          ?.claims
          ?.P1411
      )
        ? personEntity.claims.P1411
        : [];

    const allClaims = [
      ...winClaims,
      ...nominationClaims
    ];


    /*
      Completed lookup with zero claims.
    */

    if (!allClaims.length) {
      return {
        ...emptyAccolades(
          personId,
          false,
          true
        ),

        person: {
          name,

          tmdb_person_id:
            Number(personId) ||
            null,

          wikidata_id:
            qid
        },

        diagnostic: {
          stage:
            "complete_zero_award_claims",

          message:
            "Academy Awards lookup completed. Wikidata contains no award or nomination claims for this person.",

          name,
          qid
        }
      };
    }


    /*
      ----------------------------------------------------------
      STEP 5
      Load award entities.
      ----------------------------------------------------------
    */

    stage =
      "load_award_entities";

    const awardIds =
      [
        ...new Set(
          allClaims
            .map(claimItemId)
            .filter(Boolean)
        )
      ];

    const awardEntities =
      await getWikidataEntities(
        awardIds
      );


    /*
      ----------------------------------------------------------
      STEP 6
      Academy Awards only.
      ----------------------------------------------------------
    */

    stage =
      "filter_academy_awards";

    const academyWinClaims =
      winClaims.filter(
        claim =>
          isAcademyAwardEntity(
            awardEntities[
              claimItemId(claim)
            ]
          )
      );

    const academyNominationClaims =
      nominationClaims.filter(
        claim =>
          isAcademyAwardEntity(
            awardEntities[
              claimItemId(claim)
            ]
          )
      );

    const academyClaims = [
      ...academyWinClaims,
      ...academyNominationClaims
    ];


    if (!academyClaims.length) {
      return {
        ...emptyAccolades(
          personId,
          false,
          true
        ),

        person: {
          name,

          tmdb_person_id:
            Number(personId) ||
            null,

          wikidata_id:
            qid
        },

        diagnostic: {
          stage:
            "complete_zero_academy_awards",

          message:
            "Academy Awards lookup completed. No Academy Award categories were found among this person's Wikidata award claims.",

          name,

          qid,

          total_award_claims:
            allClaims.length
        }
      };
    }


    /*
      ----------------------------------------------------------
      STEP 7
      Load films and ceremonies.

      P1686 = for work
      P805  = statement is subject of
      ----------------------------------------------------------
    */

    stage =
      "load_award_details";

    const relatedIds = [];

    for (
      const claim
      of academyClaims
    ) {
      relatedIds.push(
        qualifierItemId(
          claim,
          "P1686"
        ),

        qualifierItemId(
          claim,
          "P805"
        )
      );
    }

    const uniqueRelatedIds =
      [
        ...new Set(
          relatedIds.filter(Boolean)
        )
      ];

    const relatedEntities =
      await getWikidataEntities(
        uniqueRelatedIds
      );


    /*
      ----------------------------------------------------------
      STEP 8
      Build raw Oscar history.
      ----------------------------------------------------------
    */

    stage =
      "build_award_history";


    function buildHistoryItem(
      claim,
      winner
    ) {
      const awardId =
        claimItemId(claim);

      const awardEntity =
        awardEntities[
          awardId
        ];

      if (
        !isAcademyAwardEntity(
          awardEntity
        )
      ) {
        return null;
      }


      const workId =
        qualifierItemId(
          claim,
          "P1686"
        );

      const ceremonyId =
        qualifierItemId(
          claim,
          "P805"
        );


      /*
        YEAR
      */

      let year =
        claimYear(claim);


      /*
        Ceremony date fallback.
      */

      if (
        !year &&
        ceremonyId
      ) {
        const ceremony =
          relatedEntities[
            ceremonyId
          ];

        const ceremonyDateClaim =
          ceremony
            ?.claims
            ?.P585
            ?.[0];

        year =
          timeValueToYear(
            ceremonyDateClaim
              ?.mainsnak
              ?.datavalue
              ?.value
          );
      }


      /*
        FILM
      */

      const movie =
        englishLabel(
          relatedEntities[
            workId
          ],
          ""
        );


      /*
        CATEGORY
      */

      const category =
        englishLabel(
          awardEntity,
          "Academy Award"
        );


      return {
        year:
          year || null,

        category,

        movie,

        winner:
          Boolean(winner)
      };
    }


    /*
      Build the raw claim list FIRST.

      We intentionally do not dedupe yet because
      the nomination version may contain a movie
      title missing from the winning version.
    */

    let rawHistory = [
      ...academyWinClaims.map(
        claim =>
          buildHistoryItem(
            claim,
            true
          )
      ),

      ...academyNominationClaims.map(
        claim =>
          buildHistoryItem(
            claim,
            false
          )
      )
    ].filter(Boolean);


    /*
      ----------------------------------------------------------
      STEP 9
      Recover missing winner films.

      This is the important fix for:
        Tom Hanks
        1995
        Forrest Gump
      ----------------------------------------------------------
    */

    rawHistory =
      recoverMissingWinningFilms(
        rawHistory
      );


    /*
      ----------------------------------------------------------
      STEP 10
      Remove duplicate winner/nominee entries.
      ----------------------------------------------------------
    */

    rawHistory =
      mergeWinningDuplicates(
        rawHistory
      );


    /*
      ----------------------------------------------------------
      STEP 11
      Final dedupe + sorting.
      ----------------------------------------------------------
    */

    const history =
      dedupeHistory(
        rawHistory
      );


    /*
      ----------------------------------------------------------
      STEP 12
      Totals.
      ----------------------------------------------------------
    */

    const wins =
      history.filter(
        item =>
          item.winner
      ).length;

    const nominations =
      history.length;


    /*
      ----------------------------------------------------------
      STEP 13
      Response aliases expected by index.html.
      ----------------------------------------------------------
    */

    const academyAwards =
      history.map(
        item => ({
          award:
            item.category,

          category:
            item.category,

          result:
            item.winner
              ? "Winner"
              : "Nominee",

          winner:
            item.winner,

          year:
            item.year,

          work:
            item.movie,

          movie:
            item.movie,

          ceremony:
            ""
        })
      );


    /*
      ----------------------------------------------------------
      SUCCESS
      ----------------------------------------------------------
    */

    return {
      confirmed: true,

      found:
        history.length > 0,

      tmdb_person_id:
        Number(personId) ||
        null,

      person: {
        name,

        tmdb_person_id:
          Number(personId) ||
          null,

        wikidata_id:
          qid
      },

      wins,

      nominations,

      history,

      academy_awards:
        academyAwards,

      academyAwards,

      accolades:
        academyAwards,

      unavailable:
        false,

      source:
        "TMDB + Wikidata",

      diagnostic: {
        stage:
          "complete",

        message:
          "Academy Awards lookup completed.",

        qid,

        total_award_claims:
          allClaims.length,

        academy_award_claims:
          academyClaims.length
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


/* ============================================================
   KNOWN FOR
   ============================================================ */

function buildKnownFor(
  credits = []
) {
  const seen =
    new Set();

  return credits
    .filter(movie => {

      if (
        !movie?.id ||
        !movie?.title
      ) {
        return false;
      }

      if (
        seen.has(movie.id)
      ) {
        return false;
      }

      seen.add(movie.id);

      return true;
    })

    .sort((a, b) => {

      const scoreA =
        (Number(a.popularity) || 0) +
        Math.log10(
          (Number(a.vote_count) || 0) +
          1
        ) * 10;

      const scoreB =
        (Number(b.popularity) || 0) +
        Math.log10(
          (Number(b.vote_count) || 0) +
          1
        ) * 10;

      return scoreB - scoreA;
    })

    .slice(0, 12)

    .map(movie => ({
      id:
        movie.id,

      title:
        movie.title,

      character:
        movie.character || "",

      release_date:
        movie.release_date || "",

      poster_path:
        movie.poster_path || null,

      backdrop_path:
        movie.backdrop_path || null,

      popularity:
        movie.popularity || 0,

      vote_average:
        movie.vote_average || 0,

      vote_count:
        movie.vote_count || 0
    }));
}


/* ============================================================
   API HANDLER
   ============================================================ */

export default async function handler(
  req,
  res
) {
  try {

    /*
      TOKEN
    */

    if (!TOKEN) {
      return res
        .status(500)
        .json({
          error:
            "TMDB_READ_ACCESS_TOKEN is missing."
        });
    }


    /*
      PERSON ID
    */

    const personId =
      req.query.id ||
      req.query.personId ||
      req.query.person_id;

    if (!personId) {
      return res
        .status(400)
        .json({
          error:
            "Person ID is required."
        });
    }


    /*
      MODE
    */

    const mode =
      String(
        req.query.mode || ""
      )
        .toLowerCase()
        .trim();


    /*
      ==========================================================
      ACCOLADES MODE
      ==========================================================
    */

    if (
      mode === "accolades"
    ) {
      const awardsData =
        await getAccolades(
          personId
        );

      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, max-age=0"
      );

      res.setHeader(
        "Pragma",
        "no-cache"
      );

      return res
        .status(200)
        .json(
          awardsData
        );
    }


    /*
      ==========================================================
      NORMAL STAR PROFILE
      ==========================================================
    */

    const [
      person,
      credits
    ] =
      await Promise.all([
        getPersonDetails(
          personId
        ),

        getMovieCredits(
          personId
        )
      ]);


    /*
      BIOGRAPHY
    */

    const wikipediaBio =
      await getWikipediaBiography(
        person.name
      );

    const tmdbBio =
      cleanText(
        person.biography || ""
      );

    const biography =
      wikipediaBio ||
      tmdbBio ||
      `${person.name} is a film actor and filmmaker.`;


    /*
      KNOWN FOR
    */

    const knownFor =
      buildKnownFor(
        credits
      );


    /*
      ACCOLADES

      An awards failure must never prevent
      the star profile from loading.
    */

    let awardsData;

    try {
      awardsData =
        await getAccolades(
          personId,
          person.name
        );

    } catch (error) {

      console.error(
        "Profile awards lookup error:",
        error
      );

      awardsData =
        diagnosticAccolades(
          personId,
          "profile_awards",
          error,
          {
            name:
              person.name || ""
          }
        );
    }


    /*
      RESPONSE
    */

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );


    return res
      .status(200)
      .json({

        id:
          person.id,

        name:
          person.name || "",

        birthday:
          person.birthday ||
          null,

        deathday:
          person.deathday ||
          null,

        place_of_birth:
          person.place_of_birth ||
          "",

        biography,

        profile_path:
          person.profile_path ||
          null,

        homepage:
          person.homepage ||
          null,

        imdb_id:
          person.imdb_id ||
          null,

        known_for_department:
          person.known_for_department ||
          "",

        popularity:
          person.popularity ||
          0,

        known_for:
          knownFor,

        knownFor,

        movies:
          knownFor,


        /*
          Oscar summary
        */

        reelwise_academy_awards: {
          confirmed:
            awardsData.confirmed === true,

          wins:
            awardsData.wins || 0,

          nominations:
            awardsData.nominations || 0
        },


        /*
          Existing Reelwise aliases
        */

        academy_awards:
          awardsData.academy_awards ||
          [],

        academyAwards:
          awardsData.academyAwards ||
          [],

        accolades:
          awardsData.accolades ||
          []
      });

  } catch (error) {

    console.error(
      "Reelwise person API error:",
      error
    );

    return res
      .status(500)
      .json({
        error:
          "Unable to load star profile.",

        details:
          error.message
      });
  }
}

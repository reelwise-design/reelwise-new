const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE PERSON API
  ============================================================

  Normal:
    /api/person?id=123

  Academy Awards:
    /api/person?id=123&mode=accolades

  ACCOLADES RULES
  ------------------------------------------------------------

  1. confirmed:true means the lookup completed successfully.

  2. confirmed:false + unavailable:true means the lookup
     genuinely failed.

  3. Never borrow an Oscar film from an adjacent award year.

  4. Wikidata remains the primary Oscar source.

  5. If Wikidata gives us an Oscar category/year but omits the
     movie, Reelwise may use the person's TMDB movie credits as
     a tightly constrained fallback.

  6. Blank duplicate Oscar records are removed rather than
     displayed as "Film".
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

function normalizeText(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
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

  return timeValueToYear(
    startTime
  );
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
  return normalizeText(value);
}


function releaseYear(movie) {
  const date =
    String(
      movie?.release_date || ""
    );

  const match =
    date.match(/^(\d{4})/);

  return match
    ? Number(match[1])
    : null;
}


/*
  ============================================================
  TMDB FILM RECOVERY
  ============================================================

  Oscar ceremonies are generally held in the calendar year
  after the eligible film's release.

  Therefore an Oscar record for year 1995 normally points to
  a movie released in 1994.

  IMPORTANT:
  We only use this fallback when Wikidata has omitted the work.

  We do NOT borrow titles from another Oscar record.
*/

function findMovieCreditForOscarYear(
  credits = [],
  oscarYear
) {
  const year =
    Number(oscarYear);

  if (!year) {
    return "";
  }

  const filmYear =
    year - 1;

  const candidates =
    credits
      .filter(movie => {
        if (
          !movie?.title ||
          !movie?.id
        ) {
          return false;
        }

        return (
          releaseYear(movie) ===
          filmYear
        );
      })
      .sort((a, b) => {
        /*
          Prefer substantial/well-known films.

          TMDB popularity + vote count are used only
          to choose among the actor's films from the
          exact eligible year.
        */

        const scoreA =
          (Number(a.vote_count) || 0) +
          ((Number(a.popularity) || 0) * 100);

        const scoreB =
          (Number(b.vote_count) || 0) +
          ((Number(b.popularity) || 0) * 100);

        return scoreB - scoreA;
      });

  /*
    Do not guess if there are no candidates.
  */

  if (!candidates.length) {
    return "";
  }

  /*
    If only one film exists for the eligible year,
    it is a strong fallback.
  */

  if (candidates.length === 1) {
    return cleanText(
      candidates[0].title
    );
  }

  /*
    With multiple films, only accept the first movie
    when it is clearly stronger than the second by
    TMDB vote activity.

    This reduces accidental guessing.
  */

  const first =
    candidates[0];

  const second =
    candidates[1];

  const firstVotes =
    Number(
      first?.vote_count
    ) || 0;

  const secondVotes =
    Number(
      second?.vote_count
    ) || 0;

  if (
    firstVotes >= 500 &&
    firstVotes >=
      secondVotes * 1.5
  ) {
    return cleanText(
      first.title
    );
  }

  return "";
}


/*
  ============================================================
  RECOVER MISSING FILMS
  ============================================================
*/

function recoverMissingFilms(
  items = [],
  credits = []
) {
  return items.map(item => {

    if (
      cleanText(item.movie)
    ) {
      return {
        ...item
      };
    }

    const recoveredMovie =
      findMovieCreditForOscarYear(
        credits,
        item.year
      );

    return {
      ...item,

      movie:
        recoveredMovie || ""
    };
  });
}


/*
  ============================================================
  REMOVE BLANK DUPLICATES
  ============================================================

  If Wikidata gives us:

    1995 Best Actor WINNER - Forrest Gump
    1995 Best Actor NOMINEE - blank

  the blank nomination is redundant and should disappear.

  We only compare records from the SAME year.
*/

function removeBlankDuplicates(items = []) {
  return items.filter(
    (item, index, array) => {

      if (
        cleanText(item.movie)
      ) {
        return true;
      }

      const sameEventWithMovie =
        array.some(
          (other, otherIndex) => {

            if (
              otherIndex === index
            ) {
              return false;
            }

            return (
              Number(other.year) ===
                Number(item.year) &&

              normalizeCategory(
                other.category
              ) ===
                normalizeCategory(
                  item.category
                ) &&

              Boolean(
                cleanText(
                  other.movie
                )
              )
            );
          }
        );

      return !sameEventWithMovie;
    }
  );
}


/*
  ============================================================
  MERGE WINNER / NOMINEE DUPLICATES
  ============================================================

  Only merge records when:
    year is identical
    category is identical
    movie is identical

  NO adjacent-year matching.
*/

function mergeExactDuplicates(items = []) {
  const map =
    new Map();

  for (const item of items) {
    const year =
      item.year || "";

    const category =
      normalizeCategory(
        item.category
      );

    const movie =
      normalizeText(
        item.movie
      );

    const key =
      `${year}|${category}|${movie}`;

    const existing =
      map.get(key);

    if (!existing) {
      map.set(
        key,
        {
          ...item
        }
      );

      continue;
    }

    /*
      Winner always overrides nominee for
      the exact same Oscar event.
    */

    if (
      item.winner &&
      !existing.winner
    ) {
      map.set(
        key,
        {
          ...item
        }
      );
    }
  }

  return [
    ...map.values()
  ];
}


/*
  ============================================================
  FINAL HISTORY CLEANUP
  ============================================================
*/

function finalizeHistory(items = []) {
  let output =
    removeBlankDuplicates(
      items
    );

  output =
    mergeExactDuplicates(
      output
    );

  return output.sort(
    (a, b) => {

      const yearDifference =
        (b.year || 0) -
        (a.year || 0);

      if (yearDifference) {
        return yearDifference;
      }

      /*
        Winner first when two entries share a year.
      */

      if (
        a.winner !==
        b.winner
      ) {
        return a.winner
          ? -1
          : 1;
      }

      return cleanText(
        a.category
      ).localeCompare(
        cleanText(
          b.category
        )
      );
    }
  );
}


/* ============================================================
   ACADEMY AWARDS LOOKUP
   ============================================================ */

async function getAccolades(
  personId,
  personName = "",
  suppliedCredits = null
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
      Resolve person.
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
      Exact Wikidata identity from TMDB.
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
      Person entity.
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
      Awards.

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
            "Academy Awards lookup completed. No Academy Award categories were found.",

          name,
          qid
        }
      };
    }


    /*
      ----------------------------------------------------------
      STEP 7
      Load related films and ceremonies.
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

    const relatedEntities =
      await getWikidataEntities(
        [
          ...new Set(
            relatedIds.filter(Boolean)
          )
        ]
      );


    /*
      ----------------------------------------------------------
      STEP 8
      Build raw history.
      ----------------------------------------------------------
    */

    stage =
      "build_award_history";


    function buildHistoryItem(
      claim,
      winner
    ) {
      const awardId =
        claimItemId(
          claim
        );

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
        claimYear(
          claim
        );


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
        MOVIE
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
      Load TMDB credits only if we need them.
      ----------------------------------------------------------
    */

    const hasMissingMovie =
      rawHistory.some(
        item =>
          !cleanText(
            item.movie
          )
      );

    let movieCredits =
      Array.isArray(
        suppliedCredits
      )
        ? suppliedCredits
        : [];


    if (
      hasMissingMovie &&
      !movieCredits.length
    ) {
      stage =
        "load_tmdb_movie_fallback";

      try {
        movieCredits =
          await getMovieCredits(
            personId
          );
      } catch (error) {
        console.error(
          "TMDB Oscar film fallback error:",
          error
        );

        movieCredits = [];
      }
    }


    /*
      ----------------------------------------------------------
      STEP 10
      Recover missing movie titles.

      NO adjacent Oscar-year matching.
      ----------------------------------------------------------
    */

    if (
      hasMissingMovie &&
      movieCredits.length
    ) {
      rawHistory =
        recoverMissingFilms(
          rawHistory,
          movieCredits
        );
    }


    /*
      ----------------------------------------------------------
      STEP 11
      Clean exact duplicates.
      ----------------------------------------------------------
    */

    const history =
      finalizeHistory(
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
      Build aliases expected by Reelwise.
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

      seen.add(
        movie.id
      );

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

    if (!TOKEN) {
      return res
        .status(500)
        .json({
          error:
            "TMDB_READ_ACCESS_TOKEN is missing."
        });
    }


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

      Awards can never prevent the normal
      star profile from loading.
    */

    let awardsData;

    try {
      awardsData =
        await getAccolades(
          personId,
          person.name,
          credits
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


        reelwise_academy_awards: {
          confirmed:
            awardsData.confirmed === true,

          wins:
            awardsData.wins || 0,

          nominations:
            awardsData.nominations || 0
        },


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

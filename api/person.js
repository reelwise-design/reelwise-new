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

  IMPORTANT:
  A completed Academy Awards lookup returns:
    confirmed: true

  This tells the Reelwise front end that the lookup genuinely
  completed — including when the person has zero Oscar
  nominations.

  A genuine lookup failure returns:
    confirmed: false
    unavailable: true
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
   FETCH HELPER
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
    throw new Error("Expected JSON response.");
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
      summaryData?.type ===
        "disambiguation" ||
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
   ACADEMY AWARDS RESPONSE HELPERS
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

async function getWikidataEntities(
  ids = []
) {
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

  /*
    Keep batches small enough for the
    Wikidata Action API.
  */

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
  /*
    Point in time
  */

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

  /*
    Start time fallback
  */

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

  /*
    Most Oscar categories appear in Wikidata as:
      Academy Award for Best Actor
      Academy Award for Best Actress
      Academy Award for Best Supporting Actor
      Academy Award for Best Supporting Actress
      Academy Award for Best Director
      etc.

    Honorary Academy Awards are also accepted.
  */

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
   HISTORY CLEANUP
   ============================================================ */

function dedupeHistory(
  items = []
) {
  const map =
    new Map();

  for (const item of items) {
    if (!item?.category) {
      continue;
    }

    const key = [
      item.year || "",

      cleanText(
        item.category
      ).toLowerCase(),

      cleanText(
        item.movie
      ).toLowerCase()

    ].join("|");

    const existing =
      map.get(key);

    /*
      A Wikidata person can sometimes
      contain both a nomination claim
      and a received-award claim for the
      same Oscar.

      Preserve the winning version.
    */

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
      Resolve the exact TMDB person.
      ----------------------------------------------------------
    */

    stage =
      "resolve_tmdb_person";

    let tmdbPerson = null;

    if (!name) {
      tmdbPerson =
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
      Get the exact Wikidata QID directly
      from TMDB.

      This avoids guessing which person
      Wikipedia/Wikidata search results mean.
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

    /*
      If TMDB has no Wikidata ID, this
      does NOT prove the person has zero
      Oscars. It means Reelwise cannot
      confirm the lookup.
    */

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
      Load the Wikidata person record.
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
      Read award received + nomination
      claims.

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
      Wikidata resolved successfully.

      No award claims is therefore a
      COMPLETED lookup, not an outage.
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
      Load every award category referenced
      by those claims.
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
      Keep Academy Awards only.
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


    /*
      We successfully examined the person's
      awards and found no Academy Awards.

      This MUST return confirmed:true.

      Otherwise the Reelwise front end will
      think the API failed and retry.
    */

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
      Load related works and ceremonies.

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
      Build Reelwise award cards.
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
        If the claim itself has no year,
        attempt to get the ceremony date.
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
        MOVIE / WORK
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


    const history =
      dedupeHistory(
        [
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
        ].filter(Boolean)
      );


    /*
      ----------------------------------------------------------
      STEP 9
      Calculate totals.
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
      STEP 10
      Build all response aliases expected
      by Reelwise.

      Keeping these aliases means the
      existing index.html does not need
      to be changed.
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

      confirmed:true is critical.

      The current Reelwise index.html uses
      this field to distinguish a completed
      lookup from a failed API request.
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

    /*
      Genuine technical failure.

      confirmed:false tells the front end
      that retrying may be appropriate.
    */

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
      ----------------------------------------------------------
      TOKEN CHECK
      ----------------------------------------------------------
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
      ----------------------------------------------------------
      PERSON ID
      ----------------------------------------------------------
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
      ----------------------------------------------------------
      MODE
      ----------------------------------------------------------
    */

    const mode =
      String(
        req.query.mode || ""
      )
        .toLowerCase()
        .trim();


    /*
      ==========================================================
      ACADEMY AWARDS / ACCOLADES MODE
      ==========================================================
    */

    if (
      mode ===
      "accolades"
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
      NORMAL STAR PROFILE MODE
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
      ACADEMY AWARDS

      Failure here must NEVER stop the
      normal star profile from loading.
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
      ----------------------------------------------------------
      RESPONSE
      ----------------------------------------------------------
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
          Academy Award summary
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
          Keep all aliases currently
          understood by Reelwise.
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

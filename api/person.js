const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE PERSON API
  ============================================================

  Handles Reelwise star profiles.

  NORMAL MODE
  - Pulls person details from TMDB
  - Returns birthday and profile photo
  - Returns known-for movies
  - Uses Wikipedia for a fuller biography when available
  - Falls back to TMDB biography

  ACCOLADES MODE
  - Called with ?mode=accolades
  - Looks up Academy Award history through Wikidata
  - Returns the exact structure expected by Reelwise index.html:
      found
      wins
      nominations
      history
  ============================================================
*/


/* ============================================================
   GENERAL HELPERS
   ============================================================ */

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

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}


/* ============================================================
   WIKIPEDIA SEARCH
   ============================================================ */

async function getWikipediaPage(name) {
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

    if (!results.length) {
      return {
        title: "",
        wikidataId: ""
      };
    }

    const exactMatch = results.find(
      item =>
        item.title &&
        item.title.toLowerCase() ===
          String(name).toLowerCase()
    );

    const pageTitle =
      exactMatch?.title ||
      results[0]?.title ||
      "";

    if (!pageTitle) {
      return {
        title: "",
        wikidataId: ""
      };
    }

    /*
      Get the Wikidata ID from the selected
      Wikipedia page instead of running a second,
      unrelated Wikidata search.
    */

    const pageUrl =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        titles: pageTitle,
        prop: "pageprops",
        ppprop: "wikibase_item",
        redirects: "1",
        format: "json",
        origin: "*"
      });

    const pageData = await fetchJSON(pageUrl);

    const pages =
      pageData?.query?.pages || {};

    const page =
      Object.values(pages)[0];

    return {
      title: pageTitle,
      wikidataId:
        page?.pageprops?.wikibase_item || ""
    };
  } catch (error) {
    console.error(
      "Wikipedia page lookup error:",
      error
    );

    return {
      title: "",
      wikidataId: ""
    };
  }
}


/* ============================================================
   WIKIPEDIA BIOGRAPHY
   ============================================================ */

async function getWikipediaBiography(
  name,
  knownPageTitle = ""
) {
  try {
    let pageTitle = knownPageTitle;

    if (!pageTitle) {
      const page =
        await getWikipediaPage(name);

      pageTitle = page.title;
    }

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
   TMDB PERSON DETAILS
   ============================================================ */

async function getPersonDetails(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${personId}` +
    "?language=en-US";

  return fetchJSON(url, {
    headers: {
      Authorization:
        `Bearer ${TOKEN}`,
      accept: "application/json"
    }
  });
}


/* ============================================================
   TMDB MOVIE CREDITS
   ============================================================ */

async function getMovieCredits(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${personId}/movie_credits` +
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


/* ============================================================
   KNOWN FOR
   ============================================================ */

function buildKnownFor(credits = []) {
  const seen = new Set();

  return credits
    .filter(movie => {
      if (
        !movie?.id ||
        !movie?.title
      ) {
        return false;
      }

      if (seen.has(movie.id)) {
        return false;
      }

      seen.add(movie.id);

      return true;
    })

    .sort((a, b) => {
      const scoreA =
        (Number(a.popularity) || 0) +
        Math.log10(
          (Number(a.vote_count) || 0) + 1
        ) * 10;

      const scoreB =
        (Number(b.popularity) || 0) +
        Math.log10(
          (Number(b.vote_count) || 0) + 1
        ) * 10;

      return scoreB - scoreA;
    })

    .slice(0, 12)

    .map(movie => ({
      id: movie.id,
      title: movie.title,
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
   WIKIDATA HELPERS
   ============================================================ */

async function getWikidataEntity(
  wikidataId
) {
  if (!wikidataId) {
    return null;
  }

  try {
    const url =
      "https://www.wikidata.org/w/api.php?" +
      new URLSearchParams({
        action: "wbgetentities",
        ids: wikidataId,
        props: "claims|labels",
        languages: "en",
        format: "json",
        origin: "*"
      });

    const data =
      await fetchJSON(url);

    return (
      data?.entities?.[wikidataId] ||
      null
    );
  } catch (error) {
    console.error(
      "Wikidata entity error:",
      error
    );

    return null;
  }
}


async function getWikidataLabels(
  ids = []
) {
  const uniqueIds =
    [
      ...new Set(
        ids.filter(Boolean)
      )
    ];

  if (!uniqueIds.length) {
    return {};
  }

  const all = {};

  for (
    let i = 0;
    i < uniqueIds.length;
    i += 40
  ) {
    const chunk =
      uniqueIds.slice(i, i + 40);

    try {
      const url =
        "https://www.wikidata.org/w/api.php?" +
        new URLSearchParams({
          action: "wbgetentities",
          ids: chunk.join("|"),
          props: "labels",
          languages: "en",
          format: "json",
          origin: "*"
        });

      const data =
        await fetchJSON(url);

      Object.assign(
        all,
        data?.entities || {}
      );
    } catch (error) {
      console.error(
        "Wikidata labels error:",
        error
      );
    }
  }

  return all;
}


function claimEntityId(claim) {
  return (
    claim
      ?.mainsnak
      ?.datavalue
      ?.value
      ?.id || ""
  );
}


function qualifierEntityIds(
  claim,
  property
) {
  const values =
    claim
      ?.qualifiers
      ?.[property] || [];

  return values
    .map(
      item =>
        item
          ?.datavalue
          ?.value
          ?.id || ""
    )
    .filter(Boolean);
}


function qualifierEntityId(
  claim,
  property
) {
  return (
    qualifierEntityIds(
      claim,
      property
    )[0] || ""
  );
}


function qualifierYear(claim) {
  const possibleProperties = [
    "P585",
    "P580",
    "P582"
  ];

  for (
    const property
    of possibleProperties
  ) {
    const raw =
      claim
        ?.qualifiers
        ?.[property]
        ?.[0]
        ?.datavalue
        ?.value
        ?.time || "";

    const match =
      raw.match(
        /[+-](\d{4})-/
      );

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}


/* ============================================================
   ACADEMY AWARD HELPERS
   ============================================================ */

function isAcademyAwardText(
  text = ""
) {
  const value =
    String(text).toLowerCase();

  return (
    value.includes(
      "academy award"
    ) ||
    value.includes("oscar")
  );
}


function normalizeOscarCategory(
  award = ""
) {
  let value =
    cleanText(award);

  value = value
    .replace(
      /^academy award for\s+/i,
      "Best "
    )
    .replace(
      /^academy awards? for\s+/i,
      "Best "
    );

  /*
    Avoid accidental "Best Best Actor"
    if Wikidata already uses Best.
  */

  value =
    value.replace(
      /^Best Best /i,
      "Best "
    );

  return value;
}


function dedupeAwardHistory(
  history = []
) {
  const seen = new Set();

  return history.filter(item => {
    const key = [
      item.year || "",
      item.movie || "",
      item.category || "",
      item.winner
        ? "winner"
        : "nominee"
    ]
      .join("|")
      .toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}


/* ============================================================
   ACADEMY AWARDS / ACCOLADES
   ============================================================ */

async function getAwardsAndAccolades(
  name,
  knownWikidataId = ""
) {
  try {
    let wikidataId =
      knownWikidataId;

    if (!wikidataId) {
      const page =
        await getWikipediaPage(name);

      wikidataId =
        page.wikidataId;
    }

    if (!wikidataId) {
      return {
        found: false,
        wins: 0,
        nominations: 0,
        history: [],
        academy_awards: [],
        academyAwards: [],
        accolades: []
      };
    }

    const entity =
      await getWikidataEntity(
        wikidataId
      );

    const claims =
      entity?.claims || {};

    /*
      P166 = award received
      P1411 = nominated for

      Wikidata can store:
      - award category
      - nominated work
      - ceremony
      - point in time

      Qualifiers vary between records,
      so we collect the useful IDs first
      and resolve their labels afterward.
    */

    const winningClaims =
      (claims.P166 || [])
        .map(claim => ({
          winner: true,
          awardId:
            claimEntityId(claim),

          workIds: [
            ...qualifierEntityIds(
              claim,
              "P1686"
            ),
            ...qualifierEntityIds(
              claim,
              "P1346"
            )
          ],

          ceremonyIds:
            qualifierEntityIds(
              claim,
              "P805"
            ),

          year:
            qualifierYear(claim)
        }));


    const nominationClaims =
      (claims.P1411 || [])
        .map(claim => ({
          winner: false,
          awardId:
            claimEntityId(claim),

          workIds: [
            ...qualifierEntityIds(
              claim,
              "P1686"
            ),
            ...qualifierEntityIds(
              claim,
              "P1346"
            )
          ],

          ceremonyIds:
            qualifierEntityIds(
              claim,
              "P805"
            ),

          year:
            qualifierYear(claim)
        }));


    const rawClaims = [
      ...winningClaims,
      ...nominationClaims
    ].filter(
      item => item.awardId
    );


    if (!rawClaims.length) {
      return {
        found: false,
        wins: 0,
        nominations: 0,
        history: [],
        academy_awards: [],
        academyAwards: [],
        accolades: []
      };
    }


    /*
      Resolve all Wikidata IDs to readable
      English names.
    */

    const idsToResolve =
      rawClaims.flatMap(item => [
        item.awardId,
        ...item.workIds,
        ...item.ceremonyIds
      ]);


    const labels =
      await getWikidataLabels(
        idsToResolve
      );


    const labelFor = id =>
      labels
        ?.[id]
        ?.labels
        ?.en
        ?.value || "";


    const formatted =
      rawClaims.map(item => {
        const award =
          labelFor(
            item.awardId
          );

        const work =
          item.workIds
            .map(labelFor)
            .find(Boolean) || "";

        const ceremony =
          item.ceremonyIds
            .map(labelFor)
            .find(Boolean) || "";

        return {
          award,
          work,
          ceremony,
          year: item.year,
          winner: item.winner
        };
      });


    /*
      Only keep Academy Awards.

      We check both the award/category name
      and ceremony because Wikidata records
      are not always structured identically.
    */

    const academy =
      formatted.filter(item =>
        isAcademyAwardText(
          `${item.award} ${item.ceremony}`
        )
      );


    /*
      Convert to the exact structure used
      by Reelwise index.html.
    */

    let history =
      academy.map(item => ({
        year:
          item.year
            ? String(item.year)
            : "",

        movie:
          item.work || "",

        category:
          normalizeOscarCategory(
            item.award
          ) ||
          "Academy Award",

        winner:
          Boolean(item.winner)
      }));


    history =
      dedupeAwardHistory(
        history
      );


    /*
      If the same exact nomination appears
      once as a nomination and once as a win,
      keep the winning version.
    */

    history =
      history.filter(
        (item, index, array) => {
          if (item.winner) {
            return true;
          }

          const matchingWinner =
            array.some(other =>
              other.winner &&
              other.year === item.year &&
              other.movie === item.movie &&
              other.category ===
                item.category
            );

          return !matchingWinner;
        }
      );


    history.sort((a, b) => {
      const yearA =
        Number(a.year) || 0;

      const yearB =
        Number(b.year) || 0;

      return yearB - yearA;
    });


    const wins =
      history.filter(
        item => item.winner
      ).length;


    /*
      "nominations" means total Academy Award
      nominations, including nominations that
      resulted in wins.

      Therefore the total is history.length.
    */

    const nominations =
      history.length;


    const academyAwards =
      history.map(item => ({
        award: item.category,
        result:
          item.winner
            ? "Winner"
            : "Nominee",
        year: item.year,
        work: item.movie,
        ceremony: ""
      }));


    return {
      found:
        history.length > 0,

      wins,

      nominations,

      history,

      /*
        Keep the older property names too,
        so other Reelwise code will not break.
      */

      academy_awards:
        academyAwards,

      academyAwards,

      accolades:
        academyAwards
    };

  } catch (error) {
    console.error(
      "Awards/accolades error:",
      error
    );

    return {
      found: false,
      wins: 0,
      nominations: 0,
      history: [],
      academy_awards: [],
      academyAwards: [],
      accolades: []
    };
  }
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
      return res.status(500).json({
        error:
          "TMDB_READ_ACCESS_TOKEN is missing."
      });
    }


    const personId =
      req.query.id ||
      req.query.personId ||
      req.query.person_id;


    if (!personId) {
      return res.status(400).json({
        error:
          "Person ID is required."
      });
    }


    const mode =
      String(
        req.query.mode || ""
      ).toLowerCase();


    /*
      ========================================================
      GET PERSON FIRST

      We need the person's real name for
      Wikipedia/Wikidata lookup.
      ========================================================
    */

    const person =
      await getPersonDetails(
        personId
      );


    /*
      ========================================================
      RESOLVE WIKIPEDIA / WIKIDATA PAGE ONCE
      ========================================================
    */

    const wikipediaPage =
      await getWikipediaPage(
        person.name
      );


    /*
      ========================================================
      ACCOLADES MODE

      index.html calls:

      /api/person?id=123&mode=accolades

      It expects:

      {
        found,
        wins,
        nominations,
        history
      }
      ========================================================
    */

    if (mode === "accolades") {

      const awardsData =
        await getAwardsAndAccolades(
          person.name,
          wikipediaPage.wikidataId
        );


      return res
        .status(200)
        .json({
          id: person.id,

          name:
            person.name || "",

          found:
            awardsData.found,

          wins:
            awardsData.wins,

          nominations:
            awardsData.nominations,

          history:
            awardsData.history,

          academy_awards:
            awardsData.academy_awards,

          academyAwards:
            awardsData.academyAwards,

          accolades:
            awardsData.accolades
        });
    }


    /*
      ========================================================
      NORMAL STAR PROFILE MODE
      ========================================================
    */

    const credits =
      await getMovieCredits(
        personId
      );


    const wikipediaBio =
      await getWikipediaBiography(
        person.name,
        wikipediaPage.title
      );


    const tmdbBio =
      cleanText(
        person.biography || ""
      );


    const biography =
      wikipediaBio ||
      tmdbBio ||
      `${person.name} is a film actor and filmmaker.`;


    const knownFor =
      buildKnownFor(
        credits
      );


    /*
      Awards are still included in the
      normal response for compatibility,
      although the dedicated accolades page
      uses mode=accolades.
    */

    const awardsData =
      await getAwardsAndAccolades(
        person.name,
        wikipediaPage.wikidataId
      );


    return res
      .status(200)
      .json({

        id:
          person.id,

        name:
          person.name || "",

        birthday:
          person.birthday || null,

        deathday:
          person.deathday || null,

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

        known_for:
          knownFor,

        academy_awards:
          awardsData.academy_awards,

        academyAwards:
          awardsData.academyAwards,

        accolades:
          awardsData.accolades,

        /*
          Compatibility aliases
        */

        knownFor,

        movies:
          knownFor
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

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE PERSON API
  ============================================================

  Handles Reelwise star profiles.

  - Pulls person details from TMDB
  - Returns birthday and profile photo
  - Returns known-for movies
  - Uses Wikipedia for a fuller biography when available
  - Falls back to TMDB biography
  - Cleans biography text without chopping off the beginning
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

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
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

    if (!results.length) {
      return "";
    }

    /*
      Prefer an exact title match when possible.
    */

    const exactMatch = results.find(
      item =>
        item.title &&
        item.title.toLowerCase() === name.toLowerCase()
    );

    const pageTitle = exactMatch?.title || results[0]?.title;

    if (!pageTitle) {
      return "";
    }

    /*
      Wikipedia REST summary normally gives us a clean,
      complete introductory biography instead of starting
      halfway through the person's story.
    */

    const summaryUrl =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(pageTitle);

    const summaryData = await fetchJSON(summaryUrl);

    let bio = cleanText(summaryData?.extract || "");

    bio = removeWikipediaEnding(bio);

    /*
      Reject disambiguation pages or unusably short summaries.
    */

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
  TMDB PERSON DETAILS
  ============================================================
*/


/*
  ============================================================
   WIKIDATA AWARDS / ACCOLADES
  ============================================================
*/

async function getWikidataIdFromWikipedia(name) {
  try {
    const url =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: name,
        gsrlimit: "1",
        prop: "pageprops",
        ppprop: "wikibase_item",
        redirects: "1",
        format: "json",
        origin: "*"
      });

    const data = await fetchJSON(url);
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    return page?.pageprops?.wikibase_item || "";
  } catch (error) {
    console.error("Wikidata ID error:", error);
    return "";
  }
}

async function getWikidataLabels(ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};

  const all = {};

  for (let i = 0; i < uniqueIds.length; i += 40) {
    const chunk = uniqueIds.slice(i, i + 40);

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

    const data = await fetchJSON(url);
    Object.assign(all, data?.entities || {});
  }

  return all;
}

function claimEntityId(claim) {
  return claim?.mainsnak?.datavalue?.value?.id || "";
}

function qualifierEntityId(claim, property) {
  return claim?.qualifiers?.[property]?.[0]?.datavalue?.value?.id || "";
}

function qualifierYear(claim) {
  const raw =
    claim?.qualifiers?.P585?.[0]?.datavalue?.value?.time ||
    claim?.qualifiers?.P580?.[0]?.datavalue?.value?.time ||
    "";

  const match = raw.match(/[+-](\d{4})-/);
  return match ? Number(match[1]) : null;
}

async function getAwardsAndAccolades(name) {
  try {
    const wikidataId = await getWikidataIdFromWikipedia(name);

    if (!wikidataId) {
      return { academy_awards: [], academyAwards: [], accolades: [] };
    }

    const entityUrl =
      "https://www.wikidata.org/w/api.php?" +
      new URLSearchParams({
        action: "wbgetentities",
        ids: wikidataId,
        props: "claims",
        format: "json",
        origin: "*"
      });

    const entityData = await fetchJSON(entityUrl);
    const claims = entityData?.entities?.[wikidataId]?.claims || {};

    const wins = (claims.P166 || []).map(claim => ({
      result: "Winner",
      awardId: claimEntityId(claim),
      workId: qualifierEntityId(claim, "P1686"),
      ceremonyId: qualifierEntityId(claim, "P805"),
      year: qualifierYear(claim)
    }));

    const nominations = (claims.P1411 || []).map(claim => ({
      result: "Nominee",
      awardId: claimEntityId(claim),
      workId: qualifierEntityId(claim, "P1686"),
      ceremonyId: qualifierEntityId(claim, "P805"),
      year: qualifierYear(claim)
    }));

    const raw = [...wins, ...nominations].filter(item => item.awardId);

    const labels = await getWikidataLabels(
      raw.flatMap(item => [item.awardId, item.workId, item.ceremonyId])
    );

    const labelFor = id => labels?.[id]?.labels?.en?.value || "";

    const formatted = raw
      .map(item => ({
        award: labelFor(item.awardId),
        result: item.result,
        year: item.year,
        work: labelFor(item.workId),
        ceremony: labelFor(item.ceremonyId)
      }))
      .filter(item => item.award)
      .filter((item, index, array) => {
        const key = `${item.award}|${item.result}|${item.year || ""}|${item.work}`;
        return array.findIndex(other =>
          `${other.award}|${other.result}|${other.year || ""}|${other.work}` === key
        ) === index;
      })
      .sort((a, b) => (b.year || 0) - (a.year || 0));

    const academyAwards = formatted.filter(item =>
      /academy award|academy awards|oscar/i.test(
        `${item.award} ${item.ceremony}`
      )
    );

    return {
      academy_awards: academyAwards,
      academyAwards,
      accolades: formatted.slice(0, 40)
    };
  } catch (error) {
    console.error("Awards/accolades error:", error);
    return { academy_awards: [], academyAwards: [], accolades: [] };
  }
}

/*
  ============================================================
   TMDB PERSON DETAILS
  ============================================================
*/

async function getPersonDetails(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${personId}` +
    "?language=en-US";

  return fetchJSON(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      accept: "application/json"
    }
  });
}

/*
  ============================================================
  TMDB MOVIE CREDITS
  ============================================================
*/

async function getMovieCredits(personId) {
  const url =
    `https://api.themoviedb.org/3/person/${personId}/movie_credits` +
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
  KNOWN FOR
  ============================================================
*/

function buildKnownFor(credits = []) {
  const seen = new Set();

  return credits
    .filter(movie => {
      if (!movie?.id || !movie?.title) {
        return false;
      }

      if (seen.has(movie.id)) {
        return false;
      }

      seen.add(movie.id);

      return true;
    })
    .sort((a, b) => {
      /*
        Popularity helps surface recognizable films,
        while vote count prevents tiny titles from dominating.
      */

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

    const [person, credits] = await Promise.all([
      getPersonDetails(personId),
      getMovieCredits(personId)
    ]);

    /*
      Try Wikipedia first because it generally provides a
      stronger editorial biography.

      IMPORTANT:
      We do NOT slice sentences off the front of the biography.
      This fixes profiles such as Edward Norton beginning with
      phrases like "He also starred..."
    */

    const wikipediaBio =
      await getWikipediaBiography(person.name);

    const tmdbBio =
      cleanText(person.biography || "");

    const biography =
      wikipediaBio ||
      tmdbBio ||
      `${person.name} is a film actor and filmmaker.`;

    const knownFor = buildKnownFor(credits);

    const awardsData =
      await getAwardsAndAccolades(person.name);

    return res.status(200).json({
      id: person.id,

      name: person.name || "",

      birthday: person.birthday || null,

      deathday: person.deathday || null,

      place_of_birth: person.place_of_birth || "",

      biography,

      profile_path: person.profile_path || null,

      homepage: person.homepage || null,

      imdb_id: person.imdb_id || null,

      known_for_department:
        person.known_for_department || "",

      popularity: person.popularity || 0,

      known_for: knownFor,

      academy_awards: awardsData.academy_awards,

      academyAwards: awardsData.academyAwards,

      accolades: awardsData.accolades,

      /*
        Keep aliases for compatibility with older Reelwise
        frontend code.
      */

      knownFor,

      movies: knownFor
    });
  } catch (error) {
    console.error("Reelwise person API error:", error);

    return res.status(500).json({
      error: "Unable to load star profile.",
      details: error.message
    });
  }
}

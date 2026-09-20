const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const OSCARBASE = "https://api.oscarbase.com/api";

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
  ACADEMY AWARDS / OSCARBASE
  ============================================================

  Important:
  Awards failure must NEVER break the person API and must NEVER
  return HTML. Reelwise always receives a readable JSON object.
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
    unavailable
  };
}

async function oscarbase(path) {
  const response = await fetch(`${OSCARBASE}${path}`, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`OscarBase request failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("OscarBase returned a non-JSON response.");
  }

  return response.json();
}

function normalizeAwardItem(item = {}) {
  const year =
    Number(
      item.ceremony_year ??
      item.year ??
      item.ceremonyYear
    ) || null;

  const category = String(
    item.category ??
    item.category_name ??
    item.categoryName ??
    item.award ??
    ""
  ).trim();

  const movie = String(
    item.movie ??
    item.movie_title ??
    item.movieTitle ??
    item.film ??
    item.work ??
    ""
  ).trim();

  const rawWinner =
    item.winner ??
    item.is_winner ??
    item.isWinner ??
    item.won ??
    false;

  const winner =
    rawWinner === true ||
    rawWinner === 1 ||
    String(rawWinner).toLowerCase() === "true" ||
    String(rawWinner).toLowerCase() === "winner" ||
    String(item.result || "").toLowerCase() === "winner";

  return {
    id: item.id || null,
    year,
    category,
    movie,
    winner
  };
}

function dedupeHistory(items = []) {
  const map = new Map();

  for (const item of items) {
    if (!item.category && !item.movie) continue;

    const key = [
      item.year || "",
      item.category.toLowerCase(),
      item.movie.toLowerCase()
    ].join("|");

    const existing = map.get(key);

    if (!existing || item.winner) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.year || 0) - (a.year || 0)
  );
}

async function getAccolades(personId, personName = "") {
  try {
    /*
      OscarBase's documented /api/nominations endpoint can search
      directly by nominee name. This avoids depending on the
      /nominees/{id} detail lookup that was causing the temporary
      unavailable message.
    */

    let name = cleanText(personName);

    if (!name) {
      const person = await getPersonDetails(personId);
      name = cleanText(person?.name || "");
    }

    if (!name) {
      return emptyAccolades(personId, false);
    }

    const response = await oscarbase(
      `/nominations?nominee=${encodeURIComponent(name)}&limit=100`
    );

    const rows =
      Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.results)
            ? response.results
            : [];

    /*
      The API's nominee filter is a partial-name search, so require
      an exact normalized nominee match before displaying anything.
      This prevents a similarly named person from receiving another
      person's Oscar history.
    */
    const normalizeName = value =>
      cleanText(value)
        .toLowerCase()
        .replace(/[.,'’"-]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const wantedName = normalizeName(name);

    const exactRows = rows.filter(item => {
      const nomineeName =
        item?.nominee ??
        item?.name ??
        item?.nominee_name ??
        "";

      return normalizeName(nomineeName) === wantedName;
    });

    const history = dedupeHistory(
      exactRows.map(normalizeAwardItem)
    );

    const wins =
      history.filter(item => item.winner).length;

    const academyAwards = history.map(item => ({
      award: item.category || "Academy Award",
      category: item.category || "Academy Award",
      result: item.winner ? "Winner" : "Nominee",
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
        tmdb_person_id: Number(personId) || null
      },
      wins,
      nominations: history.length,
      history,
      academy_awards: academyAwards,
      academyAwards,
      accolades: academyAwards,
      unavailable: false
    };
  } catch (error) {
    console.error("Reelwise accolades lookup error:", error);

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

const token = process.env.TMDB_READ_ACCESS_TOKEN;

const OSCARBASE = "https://api.oscarbase.com/api";

/*
  ============================================================
  TMDB
  ============================================================
*/

async function tmdb(path) {
  if (!token) {
    throw new Error("TMDB token is not configured");
  }

  const response = await fetch(
    `https://api.themoviedb.org/3${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.status_message ||
      "Movie lookup failed"
    );
  }

  return data;
}

/*
  ============================================================
  OSCARBASE
  ============================================================
*/

async function oscarbase(path) {
  const response = await fetch(
    `${OSCARBASE}${path}`,
    {
      headers: {
        accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `OscarBase request failed: ${response.status}`
    );
  }

  return response.json();
}

function cleanCategory(category = "") {
  return String(category || "").trim();
}

function isBestPicture(category = "") {
  const value = String(category || "")
    .toLowerCase()
    .trim();

  return (
    value.includes("best picture") ||
    value.includes("outstanding picture") ||
    value.includes("outstanding production")
  );
}

/*
  ============================================================
  ACADEMY AWARD NOMINATION CLEANUP
  ============================================================

  Keep the complete nomination history available to the Reelwise
  movie page. OscarBase records can vary slightly in field naming,
  so Reelwise normalizes the useful fields while retaining the raw
  record as a fallback for future display improvements.
*/

function isWinner(item = {}) {
  return (
    item?.winner === true ||
    item?.winner === 1 ||
    String(item?.winner).toLowerCase() === "true"
  );
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function nomineeName(item = {}) {
  return firstText(
    item?.nominee,
    item?.nominee_name,
    item?.person_name,
    item?.name,
    item?.recipient,
    item?.recipient_name,
    item?.credited_name,
    item?.credit
  );
}

function nominationYear(item = {}) {
  const value =
    item?.ceremony_year ??
    item?.year ??
    item?.award_year ??
    item?.ceremony?.year ??
    "";

  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : "";
}

function cleanNomination(item = {}) {
  return {
    category: cleanCategory(
      item?.category ||
      item?.category_name
    ),

    nominee: nomineeName(item),

    winner: isWinner(item),

    ceremonyYear: nominationYear(item),

    ceremony:
      firstText(
        item?.ceremony_name,
        item?.ceremony?.name
      ),

    film:
      firstText(
        item?.film,
        item?.film_title,
        item?.movie_title,
        item?.title
      ),

    raw: item
  };
}

/*
  ============================================================
  AUTOMATIC ACADEMY AWARDS LOOKUP
  ============================================================
*/

async function getAwards(tmdbId) {
  /*
    Step 1:
    Find the OscarBase movie using Reelwise's TMDB ID.
  */

  const search = await oscarbase(
    `/movies?tmdb_id=${encodeURIComponent(tmdbId)}&limit=5`
  );

  /*
    OscarBase list endpoints normally return:
    {
      data: [...]
    }

    This also tolerates an array response in case
    the API format changes.
  */

  const movies = Array.isArray(search)
    ? search
    : Array.isArray(search?.data)
      ? search.data
      : [];

  const movie =
    movies.find(
      item =>
        Number(item?.tmdb_id) === Number(tmdbId)
    ) || movies[0] || null;

  if (!movie || !movie.id) {
    return {
      found: false,
      tmdb_id: Number(tmdbId),
      nominations: 0,
      wins: 0,
      bestPictureWinner: false,
      winningCategories: [],
      nominatedCategories: [],
      ceremonyYears: [],
      history: []
    };
  }

  /*
    Step 2:
    Fetch the full OscarBase movie record.

    /movies/{id} includes the film's nominations.
  */

  const detailResponse = await oscarbase(
    `/movies/${encodeURIComponent(movie.id)}`
  );

  /*
    Accept either:
      { ...movie }
    or:
      { data: { ...movie } }

    This prevents the response wrapper from causing
    Reelwise to incorrectly report zero nominations.
  */

  const detail =
    detailResponse?.data &&
    !Array.isArray(detailResponse.data)
      ? detailResponse.data
      : detailResponse;

  const nominations =
    Array.isArray(detail?.nominations)
      ? detail.nominations
      : [];

  /*
    OscarBase uses winner:true for winning nominations.
  */

  const wins = nominations.filter(isWinner);

  const winningCategories = [
    ...new Set(
      wins
        .map(item =>
          cleanCategory(
            item?.category ||
            item?.category_name
          )
        )
        .filter(Boolean)
    )
  ];

  const nominatedCategories = [
    ...new Set(
      nominations
        .map(item =>
          cleanCategory(
            item?.category ||
            item?.category_name
          )
        )
        .filter(Boolean)
    )
  ];

  const ceremonyYears = [
    ...new Set(
      nominations
        .map(nominationYear)
        .filter(Boolean)
    )
  ].sort((a, b) => a - b);

  const bestPictureWinner =
    wins.some(item =>
      isBestPicture(
        item?.category ||
        item?.category_name
      )
    );

  /*
    NEW:
    Send every Academy Award nomination to index.html instead of
    discarding the individual records after calculating totals.
  */

  const history = nominations
    .map(cleanNomination)
    .filter(item => item.category)
    .sort((a, b) => {
      if (a.ceremonyYear && b.ceremonyYear) {
        return a.ceremonyYear - b.ceremonyYear;
      }
      return 0;
    });

  return {
    found: nominations.length > 0,

    movie: {
      title:
        detail?.title ||
        movie?.title ||
        "",

      release_date:
        detail?.release_date ||
        movie?.release_date ||
        "",

      tmdb_id: Number(tmdbId)
    },

    nominations: nominations.length,
    wins: wins.length,

    bestPictureWinner,

    winningCategories,
    nominatedCategories,
    ceremonyYears,

    history
  };
}

/*
  ============================================================
  MOVIE CLEANUP
  ============================================================
*/

function cleanMovies(movies) {
  return (movies || [])
    .filter(movie =>
      movie &&
      movie.id &&
      movie.title &&
      movie.poster_path
    )
    .map(movie => ({
      id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      release_date: movie.release_date || "",
      overview: movie.overview || "",
      popularity: movie.popularity || 0
    }));
}

/*
  ============================================================
  MAIN REELWISE MOVIES API
  ============================================================
*/

export default async function handler(req, res) {
  try {
    const category =
      String(
        req.query?.category ||
        "trending"
      ).toLowerCase();

    /*
      ========================================================
      ACADEMY AWARDS

      Example:
      /api/movies?category=awards&id=238
      ========================================================
    */

    if (category === "awards") {
      const tmdbId =
        Number(req.query?.id);

      if (!tmdbId) {
        return res.status(400).json({
          error: "Missing TMDB movie ID"
        });
      }

      try {
        const awards =
          await getAwards(tmdbId);

        res.setHeader(
          "Cache-Control",
          "s-maxage=86400, stale-while-revalidate=604800"
        );

        return res
          .status(200)
          .json(awards);

      } catch (awardError) {
        /*
          OscarBase should never prevent the movie
          page itself from loading.
        */

        console.error(
          "Reelwise awards lookup error:",
          awardError
        );

        return res.status(200).json({
          found: false,
          tmdb_id: tmdbId,
          nominations: 0,
          wins: 0,
          bestPictureWinner: false,
          winningCategories: [],
          nominatedCategories: [],
          ceremonyYears: [],
          history: [],
          unavailable: true
        });
      }
    }

    let data;

    /*
      ========================================================
      TRENDING MOVIES
      ========================================================
    */

    if (category === "trending") {
      data = await tmdb(
        "/trending/movie/week?language=en-US"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      ACTION
      TMDB genre 28
      ========================================================
    */

    if (category === "action") {
      data = await tmdb(
        "/discover/movie" +
        "?with_genres=28" +
        "&include_adult=false" +
        "&include_video=false" +
        "&language=en-US" +
        "&sort_by=popularity.desc" +
        "&vote_count.gte=1000"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      COMEDY
      TMDB genre 35
      ========================================================
    */

    if (category === "comedy") {
      data = await tmdb(
        "/discover/movie" +
        "?with_genres=35" +
        "&include_adult=false" +
        "&include_video=false" +
        "&language=en-US" +
        "&sort_by=popularity.desc" +
        "&vote_count.gte=1000"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      MOVIE CLASSICS
      ========================================================
    */

    if (category === "classics") {
      data = await tmdb(
        "/discover/movie" +
        "?include_adult=false" +
        "&include_video=false" +
        "&language=en-US" +
        "&primary_release_date.lte=1979-12-31" +
        "&sort_by=vote_average.desc" +
        "&vote_count.gte=1500"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      80s & 90s
      ========================================================
    */

    if (category === "retro") {
      data = await tmdb(
        "/discover/movie" +
        "?include_adult=false" +
        "&include_video=false" +
        "&language=en-US" +
        "&primary_release_date.gte=1980-01-01" +
        "&primary_release_date.lte=1999-12-31" +
        "&sort_by=popularity.desc" +
        "&vote_count.gte=1000"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      GREAT FRANCHISES
      ========================================================
    */

    if (category === "franchises") {
      const franchiseMovieIds = [
        862,
        11,
        85,
        603,
        671,
        120,
        27205,
        1771,
        155,
        98,
        78,
        329,
        238,
        424,
        105,
        597,
        89,
        1891
      ];

      const movies =
        await Promise.all(
          franchiseMovieIds.map(
            async id => {
              try {
                return await tmdb(
                  `/movie/${id}?language=en-US`
                );
              } catch {
                return null;
              }
            }
          )
        );

      return res
        .status(200)
        .json(
          cleanMovies(movies)
        );
    }

    /*
      ========================================================
      FALLBACK
      ========================================================
    */

    data = await tmdb(
      "/movie/popular?language=en-US&page=1"
    );

    return res
      .status(200)
      .json(
        cleanMovies(data.results)
      );

  } catch (error) {
    console.error(
      "Reelwise movies API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Movie lookup failed"
    });
  }
}

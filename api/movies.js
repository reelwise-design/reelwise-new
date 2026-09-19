const token = process.env.TMDB_READ_ACCESS_TOKEN;

const OSCARBASE =
  "https://api.oscarbase.com/api";

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
  return String(category).trim();
}

function isBestPicture(category = "") {
  const value =
    String(category).toLowerCase();

  return (
    value.includes("best picture") ||
    value.includes("outstanding picture") ||
    value.includes("outstanding production")
  );
}

/*
  ============================================================
  AUTOMATIC ACADEMY AWARDS LOOKUP
  ============================================================
*/

async function getAwards(tmdbId) {
  if (!tmdbId) {
    return {
      found: false,
      nominations: 0,
      wins: 0,
      bestPictureWinner: false,
      winningCategories: [],
      nominatedCategories: [],
      ceremonyYears: []
    };
  }

  /*
    Find OscarBase's movie record using the
    TMDB movie ID Reelwise already has.
  */

  const search = await oscarbase(
    `/movies?tmdb_id=${encodeURIComponent(
      tmdbId
    )}&limit=5`
  );

  const movies =
    Array.isArray(search?.data)
      ? search.data
      : [];

  const movie =
    movies.find(
      item =>
        Number(item.tmdb_id) ===
        Number(tmdbId)
    ) || null;

  /*
    No result means this movie does not have
    an Academy Award record in OscarBase.
  */

  if (!movie) {
    return {
      found: false,
      tmdb_id: Number(tmdbId),
      nominations: 0,
      wins: 0,
      bestPictureWinner: false,
      winningCategories: [],
      nominatedCategories: [],
      ceremonyYears: []
    };
  }

  /*
    Fetch full movie record.
    This includes all Oscar nominations.
  */

  const detail = await oscarbase(
    `/movies/${movie.id}`
  );

  const nominations =
    Array.isArray(detail?.nominations)
      ? detail.nominations
      : [];

  const wins =
    nominations.filter(
      nomination =>
        nomination.winner === true
    );

  const winningCategories = [
    ...new Set(
      wins
        .map(item =>
          cleanCategory(item.category)
        )
        .filter(Boolean)
    )
  ];

  const nominatedCategories = [
    ...new Set(
      nominations
        .map(item =>
          cleanCategory(item.category)
        )
        .filter(Boolean)
    )
  ];

  const ceremonyYears = [
    ...new Set(
      nominations
        .map(item =>
          Number(item.ceremony_year)
        )
        .filter(Boolean)
    )
  ].sort((a, b) => a - b);

  const bestPictureWinner =
    wins.some(item =>
      isBestPicture(item.category)
    );

  return {
    found: nominations.length > 0,

    movie: {
      title:
        detail?.title ||
        movie.title ||
        "",

      release_date:
        detail?.release_date ||
        movie.release_date ||
        "",

      tmdb_id: Number(tmdbId)
    },

    nominations:
      nominations.length,

    wins:
      wins.length,

    bestPictureWinner,

    winningCategories,

    nominatedCategories,

    ceremonyYears
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
      release_date:
        movie.release_date || "",
      overview:
        movie.overview || "",
      popularity:
        movie.popularity || 0
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

      Uses the movie's TMDB ID.
      ========================================================
    */

    if (category === "awards") {
      const tmdbId =
        Number(req.query?.id);

      if (!tmdbId) {
        return res.status(400).json({
          error:
            "Missing TMDB movie ID"
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
          Awards must never break the movie page.

          If OscarBase is temporarily unavailable,
          Reelwise simply behaves as though no award
          information was found.
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

      Highly rated movies released
      before 1980 with substantial votes.
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

      Popular movies released from
      1980 through 1999.
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

      These are TMDB movie IDs.
      Movie information still comes
      directly from TMDB.
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

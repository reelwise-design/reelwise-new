/*
  ============================================================
  REELWISE AWARDS API
  ============================================================

  Uses OscarBase to automatically find Academy Award history
  for a movie using the TMDB movie ID already used by Reelwise.

  No API key required.
*/

const OSCARBASE = "https://api.oscarbase.com/api";

async function getJSON(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`OscarBase request failed: ${response.status}`);
  }

  return response.json();
}

function cleanCategory(category = "") {
  return String(category).trim();
}

function isBestPicture(category = "") {
  const value = String(category).toLowerCase();

  return (
    value.includes("best picture") ||
    value.includes("outstanding picture") ||
    value.includes("outstanding production")
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");

  const tmdbId = Number(req.query.id);

  if (!tmdbId) {
    return res.status(400).json({
      error: "Missing TMDB movie ID."
    });
  }

  try {
    /*
      STEP 1
      Find the OscarBase movie using its TMDB ID.
    */

    const movieSearch = await getJSON(
      `${OSCARBASE}/movies?tmdb_id=${encodeURIComponent(tmdbId)}&limit=5`
    );

    const movies = Array.isArray(movieSearch?.data)
      ? movieSearch.data
      : [];

    const movie = movies.find(
      item => Number(item.tmdb_id) === tmdbId
    );

    /*
      No OscarBase movie means the film has no Academy Award
      record in the database. Reelwise simply displays nothing.
    */

    if (!movie) {
      return res.status(200).json({
        found: false,
        tmdb_id: tmdbId,
        nominations: 0,
        wins: 0,
        bestPictureWinner: false,
        winningCategories: [],
        nominatedCategories: []
      });
    }

    /*
      STEP 2
      Fetch the complete movie record, which includes nominations.
    */

    const movieDetail = await getJSON(
      `${OSCARBASE}/movies/${movie.id}`
    );

    const nominations = Array.isArray(movieDetail?.nominations)
      ? movieDetail.nominations
      : [];

    const wins = nominations.filter(
      nomination => nomination.winner === true
    );

    const winningCategories = [
      ...new Set(
        wins
          .map(item => cleanCategory(item.category))
          .filter(Boolean)
      )
    ];

    const nominatedCategories = [
      ...new Set(
        nominations
          .map(item => cleanCategory(item.category))
          .filter(Boolean)
      )
    ];

    const bestPictureWinner = wins.some(item =>
      isBestPicture(item.category)
    );

    /*
      Ceremony year can differ from the film's release year.
      Example:
      Rocky = 1976 film, Oscars ceremony = 1977.
    */

    const ceremonyYears = [
      ...new Set(
        nominations
          .map(item => Number(item.ceremony_year))
          .filter(Boolean)
      )
    ].sort((a, b) => a - b);

    return res.status(200).json({
      found: true,

      movie: {
        title: movieDetail?.title || movie.title || "",
        release_date:
          movieDetail?.release_date ||
          movie.release_date ||
          "",
        tmdb_id: tmdbId
      },

      nominations: nominations.length,
      wins: wins.length,

      bestPictureWinner,

      winningCategories,
      nominatedCategories,
      ceremonyYears
    });

  } catch (error) {
    console.error("Reelwise Awards API error:", error);

    /*
      Awards should never prevent the movie page itself from
      working. If OscarBase is temporarily unavailable, return
      an empty award result rather than breaking Reelwise.
    */

    return res.status(200).json({
      found: false,
      tmdb_id: tmdbId,
      nominations: 0,
      wins: 0,
      bestPictureWinner: false,
      winningCategories: [],
      nominatedCategories: [],
      unavailable: true
    });
  }
}

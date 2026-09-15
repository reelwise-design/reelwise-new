const token = process.env.TMDB_READ_ACCESS_TOKEN;

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

export default async function handler(req, res) {
  try {
    const category =
      String(req.query?.category || "trending")
        .toLowerCase();

    let data;

    /*
      TRENDING MOVIES
    */

    if (category === "trending") {
      data = await tmdb(
        "/trending/movie/week?language=en-US"
      );

      return res
        .status(200)
        .json(cleanMovies(data.results));
    }

    /*
      ACTION
      TMDB genre 28
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
        .json(cleanMovies(data.results));
    }

    /*
      COMEDY
      TMDB genre 35
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
        .json(cleanMovies(data.results));
    }

    /*
      MOVIE CLASSICS

      Highly rated movies released
      before 1980 with substantial votes.
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
        .json(cleanMovies(data.results));
    }

    /*
      80s & 90s

      Popular movies released from
      1980 through 1999.
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
        .json(cleanMovies(data.results));
    }

    /*
      GREAT FRANCHISES

      For this discovery row, use recognizable
      franchise entries from different series.

      These are TMDB movie IDs, not hard-coded
      movie information. All titles/posters/details
      still come directly from TMDB.
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

      const movies = await Promise.all(
        franchiseMovieIds.map(async id => {
          try {
            return await tmdb(
              `/movie/${id}?language=en-US`
            );
          } catch {
            return null;
          }
        })
      );

      return res
        .status(200)
        .json(cleanMovies(movies));
    }

    /*
      FALLBACK
    */

    data = await tmdb(
      "/movie/popular?language=en-US&page=1"
    );

    return res
      .status(200)
      .json(cleanMovies(data.results));

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

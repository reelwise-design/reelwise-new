export default async function handler(req, res) {
  const actor1 = req.query.actor1;
  const actor2 = req.query.actor2;

  if (!actor1 || !actor2) {
    return res.status(400).json({
      error: "Missing actor names"
    });
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "TMDB token is not configured"
    });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    accept: "application/json"
  };

  async function tmdb(url) {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  }

  async function searchPerson(name) {
    const data = await tmdb(
      `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&include_adult=false&language=en-US&page=1`
    );

    return data?.results?.[0] || null;
  }

  async function getMovieCredits(personId) {
    const data = await tmdb(
      `https://api.themoviedb.org/3/person/${personId}/movie_credits?language=en-US`
    );

    return data?.cast || [];
  }

  async function getMovie(movieId) {
    return await tmdb(
      `https://api.themoviedb.org/3/movie/${movieId}?language=en-US`
    );
  }

  async function getCast(movieId) {
    const data = await tmdb(
      `https://api.themoviedb.org/3/movie/${movieId}/credits?language=en-US`
    );

    return data?.cast || [];
  }

  function normalActingCredit(movie) {
    const character = (movie.character || "").toLowerCase();

    const badCharacterTerms = [
      "self",
      "archive",
      "archival",
      "himself",
      "herself",
      "footage"
    ];

    return !badCharacterTerms.some(term =>
      character.includes(term)
    );
  }

  async function validConnectionMovie(movie) {
    if (!movie?.id || !normalActingCredit(movie)) {
      return false;
    }

    const details = await getMovie(movie.id);

    if (!details) {
      return false;
    }

    const genres = details.genres || [];

    const isDocumentary = genres.some(
      genre => genre.name === "Documentary"
    );

    if (isDocumentary) {
      return false;
    }

    return true;
  }

  function cleanMovies(movies) {
    const seen = new Set();

    return movies
      .filter(movie =>
        movie.id &&
        movie.title &&
        !movie.adult &&
        normalActingCredit(movie)
      )
      .filter(movie => {
        if (seen.has(movie.id)) {
          return false;
        }

        seen.add(movie.id);
        return true;
      })
      .sort(
        (a, b) =>
          (b.popularity || 0) -
          (a.popularity || 0)
      )
      .slice(0, 20);
  }

  try {
    const [personA, personB] = await Promise.all([
      searchPerson(actor1),
      searchPerson(actor2)
    ]);

    if (!personA || !personB) {
      return res.status(404).json({
        error: "One or both actors could not be found"
      });
    }

    if (personA.id === personB.id) {
      return res.status(200).json({
        found: true,
        degrees: 0,
        actor1: personA,
        actor2: personB,
        path: []
      });
    }

    const [allMoviesA, allMoviesB] = await Promise.all([
      getMovieCredits(personA.id),
      getMovieCredits(personB.id)
    ]);

    const moviesBMap = new Map(
      allMoviesB
        .filter(normalActingCredit)
        .map(movie => [movie.id, movie])
    );

    /*
      DIRECT CONNECTION
    */

    for (const movie of allMoviesA) {
      if (!moviesBMap.has(movie.id)) {
        continue;
      }

      const matchingMovieB = moviesBMap.get(movie.id);

      if (
        !normalActingCredit(movie) ||
        !normalActingCredit(matchingMovieB)
      ) {
        continue;
      }

      const valid = await validConnectionMovie(movie);

      if (!valid) {
        continue;
      }

      return res.status(200).json({
        found: true,
        degrees: 1,
        actor1: personA,
        actor2: personB,
        path: [
          {
            actor: personA.name,
            actorId: personA.id,
            movie: movie.title,
            movieId: movie.id
          },
          {
            actor: personB.name,
            actorId: personB.id
          }
        ]
      });
    }

    /*
      TWO-DEGREE CONNECTION
    */

    const moviesA = cleanMovies(allMoviesA);
    const moviesB = cleanMovies(allMoviesB);

    const [castsA, castsB] = await Promise.all([
      Promise.all(
        moviesA.map(movie => getCast(movie.id))
      ),
      Promise.all(
        moviesB.map(movie => getCast(movie.id))
      )
    ]);

    const actorMapB = new Map();

    castsB.forEach((cast, movieIndex) => {
      const movie = moviesB[movieIndex];

      cast
        .slice(0, 25)
        .forEach(actor => {
          if (
            !actor.id ||
            actor.id === personA.id ||
            actor.id === personB.id
          ) {
            return;
          }

          const character =
            (actor.character || "").toLowerCase();

          if (
            character.includes("self") ||
            character.includes("archive")
          ) {
            return;
          }

          if (!actorMapB.has(actor.id)) {
            actorMapB.set(actor.id, {
              actor,
              movie
            });
          }
        });
    });

    for (
      let movieIndex = 0;
      movieIndex < castsA.length;
      movieIndex++
    ) {
      const cast = castsA[movieIndex];
      const movieA = moviesA[movieIndex];

      for (const middleActor of cast.slice(0, 25)) {
        if (
          !middleActor.id ||
          middleActor.id === personA.id ||
          middleActor.id === personB.id
        ) {
          continue;
        }

        const character =
          (middleActor.character || "").toLowerCase();

        if (
          character.includes("self") ||
          character.includes("archive")
        ) {
          continue;
        }

        const match = actorMapB.get(
          middleActor.id
        );

        if (!match) {
          continue;
        }

        const [movieAValid, movieBValid] =
          await Promise.all([
            validConnectionMovie(movieA),
            validConnectionMovie(match.movie)
          ]);

        if (!movieAValid || !movieBValid) {
          continue;
        }

        return res.status(200).json({
          found: true,
          degrees: 2,
          actor1: personA,
          actor2: personB,
          path: [
            {
              actor: personA.name,
              actorId: personA.id,
              movie: movieA.title,
              movieId: movieA.id
            },
            {
              actor: middleActor.name,
              actorId: middleActor.id,
              movie: match.movie.title,
              movieId: match.movie.id
            },
            {
              actor: personB.name,
              actorId: personB.id
            }
          ]
        });
      }
    }

    return res.status(200).json({
      found: false,
      actor1: personA,
      actor2: personB,
      message:
        "No real acting connection was found in this search yet."
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Six Degrees search failed"
    });
  }
}

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

    if (!data?.results?.length) {
      return null;
    }

    return data.results[0];

  }


  async function getMovieCredits(personId) {

    const data = await tmdb(
      `https://api.themoviedb.org/3/person/${personId}/movie_credits?language=en-US`
    );

    return data?.cast || [];

  }


  async function getCast(movieId) {

    const data = await tmdb(
      `https://api.themoviedb.org/3/movie/${movieId}/credits?language=en-US`
    );

    return data?.cast || [];

  }


  function cleanMovies(movies) {

    const seen = new Set();

    return movies

      .filter(movie =>
        movie.id &&
        movie.title &&
        !movie.adult
      )

      .filter(movie => {

        if (seen.has(movie.id)) {
          return false;
        }

        seen.add(movie.id);

        return true;

      })

      .sort((a, b) =>
        (b.popularity || 0) -
        (a.popularity || 0)
      )

      .slice(0, 25);

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


    /*
      FIRST CHECK:
      Were the two actors actually in the same movie?
    */

    const moviesBMap = new Map(
      allMoviesB.map(movie => [
        movie.id,
        movie
      ])
    );


    for (const movie of allMoviesA) {

      if (moviesBMap.has(movie.id)) {

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

    }


    /*
      SECOND CHECK:
      Look for a shared co-star.

      Actor A -> Movie A -> Middle Actor
      Middle Actor -> Movie B -> Actor B
    */

    const moviesA = cleanMovies(allMoviesA);
    const moviesB = cleanMovies(allMoviesB);


    const castsA = await Promise.all(
      moviesA.map(movie =>
        getCast(movie.id)
      )
    );


    const castsB = await Promise.all(
      moviesB.map(movie =>
        getCast(movie.id)
      )
    );


    /*
      Build a map of actors connected to Actor B.
    */

    const actorMapB = new Map();


    castsB.forEach((cast, movieIndex) => {

      const movie = moviesB[movieIndex];

      cast
        .slice(0, 30)
        .forEach(actor => {

          if (
            !actor.id ||
            actor.id === personA.id ||
            actor.id === personB.id
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


    /*
      Search Actor A's movie casts for the same person.
    */

    for (
      let movieIndex = 0;
      movieIndex < castsA.length;
      movieIndex++
    ) {

      const cast = castsA[movieIndex];
      const movieA = moviesA[movieIndex];


      for (const middleActor of cast.slice(0, 30)) {

        if (
          !middleActor.id ||
          middleActor.id === personA.id ||
          middleActor.id === personB.id
        ) {
          continue;
        }


        const match = actorMapB.get(
          middleActor.id
        );


        if (match) {

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

    }


    return res.status(200).json({

      found: false,

      actor1: personA,

      actor2: personB,

      message:
        "No connection was found in this search. Reelwise will continue expanding toward the full Six Degrees game."

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Six Degrees search failed"
    });

  }

}

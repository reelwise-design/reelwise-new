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

  try {

    const searchPerson = async (name) => {

      const response = await fetch(
        `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&include_adult=false&language=en-US&page=1`,
        { headers }
      );

      const data = await response.json();

      if (!response.ok || !data.results?.length) {
        return null;
      }

      return data.results[0];
    };


    const getCredits = async (personId) => {

      const response = await fetch(
        `https://api.themoviedb.org/3/person/${personId}/movie_credits?language=en-US`,
        { headers }
      );

      const data = await response.json();

      if (!response.ok) {
        return [];
      }

      return data.cast || [];
    };


    const getMovieCredits = async (movieId) => {

      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${movieId}/credits?language=en-US`,
        { headers }
      );

      const data = await response.json();

      if (!response.ok) {
        return [];
      }

      return data.cast || [];
    };


    const personA = await searchPerson(actor1);
    const personB = await searchPerson(actor2);


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


    const creditsA = await getCredits(personA.id);
    const creditsB = await getCredits(personB.id);


    const moviesB = new Map(
      creditsB.map(movie => [movie.id, movie])
    );


    for (const movie of creditsA) {

      if (moviesB.has(movie.id)) {

        return res.status(200).json({
          found: true,
          degrees: 1,
          actor1: personA,
          actor2: personB,
          path: [
            {
              actor: personA.name,
              movie: movie.title,
              movieId: movie.id
            },
            {
              actor: personB.name
            }
          ]
        });

      }

    }


    const bestMoviesA = creditsA
      .filter(movie => movie.id)
      .sort(
        (a,b)=>
        (b.popularity || 0) -
        (a.popularity || 0)
      )
      .slice(0,20);


    const checkedActors = new Set([
      personA.id,
      personB.id
    ]);


    for (const movieA of bestMoviesA) {

      const cast = await getMovieCredits(movieA.id);

      const importantCast = cast.slice(0,15);


      for (const middleActor of importantCast) {

        if (checkedActors.has(middleActor.id)) {
          continue;
        }

        checkedActors.add(middleActor.id);


        const middleCredits =
          await getCredits(middleActor.id);


        for (const movieB of middleCredits) {

          if (moviesB.has(movieB.id)) {

            return res.status(200).json({
              found: true,
              degrees: 2,
              actor1: personA,
              actor2: personB,
              path: [
                {
                  actor: personA.name,
                  movie: movieA.title,
                  movieId: movieA.id
                },
                {
                  actor: middleActor.name,
                  movie: movieB.title,
                  movieId: movieB.id
                },
                {
                  actor: personB.name
                }
              ]
            });

          }

        }

      }

    }


    return res.status(200).json({
      found: false,
      actor1: personA,
      actor2: personB,
      message:
        "No short connection was found yet. Reelwise will keep expanding the Six Degrees engine."
    });


  } catch (error) {

    return res.status(500).json({
      error: "Six Degrees search failed"
    });

  }

}

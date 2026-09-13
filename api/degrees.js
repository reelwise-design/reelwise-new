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


  const movieCastCache = new Map();
  const personCreditsCache = new Map();
  const movieDetailsCache = new Map();


  async function tmdb(url) {

    const response = await fetch(url, {
      headers
    });

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


  async function getPersonCredits(personId) {

    if (personCreditsCache.has(personId)) {
      return personCreditsCache.get(personId);
    }

    const data = await tmdb(
      `https://api.themoviedb.org/3/person/${personId}/movie_credits?language=en-US`
    );

    const movies = data?.cast || [];

    personCreditsCache.set(personId, movies);

    return movies;

  }


  async function getMovieCast(movieId) {

    if (movieCastCache.has(movieId)) {
      return movieCastCache.get(movieId);
    }

    const data = await tmdb(
      `https://api.themoviedb.org/3/movie/${movieId}/credits?language=en-US`
    );

    const cast = data?.cast || [];

    movieCastCache.set(movieId, cast);

    return cast;

  }


  async function getMovieDetails(movieId) {

    if (movieDetailsCache.has(movieId)) {
      return movieDetailsCache.get(movieId);
    }

    const data = await tmdb(
      `https://api.themoviedb.org/3/movie/${movieId}?language=en-US`
    );

    movieDetailsCache.set(movieId, data);

    return data;

  }


  function isRealActingCredit(credit) {

    if (!credit) {
      return false;
    }

    const character =
      (credit.character || "").toLowerCase();


    const badTerms = [
      "self",
      "archive",
      "archival",
      "footage",
      "himself",
      "herself"
    ];


    if (
      badTerms.some(term =>
        character.includes(term)
      )
    ) {
      return false;
    }


    return true;

  }


  function selectMovies(movies) {

    const seen = new Set();


    return movies

      .filter(movie =>
        movie.id &&
        movie.title &&
        !movie.adult &&
        isRealActingCredit(movie)
      )

      .filter(movie => {

        if (seen.has(movie.id)) {
          return false;
        }

        seen.add(movie.id);

        return true;

      })

      .sort((a, b) => {

        const popA = a.popularity || 0;
        const popB = b.popularity || 0;

        return popB - popA;

      })

      .slice(0, 7);

  }


  async function validMovie(movieId) {

    const details =
      await getMovieDetails(movieId);


    if (!details) {
      return false;
    }


    const genres =
      details.genres || [];


    if (
      genres.some(
        genre =>
          genre.name === "Documentary"
      )
    ) {
      return false;
    }


    return true;

  }


  async function getNeighbors(person) {

    const movies =
      selectMovies(
        await getPersonCredits(person.id)
      );


    const casts =
      await Promise.all(
        movies.map(movie =>
          getMovieCast(movie.id)
        )
      );


    const neighborMap =
      new Map();


    for (
      let i = 0;
      i < movies.length;
      i++
    ) {

      const movie = movies[i];
      const cast = casts[i] || [];


      for (
        const castMember of
        cast.slice(0, 18)
      ) {

        if (
          !castMember.id ||
          castMember.id === person.id
        ) {
          continue;
        }


        if (
          !isRealActingCredit(castMember)
        ) {
          continue;
        }


        if (
          !neighborMap.has(
            castMember.id
          )
        ) {

          neighborMap.set(
            castMember.id,
            {
              actor: {
                id: castMember.id,
                name: castMember.name,
                popularity:
                  castMember.popularity || 0
              },

              movie: {
                id: movie.id,
                title: movie.title
              }
            }
          );

        }

      }

    }


    return Array.from(
      neighborMap.values()
    )

      .sort(
        (a, b) =>
          (b.actor.popularity || 0) -
          (a.actor.popularity || 0)
      )

      .slice(0, 28);

  }


  function buildPath(
    visitedA,
    visitedB,
    meetingId
  ) {

    const left = [];
    let current = meetingId;


    while (
      visitedA.get(current)?.parent
    ) {

      const node =
        visitedA.get(current);

      left.unshift({
        from: node.parentName,
        fromId: node.parent,
        movie: node.movieTitle,
        movieId: node.movieId,
        to: node.name,
        toId: current
      });

      current = node.parent;

    }


    const right = [];
    current = meetingId;


    while (
      visitedB.get(current)?.parent
    ) {

      const node =
        visitedB.get(current);

      right.push({
        from: node.name,
        fromId: current,
        movie: node.movieTitle,
        movieId: node.movieId,
        to: node.parentName,
        toId: node.parent
      });

      current = node.parent;

    }


    return [
      ...left,
      ...right
    ];

  }


  async function verifyPath(path) {

    for (const step of path) {

      const valid =
        await validMovie(
          step.movieId
        );

      if (!valid) {
        return false;
      }

    }

    return true;

  }


  function formatPath(
    actorA,
    actorB,
    edges
  ) {

    const path = [];


    if (!edges.length) {
      return path;
    }


    for (
      let i = 0;
      i < edges.length;
      i++
    ) {

      const edge = edges[i];


      path.push({
        actor: edge.from,
        actorId: edge.fromId,
        movie: edge.movie,
        movieId: edge.movieId
      });

    }


    path.push({
      actor: actorB.name,
      actorId: actorB.id
    });


    return path;

  }


  try {

    const [personA, personB] =
      await Promise.all([
        searchPerson(actor1),
        searchPerson(actor2)
      ]);


    if (!personA || !personB) {

      return res.status(404).json({
        error:
          "One or both actors could not be found"
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


    /*
      BIDIRECTIONAL SEARCH

      Search outward from BOTH actors.

      Each side can travel three levels.

      3 + 3 = maximum 6 degrees.
    */


    const visitedA =
      new Map();


    const visitedB =
      new Map();


    visitedA.set(
      personA.id,
      {
        id: personA.id,
        name: personA.name,
        depth: 0,
        parent: null
      }
    );


    visitedB.set(
      personB.id,
      {
        id: personB.id,
        name: personB.name,
        depth: 0,
        parent: null
      }
    );


    let frontierA = [
      {
        id: personA.id,
        name: personA.name
      }
    ];


    let frontierB = [
      {
        id: personB.id,
        name: personB.name
      }
    ];


    async function expandFrontier(
      frontier,
      ownVisited,
      otherVisited,
      maxDepth
    ) {

      const next = [];


      for (
        const person of
        frontier.slice(0, 12)
      ) {

        const current =
          ownVisited.get(person.id);


        if (
          !current ||
          current.depth >= maxDepth
        ) {
          continue;
        }


        const neighbors =
          await getNeighbors(person);


        for (
          const connection of
          neighbors
        ) {

          const actor =
            connection.actor;


          if (
            ownVisited.has(actor.id)
          ) {
            continue;
          }


          ownVisited.set(
            actor.id,
            {
              id: actor.id,
              name: actor.name,
              depth:
                current.depth + 1,

              parent:
                person.id,

              parentName:
                person.name,

              movieId:
                connection.movie.id,

              movieTitle:
                connection.movie.title,

              popularity:
                actor.popularity || 0
            }
          );


          next.push({
            id: actor.id,
            name: actor.name,
            popularity:
              actor.popularity || 0
          });


          if (
            otherVisited.has(actor.id)
          ) {

            return {
              found: true,
              meetingId:
                actor.id,
              next
            };

          }

        }

      }


      next.sort(
        (a, b) =>
          (b.popularity || 0) -
          (a.popularity || 0)
      );


      return {
        found: false,
        next:
          next.slice(0, 18)
      };

    }


    let meetingId = null;


    for (
      let round = 1;
      round <= 3;
      round++
    ) {

      const resultA =
        await expandFrontier(
          frontierA,
          visitedA,
          visitedB,
          3
        );


      frontierA =
        resultA.next;


      if (resultA.found) {

        meetingId =
          resultA.meetingId;

        break;

      }


      const resultB =
        await expandFrontier(
          frontierB,
          visitedB,
          visitedA,
          3
        );


      frontierB =
        resultB.next;


      if (resultB.found) {

        meetingId =
          resultB.meetingId;

        break;

      }


      if (
        !frontierA.length &&
        !frontierB.length
      ) {
        break;
      }

    }


    if (!meetingId) {

      return res.status(200).json({

        found: false,

        actor1: personA,

        actor2: personB,

        message:
          "Reelwise searched up to six degrees but did not find a strong movie connection in this search."

      });

    }


    const edges =
      buildPath(
        visitedA,
        visitedB,
        meetingId
      );


    /*
      Reject documentary or compilation
      movies before displaying result.
    */


    const verified =
      await verifyPath(edges);


    if (!verified) {

      return res.status(200).json({

        found: false,

        actor1: personA,

        actor2: personB,

        message:
          "A possible connection was found, but Reelwise rejected it because it included archive, documentary or compilation material."

      });

    }


    const degrees =
      edges.length;


    if (
      degrees < 1 ||
      degrees > 6
    ) {

      return res.status(200).json({

        found: false,

        actor1: personA,

        actor2: personB,

        message:
          "No valid Six Degrees connection was found."

      });

    }


    return res.status(200).json({

      found: true,

      degrees,

      actor1: personA,

      actor2: personB,

      path:
        formatPath(
          personA,
          personB,
          edges
        )

    });


  } catch (error) {

    console.error(
      "Six Degrees error:",
      error
    );


    return res.status(500).json({
      error:
        "Six Degrees search failed"
    });

  }

}

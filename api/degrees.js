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

    return !badTerms.some(term =>
      character.includes(term)
    );
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


  function selectMovies(movies, limit = 20) {

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

      .sort(
        (a, b) =>
          (b.popularity || 0) -
          (a.popularity || 0)
      )

      .slice(0, limit);
  }


  /*
    1 DEGREE
  */

  async function findDirectConnection(
    personA,
    personB,
    moviesA,
    moviesB
  ) {

    const moviesBMap = new Map(
      moviesB
        .filter(isRealActingCredit)
        .map(movie => [
          movie.id,
          movie
        ])
    );

    for (const movie of moviesA) {

      if (!isRealActingCredit(movie)) {
        continue;
      }

      const match =
        moviesBMap.get(movie.id);

      if (!match) {
        continue;
      }

      if (!isRealActingCredit(match)) {
        continue;
      }

      if (!(await validMovie(movie.id))) {
        continue;
      }

      return {
        found: true,
        degrees: 1,
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
      };
    }

    return null;
  }


  /*
    2 DEGREES
  */

  async function findTwoDegreeConnection(
    personA,
    personB,
    allMoviesA,
    allMoviesB
  ) {

    const moviesA =
      selectMovies(allMoviesA, 25);

    const moviesB =
      selectMovies(allMoviesB, 25);

    const [castsA, castsB] =
      await Promise.all([

        Promise.all(
          moviesA.map(movie =>
            getMovieCast(movie.id)
          )
        ),

        Promise.all(
          moviesB.map(movie =>
            getMovieCast(movie.id)
          )
        )

      ]);


    const actorMapB = new Map();


    castsB.forEach(
      (cast, movieIndex) => {

        const movie =
          moviesB[movieIndex];

        cast
          .slice(0, 30)
          .forEach(actor => {

            if (
              !actor.id ||
              actor.id === personA.id ||
              actor.id === personB.id ||
              !isRealActingCredit(actor)
            ) {
              return;
            }

            if (!actorMapB.has(actor.id)) {

              actorMapB.set(
                actor.id,
                {
                  actor,
                  movie
                }
              );

            }

          });

      }
    );


    for (
      let movieIndex = 0;
      movieIndex < castsA.length;
      movieIndex++
    ) {

      const cast =
        castsA[movieIndex];

      const movieA =
        moviesA[movieIndex];


      for (
        const middleActor of
        cast.slice(0, 30)
      ) {

        if (
          !middleActor.id ||
          middleActor.id === personA.id ||
          middleActor.id === personB.id ||
          !isRealActingCredit(middleActor)
        ) {
          continue;
        }


        const match =
          actorMapB.get(
            middleActor.id
          );


        if (!match) {
          continue;
        }


        const [
          validA,
          validB
        ] = await Promise.all([

          validMovie(movieA.id),

          validMovie(
            match.movie.id
          )

        ]);


        if (!validA || !validB) {
          continue;
        }


        return {

          found: true,

          degrees: 2,

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

        };

      }

    }

    return null;
  }


  /*
    3 TO 6 DEGREES
  */

  async function getNeighbors(person) {

    const movies =
      selectMovies(
        await getPersonCredits(person.id),
        7
      );


    const casts =
      await Promise.all(
        movies.map(movie =>
          getMovieCast(movie.id)
        )
      );


    const neighbors =
      new Map();


    for (
      let i = 0;
      i < movies.length;
      i++
    ) {

      const movie = movies[i];
      const cast = casts[i] || [];


      for (
        const actor of
        cast.slice(0, 18)
      ) {

        if (
          !actor.id ||
          actor.id === person.id ||
          !isRealActingCredit(actor)
        ) {
          continue;
        }


        if (!neighbors.has(actor.id)) {

          neighbors.set(
            actor.id,
            {
              actor: {
                id: actor.id,
                name: actor.name,
                popularity:
                  actor.popularity || 0
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
      neighbors.values()
    )

      .sort(
        (a, b) =>
          (b.actor.popularity || 0) -
          (a.actor.popularity || 0)
      )

      .slice(0, 28);
  }


  async function expandFrontier(
    frontier,
    ownVisited,
    otherVisited
  ) {

    const next = [];
    const meetings = [];


    for (
      const person of
      frontier.slice(0, 14)
    ) {

      const current =
        ownVisited.get(person.id);

      if (!current) {
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

          meetings.push(actor.id);

        }

      }

    }


    next.sort(
      (a, b) =>
        (b.popularity || 0) -
        (a.popularity || 0)
    );


    return {
      next:
        next.slice(0, 20),

      meetings
    };
  }


  function buildEdges(
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

        from:
          node.parentName,

        fromId:
          node.parent,

        movie:
          node.movieTitle,

        movieId:
          node.movieId,

        to:
          node.name,

        toId:
          current

      });

      current =
        node.parent;
    }


    const right = [];
    current = meetingId;


    while (
      visitedB.get(current)?.parent
    ) {

      const node =
        visitedB.get(current);

      right.push({

        from:
          node.name,

        fromId:
          current,

        movie:
          node.movieTitle,

        movieId:
          node.movieId,

        to:
          node.parentName,

        toId:
          node.parent

      });

      current =
        node.parent;
    }


    return [
      ...left,
      ...right
    ];
  }


  async function pathIsValid(edges) {

    for (const edge of edges) {

      if (
        !(await validMovie(
          edge.movieId
        ))
      ) {
        return false;
      }

    }

    return true;
  }


  function formatEdges(
    personB,
    edges
  ) {

    const path =
      edges.map(edge => ({

        actor:
          edge.from,

        actorId:
          edge.fromId,

        movie:
          edge.movie,

        movieId:
          edge.movieId

      }));


    path.push({

      actor:
        personB.name,

      actorId:
        personB.id

    });


    return path;
  }


  try {

    const [
      personA,
      personB
    ] = await Promise.all([

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


    const [
      allMoviesA,
      allMoviesB
    ] = await Promise.all([

      getPersonCredits(personA.id),

      getPersonCredits(personB.id)

    ]);


    /*
      CHECK 1 DEGREE FIRST
    */

    const direct =
      await findDirectConnection(
        personA,
        personB,
        allMoviesA,
        allMoviesB
      );


    if (direct) {

      return res.status(200).json({

        ...direct,
        actor1: personA,
        actor2: personB

      });

    }


    /*
      CHECK 2 DEGREES SECOND
    */

    const twoDegree =
      await findTwoDegreeConnection(
        personA,
        personB,
        allMoviesA,
        allMoviesB
      );


    if (twoDegree) {

      return res.status(200).json({

        ...twoDegree,
        actor1: personA,
        actor2: personB

      });

    }


    /*
      ONLY NOW SEARCH 3–6
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


    let bestPath = null;


    for (
      let round = 1;
      round <= 3;
      round++
    ) {

      const resultA =
        await expandFrontier(
          frontierA,
          visitedA,
          visitedB
        );

      frontierA =
        resultA.next;


      const resultB =
        await expandFrontier(
          frontierB,
          visitedB,
          visitedA
        );

      frontierB =
        resultB.next;


      const meetings = [
        ...resultA.meetings,
        ...resultB.meetings
      ];


      for (
        const meetingId of meetings
      ) {

        const edges =
          buildEdges(
            visitedA,
            visitedB,
            meetingId
          );


        if (
          edges.length < 3 ||
          edges.length > 6
        ) {
          continue;
        }


        if (
          !(await pathIsValid(edges))
        ) {
          continue;
        }


        if (
          !bestPath ||
          edges.length <
            bestPath.length
        ) {

          bestPath = edges;

        }

      }


      /*
        Once a valid path is found at
        this depth, return the shortest
        one from that search level.
      */

      if (bestPath) {

        return res.status(200).json({

          found: true,

          degrees:
            bestPath.length,

          actor1:
            personA,

          actor2:
            personB,

          path:
            formatEdges(
              personB,
              bestPath
            )

        });

      }


      if (
        !frontierA.length &&
        !frontierB.length
      ) {
        break;
      }

    }


    return res.status(200).json({

      found: false,

      actor1:
        personA,

      actor2:
        personB,

      message:
        "Reelwise searched up to six degrees but did not find a strong movie connection."

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

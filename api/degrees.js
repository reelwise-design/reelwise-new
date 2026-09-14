const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

const movieCreditsCache = new Map();
const castCache = new Map();
const personCache = new Map();

async function tmdb(path) {
  let url = `https://api.themoviedb.org/3${path}`;

  const headers = {
    accept: "application/json"
  };

  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  } else if (API_KEY) {
    const separator = url.includes("?") ? "&" : "?";
    url += `${separator}api_key=${API_KEY}`;
  } else {
    throw new Error("TMDB credentials are not configured.");
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }

  return response.json();
}

async function findActor(name) {
  const data = await tmdb(
    `/search/person?query=${encodeURIComponent(name)}&include_adult=false`
  );

  const people = Array.isArray(data.results)
    ? data.results.filter(person =>
        person.known_for_department === "Acting"
      )
    : [];

  if (!people.length) {
    return null;
  }

  const wanted = name.toLowerCase().trim();

  people.sort((a, b) => {
    const aExact =
      String(a.name || "").toLowerCase().trim() === wanted ? 1 : 0;

    const bExact =
      String(b.name || "").toLowerCase().trim() === wanted ? 1 : 0;

    if (aExact !== bExact) {
      return bExact - aExact;
    }

    return Number(b.popularity || 0) - Number(a.popularity || 0);
  });

  return people[0];
}

async function getPerson(id) {
  if (personCache.has(id)) {
    return personCache.get(id);
  }

  const person = await tmdb(`/person/${id}`);

  personCache.set(id, person);

  return person;
}

async function actorMovies(actorId) {
  if (movieCreditsCache.has(actorId)) {
    return movieCreditsCache.get(actorId);
  }

  const data = await tmdb(`/person/${actorId}/movie_credits`);

  let movies = Array.isArray(data.cast)
    ? data.cast
    : [];

  movies = movies
    .filter(movie => {
      if (!movie.id) return false;

      const count = Number(movie.vote_count || 0);

      return count >= 10;
    })
    .sort((a, b) => {
      const aScore =
        Number(a.vote_count || 0) +
        Number(a.popularity || 0) * 20;

      const bScore =
        Number(b.vote_count || 0) +
        Number(b.popularity || 0) * 20;

      return bScore - aScore;
    })
    .slice(0, 35);

  movieCreditsCache.set(actorId, movies);

  return movies;
}

async function movieCast(movieId) {
  if (castCache.has(movieId)) {
    return castCache.get(movieId);
  }

  const data = await tmdb(`/movie/${movieId}/credits`);

  let cast = Array.isArray(data.cast)
    ? data.cast
    : [];

  cast = cast
    .filter(person => person.id)
    .slice(0, 30);

  castCache.set(movieId, cast);

  return cast;
}

function movieNode(movie) {
  return {
    type: "movie",
    id: movie.id,
    title:
      movie.title ||
      movie.original_title ||
      "Movie",
    year: movie.release_date
      ? movie.release_date.slice(0, 4)
      : "",
    poster_path: movie.poster_path || null
  };
}

function personNode(person) {
  return {
    type: "person",
    id: person.id,
    name: person.name || "Actor",
    profile_path: person.profile_path || null
  };
}

async function directConnection(actorA, actorB) {
  const [moviesA, moviesB] = await Promise.all([
    actorMovies(actorA.id),
    actorMovies(actorB.id)
  ]);

  const moviesBMap = new Map(
    moviesB.map(movie => [movie.id, movie])
  );

  for (const movie of moviesA) {
    if (moviesBMap.has(movie.id)) {
      return {
        movie,
        chain: [
          personNode(actorA),
          movieNode(movie),
          personNode(actorB)
        ]
      };
    }
  }

  return null;
}

async function getNeighbors(actorId, deadline) {
  if (Date.now() > deadline) {
    return [];
  }

  const movies = await actorMovies(actorId);

  const selectedMovies = movies.slice(0, 24);

  const castResults = await Promise.all(
    selectedMovies.map(async movie => {
      if (Date.now() > deadline) {
        return {
          movie,
          cast: []
        };
      }

      try {
        const cast = await movieCast(movie.id);

        return {
          movie,
          cast
        };
      } catch {
        return {
          movie,
          cast: []
        };
      }
    })
  );

  const neighbors = new Map();

  for (const result of castResults) {
    for (const actor of result.cast) {
      if (!actor.id || actor.id === actorId) {
        continue;
      }

      const existing = neighbors.get(actor.id);

      const score =
        Number(actor.popularity || 0) +
        Number(result.movie.vote_count || 0) / 500;

      if (
        !existing ||
        score > existing.score
      ) {
        neighbors.set(actor.id, {
          actor,
          movie: result.movie,
          score
        });
      }
    }
  }

  return Array.from(neighbors.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 160);
}

function buildChain(
  meetingId,
  forwardParents,
  backwardParents,
  startActor,
  targetActor
) {
  const left = [];

  let current = meetingId;

  while (
    current !== startActor.id
  ) {
    const step =
      forwardParents.get(current);

    if (!step) {
      break;
    }

    left.push({
      actor: step.actor,
      movie: step.movie
    });

    current = step.parentId;
  }

  left.reverse();

  const chain = [
    personNode(startActor)
  ];

  for (const step of left) {
    chain.push(movieNode(step.movie));
    chain.push(personNode(step.actor));
  }

  current = meetingId;

  while (
    current !== targetActor.id
  ) {
    const step =
      backwardParents.get(current);

    if (!step) {
      break;
    }

    chain.push(movieNode(step.movie));
    chain.push(personNode(step.actor));

    current = step.parentId;
  }

  return chain;
}

async function bidirectionalSearch(
  startActor,
  targetActor,
  deadline
) {
  let forwardFrontier = new Map([
    [startActor.id, startActor]
  ]);

  let backwardFrontier = new Map([
    [targetActor.id, targetActor]
  ]);

  const forwardVisited =
    new Map([
      [startActor.id, 0]
    ]);

  const backwardVisited =
    new Map([
      [targetActor.id, 0]
    ]);

  const forwardParents =
    new Map();

  const backwardParents =
    new Map();

  let forwardDepth = 0;
  let backwardDepth = 0;

  while (
    forwardFrontier.size &&
    backwardFrontier.size &&
    Date.now() < deadline
  ) {
    if (
      forwardDepth +
      backwardDepth >=
      6
    ) {
      break;
    }

    const expandForward =
      forwardFrontier.size <=
      backwardFrontier.size;

    const frontier =
      expandForward
        ? forwardFrontier
        : backwardFrontier;

    const visited =
      expandForward
        ? forwardVisited
        : backwardVisited;

    const oppositeVisited =
      expandForward
        ? backwardVisited
        : forwardVisited;

    const parents =
      expandForward
        ? forwardParents
        : backwardParents;

    const nextFrontier =
      new Map();

    const actors =
      Array.from(frontier.values());

    for (const actor of actors) {
      if (Date.now() > deadline) {
        break;
      }

      let neighbors = [];

      try {
        neighbors =
          await getNeighbors(
            actor.id,
            deadline
          );
      } catch {
        continue;
      }

      for (const neighbor of neighbors) {
        const neighborId =
          neighbor.actor.id;

        if (visited.has(neighborId)) {
          continue;
        }

        const newDepth =
          (visited.get(actor.id) || 0) + 1;

        if (newDepth > 6) {
          continue;
        }

        visited.set(
          neighborId,
          newDepth
        );

        parents.set(
          neighborId,
          {
            parentId: actor.id,
            actor: neighbor.actor,
            movie: neighbor.movie
          }
        );

        nextFrontier.set(
          neighborId,
          neighbor.actor
        );

        if (
          oppositeVisited.has(
            neighborId
          )
        ) {
          const totalDepth =
            newDepth +
            oppositeVisited.get(
              neighborId
            );

          if (totalDepth <= 6) {
            return buildChain(
              neighborId,
              forwardParents,
              backwardParents,
              startActor,
              targetActor
            );
          }
        }
      }

      if (
        forwardVisited.size +
        backwardVisited.size >
        1100
      ) {
        break;
      }
    }

    if (expandForward) {
      forwardFrontier =
        nextFrontier;

      forwardDepth++;
    } else {
      backwardFrontier =
        nextFrontier;

      backwardDepth++;
    }

    if (
      forwardVisited.size +
      backwardVisited.size >
      1100
    ) {
      break;
    }
  }

  return null;
}

function calculateDegrees(chain) {
  if (
    !Array.isArray(chain) ||
    chain.length < 3
  ) {
    return 0;
  }

  return Math.floor(
    (chain.length - 1) / 2
  );
}

export default async function handler(
  req,
  res
) {
  try {
    const actor1 =
      String(
        req.query.actor1 || ""
      ).trim();

    const actor2 =
      String(
        req.query.actor2 || ""
      ).trim();

    if (!actor1 || !actor2) {
      return res.status(400).json({
        error:
          "Two actor names are required."
      });
    }

    const [
      startActor,
      targetActor
    ] = await Promise.all([
      findActor(actor1),
      findActor(actor2)
    ]);

    if (!startActor) {
      return res.status(404).json({
        error:
          `Reelwise could not find ${actor1}.`
      });
    }

    if (!targetActor) {
      return res.status(404).json({
        error:
          `Reelwise could not find ${actor2}.`
      });
    }

    if (
      startActor.id ===
      targetActor.id
    ) {
      return res.status(200).json({
        found: true,
        degrees: 0,
        actors: [
          personNode(startActor)
        ],
        chain: [
          personNode(startActor)
        ]
      });
    }

    const direct =
      await directConnection(
        startActor,
        targetActor
      );

    if (direct) {
      return res.status(200).json({
        found: true,
        degrees: 1,
        actors: [
          personNode(startActor),
          personNode(targetActor)
        ],
        chain: direct.chain
      });
    }

    /*
      Give the connection engine most of
      the available serverless request time,
      while leaving room to return a response.
    */

    const deadline =
      Date.now() + 8500;

    const chain =
      await bidirectionalSearch(
        startActor,
        targetActor,
        deadline
      );

    if (!chain) {
      return res.status(200).json({
        found: false,
        degrees: null,

        actors: [
          personNode(startActor),
          personNode(targetActor)
        ],

        chain: [],

        message:
          "Reelwise searched the available movie network but could not confirm a connection within six degrees. Try again or choose another pair."
      });
    }

    const degrees =
      calculateDegrees(chain);

    const actorNodes =
      chain.filter(
        item =>
          item.type === "person"
      );

    return res.status(200).json({
      found: true,
      degrees,
      actors: actorNodes,
      chain
    });

  } catch (error) {
    console.error(
      "Six Degrees API error:",
      error
    );

    return res.status(500).json({
      error:
        "Reelwise could not complete the Six Degrees search."
    });
  }
}

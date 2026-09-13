const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

const TMDB = "https://api.themoviedb.org/3";

async function tmdb(path) {
  let url = TMDB + path;

  const options = {
    headers: {
      accept: "application/json"
    }
  };

  if (TOKEN) {
    options.headers.Authorization = `Bearer ${TOKEN}`;
  } else if (API_KEY) {
    url += (url.includes("?") ? "&" : "?") +
      "api_key=" +
      encodeURIComponent(API_KEY);
  } else {
    throw new Error("TMDB credentials are not configured.");
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `TMDB request failed (${response.status}): ${text}`
    );
  }

  return response.json();
}


function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


async function findActor(name) {
  const data = await tmdb(
    "/search/person?query=" +
    encodeURIComponent(name) +
    "&include_adult=false&language=en-US&page=1"
  );

  const people = Array.isArray(data.results)
    ? data.results.filter(person =>
        person.known_for_department === "Acting"
      )
    : [];

  if (!people.length) {
    return null;
  }

  const wanted = normalizeName(name);

  const exact = people
    .filter(person =>
      normalizeName(person.name) === wanted
    )
    .sort(
      (a, b) =>
        Number(b.popularity || 0) -
        Number(a.popularity || 0)
    );

  return exact[0] || people[0];
}


const creditCache = new Map();
const castCache = new Map();


async function actorMovies(actorId) {
  if (creditCache.has(actorId)) {
    return creditCache.get(actorId);
  }

  const data = await tmdb(
    `/person/${actorId}/movie_credits?language=en-US`
  );

  let movies = Array.isArray(data.cast)
    ? data.cast
    : [];

  /*
    Vote count works better than current popularity
    for older well-known films.
  */
  movies = movies
    .filter(movie =>
      movie.id &&
      movie.title &&
      Number(movie.vote_count || 0) > 25
    )
    .sort(
      (a, b) =>
        Number(b.vote_count || 0) -
        Number(a.vote_count || 0)
    )
    .slice(0, 20);

  creditCache.set(actorId, movies);

  return movies;
}


async function movieCast(movieId) {
  if (castCache.has(movieId)) {
    return castCache.get(movieId);
  }

  const data = await tmdb(
    `/movie/${movieId}/credits?language=en-US`
  );

  const cast = Array.isArray(data.cast)
    ? data.cast
        .filter(person =>
          person.id &&
          person.name &&
          person.known_for_department === "Acting"
        )
        .slice(0, 22)
    : [];

  castCache.set(movieId, cast);

  return cast;
}


async function directConnection(actorA, actorB) {
  const [moviesA, moviesB] = await Promise.all([
    actorMovies(actorA.id),
    actorMovies(actorB.id)
  ]);

  const bMovieIds = new Set(
    moviesB.map(movie => movie.id)
  );

  for (const movie of moviesA) {
    if (bMovieIds.has(movie.id)) {
      return {
        degrees: 1,
        chain: [
          {
            type: "person",
            id: actorA.id,
            name: actorA.name,
            profile_path: actorA.profile_path || null
          },
          {
            type: "movie",
            id: movie.id,
            title: movie.title,
            poster_path: movie.poster_path || null,
            year: movie.release_date
              ? movie.release_date.slice(0, 4)
              : ""
          },
          {
            type: "person",
            id: actorB.id,
            name: actorB.name,
            profile_path: actorB.profile_path || null
          }
        ]
      };
    }
  }

  return null;
}


async function getNeighbors(actor) {
  const movies = await actorMovies(actor.id);

  const selectedMovies = movies.slice(0, 16);

  const castLists = await Promise.all(
    selectedMovies.map(async movie => {
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

  for (const item of castLists) {
    for (const person of item.cast) {
      if (person.id === actor.id) {
        continue;
      }

      if (!neighbors.has(person.id)) {
        neighbors.set(person.id, {
          actor: {
            id: person.id,
            name: person.name,
            profile_path: person.profile_path || null,
            popularity: Number(person.popularity || 0)
          },
          movie: {
            id: item.movie.id,
            title: item.movie.title,
            poster_path: item.movie.poster_path || null,
            year: item.movie.release_date
              ? item.movie.release_date.slice(0, 4)
              : ""
          }
        });
      }
    }
  }

  return Array.from(neighbors.values())
    .sort(
      (a, b) =>
        b.actor.popularity -
        a.actor.popularity
    )
    .slice(0, 80);
}


function buildChain(
  startActor,
  endActor,
  parents,
  meetingId
) {
  const pieces = [];

  let currentId = meetingId;

  while (currentId !== startActor.id) {
    const step = parents.get(currentId);

    if (!step) {
      return null;
    }

    pieces.unshift({
      type: "person",
      id: step.actor.id,
      name: step.actor.name,
      profile_path:
        step.actor.profile_path || null
    });

    pieces.unshift({
      type: "movie",
      id: step.movie.id,
      title: step.movie.title,
      poster_path:
        step.movie.poster_path || null,
      year: step.movie.year || ""
    });

    currentId = step.parentId;
  }

  pieces.unshift({
    type: "person",
    id: startActor.id,
    name: startActor.name,
    profile_path:
      startActor.profile_path || null
  });

  if (
    pieces[pieces.length - 1].id !==
    endActor.id
  ) {
    pieces.push({
      type: "person",
      id: endActor.id,
      name: endActor.name,
      profile_path:
        endActor.profile_path || null
    });
  }

  return pieces;
}


async function breadthFirstSearch(
  startActor,
  targetActor,
  deadline
) {
  const queue = [
    {
      actor: startActor,
      depth: 0
    }
  ];

  const visited = new Set([
    startActor.id
  ]);

  const parents = new Map();

  while (queue.length) {
    if (Date.now() > deadline) {
      break;
    }

    const current = queue.shift();

    if (current.depth >= 6) {
      continue;
    }

    let neighbors;

    try {
      neighbors = await getNeighbors(
        current.actor
      );
    } catch {
      continue;
    }

    for (const connection of neighbors) {
      const nextActor =
        connection.actor;

      if (visited.has(nextActor.id)) {
        continue;
      }

      visited.add(nextActor.id);

      parents.set(
        nextActor.id,
        {
          parentId: current.actor.id,
          actor: nextActor,
          movie: connection.movie
        }
      );

      if (
        nextActor.id ===
        targetActor.id
      ) {
        return {
          parents,
          meetingId: nextActor.id,
          depth: current.depth + 1
        };
      }

      /*
        Keep later levels focused on recognizable
        performers so the serverless search does
        not explode into thousands of requests.
      */
      if (
        current.depth < 2 ||
        nextActor.popularity > 2
      ) {
        queue.push({
          actor: nextActor,
          depth: current.depth + 1
        });
      }
    }

    /*
      Safety valve for Vercel/serverless execution.
    */
    if (visited.size > 450) {
      break;
    }
  }

  return null;
}


export default async function handler(
  req,
  res
) {
  try {
    const actorOne =
      String(
        req.query.actor1 || ""
      ).trim();

    const actorTwo =
      String(
        req.query.actor2 || ""
      ).trim();

    if (!actorOne || !actorTwo) {
      return res.status(400).json({
        error:
          "Please enter two actor names."
      });
    }

    const [first, second] =
      await Promise.all([
        findActor(actorOne),
        findActor(actorTwo)
      ]);

    if (!first) {
      return res.status(404).json({
        error:
          `Could not find ${actorOne}.`
      });
    }

    if (!second) {
      return res.status(404).json({
        error:
          `Could not find ${actorTwo}.`
      });
    }

    if (first.id === second.id) {
      return res.status(200).json({
        found: true,
        degrees: 0,
        actors: {
          first,
          second
        },
        chain: [
          {
            type: "person",
            id: first.id,
            name: first.name,
            profile_path:
              first.profile_path || null
          }
        ]
      });
    }

    /*
      Check the easiest and fastest case first:
      both actors appeared in the same movie.
    */
    const direct =
      await directConnection(
        first,
        second
      );

    if (direct) {
      return res.status(200).json({
        found: true,
        actors: {
          first,
          second
        },
        ...direct
      });
    }

    /*
      Allow roughly eight seconds of graph searching.
    */
    const deadline =
      Date.now() + 8000;

    const result =
      await breadthFirstSearch(
        first,
        second,
        deadline
      );

    if (!result) {
      return res.status(200).json({
        found: false,
        actors: {
          first,
          second
        },
        message:
          "Reelwise could not find a connection within six degrees in the current search window. Try another pair."
      });
    }

    const chain =
      buildChain(
        first,
        second,
        result.parents,
        result.meetingId
      );

    if (!chain) {
      throw new Error(
        "The connection could not be assembled."
      );
    }

    const degrees =
      chain.filter(
        item =>
          item.type === "movie"
      ).length;

    return res.status(200).json({
      found: true,
      degrees,
      actors: {
        first,
        second
      },
      chain
    });

  } catch (error) {
    console.error(
      "Six Degrees error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Six Degrees search failed."
    });
  }
}

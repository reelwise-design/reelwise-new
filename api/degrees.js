const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

/*
  ============================================================
  REELWISE SIX DEGREES — MOVIES ONLY
  ============================================================

  Goal:
  Actor → recognizable feature movie → actor.

  Excludes / strongly rejects:
  - TV (this endpoint already uses movie_credits only)
  - documentaries and actor-biography films
  - self / archive-footage / uncredited-self appearances
  - shorts, specials, concert films and similar non-feature material
  - extremely obscure credits that create technically valid but poor paths

  Search architecture remains the working bidirectional search.
  ============================================================
*/

const movieCreditsCache = new Map();
const castCache = new Map();
const movieDetailsCache = new Map();

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

function text(value) {
  return String(value || "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function isSelfLikeCharacter(character) {
  const value = lower(character);

  if (!value) return false;

  return (
    value === "self" ||
    value === "himself" ||
    value === "herself" ||
    value.includes("self (archive") ||
    value.includes("himself (archive") ||
    value.includes("herself (archive") ||
    value.includes("archive footage") ||
    value.includes("archive sound") ||
    value.includes("uncredited self") ||
    value.includes("as self")
  );
}

function looksNonNarrativeFromTitle(movie) {
  const title = lower(
    movie?.title ||
    movie?.original_title
  );

  if (!title) return false;

  /*
    Conservative title-level safety net.
    Genre/runtime checks below do most of the work.
  */
  return (
    /\b(documentary|making of|behind the scenes|behind-the-scenes)\b/.test(title) ||
    /\b(a tribute to|tribute to)\b/.test(title) ||
    /\b(live in concert|in concert|concert film)\b/.test(title)
  );
}

function basicCreditEligible(movie) {
  if (!movie?.id) return false;

  if (isSelfLikeCharacter(movie.character)) {
    return false;
  }

  if (looksNonNarrativeFromTitle(movie)) {
    return false;
  }

  /*
    A connection with almost no audience footprint is exactly what caused
    obscure Six Degrees answers. Keep the initial threshold high enough to
    remove noise while still allowing older / less-commercial legitimate films.
  */
  const votes = Number(movie.vote_count || 0);
  const popularity = Number(movie.popularity || 0);

  return votes >= 75 || (votes >= 40 && popularity >= 8);
}

function movieQualityScore(movie) {
  const votes = Number(movie?.vote_count || 0);
  const popularity = Number(movie?.popularity || 0);
  const rating = Number(movie?.vote_average || 0);
  const order = Number(movie?.order);

  let score =
    Math.log10(Math.max(10, votes)) * 42 +
    Math.min(80, popularity) * 1.2 +
    Math.max(0, rating - 5) * 6;

  /*
    Prefer meaningful billed performances. Do not require top billing because
    ensemble casts are essential to Six Degrees.
  */
  if (Number.isFinite(order)) {
    if (order <= 2) score += 18;
    else if (order <= 5) score += 12;
    else if (order <= 10) score += 6;
    else if (order >= 25) score -= 8;
  }

  return score;
}

async function movieDetails(movieId) {
  if (movieDetailsCache.has(movieId)) {
    return movieDetailsCache.get(movieId);
  }

  const data = await tmdb(`/movie/${movieId}`);
  movieDetailsCache.set(movieId, data);
  return data;
}

async function isNarrativeFeature(movie) {
  if (!basicCreditEligible(movie)) {
    return false;
  }

  let details;

  try {
    details = await movieDetails(movie.id);
  } catch {
    /*
      If TMDB details temporarily fail, keep only credits with a substantial
      audience footprint instead of letting an obscure unknown through.
    */
    return Number(movie.vote_count || 0) >= 500;
  }

  const genres = Array.isArray(details?.genres)
    ? details.genres.map(g => lower(g?.name))
    : [];

  if (genres.includes("documentary")) {
    return false;
  }

  const runtime = Number(details?.runtime || 0);

  /*
    Reject shorts/special-length material when runtime is known.
    Older legitimate features occasionally run under 70 minutes, so 55 is a
    deliberately conservative floor.
  */
  if (runtime > 0 && runtime < 55) {
    return false;
  }

  const status = lower(details?.status);

  if (status && status !== "released") {
    return false;
  }

  return true;
}

async function findActor(name) {
  const data = await tmdb(
    `/search/person?query=${encodeURIComponent(name)}&include_adult=false`
  );

  const people = Array.isArray(data.results)
    ? data.results.filter(
        person => person.known_for_department === "Acting"
      )
    : [];

  if (!people.length) {
    return null;
  }

  const wanted = name.toLowerCase().trim();

  people.sort((a, b) => {
    const aExact =
      String(a.name || "").toLowerCase().trim() === wanted
        ? 1
        : 0;

    const bExact =
      String(b.name || "").toLowerCase().trim() === wanted
        ? 1
        : 0;

    if (aExact !== bExact) {
      return bExact - aExact;
    }

    return (
      Number(b.popularity || 0) -
      Number(a.popularity || 0)
    );
  });

  return people[0];
}

async function actorMovies(actorId) {
  if (movieCreditsCache.has(actorId)) {
    return movieCreditsCache.get(actorId);
  }

  const data = await tmdb(
    `/person/${actorId}/movie_credits`
  );

  const rawMovies = Array.isArray(data.cast)
    ? data.cast.filter(basicCreditEligible)
    : [];

  /*
    First rank cheaply using credit data. Then inspect only the strongest
    candidates with /movie/{id}, keeping API work reasonable for Vercel.
  */
  const preselected = rawMovies
    .sort((a, b) =>
      movieQualityScore(b) - movieQualityScore(a)
    )
    .slice(0, 45);

  const checks = await Promise.all(
    preselected.map(async movie => {
      const eligible = await isNarrativeFeature(movie);
      return eligible ? movie : null;
    })
  );

  const movies = checks
    .filter(Boolean)
    .sort((a, b) =>
      movieQualityScore(b) - movieQualityScore(a)
    )
    .slice(0, 32);

  movieCreditsCache.set(actorId, movies);

  return movies;
}

async function movieCast(movieId) {
  if (castCache.has(movieId)) {
    return castCache.get(movieId);
  }

  const data = await tmdb(
    `/movie/${movieId}/credits`
  );

  let cast = Array.isArray(data.cast)
    ? data.cast
    : [];

  cast = cast
    .filter(person => {
      if (!person?.id) return false;
      if (isSelfLikeCharacter(person.character)) return false;

      const order = Number(person.order);

      /*
        Keep meaningful cast while allowing large ensemble films.
        A named/real character can survive somewhat deeper in the billing.
      */
      if (Number.isFinite(order) && order >= 35) {
        return false;
      }

      return true;
    })
    .slice(0, 32);

  castCache.set(movieId, cast);

  return cast;
}

function personNode(person) {
  return {
    type: "person",
    id: person.id,
    name: person.name || "Actor",
    profile_path: person.profile_path || null
  };
}

function movieNode(movie) {
  return {
    type: "movie",
    id: movie.id,
    title:
      movie.title ||
      movie.original_title ||
      "Movie",

    year:
      movie.release_date
        ? movie.release_date.slice(0, 4)
        : "",

    poster_path: movie.poster_path || null
  };
}

async function directConnection(actorA, actorB) {
  const [moviesA, moviesB] =
    await Promise.all([
      actorMovies(actorA.id),
      actorMovies(actorB.id)
    ]);

  const moviesBMap = new Map(
    moviesB.map(movie => [
      movie.id,
      movie
    ])
  );

  /*
    Shared films are already ranked by movie quality, so the direct connection
    prefers a recognizable feature rather than an obscure technical match.
  */
  for (const movie of moviesA) {
    if (moviesBMap.has(movie.id)) {
      return [
        personNode(actorA),
        movieNode(movie),
        personNode(actorB)
      ];
    }
  }

  return null;
}

async function getNeighbors(
  actorId,
  deadline
) {
  if (Date.now() > deadline) {
    return [];
  }

  const movies =
    await actorMovies(actorId);

  const selectedMovies =
    movies.slice(0, 22);

  const castResults =
    await Promise.all(
      selectedMovies.map(
        async movie => {
          if (Date.now() > deadline) {
            return {
              movie,
              cast: []
            };
          }

          try {
            const cast =
              await movieCast(
                movie.id
              );

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
        }
      )
    );

  const neighbors =
    new Map();

  for (const result of castResults) {
    for (const actor of result.cast) {
      if (
        !actor.id ||
        actor.id === actorId
      ) {
        continue;
      }

      const existing =
        neighbors.get(actor.id);

      /*
        Prefer a recognizable movie connection first, then a recognizable actor.
        This is intentionally movie-led: Six Degrees should not choose an
        obscure film merely because one cast member has high popularity.
      */
      const score =
        movieQualityScore(result.movie) +
        Math.min(
          45,
          Number(actor.popularity || 0)
        );

      if (
        !existing ||
        score > existing.score
      ) {
        neighbors.set(
          actor.id,
          {
            actor,
            movie: result.movie,
            score
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
        b.score - a.score
    )
    .slice(0, 140);
}

function buildChain(
  meetingId,
  forwardParents,
  backwardParents,
  forwardActors,
  backwardActors,
  startActor,
  targetActor
) {
  const leftSteps = [];

  let current =
    meetingId;

  while (
    current !== startActor.id
  ) {
    const step =
      forwardParents.get(current);

    if (!step) {
      return null;
    }

    const actor =
      forwardActors.get(current);

    if (!actor) {
      return null;
    }

    leftSteps.push({
      actor,
      movie: step.movie
    });

    current =
      step.parentId;
  }

  leftSteps.reverse();

  const chain = [
    personNode(startActor)
  ];

  for (const step of leftSteps) {
    chain.push(
      movieNode(step.movie)
    );

    chain.push(
      personNode(step.actor)
    );
  }

  current =
    meetingId;

  while (
    current !== targetActor.id
  ) {
    const step =
      backwardParents.get(current);

    if (!step) {
      return null;
    }

    const nextActor =
      backwardActors.get(
        step.parentId
      );

    if (!nextActor) {
      return null;
    }

    chain.push(
      movieNode(step.movie)
    );

    chain.push(
      personNode(nextActor)
    );

    current =
      step.parentId;
  }

  return chain;
}

async function bidirectionalSearch(
  startActor,
  targetActor,
  deadline
) {
  let forwardFrontier =
    new Map([
      [
        startActor.id,
        startActor
      ]
    ]);

  let backwardFrontier =
    new Map([
      [
        targetActor.id,
        targetActor
      ]
    ]);

  const forwardVisited =
    new Map([
      [
        startActor.id,
        0
      ]
    ]);

  const backwardVisited =
    new Map([
      [
        targetActor.id,
        0
      ]
    ]);

  const forwardActors =
    new Map([
      [
        startActor.id,
        startActor
      ]
    ]);

  const backwardActors =
    new Map([
      [
        targetActor.id,
        targetActor
      ]
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

    const actorMap =
      expandForward
        ? forwardActors
        : backwardActors;

    const nextFrontier =
      new Map();

    const actors =
      Array.from(
        frontier.values()
      );

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

        if (
          visited.has(neighborId)
        ) {
          continue;
        }

        const currentDepth =
          visited.get(actor.id) || 0;

        const newDepth =
          currentDepth + 1;

        if (newDepth > 6) {
          continue;
        }

        visited.set(
          neighborId,
          newDepth
        );

        actorMap.set(
          neighborId,
          neighbor.actor
        );

        parents.set(
          neighborId,
          {
            parentId: actor.id,
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

          if (
            totalDepth <= 6
          ) {
            if (
              expandForward &&
              !backwardActors.has(
                neighborId
              )
            ) {
              backwardActors.set(
                neighborId,
                neighbor.actor
              );
            }

            if (
              !expandForward &&
              !forwardActors.has(
                neighborId
              )
            ) {
              forwardActors.set(
                neighborId,
                neighbor.actor
              );
            }

            return buildChain(
              neighborId,
              forwardParents,
              backwardParents,
              forwardActors,
              backwardActors,
              startActor,
              targetActor
            );
          }
        }
      }

      if (
        forwardVisited.size +
          backwardVisited.size >
        1000
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
      1000
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

    if (
      !actor1 ||
      !actor2
    ) {
      return res
        .status(400)
        .json({
          error:
            "Two actor names are required."
        });
    }

    const [
      startActor,
      targetActor
    ] =
      await Promise.all([
        findActor(actor1),
        findActor(actor2)
      ]);

    if (!startActor) {
      return res
        .status(404)
        .json({
          error:
            `Reelwise could not find ${actor1}.`
        });
    }

    if (!targetActor) {
      return res
        .status(404)
        .json({
          error:
            `Reelwise could not find ${actor2}.`
        });
    }

    if (
      startActor.id ===
      targetActor.id
    ) {
      return res
        .status(200)
        .json({
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
      return res
        .status(200)
        .json({
          found: true,
          degrees: 1,
          actors: [
            personNode(startActor),
            personNode(targetActor)
          ],
          chain: direct
        });
    }

    /*
      Movie-detail validation adds API work, so allow a little more search time
      than the previous version while preserving response headroom for Vercel.
    */
    const deadline =
      Date.now() + 9500;

    const chain =
      await bidirectionalSearch(
        startActor,
        targetActor,
        deadline
      );

    if (!chain) {
      return res
        .status(200)
        .json({
          found: false,
          degrees: null,

          actors: [
            personNode(startActor),
            personNode(targetActor)
          ],

          chain: [],

          message:
            "Reelwise searched the feature-film network but could not confirm a movie-only connection within six degrees. Try again or choose another pair."
        });
    }

    const degrees =
      calculateDegrees(chain);

    const actorNodes =
      chain.filter(
        item =>
          item.type === "person"
      );

    return res
      .status(200)
      .json({
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

    return res
      .status(500)
      .json({
        error:
          "Reelwise could not complete the Six Degrees search."
      });
  }
}

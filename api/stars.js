const token = process.env.TMDB_READ_ACCESS_TOKEN;

async function tmdb(path) {
  if (!token) {
    throw new Error("TMDB token is not configured");
  }

  const response = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.status_message || "Star lookup failed");
  }

  return data;
}

function cleanStars(people) {
  const seen = new Set();

  return (people || [])
    .filter(person =>
      person &&
      person.id &&
      person.name &&
      person.profile_path &&
      (!person.known_for_department || person.known_for_department === "Acting")
    )
    .filter(person => {
      if (seen.has(person.id)) return false;
      seen.add(person.id);
      return true;
    })
    .map(person => ({
      id: person.id,
      name: person.name,
      profile_path: person.profile_path,
      popularity: Number(person.popularity || 0),
      known_for: Array.isArray(person.known_for) ? person.known_for : []
    }));
}

function movieCredits(person) {
  return Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];
}

function isReleasedMovie(movie) {
  if (!movie || movie.adult) return false;
  if (!movie.release_date) return true;

  const release = new Date(`${movie.release_date}T00:00:00Z`);
  return Number.isNaN(release.getTime()) || release <= new Date();
}

function meaningfulCredit(movie) {
  if (!isReleasedMovie(movie)) return false;

  const order = Number.isFinite(Number(movie.order))
    ? Number(movie.order)
    : 99;

  const votes = Number(movie.vote_count || 0);
  const popularity = Number(movie.popularity || 0);

  return (
    order <= 5 &&
    (
      votes >= 500 ||
      popularity >= 10
    )
  );
}

function creditWeight(movie) {
  const order = Number.isFinite(Number(movie.order))
    ? Number(movie.order)
    : 99;

  const votes = Number(movie.vote_count || 0);
  const rating = Number(movie.vote_average || 0);
  const popularity = Number(movie.popularity || 0);

  const billing =
    order === 0 ? 6 :
    order === 1 ? 5 :
    order === 2 ? 4 :
    order <= 4 ? 2.5 :
    order <= 6 ? 1 :
    0;

  const audience = Math.min(Math.log10(Math.max(votes, 1)), 5) * 1.5;
  const quality = Math.max(rating - 5, 0) * 0.65;
  const currentInterest = Math.min(popularity, 50) * 0.025;

  return billing + audience + quality + currentInterest;
}

function careerStats(person, genreId = null) {
  const credits = movieCredits(person).filter(meaningfulCredit);

  const qualifying = genreId
    ? credits.filter(movie =>
        Array.isArray(movie.genre_ids) &&
        movie.genre_ids.includes(genreId)
      )
    : credits;

  const totalWeight = credits.reduce(
    (sum, movie) => sum + creditWeight(movie),
    0
  );

  const genreWeight = qualifying.reduce(
    (sum, movie) => sum + creditWeight(movie),
    0
  );

  const majorCredits = credits.filter(movie => {
    const order = Number.isFinite(Number(movie.order))
      ? Number(movie.order)
      : 99;

    return (
      order <= 3 &&
      (
        Number(movie.vote_count || 0) >= 1200 ||
        Number(movie.popularity || 0) >= 18
      )
    );
  });

  const majorGenreCredits = genreId
    ? majorCredits.filter(movie =>
        Array.isArray(movie.genre_ids) &&
        movie.genre_ids.includes(genreId)
      )
    : majorCredits;

  return {
    credits,
    qualifying,
    majorCredits,
    majorGenreCredits,
    totalWeight,
    genreWeight,
    genreShare: totalWeight > 0
      ? genreWeight / totalWeight
      : 0
  };
}

function establishedActorScore(person) {
  const stats = careerStats(person);

  const majorAudience = stats.majorCredits.reduce(
    (sum, movie) =>
      sum + Math.log10(Math.max(Number(movie.vote_count || 0), 1)),
    0
  );

  const leadCredits = stats.credits.filter(movie =>
    Number(movie.order ?? 99) <= 2
  ).length;

  return (
    stats.majorCredits.length * 14 +
    leadCredits * 4 +
    majorAudience * 2.5 +
    Math.min(Number(person.popularity || 0), 100) * 0.12
  );
}

function genreStarScore(person, genreId) {
  const stats = careerStats(person, genreId);

  const leadGenreCredits = stats.qualifying.filter(movie =>
    Number(movie.order ?? 99) <= 2
  ).length;

  const majorAudience = stats.majorGenreCredits.reduce(
    (sum, movie) =>
      sum + Math.log10(Math.max(Number(movie.vote_count || 0), 1)),
    0
  );

  return (
    stats.majorGenreCredits.length * 18 +
    leadGenreCredits * 6 +
    stats.genreShare * 35 +
    majorAudience * 2
  );
}

function qualifiesAsEstablishedMovieStar(person) {
  const stats = careerStats(person);

  const leadCredits = stats.credits.filter(movie =>
    Number(movie.order ?? 99) <= 2
  ).length;

  return (
    stats.majorCredits.length >= 2 &&
    leadCredits >= 1
  );
}

function qualifiesForGenre(person, genreId) {
  const stats = careerStats(person, genreId);

  const leadGenreCredits = stats.qualifying.filter(movie =>
    Number(movie.order ?? 99) <= 2
  ).length;

  /*
    Genre membership should represent a meaningful part of the
    performer's film career — not one incidental credit.

    Two paths qualify:
      1. At least 3 substantial genre movies, including 2 major ones.
      2. At least 2 substantial genre movies, both major, with the
         genre representing a strong share of the person's film work.
  */
  const sustainedGenreCareer =
    stats.qualifying.length >= 3 &&
    stats.majorGenreCredits.length >= 2 &&
    leadGenreCredits >= 1 &&
    stats.genreShare >= 0.24;

  const concentratedGenreCareer =
    stats.qualifying.length >= 2 &&
    stats.majorGenreCredits.length >= 2 &&
    leadGenreCredits >= 1 &&
    stats.genreShare >= 0.38;

  return sustainedGenreCareer || concentratedGenreCareer;
}

function qualifiesForTrendingMovieStar(person) {
  /*
    TMDB decides who is trending. Reelwise decides whether that person
    belongs on a MOVIE-stars page.

    This gate intentionally avoids a single hard vote threshold.
    Instead it combines:
      - acting as the person's known department
      - non-adult person/movie records
      - repeated released movie work
      - meaningful billing position
      - broad audience recognition across the filmography

    No individual performer is hard-coded.
  */
  if (!person || person.adult === true) return false;

  const department = String(
    person.known_for_department || ""
  ).toLowerCase();

  if (department && department !== "acting") {
    return false;
  }

  const credits = movieCredits(person).filter(movie =>
    isReleasedMovie(movie) &&
    !movie.adult
  );

  if (!credits.length) return false;

  const credited = credits.filter(movie => {
    const order = Number.isFinite(Number(movie.order))
      ? Number(movie.order)
      : 99;

    return order <= 12;
  });

  const prominent = credits.filter(movie => {
    const order = Number.isFinite(Number(movie.order))
      ? Number(movie.order)
      : 99;

    return order <= 6;
  });

  const leading = credits.filter(movie => {
    const order = Number.isFinite(Number(movie.order))
      ? Number(movie.order)
      : 99;

    return order <= 3;
  });

  const recognized = prominent.filter(movie => {
    const votes = Number(movie.vote_count || 0);
    const popularity = Number(movie.popularity || 0);

    return votes >= 400 || popularity >= 12;
  });

  const widelyRecognized = prominent.filter(movie =>
    Number(movie.vote_count || 0) >= 1200
  );

  const totalAudienceVotes = prominent.reduce(
    (sum, movie) => sum + Number(movie.vote_count || 0),
    0
  );

  /*
    Established movie performer:
    repeated prominent movie roles plus audience recognition.
  */
  const establishedMovieCareer =
    credited.length >= 4 &&
    prominent.length >= 2 &&
    recognized.length >= 2 &&
    leading.length >= 1 &&
    totalAudienceVotes >= 1500;

  /*
    Current/rising movie performer:
    allows a newer actor through when the movie resume is shorter,
    provided at least one movie has substantial general-audience reach.
  */
  const risingMovieCareer =
    credited.length >= 2 &&
    prominent.length >= 1 &&
    leading.length >= 1 &&
    widelyRecognized.length >= 1;

  return establishedMovieCareer || risingMovieCareer;
}

async function getTrendingMovies() {
  /*
    Reelwise Trending Stars is driven by MOVIES that are trending,
    not by TMDB's general trending-people feed.
  */
  const data = await tmdb(
    "/trending/movie/week?language=en-US"
  );

  return (Array.isArray(data.results) ? data.results : [])
    .filter(movie => movie && !movie.adult)
    .slice(0, 20);
}

async function getTrendingMovieStars() {
  const movies = await getTrendingMovies();

  /*
    Pull credits for each trending movie. TMDB movie credits include
    cast billing order, which is the cleanest signal for principal cast.
  */
  const creditSets = await Promise.all(
    movies.map(async (movie, movieRank) => {
      try {
        const credits = await tmdb(
          `/movie/${movie.id}/credits?language=en-US`
        );

        return {
          movie,
          movieRank,
          cast: Array.isArray(credits.cast)
            ? credits.cast
            : []
        };
      } catch {
        return {
          movie,
          movieRank,
          cast: []
        };
      }
    })
  );

  const people = new Map();

  for (const { movie, movieRank, cast } of creditSets) {
    /*
      Principal cast only. This prevents giant ensemble/background
      casts from flooding the Trending Stars row.
    */
    const principal = cast
      .filter(person =>
        person &&
        person.adult !== true &&
        String(person.known_for_department || "Acting").toLowerCase() === "acting" &&
        Number(person.order ?? 99) <= 5
      )
      .slice(0, 6);

    for (const person of principal) {
      const order = Number(person.order ?? 99);

      /*
        Score combines:
          - how highly the MOVIE is trending
          - how prominently the actor is billed
          - repeat appearances across multiple trending movies

        No actor names are hard-coded.
      */
      const movieTrendPoints = Math.max(1, 20 - movieRank);
      const billingPoints = Math.max(1, 7 - order);
      const score = movieTrendPoints * 10 + billingPoints * 4;

      const existing = people.get(person.id);

      if (!existing) {
        people.set(person.id, {
          ...person,
          trendingScore: score,
          trendingMovieCount: 1,
          bestMovieRank: movieRank
        });
      } else {
        existing.trendingScore += score + 35;
        existing.trendingMovieCount += 1;
        existing.bestMovieRank = Math.min(
          existing.bestMovieRank,
          movieRank
        );
      }
    }
  }

  return [...people.values()]
    .sort((a, b) => {
      if (b.trendingMovieCount !== a.trendingMovieCount) {
        return b.trendingMovieCount - a.trendingMovieCount;
      }

      if (b.trendingScore !== a.trendingScore) {
        return b.trendingScore - a.trendingScore;
      }

      return a.bestMovieRank - b.bestMovieRank;
    })
    .slice(0, 20);
}
async function getPopularPeople() {
  /*
    General discovery pool for Reelwise's career-based categories.
    This is intentionally separate from Trending Stars, which is now
    driven by TMDB's weekly trending MOVIES.
  */
  const pages = await Promise.all(
    [1, 2, 3, 4, 5].map(page =>
      tmdb(
        `/person/popular?language=en-US&page=${page}`
      )
    )
  );

  return cleanStars(
    pages.flatMap(data =>
      Array.isArray(data.results)
        ? data.results
        : []
    )
  );
}

async function getDiscoveryPool() {
  const popular = await getPopularPeople();

  /*
    Limit detail calls while still sampling a much broader field
    than the old first-20 approach.
  */
  return enrichPeople(popular.slice(0, 60));
}

async function getPeopleByIds(ids) {
  const people = await Promise.all(
    ids.map(async id => {
      try {
        return await tmdb(
          `/person/${id}?language=en-US&append_to_response=movie_credits`
        );
      } catch {
        return null;
      }
    })
  );

  return cleanStars(people);
}

function publicStar(person) {
  return {
    id: person.id,
    name: person.name,
    profile_path: person.profile_path,
    popularity: Number(person.popularity || 0),
    known_for: Array.isArray(person.known_for) ? person.known_for : []
  };
}

export default async function handler(req, res) {
  try {
    const category = String(req.query?.category || "popular").toLowerCase();

    /*
      TRENDING STARS

      The existing frontend still requests category=popular, so this
      keeps that route compatible while changing its source to TMDB's
      true weekly trending-person feed.

      TMDB supplies the trend order. Reelwise only filters the list
      to established movie actors; it does not re-rank the surviving
      people by lifetime career score.
    */
    if (category === "popular" || category === "trending") {
      const stars = (await getTrendingMovieStars())
        .map(publicStar);

      return res.status(200).json(stars);
    }

    /*
      HOLLYWOOD LEGENDS

      Editorial historical category. TMDB supplies current names,
      photos and profile data.
    */
    if (category === "legends") {
      const legendIds = [
        31,
        192,
        3084,
        380,
        3896,
        2231,
        287,
        500,
        6193,
        1892,
        1158,
        73421,
        16483,
        3801,
        4173,
        976,
        1245,
        3061
      ];

      const people = await getPeopleByIds(legendIds);
      return res.status(200).json(people.map(publicStar));
    }

    /*
      80s & 90s STARS

      Editorial historical category.
    */
    if (category === "retro") {
      const retroIds = [
        16483,
        500,
        31,
        287,
        192,
        976,
        1100,
        380,
        6193,
        1158,
        2888,
        4173,
        3061,
        3896,
        2231,
        1892,
        1245,
        73421
      ];

      const people = await getPeopleByIds(retroIds);
      return res.status(200).json(people.map(publicStar));
    }

    /*
      ACTION STARS

      TMDB action genre = 28.
      Requires repeated, meaningful action-film work.
    */
    if (category === "action") {
      const [people, trending] = await Promise.all([
        getDiscoveryPool(),
        getTrendingMovieStars()
      ]);

      const trendingIds = new Set(trending.map(person => person.id));

      const stars = people
        .filter(person =>
          !trendingIds.has(person.id) &&
          qualifiesForGenre(person, 28)
        )
        .sort((a, b) =>
          genreStarScore(b, 28) - genreStarScore(a, 28)
        )
        .slice(0, 20)
        .map(publicStar);

      return res.status(200).json(stars);
    }

    /*
      COMEDY STARS

      TMDB comedy genre = 35.
      Requires repeated, meaningful comedy-film work.
    */
    if (category === "comedy") {
      const [people, trending] = await Promise.all([
        getDiscoveryPool(),
        getTrendingMovieStars()
      ]);

      const trendingIds = new Set(trending.map(person => person.id));

      const actionIds = new Set(
        people
          .filter(person =>
            !trendingIds.has(person.id) &&
            qualifiesForGenre(person, 28)
          )
          .sort((a, b) =>
            genreStarScore(b, 28) - genreStarScore(a, 28)
          )
          .slice(0, 20)
          .map(person => person.id)
      );

      const stars = people
        .filter(person =>
          !trendingIds.has(person.id) &&
          !actionIds.has(person.id) &&
          qualifiesForGenre(person, 35)
        )
        .sort((a, b) =>
          genreStarScore(b, 35) - genreStarScore(a, 35)
        )
        .slice(0, 20)
        .map(publicStar);

      return res.status(200).json(stars);
    }

    const people = await getDiscoveryPool();

    const stars = people
      .filter(qualifiesAsEstablishedMovieStar)
      .sort((a, b) =>
        establishedActorScore(b) - establishedActorScore(a)
      )
      .slice(0, 20)
      .map(publicStar);

    return res.status(200).json(stars);

  } catch (error) {
    console.error("Reelwise stars API error:", error);

    return res.status(500).json({
      error: error.message || "Star lookup failed"
    });
  }
}

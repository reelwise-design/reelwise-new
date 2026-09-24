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

async function getPopularPeople() {
  /*
    TMDB's /person/popular feed measures current attention, not
    "most famous movie stars." Use it only as a discovery pool,
    then evaluate actual movie careers below.
  */
  const pages = await Promise.all(
    [1, 2, 3, 4, 5].map(page =>
      tmdb(`/person/popular?language=en-US&page=${page}`)
    )
  );

  return cleanStars(
    pages.flatMap(page =>
      Array.isArray(page.results) ? page.results : []
    )
  );
}

async function enrichPeople(people) {
  const enriched = await Promise.all(
    (people || []).map(async person => {
      try {
        const detail = await tmdb(
          `/person/${person.id}?language=en-US&append_to_response=movie_credits`
        );

        return {
          ...person,
          ...detail,
          popularity: Number(detail.popularity || person.popularity || 0),
          known_for: person.known_for || []
        };
      } catch {
        return null;
      }
    })
  );

  return enriched.filter(Boolean);
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
      POPULAR MOVIE STARS

      "Popular" here means recognizable, established movie actors,
      not simply whoever is trending on TMDB today.
    */
    if (category === "popular") {
      const people = await getDiscoveryPool();

      const stars = people
        .filter(qualifiesAsEstablishedMovieStar)
        .sort((a, b) =>
          establishedActorScore(b) - establishedActorScore(a)
        )
        .slice(0, 20)
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
      const people = await getDiscoveryPool();

      const stars = people
        .filter(person => qualifiesForGenre(person, 28))
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
      const people = await getDiscoveryPool();

      const stars = people
        .filter(person => qualifiesForGenre(person, 35))
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

const token = process.env.TMDB_READ_ACCESS_TOKEN;

async function tmdb(path) {
  if (!token) {
    throw new Error("TMDB token is not configured");
  }

  const response = await fetch(
    `https://api.themoviedb.org/3${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.status_message ||
      "Star lookup failed"
    );
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
      (
        !person.known_for_department ||
        person.known_for_department === "Acting"
      )
    )
    .filter(person => {
      if (seen.has(person.id)) {
        return false;
      }

      seen.add(person.id);
      return true;
    })
    .map(person => ({
      id: person.id,
      name: person.name,
      profile_path: person.profile_path,
      popularity: person.popularity || 0,
      known_for: person.known_for || []
    }));
}

function hasGenre(person, genreIds) {
  const knownFor =
    Array.isArray(person.known_for)
      ? person.known_for
      : [];

  return knownFor.some(movie => {
    const genres =
      Array.isArray(movie.genre_ids)
        ? movie.genre_ids
        : [];

    return genreIds.some(id =>
      genres.includes(id)
    );
  });
}

async function getPopularPeople() {
  const pages = await Promise.all([
    tmdb(
      "/person/popular?language=en-US&page=1"
    ),
    tmdb(
      "/person/popular?language=en-US&page=2"
    ),
    tmdb(
      "/person/popular?language=en-US&page=3"
    )
  ]);

  return cleanStars(
    pages.flatMap(page =>
      Array.isArray(page.results)
        ? page.results
        : []
    )
  );
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

export default async function handler(req, res) {
  try {
    const category =
      String(req.query?.category || "popular")
        .toLowerCase();

    /*
      POPULAR MOVIE STARS
    */

    if (category === "popular") {
      const people =
        await getPopularPeople();

      return res
        .status(200)
        .json(people.slice(0, 20));
    }

    /*
      HOLLYWOOD LEGENDS

      These are TMDB person IDs.
      Names, photos and profile information
      still come directly from TMDB.
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

      const people =
        await getPeopleByIds(legendIds);

      return res
        .status(200)
        .json(people);
    }

    /*
      80s & 90s STARS

      Editorial discovery list using
      TMDB person IDs.
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

      const people =
        await getPeopleByIds(retroIds);

      return res
        .status(200)
        .json(people);
    }

    /*
      ACTION STARS

      Start with current popular actors and
      identify people known for action films.

      TMDB action genre = 28
    */

    if (category === "action") {
      const people =
        await getPopularPeople();

      const actionStars =
        people.filter(person =>
          hasGenre(person, [28])
        );

      return res
        .status(200)
        .json(actionStars.slice(0, 20));
    }

    /*
      COMEDY STARS

      TMDB comedy genre = 35
    */

    if (category === "comedy") {
      const people =
        await getPopularPeople();

      const comedyStars =
        people.filter(person =>
          hasGenre(person, [35])
        );

      return res
        .status(200)
        .json(comedyStars.slice(0, 20));
    }

    /*
      FALLBACK
    */

    const people =
      await getPopularPeople();

    return res
      .status(200)
      .json(people.slice(0, 20));

  } catch (error) {
    console.error(
      "Reelwise stars API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Star lookup failed"
    });
  }
}

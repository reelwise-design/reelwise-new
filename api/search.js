const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

async function tmdb(path) {
  let url = `https://api.themoviedb.org/3${path}`;

  const options = {
    headers: {
      accept: "application/json"
    }
  };

  if (TOKEN) {
    options.headers.Authorization = `Bearer ${TOKEN}`;
  } else if (API_KEY) {
    const separator = url.includes("?") ? "&" : "?";
    url += `${separator}api_key=${encodeURIComponent(API_KEY)}`;
  } else {
    throw new Error(
      "TMDB API key is not configured in Vercel."
    );
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.status_message || "TMDB request failed."
    );
  }

  return data;
}

function year(date) {
  return date ? String(date).slice(0, 4) : "";
}

/*
  Normalize text so searches are compared fairly.
*/

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

/*
  Give exact and close matches priority over popularity.
*/

function relevanceScore(item, query) {
  const search = normalize(query);

  const title = normalize(
    item.display_title ||
    item.title ||
    item.original_title ||
    item.name
  );

  let score = Number(item.popularity || 0);

  /*
    Exact match:
    Rocky III → Rocky III
  */
  if (title === search) {
    score += 1000000;
  }

  /*
    Starts with the complete search:
    Rocky → Rocky III
  */
  else if (title.startsWith(search)) {
    score += 100000;
  }

  /*
    Contains the complete search phrase.
  */
  else if (title.includes(search)) {
    score += 10000;
  }

  /*
    Give additional credit when all search words
    appear somewhere in the title.
  */
  else {
    const words = search
      .split(" ")
      .filter(Boolean);

    const matchingWords = words.filter(word =>
      title.includes(word)
    ).length;

    if (
      words.length &&
      matchingWords === words.length
    ) {
      score += 5000;
    } else {
      score += matchingWords * 250;
    }
  }

  return score;
}

export default async function handler(req, res) {
  try {
    const {
      q = "",
      type = "",
      id = ""
    } = req.query || {};

    /*
      MOVIE DETAILS
    */

    if (type === "movie-details" && id) {
      const movie = await tmdb(
        `/movie/${encodeURIComponent(
          id
        )}?language=en-US&append_to_response=credits,videos`
      );

      return res.status(200).json(movie);
    }

    /*
      ACTOR DETAILS
    */

    if (type === "person-details" && id) {
      const person = await tmdb(
        `/person/${encodeURIComponent(
          id
        )}?language=en-US&append_to_response=combined_credits`
      );

      return res.status(200).json(person);
    }

    /*
      BASIC MOVIE DETAILS
    */

    if (type === "movie" && id) {
      const movie = await tmdb(
        `/movie/${encodeURIComponent(
          id
        )}?language=en-US`
      );

      return res.status(200).json(movie);
    }

    /*
      BASIC PERSON DETAILS
    */

    if (type === "person" && id) {
      const person = await tmdb(
        `/person/${encodeURIComponent(
          id
        )}?language=en-US`
      );

      return res.status(200).json(person);
    }

    /*
      SEARCH MOVIES + ACTORS
    */

    const query = String(q).trim();

    if (!query) {
      return res.status(400).json({
        error: "Please enter a movie or actor."
      });
    }

    const [movieData, personData] =
      await Promise.all([
        tmdb(
          `/search/movie?query=${encodeURIComponent(
            query
          )}&language=en-US&include_adult=false`
        ),

        tmdb(
          `/search/person?query=${encodeURIComponent(
            query
          )}&language=en-US&include_adult=false`
        )
      ]);

    const movies = Array.isArray(movieData.results)
      ? movieData.results
      : [];

    const people = Array.isArray(personData.results)
      ? personData.results
      : [];

    const movieResults = movies.map(movie => ({
      ...movie,

      result_type: "movie",

      display_title:
        movie.title ||
        movie.original_title ||
        "Untitled",

      year: year(movie.release_date)
    }));

    const personResults = people
      .filter(person =>
        !person.known_for_department ||
        person.known_for_department === "Acting"
      )
      .map(person => ({
        ...person,

        result_type: "person",

        display_title:
          person.name || "Unknown"
      }));

    /*
      REELWISE SMART SEARCH

      Exact title/name matches come first.

      Then titles/names beginning with the search.

      Then titles containing the search phrase.

      Popularity is used as a secondary ranking signal.
    */

    const results = [
      ...movieResults,
      ...personResults
    ].sort((a, b) => {
      return (
        relevanceScore(b, query) -
        relevanceScore(a, query)
      );
    });

    return res.status(200).json({
      results,
      movies,
      people
    });

  } catch (error) {
    console.error(
      "Reelwise API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Something went wrong."
    });
  }
}

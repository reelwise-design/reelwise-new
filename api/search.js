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
      Put the most relevant TMDB results first.
    */

    const results = [
      ...movieResults,
      ...personResults
    ].sort((a, b) => {
      return (
        Number(b.popularity || 0) -
        Number(a.popularity || 0)
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

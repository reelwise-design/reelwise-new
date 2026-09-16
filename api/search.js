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
      data.status_message ||
      "TMDB request failed."
    );
  }

  return data;
}

function year(date) {
  return date ? String(date).slice(0, 4) : "";
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function movieResult(movie) {
  return {
    ...movie,
    result_type: "movie",
    display_title:
      movie.title ||
      movie.original_title ||
      "Untitled",
    year: year(movie.release_date)
  };
}

function personResult(person) {
  return {
    ...person,
    result_type: "person",
    display_title:
      person.name || "Unknown"
  };
}

function relevanceScore(item, query) {
  const search = normalize(query);

  const title = normalize(
    item.display_title ||
    item.title ||
    item.original_title ||
    item.name
  );

  let score = Number(item.popularity || 0);

  if (title === search) {
    score += 1000000;
  } else if (title.startsWith(search)) {
    score += 100000;
  } else if (title.includes(search)) {
    score += 10000;
  } else {
    const words =
      search.split(" ").filter(Boolean);

    const matchingWords =
      words.filter(word =>
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

function releaseSort(a, b) {
  const dateA =
    a.release_date || "9999-99-99";

  const dateB =
    b.release_date || "9999-99-99";

  return dateA.localeCompare(dateB);
}

export default async function handler(req, res) {
  try {
    const {
      q = "",
      type = "",
      id = ""
    } = req.query || {};

    /*
      DETAILS
    */

    if (type === "movie-details" && id) {
      const movie = await tmdb(
        `/movie/${encodeURIComponent(id)}` +
        "?language=en-US" +
        "&append_to_response=credits,videos"
      );

      return res.status(200).json(movie);
    }

    if (type === "person-details" && id) {
      const person = await tmdb(
        `/person/${encodeURIComponent(id)}` +
        "?language=en-US" +
        "&append_to_response=combined_credits"
      );

      return res.status(200).json(person);
    }

    if (type === "movie" && id) {
      const movie = await tmdb(
        `/movie/${encodeURIComponent(id)}` +
        "?language=en-US"
      );

      return res.status(200).json(movie);
    }

    if (type === "person" && id) {
      const person = await tmdb(
        `/person/${encodeURIComponent(id)}` +
        "?language=en-US"
      );

      return res.status(200).json(person);
    }

    /*
      SEARCH
    */

    const query = String(q).trim();

    if (!query) {
      return res.status(400).json({
        error:
          "Please enter a movie or actor."
      });
    }

    const [
      movieData,
      personData
    ] = await Promise.all([
      tmdb(
        "/search/movie" +
        `?query=${encodeURIComponent(query)}` +
        "&language=en-US" +
        "&include_adult=false"
      ),

      tmdb(
        "/search/person" +
        `?query=${encodeURIComponent(query)}` +
        "&language=en-US" +
        "&include_adult=false"
      )
    ]);

    const rawMovies =
      Array.isArray(movieData.results)
        ? movieData.results
        : [];

    const rawPeople =
      Array.isArray(personData.results)
        ? personData.results
        : [];

    let movieResults =
      rawMovies.map(movieResult);

    const personResults =
      rawPeople
        .filter(person =>
          !person.known_for_department ||
          person.known_for_department === "Acting"
        )
        .map(personResult);

    const normalizedQuery =
      normalize(query);

    /*
      FIND EXACT MOVIE TITLE MATCHES
    */

    const exactMovies =
      movieResults
        .filter(movie =>
          normalize(
            movie.display_title
          ) === normalizedQuery
        )
        .sort(
          (a, b) =>
            Number(b.popularity || 0) -
            Number(a.popularity || 0)
        );

    let franchiseExpanded = false;

    /*
      FRANCHISE LOGIC

      Only expand when the exact movie
      searched is the FIRST released movie
      in its TMDB collection.

      Rocky -> expands
      Rocky III -> does NOT expand
    */

    if (exactMovies.length) {
      try {
        const bestExact =
          exactMovies[0];

        const details =
          await tmdb(
            `/movie/${encodeURIComponent(
              bestExact.id
            )}?language=en-US`
          );

        const collection =
          details.belongs_to_collection;

        if (
          collection &&
          collection.id
        ) {
          const collectionData =
            await tmdb(
              `/collection/${encodeURIComponent(
                collection.id
              )}?language=en-US`
            );

          const collectionMovies =
            Array.isArray(collectionData.parts)
              ? collectionData.parts
                  .filter(movie =>
                    movie &&
                    movie.id &&
                    movie.title
                  )
                  .sort(releaseSort)
              : [];

          const firstReleased =
            collectionMovies[0];

          if (
            firstReleased &&
            String(firstReleased.id) ===
              String(bestExact.id)
          ) {
            franchiseExpanded = true;

            const franchiseResults =
              collectionMovies.map(movieResult);

            const franchiseIds =
              new Set(
                franchiseResults.map(movie =>
                  String(movie.id)
                )
              );

            const remainingMovies =
              movieResults
                .filter(movie =>
                  !franchiseIds.has(
                    String(movie.id)
                  )
                )
                .sort(
                  (a, b) =>
                    relevanceScore(b, query) -
                    relevanceScore(a, query)
                );

            movieResults = [
              ...franchiseResults,
              ...remainingMovies
            ];
          }
        }
      } catch (collectionError) {
        console.error(
          "Collection lookup error:",
          collectionError
        );
      }
    }

    let results;

    /*
      RULE 1:
      A base franchise title expands.

      Example:
      Rocky -> Rocky series.
    */

    if (franchiseExpanded) {
      results = [
        ...movieResults,
        ...personResults.sort(
          (a, b) =>
            relevanceScore(b, query) -
            relevanceScore(a, query)
        )
      ];
    }

    /*
      RULE 2:
      If an exact movie title exists
      and this is NOT a franchise expansion,
      return ONLY the exact movie match.

      Example:
      Rocky III -> Rocky III only.

      This removes Creed III,
      foreign titles, remakes with
      different names, etc.
    */

    else if (exactMovies.length) {
      results = exactMovies;
    }

    /*
      RULE 3:
      No exact movie title exists.

      Return the best movie and actor
      matches normally.
    */

    else {
      results = [
        ...movieResults,
        ...personResults
      ].sort(
        (a, b) =>
          relevanceScore(b, query) -
          relevanceScore(a, query)
      );
    }

    return res.status(200).json({
      results,
      movies: rawMovies,
      people: rawPeople,
      franchiseExpanded
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

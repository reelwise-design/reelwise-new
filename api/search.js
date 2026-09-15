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
    throw new Error("TMDB API key is not configured in Vercel.");
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.status_message || "TMDB request failed.");
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
    const words = search.split(" ").filter(Boolean);

    const matchingWords = words.filter(word =>
      title.includes(word)
    ).length;

    if (words.length && matchingWords === words.length) {
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
      SEARCH
    */

    const query = String(q).trim();

    if (!query) {
      return res.status(400).json({
        error: "Please enter a movie or actor."
      });
    }

    const [movieData, personData] = await Promise.all([
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

    let movieResults = movies.map(movieResult);

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
      FRANCHISE / COLLECTION SEARCH

      Example:
      Rocky
      Rocky II
      Rocky III
      Rocky IV
      Rocky V
      Rocky Balboa

      We first find the strongest exact movie match.
      Then we ask TMDB whether that movie belongs
      to an official collection.
    */

    const normalizedQuery = normalize(query);

    const exactMovies = movieResults
      .filter(movie =>
        normalize(movie.display_title) === normalizedQuery
      )
      .sort((a, b) =>
        Number(b.popularity || 0) -
        Number(a.popularity || 0)
      );

    /*
      Only use franchise expansion when the search
      appears to be the main/base movie title.

      This means:
      Rocky -> expand the Rocky collection
      Rocky III -> remain focused on Rocky III
    */

    if (exactMovies.length) {
      try {
        const bestExactMovie = exactMovies[0];

        const movieDetails = await tmdb(
          `/movie/${encodeURIComponent(
            bestExactMovie.id
          )}?language=en-US`
        );

        const collection = movieDetails.belongs_to_collection;

        if (collection && collection.id) {
          const collectionData = await tmdb(
            `/collection/${encodeURIComponent(
              collection.id
            )}?language=en-US`
          );

          let collectionMovies =
            Array.isArray(collectionData.parts)
              ? collectionData.parts
              : [];

          /*
            Determine whether the search is for
            the base movie of the collection.

            The base movie is the earliest released
            movie whose title exactly matches the query.
          */

          const exactCollectionMovies =
            collectionMovies
              .filter(movie =>
                normalize(
                  movie.title ||
                  movie.original_title
                ) === normalizedQuery
              )
              .sort((a, b) =>
                String(a.release_date || "9999")
                  .localeCompare(
                    String(b.release_date || "9999")
                  )
              );

          const baseMovie =
            exactCollectionMovies.length
              ? exactCollectionMovies[0]
              : null;

          if (
            baseMovie &&
            String(baseMovie.id) ===
              String(bestExactMovie.id)
          ) {
            /*
              Sort the real franchise chronologically.
            */

            collectionMovies.sort((a, b) => {
              const dateA =
                a.release_date || "9999-99-99";

              const dateB =
                b.release_date || "9999-99-99";

              return dateA.localeCompare(dateB);
            });

            const franchiseResults =
              collectionMovies.map(movieResult);

            /*
              Remove franchise movies from ordinary
              search results so we don't duplicate them.
            */

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
                .sort((a, b) =>
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
        /*
          If collection lookup fails, normal Reelwise
          search still works.
        */

        console.error(
          "Collection lookup error:",
          collectionError
        );
      }
    }

    /*
      If franchise expansion did NOT happen,
      use normal Reelwise relevance ranking.
    */

    const firstMovie = movieResults[0];

    const franchiseExpanded =
      movieResults.length > 1 &&
      firstMovie &&
      normalize(firstMovie.display_title) ===
        normalizedQuery &&
      movieResults.some((movie, index) =>
        index > 0 &&
        normalize(movie.display_title)
          .startsWith(normalizedQuery) &&
        normalize(movie.display_title) !==
          normalizedQuery
      );

    let results;

    if (franchiseExpanded) {
      /*
        Keep the franchise movie order intact.
        Actors follow the movie results.
      */

      results = [
        ...movieResults,
        ...personResults.sort((a, b) =>
          relevanceScore(b, query) -
          relevanceScore(a, query)
        )
      ];

    } else {
      results = [
        ...movieResults,
        ...personResults
      ].sort((a, b) =>
        relevanceScore(b, query) -
        relevanceScore(a, query)
      );
    }

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

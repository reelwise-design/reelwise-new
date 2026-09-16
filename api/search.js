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

/*
  Convert a trailing sequel number into
  a Roman numeral before searching TMDB.

  Examples:
  Rocky 2 -> Rocky II
  Rocky 3 -> Rocky III
  Rocky 4 -> Rocky IV

  Plain "Rocky" is unchanged.
*/
function normalizeSequelSearch(value) {
  const original = String(value || "").trim();

  const numberToRoman = {
    "1": "I",
    "2": "II",
    "3": "III",
    "4": "IV",
    "5": "V",
    "6": "VI",
    "7": "VII",
    "8": "VIII",
    "9": "IX",
    "10": "X"
  };

  const match = original.match(
    /^(.*\S)\s+(1|2|3|4|5|6|7|8|9|10)$/
  );

  if (!match) {
    return original;
  }

  const baseTitle = match[1].trim();
  const number = match[2];

  return `${baseTitle} ${numberToRoman[number]}`;
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

      /*
        FRANCHISE NAVIGATION

        TMDB movie details already tell us whether
        a movie belongs to a collection. If it does,
        fetch that collection here and attach a small,
        sorted list for the movie page.

        This keeps franchise navigation inside the
        existing /api/search function, so Reelwise
        does not add another Vercel function.
      */
      const collection =
        movie.belongs_to_collection;

      if (
        collection &&
        collection.id
      ) {
        try {
          const collectionData =
            await tmdb(
              `/collection/${encodeURIComponent(
                collection.id
              )}?language=en-US`
            );

          const parts =
            Array.isArray(collectionData.parts)
              ? collectionData.parts
                  .filter(part =>
                    part &&
                    part.id &&
                    part.title
                  )
                  .sort(releaseSort)
                  .map(movieResult)
              : [];

          if (parts.length > 1) {
            movie.reelwise_franchise = {
              id: collection.id,
              name:
                collectionData.name ||
                collection.name ||
                "Movie Series",
              parts
            };
          }
        } catch (collectionError) {
          console.error(
            "Movie franchise lookup error:",
            collectionError
          );
        }
      }

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

    const originalQuery =
      String(q).trim();

    if (!originalQuery) {
      return res.status(400).json({
        error:
          "Please enter a movie or actor."
      });
    }

    /*
      This is the movie query we actually send
      to TMDB.

      Rocky 3 becomes Rocky III.
    */

    const query =
      normalizeSequelSearch(originalQuery);

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
        `?query=${encodeURIComponent(originalQuery)}` +
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

    /*
      EXACT PERSON MATCH
      ------------------

      If the search exactly matches a person's
      name, that person takes priority over movies.

      This prevents searches such as:

      Sylvester Stallone

      from returning things like:

      The Sylvester Stallone Story
      Sly

      alongside the actual person.

      The movie list will still be available
      when the person card is opened through
      person-details / combined_credits.
    */

    const normalizedPersonQuery =
      normalize(originalQuery);

    const exactPeople =
      personResults
        .filter(person =>
          normalize(
            person.display_title
          ) === normalizedPersonQuery
        )
        .sort(
          (a, b) =>
            Number(b.popularity || 0) -
            Number(a.popularity || 0)
        );

    /*
      IMPORTANT:

      If an exact person exists, return ONLY
      the exact person match.

      This takes priority over an exact movie
      with the same words in its title.
    */

    if (exactPeople.length) {

      return res.status(200).json({
        results: [
          exactPeople[0]
        ],
        movies: [],
        people: rawPeople,
        franchiseExpanded: false,
        exactPersonMatch: true
      });
    }

    /*
      EXACT MOVIE MATCHES
    */

    const normalizedQuery =
      normalize(query);

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
      Rocky 3 -> Rocky III only
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
      Base franchise title expands.

      Rocky -> Rocky series.
    */

    if (franchiseExpanded) {
      results = [
        ...movieResults,
        ...personResults.sort(
          (a, b) =>
            relevanceScore(
              b,
              originalQuery
            ) -
            relevanceScore(
              a,
              originalQuery
            )
        )
      ];
    }

    /*
      RULE 2:
      Exact sequel returns ONLY that movie.

      Rocky III -> Rocky III
      Rocky 3   -> Rocky III
    */

    else if (exactMovies.length) {
      results = exactMovies;
    }

    /*
      RULE 3:
      No exact movie or person exists.

      Return normal movie and actor matches.
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
      franchiseExpanded,
      exactPersonMatch: false
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

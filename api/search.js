const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

async function tmdb(path) {
  let url = `https://api.themoviedb.org/3${path}`;
  const options = { headers: { accept: "application/json" } };

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
  if (!response.ok) throw new Error(data.status_message || "TMDB request failed.");
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

function normalizeSequelSearch(value) {
  const original = String(value || "").trim();
  const numberToRoman = {
    "1":"I","2":"II","3":"III","4":"IV","5":"V",
    "6":"VI","7":"VII","8":"VIII","9":"IX","10":"X"
  };
  const match = original.match(/^(.*\S)\s+(1|2|3|4|5|6|7|8|9|10)$/);
  if (!match) return original;
  return `${match[1].trim()} ${numberToRoman[match[2]]}`;
}

function movieResult(movie) {
  return {
    ...movie,
    result_type: "movie",
    display_title: movie.title || movie.original_title || "Untitled",
    year: year(movie.release_date)
  };
}

function personResult(person) {
  return {
    ...person,
    result_type: "person",
    display_title: person.name || "Unknown"
  };
}

/* ---------- FUZZY SEARCH HELPERS ---------- */

function editDistance(a, b) {
  a = normalize(a);
  b = normalize(b);
  const m = a.length, n = b.length;
  const row = Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const old = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = old;
    }
  }
  return row[n];
}

function similarity(a, b) {
  a = normalize(a);
  b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.startsWith(a)) return 0.96;
  if (b.includes(a)) return 0.88;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length, 1);
}

function fuzzyScore(item, query) {
  const q = normalize(query);
  const title = normalize(
    item.display_title || item.title || item.original_title || item.name
  );
  if (!q || !title) return 0;

  const qWords = q.split(" ").filter(Boolean);
  const tWords = title.split(" ").filter(Boolean);

  let whole = similarity(q, title);
  let wordAverage = 0;

  if (qWords.length) {
    const scores = qWords.map(qw =>
      Math.max(...tWords.map(tw => similarity(qw, tw)))
    );
    wordAverage = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  let score = whole * 0.45 + wordAverage * 0.55;

  if (title === q) score += 2;
  else if (title.startsWith(q)) score += 0.8;
  else if (title.includes(q)) score += 0.4;

  score += Math.min(Number(item.popularity || 0), 100) / 1000;
  return score;
}

function relevanceScore(item, query) {
  return fuzzyScore(item, query);
}

function releaseSort(a, b) {
  return (a.release_date || "9999-99-99")
    .localeCompare(b.release_date || "9999-99-99");
}

function uniqueByTypeAndId(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.result_type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function supplementalSearch(originalQuery) {
  const words = normalize(originalQuery).split(" ").filter(Boolean);

  // Only supplement multi-word searches. This is what helps:
  // "McCauley Culkin" -> search "Culkin" too.
  if (words.length < 2) return { movies: [], people: [] };

  const distinctive = [...words]
    .filter(w => w.length >= 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);

  const searches = await Promise.all(
    distinctive.map(async word => {
      const [movies, people] = await Promise.all([
        tmdb(`/search/movie?query=${encodeURIComponent(word)}&language=en-US&include_adult=false`),
        tmdb(`/search/person?query=${encodeURIComponent(word)}&language=en-US&include_adult=false`)
      ]);
      return {
        movies: Array.isArray(movies.results) ? movies.results : [],
        people: Array.isArray(people.results) ? people.results : []
      };
    })
  );

  return {
    movies: searches.flatMap(x => x.movies),
    people: searches.flatMap(x => x.people)
  };
}

export default async function handler(req, res) {
  try {
    const { q = "", type = "", id = "" } = req.query || {};

    /* ---------- DETAILS ---------- */

    if (type === "movie-details" && id) {
      const movie = await tmdb(
        `/movie/${encodeURIComponent(id)}?language=en-US&append_to_response=credits,videos`
      );

      const collection = movie.belongs_to_collection;
      if (collection && collection.id) {
        try {
          const collectionData = await tmdb(
            `/collection/${encodeURIComponent(collection.id)}?language=en-US`
          );
          const parts = Array.isArray(collectionData.parts)
            ? collectionData.parts
                .filter(part => part && part.id && part.title)
                .sort(releaseSort)
                .map(movieResult)
            : [];

          if (parts.length > 1) {
            movie.reelwise_franchise = {
              id: collection.id,
              name: collectionData.name || collection.name || "Movie Series",
              parts
            };
          }
        } catch (collectionError) {
          console.error("Movie franchise lookup error:", collectionError);
        }
      }
      return res.status(200).json(movie);
    }

    if (type === "person-details" && id) {
      const person = await tmdb(
        `/person/${encodeURIComponent(id)}?language=en-US&append_to_response=combined_credits`
      );
      return res.status(200).json(person);
    }

    if (type === "movie" && id) {
      return res.status(200).json(
        await tmdb(`/movie/${encodeURIComponent(id)}?language=en-US`)
      );
    }

    if (type === "person" && id) {
      return res.status(200).json(
        await tmdb(`/person/${encodeURIComponent(id)}?language=en-US`)
      );
    }

    /* ---------- SEARCH ---------- */

    const originalQuery = String(q).trim();
    if (!originalQuery) {
      return res.status(400).json({ error: "Please enter a movie or actor." });
    }

    const query = normalizeSequelSearch(originalQuery);

    const [movieData, personData, supplemental] = await Promise.all([
      tmdb(`/search/movie?query=${encodeURIComponent(query)}&language=en-US&include_adult=false`),
      tmdb(`/search/person?query=${encodeURIComponent(originalQuery)}&language=en-US&include_adult=false`),
      supplementalSearch(originalQuery)
    ]);

    const rawMovies = [
      ...(Array.isArray(movieData.results) ? movieData.results : []),
      ...supplemental.movies
    ];

    const rawPeople = [
      ...(Array.isArray(personData.results) ? personData.results : []),
      ...supplemental.people
    ];

    let movieResults = uniqueByTypeAndId(rawMovies.map(movieResult));

    let personResults = uniqueByTypeAndId(
      rawPeople
        .filter(person =>
          !person.known_for_department ||
          person.known_for_department === "Acting"
        )
        .map(personResult)
    );

    const normalizedPersonQuery = normalize(originalQuery);

    const exactPeople = personResults
      .filter(person => normalize(person.display_title) === normalizedPersonQuery)
      .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));

    if (exactPeople.length) {
      return res.status(200).json({
        results: [exactPeople[0]],
        movies: [],
        people: rawPeople,
        franchiseExpanded: false,
        exactPersonMatch: true
      });
    }

    const normalizedQuery = normalize(query);

    const exactMovies = movieResults
      .filter(movie => normalize(movie.display_title) === normalizedQuery)
      .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));

    let franchiseExpanded = false;

    /* Preserve existing base-franchise behavior. */
    if (exactMovies.length) {
      try {
        const bestExact = exactMovies[0];
        const details = await tmdb(
          `/movie/${encodeURIComponent(bestExact.id)}?language=en-US`
        );
        const collection = details.belongs_to_collection;

        if (collection && collection.id) {
          const collectionData = await tmdb(
            `/collection/${encodeURIComponent(collection.id)}?language=en-US`
          );

          const collectionMovies = Array.isArray(collectionData.parts)
            ? collectionData.parts
                .filter(movie => movie && movie.id && movie.title)
                .sort(releaseSort)
            : [];

          const firstReleased = collectionMovies[0];

          if (
            firstReleased &&
            String(firstReleased.id) === String(bestExact.id)
          ) {
            franchiseExpanded = true;

            const franchiseResults = collectionMovies.map(movieResult);
            const franchiseIds = new Set(
              franchiseResults.map(movie => String(movie.id))
            );

            const remainingMovies = movieResults
              .filter(movie => !franchiseIds.has(String(movie.id)))
              .sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query));

            movieResults = [...franchiseResults, ...remainingMovies];
          }
        }
      } catch (collectionError) {
        console.error("Collection lookup error:", collectionError);
      }
    }

    let results;

    if (franchiseExpanded) {
      results = [
        ...movieResults,
        ...personResults.sort(
          (a, b) =>
            relevanceScore(b, originalQuery) -
            relevanceScore(a, originalQuery)
        )
      ];
    } else if (exactMovies.length) {
      results = exactMovies;
    } else {
      /*
        FUZZY RESULT FILTER

        For multi-word queries, candidates must resemble the whole query.
        This prevents unrelated McCauleys from flooding a search for
        "McCauley Culkin", while allowing "Macaulay Culkin" to rank highly.
      */
      const words = normalize(originalQuery).split(" ").filter(Boolean);
      const threshold = words.length > 1 ? 0.56 : 0.70;

      results = [...movieResults, ...personResults]
        .map(item => ({
          item,
          score: fuzzyScore(item, query)
        }))
        .filter(entry => entry.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.item);
    }

    return res.status(200).json({
      results: results.slice(0, 40),
      movies: rawMovies,
      people: rawPeople,
      franchiseExpanded,
      exactPersonMatch: false
    });
  } catch (error) {
    console.error("Reelwise API error:", error);
    return res.status(500).json({
      error: error.message || "Something went wrong."
    });
  }
}

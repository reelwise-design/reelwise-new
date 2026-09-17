import TRIVIA_VAULT from "../data/trivia.js";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;


/*
  ============================================================
  REELWISE TRIVIA ENGINE
  ============================================================

  1. Reelwise curated Trivia Vault is always checked FIRST.
  2. Wikipedia is used only when a movie has not yet been
     added to the Reelwise Trivia Vault.
  3. Plot summaries and weak/general sentences are filtered.
*/


function normalizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}


async function getMovie(id) {
  if (!TOKEN) {
    throw new Error("TMDB_READ_ACCESS_TOKEN is missing");
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/movie/${id}?language=en-US`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }

  return response.json();
}


async function getWikipediaExtract(title) {
  try {
    const url =
      "https://en.wikipedia.org/w/api.php" +
      `?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*` +
      `&titles=${encodeURIComponent(title)}`;

    const response = await fetch(url);

    if (!response.ok) return "";

    const data = await response.json();
    const pages = data?.query?.pages || {};

    const page = Object.values(pages)[0];

    if (!page || page.missing !== undefined) {
      return "";
    }

    return page.extract || "";
  } catch {
    return "";
  }
}


async function searchWikipediaPages(query, limit = 6) {
  try {
    const url =
      "https://en.wikipedia.org/w/api.php" +
      `?action=query&list=search&format=json&origin=*` +
      `&srsearch=${encodeURIComponent(query)}` +
      `&srlimit=${limit}`;

    const response = await fetch(url);

    if (!response.ok) return [];

    const data = await response.json();

    return data?.query?.search || [];
  } catch {
    return [];
  }
}


function isUsefulFallbackPage(pageTitle = "", movieTitle = "") {
  const page = normalizeTitle(pageTitle);
  const movie = normalizeTitle(movieTitle);

  if (!page || !movie) return false;

  const rejected = [
    "soundtrack",
    "discography",
    "video game",
    "novel",
    "album",
    "song",
    "television series",
    "musical",
    "franchise",
    "characters",
    "list of",
    "awards and nominations"
  ];

  if (rejected.some(term => page.includes(term))) {
    return false;
  }

  return true;
}


function splitSentences(text = "") {
  return text
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}


function triviaScore(sentence = "") {
  const lower = sentence.toLowerCase();

  let score = 0;

  const strongTerms = [
    "filmed",
    "filming",
    "production",
    "cast",
    "casting",
    "actor",
    "actress",
    "director",
    "directed",
    "screenplay",
    "script",
    "improvised",
    "improvisation",
    "originally",
    "replaced",
    "audition",
    "makeup",
    "prosthetic",
    "costume",
    "stunt",
    "effects",
    "visual effects",
    "special effects",
    "practical",
    "location",
    "set",
    "camera",
    "photography",
    "training",
    "trained",
    "injury",
    "injured",
    "budget",
    "crew",
    "scene was shot",
    "shot in",
    "role was offered",
    "considered for the role",
    "deleted",
    "changed during",
    "designed",
    "constructed"
  ];

  const weakTerms = [
    "plot",
    "story follows",
    "the film follows",
    "the movie follows",
    "character must",
    "character is",
    "takes place",
    "released",
    "grossed",
    "box office",
    "received positive",
    "critical acclaim",
    "review",
    "rating",
    "sequel was released",
    "became a franchise"
  ];

  strongTerms.forEach(term => {
    if (lower.includes(term)) score += 3;
  });

  weakTerms.forEach(term => {
    if (lower.includes(term)) score -= 4;
  });

  if (sentence.length >= 70 && sentence.length <= 360) {
    score += 2;
  }

  if (sentence.length < 45) {
    score -= 3;
  }

  if (sentence.length > 500) {
    score -= 3;
  }

  return score;
}


function looksLikeBrokenFragment(sentence = "") {
  const text = sentence.trim();

  if (!text) return true;

  if (text.length < 45) return true;

  if (/^[a-z]/.test(text)) return true;

  if (
    text.includes("==") ||
    text.includes("{{") ||
    text.includes("}}") ||
    text.includes("[[") ||
    text.includes("]]")
  ) {
    return true;
  }

  return false;
}


function isWeakTriviaContent(sentence = "") {
  const lower = sentence.toLowerCase();

  const rejected = [
    "the plot",
    "the story",
    "the film follows",
    "the movie follows",
    "the film tells",
    "the movie tells",
    "grossed",
    "box office",
    "critical response",
    "critical reception",
    "review aggregator",
    "rotten tomatoes",
    "metacritic",
    "opening weekend",
    "was released on",
    "premiered on",
    "home media",
    "dvd",
    "blu-ray"
  ];

  return rejected.some(term => lower.includes(term));
}


function triviaWords(text = "") {
  return new Set(
    normalizeTitle(text)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 3)
  );
}


function triviaSimilarity(a = "", b = "") {
  const wordsA = triviaWords(a);
  const wordsB = triviaWords(b);

  if (!wordsA.size || !wordsB.size) return 0;

  let overlap = 0;

  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return overlap / Math.min(wordsA.size, wordsB.size);
}


function selectBestTrivia(sentences = [], existingTrivia = []) {
  const candidates = sentences
    .filter(sentence => !looksLikeBrokenFragment(sentence))
    .filter(sentence => !isWeakTriviaContent(sentence))
    .map(sentence => ({
      text: sentence,
      score: triviaScore(sentence)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = [];

  for (const item of candidates) {
    const duplicateExisting = existingTrivia.some(
      trivia => triviaSimilarity(trivia, item.text) > 0.55
    );

    const duplicateSelected = selected.some(
      trivia => triviaSimilarity(trivia, item.text) > 0.55
    );

    if (!duplicateExisting && !duplicateSelected) {
      selected.push(item.text);
    }

    if (selected.length >= 6) break;
  }

  return selected;
}


function extractTrivia(text = "", existingTrivia = []) {
  if (!text) return [];

  const sentences = splitSentences(text);

  return selectBestTrivia(sentences, existingTrivia);
}


async function getFallbackTrivia(title, year, existingTrivia = []) {
  const searches = [
    `"${title}" film production`,
    `"${title}" film casting`,
    `"${title}" film filming`,
    `"${title}" ${year || ""} film`
  ];

  const pageTitles = [];

  for (const query of searches) {
    const results = await searchWikipediaPages(query, 5);

    for (const result of results) {
      if (
        result?.title &&
        isUsefulFallbackPage(result.title, title) &&
        !pageTitles.includes(result.title)
      ) {
        pageTitles.push(result.title);
      }
    }

    if (pageTitles.length >= 5) break;
  }

  let trivia = [];

  for (const pageTitle of pageTitles.slice(0, 5)) {
    const extract = await getWikipediaExtract(pageTitle);

    if (!extract) continue;

    const found = extractTrivia(extract, [
      ...existingTrivia,
      ...trivia
    ]);

    trivia.push(...found);

    trivia = [...new Set(trivia)];

    if (trivia.length >= 6) break;
  }

  return trivia.slice(0, 6);
}


export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        error: "Missing movie id"
      });
    }

    const movie = await getMovie(id);

    const title = movie?.title || movie?.original_title || "";

    const year = movie?.release_date
      ? movie.release_date.slice(0, 4)
      : "";

    const key = normalizeTitle(title);

    /*
      ========================================================
      FIRST: REELWISE CURATED TRIVIA VAULT
      ========================================================
    */

    const curated = TRIVIA_VAULT[key];

    if (Array.isArray(curated) && curated.length) {
      return res.status(200).json({
        movie: title,
        year,
        trivia: curated.slice(0, 6),
        source: "Reelwise Trivia Vault",
        curated: true
      });
    }


    /*
      ========================================================
      SECOND: WIKIPEDIA FALLBACK

      This is used only when Reelwise has not yet curated
      trivia for the requested movie.
      ========================================================
    */

    let automaticTrivia = [];

    const possibleWikipediaTitles = [
      year ? `${title} (${year} film)` : "",
      `${title} (film)`,
      title
    ].filter(Boolean);

    for (const wikipediaTitle of possibleWikipediaTitles) {
      const extract = await getWikipediaExtract(wikipediaTitle);

      if (!extract) continue;

      automaticTrivia = extractTrivia(extract);

      if (automaticTrivia.length >= 4) {
        break;
      }
    }


    /*
      Search additional Wikipedia production/casting pages
      if the main article did not produce enough good trivia.
    */

    if (automaticTrivia.length < 4) {
      const extraTrivia = await getFallbackTrivia(
        title,
        year,
        automaticTrivia
      );

      automaticTrivia = [
        ...automaticTrivia,
        ...extraTrivia
      ];
    }


    /*
      Remove duplicates and keep the best six.
    */

    const finalTrivia = [];

    for (const item of automaticTrivia) {
      if (
        !finalTrivia.some(
          existing => triviaSimilarity(existing, item) > 0.55
        )
      ) {
        finalTrivia.push(item);
      }

      if (finalTrivia.length >= 6) break;
    }


    return res.status(200).json({
      movie: title,
      year,
      trivia: finalTrivia,
      source: finalTrivia.length
        ? "Wikipedia fallback"
        : "No trivia source found",
      curated: false
    });

  } catch (error) {
    console.error("Reelwise trivia error:", error);

    return res.status(500).json({
      error: "Unable to load trivia",
      details: error?.message || "Unknown error"
    });
  }
}

import QUOTE_VAULT from "../data/quotes.js";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE QUOTE ENGINE
  ============================================================

  Curated Reelwise Vault quotes always appear first.
  Wikiquote is used as the fallback for movies that
  do not yet have curated quotes.

  The fallback filter removes weak dialogue fragments,
  speaker-only reactions, cast entries and page metadata.
*/

function normalizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getMovie(id) {
  if (!TOKEN) {
    throw new Error("TMDB token is not configured");
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

async function wikiRequest(params) {
  const url =
    "https://en.wikiquote.org/w/api.php?" +
    new URLSearchParams({
      format: "json",
      origin: "*",
      ...params
    });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Wikiquote request failed: ${response.status}`);
  }

  return response.json();
}

async function getWikiPage(title) {
  const data = await wikiRequest({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    redirects: "1",
    titles: title
  });

  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];

  if (!page || page.missing !== undefined || !page.extract) {
    return null;
  }

  return {
    title: page.title,
    extract: page.extract
  };
}

async function searchWikiquote(query) {
  const data = await wikiRequest({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "8"
  });

  return data?.query?.search || [];
}

function likelyMoviePage(result, movieTitle, year) {
  const resultTitle = (result?.title || "").toLowerCase();
  const snippet = (result?.snippet || "").toLowerCase();
  const movie = movieTitle.toLowerCase();

  if (resultTitle === movie) return true;
  if (resultTitle.includes(`${movie} (film`)) return true;

  if (
    resultTitle.includes(movie) &&
    resultTitle.includes("film")
  ) {
    return true;
  }

  if (
    year &&
    resultTitle.includes(movie) &&
    (
      resultTitle.includes(String(year)) ||
      snippet.includes(String(year))
    )
  ) {
    return true;
  }

  return false;
}

function cleanLine(line = "") {
  return line
    .replace(/\[[^\]]*\]/g, "")
    .replace(/^[*#:;\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeading(line) {
  const lower = line.toLowerCase();

  const headings = [
    "cast",
    "dialogue",
    "quotes",
    "external links",
    "see also",
    "references",
    "about",
    "taglines",
    "trivia",
    "notes",
    "contents"
  ];

  return headings.some(
    heading =>
      lower === heading ||
      lower === `${heading}:`
  );
}

function isCastEntry(line) {
  if (/^[A-Z][A-Za-z.' -]+ as [A-Z]/.test(line)) {
    return true;
  }

  if (
    /^[A-Z][A-Za-z.' -]+\s+[–—-]\s+[A-Z][A-Za-z0-9 "'().-]+$/.test(line)
  ) {
    return true;
  }

  return false;
}

function isWeakReaction(text) {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z' ]/g, "")
    .trim();

  const weak = [
    "yay",
    "aww",
    "aw",
    "wow",
    "yeah",
    "yes",
    "no",
    "okay",
    "ok",
    "what",
    "huh",
    "hey",
    "oh",
    "whoa",
    "oops",
    "sorry",
    "thanks",
    "thank you"
  ];

  return weak.includes(cleaned);
}

function isBrokenContinuation(line) {
  const lower = line.toLowerCase();

  const starts = [
    "and ",
    "but ",
    "which ",
    "because ",
    "although ",
    "though "
  ];

  return starts.some(start => lower.startsWith(start));
}

function isUsefulQuote(line) {
  if (!line) return false;

  if (line.length < 18) return false;
  if (line.length > 260) return false;

  if (isHeading(line)) return false;
  if (isCastEntry(line)) return false;
  if (isBrokenContinuation(line)) return false;

  if (/^\[/.test(line)) return false;
  if (/^\(/.test(line)) return false;

  const lower = line.toLowerCase();

  const blocked = [
    "wikiquote",
    "wikipedia",
    "external links",
    "official website",
    "retrieved from",
    "category:",
    "movie trailer",
    "film trailer"
  ];

  if (blocked.some(item => lower.includes(item))) {
    return false;
  }

  const words = line
    .replace(/[^A-Za-z0-9']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  return words.length >= 5;
}

function extractQuotes(extract = "") {
  const lines = extract
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);

  const quotes = [];
  const seen = new Set();

  for (let line of lines) {
    /*
      Wikiquote frequently formats dialogue like:

      Brad: This is the actual quote.

      Keep substantial dialogue but remove the speaker name.
      Reject tiny reactions such as:

      Megan, Dylan: Yay!
    */

    const speakerMatch = line.match(
      /^([^:]{1,45}):\s*(.+)$/
    );

    if (speakerMatch) {
      const speech = speakerMatch[2].trim();

      if (isWeakReaction(speech)) {
        continue;
      }

      const speechWords = speech
        .replace(/[^A-Za-z0-9']/g, " ")
        .split(/\s+/)
        .filter(Boolean);

      if (speechWords.length < 5) {
        continue;
      }

      line = speech;
    }

    line = cleanLine(line);

    if (!isUsefulQuote(line)) {
      continue;
    }

    const key = line
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (!key || seen.has(key)) {
      continue;
    }

    /*
      Avoid cards that are simply pieces or duplicates
      of quotes we already kept.
    */

    const duplicate = quotes.some(existing => {
      const existingKey = existing
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      return (
        existingKey === key ||
        (
          key.length > 25 &&
          existingKey.includes(key)
        ) ||
        (
          existingKey.length > 25 &&
          key.includes(existingKey)
        )
      );
    });

    if (duplicate) {
      continue;
    }

    seen.add(key);
    quotes.push(line);

    if (quotes.length >= 8) {
      break;
    }
  }

  return quotes;
}

async function findWikiquoteQuotes(title, year) {
  const exactCandidates = [
    year ? `${title} (${year} film)` : null,
    `${title} (film)`,
    title
  ].filter(Boolean);

  /*
    First try exact page names.
  */

  for (const candidate of exactCandidates) {
    const page = await getWikiPage(candidate);

    if (!page) continue;

    const quotes = extractQuotes(page.extract);

    if (quotes.length) {
      return {
        page: page.title,
        quotes
      };
    }
  }

  /*
    If no exact page worked, search Wikiquote.
  */

  const searches = [
    year ? `"${title}" ${year} film` : null,
    `"${title}" film`,
    title
  ].filter(Boolean);

  for (const query of searches) {
    const results = await searchWikiquote(query);

    const likely = results.filter(result =>
      likelyMoviePage(result, title, year)
    );

    for (const result of likely) {
      const page = await getWikiPage(result.title);

      if (!page) continue;

      const quotes = extractQuotes(page.extract);

      if (quotes.length) {
        return {
          page: page.title,
          quotes
        };
      }
    }
  }

  return null;
}

export default async function handler(req, res) {
  try {
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({
        error: "Movie id is required",
        quotes: []
      });
    }

    const movie = await getMovie(id);

    const title = movie?.title || "";

    const year = movie?.release_date
      ? movie.release_date.slice(0, 4)
      : "";

    const key = normalizeTitle(title);

    /*
      ==========================================================
      REELWISE CURATED VAULT
      ==========================================================
    */

    const curated = QUOTE_VAULT[key];

    if (
      Array.isArray(curated) &&
      curated.length
    ) {
      return res.status(200).json({
        movie: title,
        year,
        quotes: curated,
        source: "Reelwise Vault",
        curated: true
      });
    }

    /*
      ==========================================================
      WIKIQUOTE FALLBACK
      ==========================================================
    */

    const fallback = await findWikiquoteQuotes(
      title,
      year
    );

    if (
      fallback &&
      Array.isArray(fallback.quotes) &&
      fallback.quotes.length
    ) {
      return res.status(200).json({
        movie: title,
        year,
        quotes: fallback.quotes,
        source: "Wikiquote",
        curated: false,
        page: fallback.page
      });
    }

    return res.status(200).json({
      movie: title,
      year,
      quotes: [],
      source: "No quote source found",
      curated: false
    });

  } catch (error) {
    console.error(
      "Reelwise quotes error:",
      error
    );

    return res.status(500).json({
      error: "Unable to load quotes",
      quotes: []
    });
  }
}

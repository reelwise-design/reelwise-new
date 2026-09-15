const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

async function tmdb(path) {
  let url = "https://api.themoviedb.org/3" + path;

  const options = {
    headers: {
      accept: "application/json"
    }
  };

  if (TOKEN) {
    options.headers.Authorization = "Bearer " + TOKEN;
  } else if (API_KEY) {
    url += (url.includes("?") ? "&" : "?") +
      "api_key=" +
      encodeURIComponent(API_KEY);
  } else {
    throw new Error("TMDB credentials are not configured.");
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error("TMDB request failed.");
  }

  return response.json();
}

async function wikiquote(params) {
  const url =
    "https://en.wikiquote.org/w/api.php?" +
    new URLSearchParams({
      origin: "*",
      format: "json",
      ...params
    }).toString();

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Reelwise/1.0"
    }
  });

  if (!response.ok) {
    throw new Error("Wikiquote request failed.");
  }

  return response.json();
}

function cleanWikiText(value) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuote(value) {
  let text = cleanWikiText(value);

  text = text
    .replace(/^[*#:;]+\s*/, "")
    .replace(/^["“”'‘’]+/, "")
    .replace(/["“”'‘’]+$/, "")
    .trim();

  return text;
}

function looksLikeCastEntry(line) {
  const text = String(line || "").trim();

  if (/^[A-Z][A-Za-z.' -]{2,45}\s+[–—-]\s+.{2,70}$/.test(text)) {
    return true;
  }

  const lower = " " + text.toLowerCase() + " ";

  const rankTerms = [
    " lt ",
    " ltjg ",
    " lieutenant ",
    " captain ",
    " commander ",
    " admiral ",
    " colonel ",
    " sergeant ",
    " officer "
  ];

  return (
    /\s[–—-]\s/.test(text) &&
    rankTerms.some(term => lower.includes(term))
  );
}

function looksLikeNavigationOrReference(text, movieTitle) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();
  const title = String(movieTitle || "").toLowerCase().trim();

  if (!value) return true;

  // Wikiquote/Wikipedia navigation and page furniture
  const blockedPhrases = [
    "film series",
    "filmsite.org",
    "wikipedia",
    "wikiquote",
    "external links",
    "external link",
    "see also",
    "references",
    "reference",
    "official website",
    "official site",
    "internet movie database",
    "imdb",
    "rotten tomatoes",
    "metacritic",
    "allmovie",
    "box office mojo",
    "categories",
    "category:",
    "retrieved from",
    "navigation menu",
    "related quotes",
    "quotes about",
    "quotes from",
    "cast",
    "starring",
    "directed by",
    "written by",
    "produced by",
    "release date"
  ];

  if (blockedPhrases.some(term => lower.includes(term))) {
    return true;
  }

  // Website/domain names
  if (
    /\b(?:www\.|https?:\/\/)/i.test(value) ||
    /\b[a-z0-9-]+\.(?:com|org|net|edu|gov|io)\b/i.test(value)
  ) {
    return true;
  }

  // A bare movie title is not a quote.
  if (title && lower === title) {
    return true;
  }

  // Reject obvious sequel/navigation titles such as:
  // Rocky II, Rocky III, Rocky IV, Top Gun: Maverick, etc.
  if (title) {
    const baseTitle = title
      .replace(/\s*\(\d{4}\)\s*$/, "")
      .trim();

    if (
      lower.startsWith(baseTitle + " ") &&
      (
        /\b(?:ii|iii|iv|v|vi|vii|viii|ix|x)\b/i.test(value) ||
        /\b(?:2|3|4|5|6|7|8|9|10)\b/.test(value)
      )
    ) {
      return true;
    }
  }

  // Very short title-like strings with no sentence punctuation
  // are usually links/headings rather than dialogue.
  const words = value.split(/\s+/).filter(Boolean);

  if (
    words.length <= 7 &&
    !/[.!?]/.test(value) &&
    /^[A-Z0-9][A-Za-z0-9:'’"&., -]+$/.test(value)
  ) {
    return true;
  }

  return false;
}

function looksLikeRealQuote(text, movieTitle) {
  const value = String(text || "").trim();

  if (!value) return false;

  if (value.length < 8 || value.length > 180) {
    return false;
  }

  if (looksLikeCastEntry(value)) {
    return false;
  }

  if (looksLikeNavigationOrReference(value, movieTitle)) {
    return false;
  }

  // Reject section headings / labels.
  if (/^(dialogue|taglines?|quotes?|characters?|about|notes?)$/i.test(value)) {
    return false;
  }

  // Reject metadata-style labels.
  if (/^[A-Za-z ]{2,30}:\s*$/.test(value)) {
    return false;
  }

  // Reject obvious bullet/reference fragments.
  if (/^\d+\.\s/.test(value)) {
    return false;
  }

  // A quote should contain enough natural language.
  const words = value.split(/\s+/).filter(Boolean);

  if (words.length < 3) {
    return false;
  }

  // Reject strings that are mostly title-cased proper nouns.
  const titleCaseWords = words.filter(word =>
    /^[A-Z][a-z]+$/.test(word.replace(/[.,!?;:'"]/g, ""))
  );

  if (
    words.length <= 8 &&
    titleCaseWords.length >= Math.ceil(words.length * 0.75) &&
    !/[!?]/.test(value)
  ) {
    return false;
  }

  return true;
}

function parseQuoteLine(rawLine, movieTitle) {
  let line = normalizeQuote(rawLine);

  if (!line) return null;

  if (looksLikeCastEntry(line)) {
    return null;
  }

  if (looksLikeNavigationOrReference(line, movieTitle)) {
    return null;
  }

  let speaker = "";
  let text = line;

  /*
    Wikiquote frequently formats dialogue as:
    Maverick: I feel the need...
  */
  const speakerMatch = line.match(
    /^([A-Za-z0-9 .'’"-]{2,40}):\s+(.{5,})$/
  );

  if (speakerMatch) {
    const possibleSpeaker = speakerMatch[1].trim();
    const possibleQuote = speakerMatch[2].trim();

    if (
      !looksLikeNavigationOrReference(possibleSpeaker, movieTitle) &&
      looksLikeRealQuote(possibleQuote, movieTitle)
    ) {
      speaker = possibleSpeaker;
      text = possibleQuote;
    }
  }

  text = normalizeQuote(text);

  if (!looksLikeRealQuote(text, movieTitle)) {
    return null;
  }

  if (looksLikeCastEntry(text)) {
    return null;
  }

  return {
    text,
    speaker
  };
}

function dedupeQuotes(quotes) {
  const seen = new Set();
  const output = [];

  for (const quote of quotes) {
    const key = quote.text
      .toLowerCase()
      .replace(/[“”"'‘’.,!?;:—–-]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(quote);
  }

  return output;
}

async function findWikiquotePage(title, year) {
  const searches = [
    `"${title}" ${year} film`,
    `${title} ${year} film`,
    `${title} film`,
    title
  ];

  for (const search of searches) {
    const data = await wikiquote({
      action: "query",
      list: "search",
      srsearch: search,
      srlimit: "8"
    });

    const results =
      data &&
      data.query &&
      Array.isArray(data.query.search)
        ? data.query.search
        : [];

    if (!results.length) {
      continue;
    }

    const titleLower = title.toLowerCase();

    const ranked = results
      .map(item => {
        const candidate = String(item.title || "");
        const lower = candidate.toLowerCase();

        let score = 0;

        if (lower === titleLower) score += 100;
        if (lower.startsWith(titleLower + " (")) score += 80;
        if (lower.includes(titleLower)) score += 50;
        if (lower.includes("film")) score += 20;
        if (year && lower.includes(String(year))) score += 20;

        if (lower.includes("film series")) score -= 100;
        if (lower.includes("franchise")) score -= 80;
        if (lower.includes("character")) score -= 40;

        return {
          title: candidate,
          score
        };
      })
      .sort((a, b) => b.score - a.score);

    if (ranked.length && ranked[0].score > 0) {
      return ranked[0].title;
    }
  }

  return null;
}

async function getPageWikitext(pageTitle) {
  const data = await wikiquote({
    action: "parse",
    page: pageTitle,
    prop: "wikitext",
    redirects: "1"
  });

  return (
    data &&
    data.parse &&
    data.parse.wikitext &&
    data.parse.wikitext["*"]
  ) || "";
}

function extractQuotes(wikitext, movieTitle) {
  const lines = String(wikitext || "").split("\n");
  const quotes = [];

  let blockedSection = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Track Wikiquote sections so we don't read reference/navigation areas.
    const headingMatch = trimmed.match(/^={2,}\s*(.*?)\s*={2,}$/);

    if (headingMatch) {
      const heading = cleanWikiText(headingMatch[1]).toLowerCase();

      blockedSection =
        heading.includes("cast") ||
        heading.includes("external") ||
        heading.includes("reference") ||
        heading.includes("see also") ||
        heading.includes("link") ||
        heading.includes("about") ||
        heading.includes("bibliography");

      continue;
    }

    if (blockedSection) {
      continue;
    }

    // Actual Wikiquote material is normally in bullet/list lines.
    if (!/^[*#:]/.test(trimmed)) {
      continue;
    }

    const parsed = parseQuoteLine(trimmed, movieTitle);

    if (parsed) {
      quotes.push(parsed);
    }
  }

  return dedupeQuotes(quotes).slice(0, 8);
}

export default async function handler(req, res) {
  try {
    const id = String(req.query.id || "").trim();

    if (!id) {
      return res.status(400).json({
        error: "Movie ID is required."
      });
    }

    const movie = await tmdb(
      "/movie/" +
      encodeURIComponent(id) +
      "?language=en-US"
    );

    const title = movie.title || movie.original_title;

    const year = movie.release_date
      ? movie.release_date.slice(0, 4)
      : "";

    if (!title) {
      return res.status(404).json({
        error: "Movie could not be identified."
      });
    }

    const pageTitle = await findWikiquotePage(title, year);

    if (!pageTitle) {
      return res.status(200).json({
        title,
        year,
        quotes: [],
        message:
          "No suitable short quotes were found for this movie."
      });
    }

    const wikitext = await getPageWikitext(pageTitle);

    const quotes = extractQuotes(wikitext, title);

    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800"
    );

    return res.status(200).json({
      title,
      year,
      quotes,
      sourceName: "Wikiquote",
      source:
        "https://en.wikiquote.org/wiki/" +
        encodeURIComponent(pageTitle.replace(/ /g, "_"))
    });

  } catch (error) {
    console.error("Quotes API error:", error);

    return res.status(500).json({
      error: "Reelwise could not load quotes right now."
    });
  }
}

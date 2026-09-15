const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

async function tmdb(path) {
  let url = `https://api.themoviedb.org/3${path}`;

  const headers = {
    accept: "application/json"
  };

  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  } else if (API_KEY) {
    url += `${url.includes("?") ? "&" : "?"}api_key=${API_KEY}`;
  } else {
    throw new Error("TMDB credentials are missing.");
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }

  return response.json();
}

async function wikiquote(params) {
  const url =
    "https://en.wikiquote.org/w/api.php?" +
    new URLSearchParams({
      format: "json",
      origin: "*",
      ...params
    });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Wikiquote request failed.");
  }

  return response.json();
}

function cleanWikiText(text) {
  if (!text) return "";

  return String(text)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isLikelyMoviePage(title, movieTitle, year) {
  const page = normalizeTitle(title);
  const movie = normalizeTitle(movieTitle);

  if (!page || !movie) return false;

  if (page === movie) return true;

  if (page === `${movie} film`) return true;

  if (year && page === `${movie} ${year} film`) return true;

  return false;
}

function looksLikeJunk(text) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();

  if (!value) return true;
  if (value.length < 4) return true;
  if (value.length > 260) return true;

  if (/^(see also|external links|references|notes|cast|quotes|dialogue)$/i.test(value)) {
    return true;
  }

  if (
    lower.includes("filmsite.org") ||
    lower.includes("imdb") ||
    lower.includes("wikipedia") ||
    lower.includes("wikiquote") ||
    lower.includes("external link") ||
    lower.includes("official website")
  ) {
    return true;
  }

  if (/^https?:\/\//i.test(value)) return true;

  if (/^\([^)]{1,120}\)$/.test(value)) return true;

  if (/^\[[^\]]{1,120}\]$/.test(value)) return true;

  return false;
}

function looksLikeMovieTitle(text) {
  const value = String(text || "").trim();

  if (!value) return true;

  if (
    /^(the )?[a-z0-9][a-z0-9 '&:.,!?-]{1,55}\s+\(\d{4}\)$/i.test(value)
  ) {
    return true;
  }

  return false;
}

function looksLikeCastEntry(text) {
  const value = String(text || "").trim();

  if (!value) return false;

  if (
    /\s+[–—-]\s+(?:lt\.?|ltjg|capt\.?|captain|cmdr\.?|commander|sgt\.?|sergeant|dr\.?|colonel|col\.?|major|gen\.?|general|officer|agent)\b/i.test(
      value
    )
  ) {
    return true;
  }

  if (
    /^[A-Z][A-Za-z.' -]{2,45}\s+[–—-]\s+[A-Z][A-Za-z0-9 "'().-]{2,70}$/.test(
      value
    )
  ) {
    return true;
  }

  return false;
}

function parseSpeakerLine(text) {
  const value = cleanWikiText(text);

  if (!value) return null;

  const match = value.match(
    /^([A-Za-z0-9 .,'’"()\-]{1,45}):\s*(.+)$/
  );

  if (!match) return null;

  const speaker = match[1].trim();
  const quote = match[2].trim();

  if (!speaker || !quote) return null;

  if (
    /^(note|notes|source|sources|reference|references|external links?)$/i.test(
      speaker
    )
  ) {
    return null;
  }

  return {
    speaker,
    text: quote
  };
}

function quoteScore(text) {
  const value = String(text || "");

  let score = 0;

  if (value.length >= 20 && value.length <= 150) score += 5;
  if (value.length >= 8 && value.length < 20) score += 2;
  if (/[!?]/.test(value)) score += 1;
  if (/^[A-Z]/.test(value)) score += 1;

  if (value.length > 180) score -= 3;

  return score;
}

function dedupe(items) {
  const seen = new Set();

  return items.filter(item => {
    const key =
      item.type === "dialogue"
        ? item.lines
            .map(line => `${line.speaker}:${line.text}`)
            .join("|")
            .toLowerCase()
        : String(item.text || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function extractQuotes(wikitext) {
  const lines = String(wikitext || "").split("\n");

  const standalone = [];
  const dialogues = [];

  let currentDialogue = [];

  function saveDialogue() {
    if (currentDialogue.length >= 2) {
      /*
        Reelwise should show only SHORT memorable exchanges.
        Never turn the Quotes section into a transcript.
      */
      const trimmed = currentDialogue.slice(0, 4);

      dialogues.push({
        type: "dialogue",
        lines: trimmed
      });
    }

    currentDialogue = [];
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      saveDialogue();
      continue;
    }

    /*
      Ignore headings, templates, categories and navigation.
    */
    if (
      /^=+/.test(trimmed) ||
      /^\{\{/.test(trimmed) ||
      /^\[\[Category:/i.test(trimmed)
    ) {
      saveDialogue();
      continue;
    }

    /*
      Wikiquote quote/dialogue lines are normally bullets.
    */
    const bulletMatch = trimmed.match(/^[:*#]+\s*(.+)$/);

    if (!bulletMatch) {
      saveDialogue();
      continue;
    }

    const cleaned = cleanWikiText(bulletMatch[1]);

    if (!cleaned) continue;

    if (
      looksLikeJunk(cleaned) ||
      looksLikeMovieTitle(cleaned) ||
      looksLikeCastEntry(cleaned)
    ) {
      continue;
    }

    const speakerLine = parseSpeakerLine(cleaned);

    if (speakerLine) {
      if (
        looksLikeJunk(speakerLine.text) ||
        looksLikeCastEntry(speakerLine.text)
      ) {
        continue;
      }

      /*
        Keep dialogue exchanges together, but cap them at four lines.
      */
      currentDialogue.push(speakerLine);

      if (currentDialogue.length === 4) {
        saveDialogue();
      }

      continue;
    }

    saveDialogue();

    /*
      Standalone memorable quote.
    */
    if (
      cleaned.length >= 8 &&
      cleaned.length <= 220
    ) {
      standalone.push({
        type: "quote",
        text: cleaned,
        score: quoteScore(cleaned)
      });
    }
  }

  saveDialogue();

  /*
    Prefer standalone quotes heavily.

    Maximum:
    - 8 standalone quotes
    - 2 short dialogue exchanges
    - 10 total selections
  */

  const bestStandalone = standalone
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score, ...item }) => item);

  const bestDialogues = dialogues
    .filter(item => {
      const totalLength = item.lines.reduce(
        (sum, line) => sum + line.text.length,
        0
      );

      return totalLength <= 420;
    })
    .slice(0, 2);

  return dedupe([
    ...bestStandalone,
    ...bestDialogues
  ]).slice(0, 10);
}

async function findExactWikiquotePage(movieTitle, year) {
  /*
    Search specifically for the movie instead of accepting
    Wikiquote index/search pages.
  */

  const searches = [
    `"${movieTitle}" film`,
    year ? `"${movieTitle}" ${year} film` : "",
    `"${movieTitle}"`
  ].filter(Boolean);

  for (const query of searches) {
    const data = await wikiquote({
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: "8"
    });

    const results =
      data &&
      data.query &&
      Array.isArray(data.query.search)
        ? data.query.search
        : [];

    /*
      First demand a title that actually matches the movie.
      This prevents Space Cowboys from accidentally using
      alphabetic index/search pages containing Pacific Rim,
      Paddington, etc.
    */

    const exact = results.find(result =>
      isLikelyMoviePage(
        result.title,
        movieTitle,
        year
      )
    );

    if (exact) return exact.title;
  }

  /*
    Try the most common direct Wikiquote page names.
  */

  const candidates = [
    movieTitle,
    `${movieTitle} (film)`,
    year ? `${movieTitle} (${year} film)` : ""
  ].filter(Boolean);

  for (const title of candidates) {
    const data = await wikiquote({
      action: "query",
      titles: title
    });

    const pages =
      data &&
      data.query &&
      data.query.pages
        ? Object.values(data.query.pages)
        : [];

    const page = pages.find(
      item => item && !item.missing
    );

    if (
      page &&
      isLikelyMoviePage(
        page.title,
        movieTitle,
        year
      )
    ) {
      return page.title;
    }
  }

  return null;
}

async function getWikiText(title) {
  const data = await wikiquote({
    action: "parse",
    page: title,
    prop: "wikitext"
  });

  return (
    data &&
    data.parse &&
    data.parse.wikitext &&
    data.parse.wikitext["*"]
  ) || "";
}

export default async function handler(req, res) {
  try {
    const id = String(req.query.id || "").trim();

    if (!id) {
      return res.status(400).json({
        error: "Movie id is required."
      });
    }

    const movie = await tmdb(
      `/movie/${encodeURIComponent(id)}?language=en-US`
    );

    const movieTitle = movie.title || movie.original_title;

    if (!movieTitle) {
      return res.status(404).json({
        error: "Movie title could not be identified."
      });
    }

    const year = movie.release_date
      ? movie.release_date.slice(0, 4)
      : "";

    const wikiquoteTitle =
      await findExactWikiquotePage(
        movieTitle,
        year
      );

    if (!wikiquoteTitle) {
      res.setHeader(
        "Cache-Control",
        "s-maxage=86400, stale-while-revalidate=604800"
      );

      return res.status(200).json({
        movie: movieTitle,
        year,
        quotes: [],
        message:
          "No reliable Wikiquote page was found for this movie."
      });
    }

    const wikitext =
      await getWikiText(wikiquoteTitle);

    const quotes =
      extractQuotes(wikitext);

    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800"
    );

    return res.status(200).json({
      movie: movieTitle,
      year,
      source: "Wikiquote",
      source_page: wikiquoteTitle,
      quotes,
      message:
        quotes.length
          ? undefined
          : "No suitable short quotes were found for this movie."
    });
  } catch (error) {
    console.error("Reelwise quotes error:", error);

    return res.status(500).json({
      error: "Quotes could not be loaded."
    });
  }
}

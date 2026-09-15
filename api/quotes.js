const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

async function tmdb(path) {
  let url = `https://api.themoviedb.org/3${path}`;
  const headers = { accept: "application/json" };

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
  return String(text || "")
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

  return (
    page === movie ||
    page === `${movie} film` ||
    (year && page === `${movie} ${year} film`)
  );
}

function looksLikeJunk(text, movieTitle) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();
  const movie = String(movieTitle || "").toLowerCase();

  if (!value) return true;
  if (value.length < 8) return true;
  if (value.length > 180) return true;

  // Production credits
  if (
    /\b(directed|written|produced|screenplay|music|cinematography|distributed)\s+by\b/i.test(
      value
    )
  ) {
    return true;
  }

  // Notes, references and Wikiquote navigation
  if (
    /^(note|notes|source|sources|reference|references|see also|external links?|cast|about|links)\b/i.test(
      value
    )
  ) {
    return true;
  }

  if (
    lower.includes("american film institute") ||
    lower.includes("afi's") ||
    lower.includes("ranked #") ||
    lower.includes("movie quotations") ||
    lower.includes("filmsite.org") ||
    lower.includes("imdb") ||
    lower.includes("wikipedia") ||
    lower.includes("wikiquote") ||
    lower.includes("official website")
  ) {
    return true;
  }

  // Related movie pages
  if (lower.includes("(film series)")) return true;

  if (
    movie &&
    lower.startsWith(movie + " ") &&
    value.length < 70 &&
    !/[.!?]["']?$/.test(value)
  ) {
    return true;
  }

  // Sequel titles such as Rocky II / Rocky III
  if (
    /^[A-Z][A-Za-z0-9 '&:.-]{1,50}\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(
      value
    )
  ) {
    return true;
  }

  // URLs
  if (/^https?:\/\//i.test(value)) return true;

  // Stage directions
  if (/^\([^)]{2,160}\)$/.test(value)) return true;
  if (/^\[[^\]]{2,160}\]$/.test(value)) return true;

  // Cast-style entries
  if (
    /\s+[–—-]\s+(?:lt\.?|ltjg|capt\.?|captain|cmdr\.?|commander|sgt\.?|sergeant|dr\.?|colonel|col\.?|major|gen\.?|general|officer|agent)\b/i.test(
      value
    )
  ) {
    return true;
  }

  return false;
}

function removeSpeaker(text) {
  const value = String(text || "").trim();

  /*
    If Wikiquote stores a spoken line as:
    Rocky: Yo, Adrian!
    keep only:
    Yo, Adrian!
  */
  const match = value.match(
    /^([A-Za-z0-9 .,'’"()\-]{1,40}):\s*(.+)$/
  );

  if (!match) return value;

  const speaker = match[1].trim();
  const spoken = match[2].trim();

  if (
    /^(note|notes|source|sources|reference|references)$/i.test(
      speaker
    )
  ) {
    return "";
  }

  return spoken;
}

function quoteScore(text) {
  const value = String(text || "");
  let score = 0;

  // Strong preference for concise lines.
  if (value.length >= 15 && value.length <= 90) {
    score += 10;
  } else if (value.length <= 130) {
    score += 6;
  } else {
    score += 2;
  }

  if (/[!?]/.test(value)) score += 2;

  // Spoken-language clues.
  if (
    /\b(I|I'm|I've|you|you're|we|we're|don't|can't|won't|gonna|gotta|yeah|hey|look|listen)\b/i.test(
      value
    )
  ) {
    score += 3;
  }

  return score;
}

function dedupeQuotes(quotes) {
  const seen = new Set();

  return quotes.filter(item => {
    const key = item.text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function extractQuotes(wikitext, movieTitle) {
  const lines = String(wikitext || "").split("\n");
  const quotes = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) continue;

    // Skip headings/templates/navigation.
    if (
      /^=+/.test(trimmed) ||
      /^\{\{/.test(trimmed) ||
      /^\[\[Category:/i.test(trimmed)
    ) {
      continue;
    }

    /*
      Only consider Wikiquote bullet/indented content.
    */
    const bulletMatch = trimmed.match(/^[:*#]+\s*(.+)$/);

    if (!bulletMatch) continue;

    let cleaned = cleanWikiText(bulletMatch[1]);

    if (!cleaned) continue;

    cleaned = removeSpeaker(cleaned);

    if (!cleaned) continue;

    if (looksLikeJunk(cleaned, movieTitle)) {
      continue;
    }

    /*
      A Reelwise quote should look like an actual spoken line,
      not metadata or a page link.
    */
    if (
      cleaned.length < 8 ||
      cleaned.length > 180 ||
      !/[a-z]{3}/i.test(cleaned)
    ) {
      continue;
    }

    quotes.push({
      type: "quote",
      text: cleaned,
      score: quoteScore(cleaned)
    });
  }

  /*
    Rank the strongest short quotes first.
    No dialogue objects are returned.
  */
  return dedupeQuotes(quotes)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score, ...item }) => item);
}

async function findExactWikiquotePage(movieTitle, year) {
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
      data?.query?.search && Array.isArray(data.query.search)
        ? data.query.search
        : [];

    const exact = results.find(result =>
      isLikelyMoviePage(
        result.title,
        movieTitle,
        year
      )
    );

    if (exact) {
      return exact.title;
    }
  }

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

    const pages = data?.query?.pages
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

  return data?.parse?.wikitext?.["*"] || "";
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

    const movieTitle =
      movie.title || movie.original_title;

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
        "s-maxage=3600, stale-while-revalidate=86400"
      );

      return res.status(200).json({
        movie: movieTitle,
        year,
        quotes: [],
        message:
          "No reliable quotes were found for this movie."
      });
    }

    const wikitext =
      await getWikiText(wikiquoteTitle);

    const quotes =
      extractQuotes(wikitext, movieTitle);

    res.setHeader(
      "Cache-Control",
      "s-maxage=3600, stale-while-revalidate=86400"
    );

    return res.status(200).json({
      movie: movieTitle,
      year,
      source: "Wikiquote",
      source_page: wikiquoteTitle,
      quotes,
      message: quotes.length
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

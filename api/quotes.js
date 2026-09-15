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
  if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
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
  if (!response.ok) throw new Error("Wikiquote request failed.");
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

function looksLikeJunk(text) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();

  if (!value || value.length < 5 || value.length > 220) return true;

  // Credits and production information
  if (
    /\b(directed|written|produced|screenplay|music|cinematography|distributed)\s+by\b/i.test(
      value
    )
  ) return true;

  // Wikiquote notes and explanatory material
  if (
    /^(note|notes|source|sources|reference|references|see also|external links?|cast)\b/i.test(
      value
    )
  ) return true;

  if (
    lower.includes("american film institute") ||
    lower.includes("afi's") ||
    lower.includes("afi ") ||
    lower.includes("ranked #") ||
    lower.includes("movie quotations") ||
    lower.includes("filmsite.org") ||
    lower.includes("imdb") ||
    lower.includes("wikipedia") ||
    lower.includes("wikiquote") ||
    lower.includes("official website")
  ) return true;

  if (/^https?:\/\//i.test(value)) return true;

  // Stage directions or descriptions
  if (/^\([^)]{2,180}\)$/.test(value)) return true;
  if (/^\[[^\]]{2,180}\]$/.test(value)) return true;

  return false;
}

function looksLikeRelatedTitle(text, movieTitle) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();
  const movie = String(movieTitle || "").toLowerCase();

  // Typical related-film links such as "Rocky II" or "Rocky (film series)"
  if (lower.includes("(film series)")) return true;

  if (
    movie &&
    lower.startsWith(movie + " ") &&
    value.length < 80 &&
    !/[.!?]["']?$/.test(value)
  ) return true;

  // Bare sequel/title-like entries
  if (
    /^[A-Z][A-Za-z0-9 '&:.-]{1,50}\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(
      value
    )
  ) return true;

  return false;
}

function looksLikeCastEntry(text) {
  const value = String(text || "").trim();

  if (
    /\s+[–—-]\s+(?:lt\.?|ltjg|capt\.?|captain|cmdr\.?|commander|sgt\.?|sergeant|dr\.?|colonel|col\.?|major|gen\.?|general|officer|agent)\b/i.test(
      value
    )
  ) return true;

  if (
    /^[A-Z][A-Za-z.' -]{2,45}\s+[–—-]\s+[A-Z][A-Za-z0-9 "'().-]{2,70}$/.test(
      value
    )
  ) return true;

  return false;
}

function parseSpeakerLine(text) {
  const value = cleanWikiText(text);

  const match = value.match(
    /^([A-Za-z0-9 .,'’"()\-]{1,40}):\s*(.+)$/
  );

  if (!match) return null;

  const speaker = match[1].trim();
  const quote = match[2].trim();

  if (
    !speaker ||
    !quote ||
    /^(note|notes|source|sources|reference|references|external links?)$/i.test(
      speaker
    )
  ) {
    return null;
  }

  return { speaker, text: quote };
}

function quoteScore(text) {
  const value = String(text || "");
  let score = 0;

  // Favor concise, memorable lines.
  if (value.length >= 15 && value.length <= 120) score += 8;
  if (value.length > 120 && value.length <= 170) score += 3;
  if (/[!?]/.test(value)) score += 2;
  if (/^[A-Z]/.test(value)) score += 1;

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

function extractQuotes(wikitext, movieTitle) {
  const lines = String(wikitext || "").split("\n");

  const standalone = [];
  const dialogues = [];
  let currentDialogue = [];

  function saveDialogue() {
    /*
      Only save a genuinely short back-and-forth.
      Maximum 3 spoken lines.
    */
    if (currentDialogue.length >= 2) {
      const shortExchange = currentDialogue.slice(0, 3);

      const totalLength = shortExchange.reduce(
        (sum, line) => sum + line.text.length,
        0
      );

      if (totalLength <= 260) {
        dialogues.push({
          type: "dialogue",
          lines: shortExchange
        });
      }
    }

    currentDialogue = [];
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      saveDialogue();
      continue;
    }

    // Ignore Wikiquote structure/navigation.
    if (
      /^=+/.test(trimmed) ||
      /^\{\{/.test(trimmed) ||
      /^\[\[Category:/i.test(trimmed)
    ) {
      saveDialogue();
      continue;
    }

    const bulletMatch = trimmed.match(/^[:*#]+\s*(.+)$/);

    if (!bulletMatch) {
      saveDialogue();
      continue;
    }

    const cleaned = cleanWikiText(bulletMatch[1]);

    if (
      !cleaned ||
      looksLikeJunk(cleaned) ||
      looksLikeRelatedTitle(cleaned, movieTitle) ||
      looksLikeCastEntry(cleaned)
    ) {
      continue;
    }

    const speakerLine = parseSpeakerLine(cleaned);

    if (speakerLine) {
      if (
        looksLikeJunk(speakerLine.text) ||
        looksLikeRelatedTitle(speakerLine.text, movieTitle) ||
        looksLikeCastEntry(speakerLine.text)
      ) {
        continue;
      }

      currentDialogue.push(speakerLine);

      if (currentDialogue.length === 3) {
        saveDialogue();
      }

      continue;
    }

    saveDialogue();

    /*
      Standalone quotes only.
      Avoid very short title/navigation entries.
    */
    if (
      cleaned.length >= 12 &&
      cleaned.length <= 180 &&
      /[a-z]{3}/i.test(cleaned)
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
    Reelwise balance:
    Up to 7 standalone quotes.
    At most ONE short dialogue exchange.
    Maximum 8 selections total.
  */
  const bestStandalone = standalone
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map(({ score, ...item }) => item);

  const bestDialogue = dialogues.slice(0, 1);

  return dedupe([
    ...bestStandalone,
    ...bestDialogue
  ]).slice(0, 8);
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
      isLikelyMoviePage(result.title, movieTitle, year)
    );

    if (exact) return exact.title;
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

    const page = pages.find(item => item && !item.missing);

    if (
      page &&
      isLikelyMoviePage(page.title, movieTitle, year)
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
      await findExactWikiquotePage(movieTitle, year);

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

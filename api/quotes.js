const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

async function tmdb(path) {
  let url = "https://api.themoviedb.org/3" + path;

  const options = {
    headers: { accept: "application/json" }
  };

  if (TOKEN) {
    options.headers.Authorization = "Bearer " + TOKEN;
  } else if (API_KEY) {
    url +=
      (url.includes("?") ? "&" : "?") +
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
  return cleanWikiText(value)
    .replace(/^[*#:;]+\s*/, "")
    .replace(/^["“”'‘’]+/, "")
    .replace(/["“”'‘’]+$/, "")
    .trim();
}

function isStageDirection(text) {
  const value = String(text || "").trim();

  if (/^\[.*\]$/.test(value)) {
    return true;
  }

  if (/^\(.*\)$/.test(value)) {
    const lower = value.toLowerCase();

    if (
      lower.includes("scene") ||
      lower.includes("enters") ||
      lower.includes("leaves") ||
      lower.includes("walks") ||
      lower.includes("goes") ||
      lower.includes("looks") ||
      lower.includes("laughs") ||
      lower.includes("fighting") ||
      lower.includes("fight") ||
      lower.includes("ring")
    ) {
      return true;
    }
  }

  return false;
}

function isNoteOrCommentary(text) {
  const lower = String(text || "").trim().toLowerCase();

  const blockedStarts = [
    "note:",
    "note ",
    "notes:",
    "editor's note",
    "editor’s note",
    "the bolded",
    "bolded portion",
    "this quote",
    "this line",
    "this quotation"
  ];

  if (blockedStarts.some(item => lower.startsWith(item))) {
    return true;
  }

  const blockedContent = [
    "american film institute",
    "afi's list",
    "afi’s list",
    "top 100 movie quotations",
    "ranked #",
    "ranked number",
    "quotation in american cinema"
  ];

  return blockedContent.some(item => lower.includes(item));
}

function looksLikeNavigation(text, movieTitle) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();
  const title = String(movieTitle || "").trim().toLowerCase();

  const blocked = [
    "film series",
    "filmsite.org",
    "wikipedia",
    "wikiquote",
    "external links",
    "external link",
    "references",
    "reference",
    "see also",
    "official website",
    "official site",
    "internet movie database",
    "imdb",
    "rotten tomatoes",
    "metacritic",
    "allmovie",
    "box office mojo",
    "retrieved from",
    "category:",
    "categories"
  ];

  if (blocked.some(item => lower.includes(item))) {
    return true;
  }

  if (
    /\b(?:www\.|https?:\/\/)/i.test(value) ||
    /\b[a-z0-9-]+\.(?:com|org|net|edu|gov|io)\b/i.test(value)
  ) {
    return true;
  }

  if (title && lower === title) {
    return true;
  }

  if (title) {
    const base = title
      .replace(/\s*\(\d{4}\)\s*$/, "")
      .trim();

    if (
      lower.startsWith(base + " ") &&
      (
        /\b(?:ii|iii|iv|v|vi|vii|viii|ix|x)\b/i.test(value) ||
        /\b(?:2|3|4|5|6|7|8|9|10)\b/.test(value)
      )
    ) {
      return true;
    }
  }

  return false;
}

function looksLikeCastEntry(text) {
  const value = String(text || "").trim();

  if (
    /^[A-Z][A-Za-z.' -]{2,45}\s+[–—-]\s+.{2,70}$/.test(value)
  ) {
    return true;
  }

  const lower = " " + value.toLowerCase() + " ";

  const ranks = [
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
    /\s[–—-]\s/.test(value) &&
    ranks.some(rank => lower.includes(rank))
  );
}

function isValidQuote(text, movieTitle) {
  const value = String(text || "").trim();

  if (!value) return false;

  if (value.length < 8 || value.length > 180) {
    return false;
  }

  if (isStageDirection(value)) {
    return false;
  }

  if (isNoteOrCommentary(value)) {
    return false;
  }

  if (looksLikeNavigation(value, movieTitle)) {
    return false;
  }

  if (looksLikeCastEntry(value)) {
    return false;
  }

  if (
    /^(dialogue|taglines?|quotes?|characters?|cast|notes?|about)$/i.test(
      value
    )
  ) {
    return false;
  }

  const words = value.split(/\s+/).filter(Boolean);

  if (words.length < 3) {
    return false;
  }

  return true;
}

function parseQuoteLine(rawLine, movieTitle) {
  let line = normalizeQuote(rawLine);

  if (!line) return null;

  if (
    isStageDirection(line) ||
    isNoteOrCommentary(line) ||
    looksLikeNavigation(line, movieTitle) ||
    looksLikeCastEntry(line)
  ) {
    return null;
  }

  let speaker = "";
  let text = line;

  /*
    Recognize dialogue such as:
    Rocky: It was what?
    Adrian: But it was Thanksgiving.
  */
  const match = line.match(
    /^([A-Za-z0-9 .'’"-]{2,40}):\s*(.+)$/
  );

  if (match) {
    const possibleSpeaker = match[1].trim();
    const possibleQuote = match[2].trim();

    /*
      Don't treat things such as "Note:" or
      "Director:" as character names.
    */
    if (
      !/^(note|notes|director|writer|producer|source|reference|cast)$/i.test(
        possibleSpeaker
      ) &&
      isValidQuote(possibleQuote, movieTitle)
    ) {
      speaker = possibleSpeaker;
      text = possibleQuote;
    }
  }

  text = normalizeQuote(text);

  if (!isValidQuote(text, movieTitle)) {
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

        if (lower.includes("film series")) score -= 120;
        if (lower.includes("franchise")) score -= 100;
        if (lower.includes("character")) score -= 50;

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

    const heading = trimmed.match(
      /^={2,}\s*(.*?)\s*={2,}$/
    );

    if (heading) {
      const name = cleanWikiText(heading[1]).toLowerCase();

      blockedSection =
        name.includes("cast") ||
        name.includes("external") ||
        name.includes("reference") ||
        name.includes("see also") ||
        name.includes("link") ||
        name.includes("bibliography");

      continue;
    }

    if (blockedSection) {
      continue;
    }

    /*
      Wikiquote's actual quote/dialogue content is
      normally stored as list items.
    */
    if (!/^[*#:]/.test(trimmed)) {
      continue;
    }

    const parsed = parseQuoteLine(
      trimmed,
      movieTitle
    );

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

    const title =
      movie.title ||
      movie.original_title;

    const year =
      movie.release_date
        ? movie.release_date.slice(0, 4)
        : "";

    if (!title) {
      return res.status(404).json({
        error: "Movie could not be identified."
      });
    }

    const pageTitle =
      await findWikiquotePage(title, year);

    if (!pageTitle) {
      return res.status(200).json({
        title,
        year,
        quotes: [],
        message:
          "No suitable short quotes were found for this movie."
      });
    }

    const wikitext =
      await getPageWikitext(pageTitle);

    const quotes =
      extractQuotes(wikitext, title);

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
        encodeURIComponent(
          pageTitle.replace(/ /g, "_")
        )
    });

  } catch (error) {
    console.error(
      "Quotes API error:",
      error
    );

    return res.status(500).json({
      error:
        "Reelwise could not load quotes right now."
    });
  }
}

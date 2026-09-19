import { QUOTE_VAULT } from "../data/quotes.js";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE QUOTE ENGINE
  ============================================================

  1. Reelwise curated Quote Vault always wins.
  2. Wikiquote is used only when a movie is not in the vault.
  3. Fallback results are filtered so scene fragments,
     speaker labels, reactions and broken dialogue are removed.
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
  const title = (result?.title || "").toLowerCase();
  const snippet = (result?.snippet || "").toLowerCase();
  const movie = movieTitle.toLowerCase();

  if (title === movie) return true;
  if (title.includes(`${movie} (film`)) return true;
  if (title.includes(movie) && title.includes("film")) return true;

  if (
    year &&
    title.includes(movie) &&
    (title.includes(String(year)) || snippet.includes(String(year)))
  ) {
    return true;
  }

  return false;
}

function cleanLine(line = "") {
  return line
    .replace(/\[[^\]]*]/g, "")
    .replace(/\([^)]*edit[^)]*\)/gi, "")
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
      lower === `${heading}:` ||
      lower.startsWith(`${heading}[`)
  );
}

function looksLikeSpeakerFragment(line) {
  /*
    Reject lines such as:
    "Megan, Dylan: Yay!"
    "Brad: No."
    "Dusty: What?"
  */

  const match = line.match(/^([^:]{1,45}):\s*(.+)$/);

  if (!match) return false;

  const speech = match[2].trim();

  const words = speech
    .replace(/[^\w']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length <= 5) {
    return true;
  }

  return false;
}

function looksLikeScriptDirection(line) {
  const lower = line.toLowerCase();

  const patterns = [
    /^\[/,
    /^\(/,
    /^scene\b/,
    /^cut to\b/,
    /^fade\b/,
    /^later\b/,
    /^meanwhile\b/,
    /^the scene\b/,
    /^he says\b/,
    /^she says\b/,
    /^they say\b/
  ];

  return patterns.some(pattern => pattern.test(lower));
}

function looksLikeCastEntry(line) {
  /*
    Reject cast-list style entries:
    "Will Ferrell as Brad Whitaker"
    "Mark Wahlberg - Dusty Mayron"
  */

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

function looksLikeBrokenDialogue(line) {
  const lower = line.toLowerCase();

  /*
    Common signs that a Wikiquote line is merely one piece
    of a larger dialogue exchange rather than a standalone quote.
  */

  const badStarts = [
    "and ",
    "but ",
    "so ",
    "then ",
    "which ",
    "because ",
    "although ",
    "though ",
    "except ",
    "until ",
    "while "
  ];

  if (badStarts.some(start => lower.startsWith(start))) {
    return true;
  }

  /*
    Very short reactions usually aren't useful Reelwise quotes.
  */

  const reactionWords = [
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

  const stripped = lower
    .replace(/^[^:]+:\s*/, "")
    .replace(/[^a-z' ]/g, "")
    .trim();

  if (reactionWords.includes(stripped)) {
    return true;
  }

  return false;
}

function isUsefulQuote(line) {
  if (!line) return false;

  if (line.length < 18) return false;
  if (line.length > 240) return false;

  if (isHeading(line)) return false;
  if (looksLikeSpeakerFragment(line)) return false;
  if (looksLikeScriptDirection(line)) return false;
  if (looksLikeCastEntry(line)) return false;
  if (looksLikeBrokenDialogue(line)) return false;

  /*
    Reject obvious Wikiquote/navigation material.
  */

  const lower = line.toLowerCase();

  const blocked = [
    "wikiquote",
    "wikipedia",
    "imdb",
    "official website",
    "external link",
    "retrieved from",
    "category:",
    "quotes about",
    "film trailer",
    "movie trailer"
  ];

  if (blocked.some(text => lower.includes(text))) {
    return false;
  }

  /*
    Require enough actual words to resemble a meaningful quote.
  */

  const words = line
    .replace(/[^A-Za-z0-9']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length < 5) return false;

  return true;
}

function quoteScore(line) {
  let score = 0;

  const words = line
    .replace(/[^A-Za-z0-9']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  /*
    Standalone medium-length lines usually make the best cards.
  */

  if (words.length >= 7 && words.length <= 25) {
    score += 5;
  }

  if (words.length >= 5 && words.length <= 35) {
    score += 3;
  }

  if (line.length >= 35 && line.length <= 160) {
    score += 4;
  }

  if (/[.!?]["']?$/.test(line)) {
    score += 2;
  }

  /*
    Speaker-prefixed lines can still be valid if the actual
    quote is substantial, but slightly prefer clean standalone
    lines when both are available.
  */

  if (/^[^:]{1,40}:\s+/.test(line)) {
    score -= 1;
  }

  return score;
}

function extractFallbackQuotes(extract = "") {
  const lines = extract
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);

  const candidates = [];
  const seen = new Set();

  for (const originalLine of lines) {
    let line = originalLine;

    /*
      If Wikiquote gives us:
      "Brad: This is an actual substantial quote..."
      remove the speaker name but keep the quote.
    */

    const speakerMatch = line.match(/^([^:]{1,45}):\s*(.+)$/);

    if (speakerMatch) {
      const speech = speakerMatch[2].trim();

      const speechWords = speech
        .replace(/[^\w']/g, " ")
        .split(/\s+/)
        .filter(Boolean);

      if (speechWords.length >= 6) {
        line = speech;
      }
    }

    line = cleanLine(line);

    if (!isUsefulQuote(line)) continue;

    const key = line
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (!key || seen.has(key)) continue;

    /*
      Prevent near-duplicate quote cards.
    */

    const duplicate = candidates.some(item => {
      const existing = item.line
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      return (
        existing.includes(key) ||
        key.includes(existing)
      );
    });

    if (duplicate) continue;

    seen.add(key);

    candidates.push({
      line,
      score: quoteScore(line),
      order: candidates.length
    });
  }

  /*
    Favor stronger standalone quotes while retaining page order
    when scores are equal.
  */

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.order - b.order;
  });

  return candidates
    .slice(0, 5)
    .map(item => item.line);
}

async function findWikiquotePage(title, year) {
  const candidates = [
    year ? `${title} (${year} film)` : null,
    `${title} (film)`,
    title
  ].filter(Boolean);

  /*
    Try likely exact Wikiquote page names first.
  */

  for (const candidate of candidates) {
    const page = await getWikiPage(candidate);

    if (page) {
      const quotes = extractFallbackQuotes(page.extract);

      if (quotes.length) {
        return {
          page: page.title,
          quotes
        };
      }
    }
  }

  /*
    If an exact page wasn't found, search Wikiquote.
  */

  const searches = [
    year ? `"${title}" ${year} film` : null,
    `"${title}" film`,
    title
  ].filter(Boolean);

  for (const search of searches) {
    const results = await searchWikiquote(search);

    const likely = results.filter(result =>
      likelyMoviePage(result, title, year)
    );

    for (const result of likely) {
      const page = await getWikiPage(result.title);

      if (!page) continue;

      const quotes = extractFallbackQuotes(page.extract);

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
      REELWISE VAULT
      ==========================================================
      Curated quotes always take priority.
    */

    const curatedQuotes = QUOTE_VAULT[key];

    if (
      Array.isArray(curatedQuotes) &&
      curatedQuotes.length
    ) {
      return res.status(200).json({
        movie: title,
        year,
        quotes: curatedQuotes,
        source: "Reelwise Vault",
        curated: true
      });
    }

    /*
      ==========================================================
      WIKIQUOTE FALLBACK
      ==========================================================
    */

    const fallback = await findWikiquotePage(title, year);

    if (fallback?.quotes?.length) {
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
    console.error("Reelwise quotes error:", error);

    return res.status(500).json({
      error: "Unable to load quotes",
      quotes: []
    });
  }
}

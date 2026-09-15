const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

async function getMovie(id) {
  if (!TOKEN) {
    throw new Error("TMDB token is not configured");
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}?language=en-US`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        accept: "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.status_message ||
      "Movie lookup failed"
    );
  }

  return data;
}

async function getWikiquotePage(title) {
  const url =
    "https://en.wikiquote.org/w/api.php" +
    "?action=query" +
    "&prop=extracts" +
    "&explaintext=1" +
    "&redirects=1" +
    "&format=json" +
    "&origin=*" +
    "&titles=" +
    encodeURIComponent(title);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Reelwise/1.0 movie quote discovery"
    }
  });

  if (!response.ok) {
    return "";
  }

  const data = await response.json();

  const pages =
    data?.query?.pages || {};

  const page =
    Object.values(pages)[0];

  if (!page || page.missing !== undefined) {
    return "";
  }

  return page.extract || "";
}

function cleanLine(line) {
  return String(line || "")
    .replace(/^[-*#:]+\s*/, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadLine(line) {
  const lower = line.toLowerCase();

  if (!line) return true;

  if (line.length < 12) return true;

  if (line.length > 180) return true;

  if (/^=+.*=+$/.test(line)) return true;

  if (
    lower.startsWith("see also") ||
    lower.startsWith("external links") ||
    lower.startsWith("references") ||
    lower.startsWith("cast") ||
    lower.startsWith("about ") ||
    lower.startsWith("tagline") ||
    lower.startsWith("taglines") ||
    lower.startsWith("dialogue") ||
    lower.startsWith("quotes")
  ) {
    return true;
  }

  if (
    lower.includes("wikipedia") ||
    lower.includes("imdb") ||
    lower.includes("official website")
  ) {
    return true;
  }

  /*
    Reject lines that look primarily like
    speaker labels or screenplay directions.
  */

  if (
    /^[A-Z][A-Za-z .'-]{1,30}:$/.test(line)
  ) {
    return true;
  }

  if (
    /^\[[^\]]+\]$/.test(line) ||
    /^\([^)]+\)$/.test(line)
  ) {
    return true;
  }

  return false;
}

function quoteScore(line) {
  let score = 0;

  const length = line.length;

  /*
    Memorable movie quotes are frequently
    compact. Favor roughly 25–110 characters.
  */

  if (length >= 25 && length <= 110) {
    score += 45;
  } else if (
    length >= 15 &&
    length <= 140
  ) {
    score += 25;
  }

  /*
    Favor lines that read like complete,
    quotable statements.
  */

  if (/[.!?]$/.test(line)) {
    score += 15;
  }

  if (line.includes("!")) {
    score += 6;
  }

  if (line.includes("?")) {
    score += 3;
  }

  /*
    First-person / direct-address language
    often corresponds to actual memorable
    spoken dialogue.
  */

  if (
    /\b(I|I'm|I'll|I've|you|you're|we|we're|my|your)\b/i
      .test(line)
  ) {
    score += 8;
  }

  /*
    Penalize formatting that looks like
    transcripts rather than standalone quotes.
  */

  const colonCount =
    (line.match(/:/g) || []).length;

  if (colonCount >= 2) {
    score -= 25;
  }

  if (
    line.includes("[") ||
    line.includes("]")
  ) {
    score -= 15;
  }

  return score;
}

function extractQuotes(text) {
  if (!text) return [];

  const lines =
    text
      .split(/\r?\n/)
      .map(cleanLine)
      .filter(line => !isBadLine(line));

  const candidates = [];

  for (const line of lines) {
    /*
      Wikiquote often formats dialogue as:

      George Bailey: Some line here.

      Keep the spoken portion but remove
      the character label.
    */

    const speakerMatch =
      line.match(
        /^[A-Za-z0-9 .'-]{1,40}:\s+(.+)$/
      );

    let quote =
      speakerMatch
        ? cleanLine(speakerMatch[1])
        : line;

    if (isBadLine(quote)) {
      continue;
    }

    /*
      Avoid obvious descriptive prose.
    */

    if (
      /^(the film|the movie|this film|this movie|released|directed|written|starring)\b/i
        .test(quote)
    ) {
      continue;
    }

    candidates.push({
      text: quote,
      score: quoteScore(quote)
    });
  }

  /*
    Remove duplicates.
  */

  const unique = [];
  const seen = new Set();

  for (const item of candidates) {
    const key =
      item.text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique
    .sort((a, b) =>
      b.score - a.score
    )
    .slice(0, 8)
    .map(item => item.text);
}

export default async function handler(req, res) {
  try {
    const id =
      String(req.query?.id || "").trim();

    if (!id) {
      return res.status(400).json({
        error: "Movie ID is required."
      });
    }

    const movie =
      await getMovie(id);

    const title =
      movie.title ||
      movie.original_title;

    const year =
      movie.release_date
        ? movie.release_date.slice(0, 4)
        : "";

    /*
      Try the normal movie title first.

      If Wikiquote does not have that exact
      page, try common disambiguation formats.
    */

    const possibleTitles = [
      title,
      `${title} (film)`,
      year
        ? `${title} (${year} film)`
        : ""
    ].filter(Boolean);

    let extract = "";

    for (const pageTitle of possibleTitles) {
      extract =
        await getWikiquotePage(pageTitle);

      if (extract) {
        break;
      }
    }

    const quotes =
      extractQuotes(extract);

    return res.status(200).json({
      movie: title,
      year,
      quotes,
      source:
        quotes.length
          ? "Wikiquote"
          : "No quote source found"
    });

  } catch (error) {
    console.error(
      "Reelwise quotes error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Quotes could not be loaded.",
      quotes: []
    });
  }
}

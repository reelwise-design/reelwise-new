const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  REELWISE ICONIC QUOTE VAULT

  These are intentionally curated.
  They always appear before automatically
  sourced quotes.
*/

const ICONIC_QUOTES = {

  "it's a wonderful life": [
    "Every time a bell rings, an angel gets his wings.",
    "No man is a failure who has friends.",
    "I want to live again!",
    "You want the moon? Just say the word and I'll throw a lasso around it and pull it down.",
    "Merry Christmas, you wonderful old Building and Loan!",
    "To my big brother George, the richest man in town."
  ],

  "jaws": [
    "You're gonna need a bigger boat.",
    "Smile, you son of a—",
    "That's some bad hat, Harry.",
    "Here's to swimmin' with bow-legged women."
  ],

  "rocky": [
    "Yo, Adrian!",
    "It really don't matter if I lose this fight.",
    "All I wanna do is go the distance.",
    "Nobody's ever gone the distance with Creed.",
    "I must break you."
  ],

  "top gun": [
    "I feel the need—the need for speed!",
    "You can be my wingman any time.",
    "That's right, Iceman. I am dangerous.",
    "Talk to me, Goose.",
    "Your ego is writing checks your body can't cash."
  ],

  "the godfather": [
    "I'm gonna make him an offer he can't refuse.",
    "Leave the gun. Take the cannoli.",
    "It's not personal, Sonny. It's strictly business.",
    "A man who doesn't spend time with his family can never be a real man."
  ],

  "back to the future": [
    "Where we're going, we don't need roads.",
    "Great Scott!",
    "Nobody calls me chicken.",
    "If my calculations are correct, when this baby hits 88 miles per hour, you're gonna see some serious stuff."
  ]

};

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

async function getMovie(id) {
  if (!TOKEN) {
    throw new Error(
      "TMDB token is not configured"
    );
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
  try {
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

    if (
      !page ||
      page.missing !== undefined
    ) {
      return "";
    }

    return page.extract || "";

  } catch {
    return "";
  }
}

function cleanLine(line) {
  return String(line || "")
    .replace(/^[-*#:]+\s*/, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function usableQuote(line) {
  if (!line) return false;

  if (line.length < 15) return false;
  if (line.length > 150) return false;

  const lower =
    line.toLowerCase();

  if (
    lower.startsWith("see also") ||
    lower.startsWith("external links") ||
    lower.startsWith("references") ||
    lower.startsWith("cast") ||
    lower.startsWith("about ") ||
    lower.startsWith("tagline")
  ) {
    return false;
  }

  if (
    line.includes("[") ||
    line.includes("]")
  ) {
    return false;
  }

  return true;
}

function extractFallbackQuotes(text) {
  if (!text) return [];

  const lines =
    text
      .split(/\r?\n/)
      .map(cleanLine)
      .filter(usableQuote);

  const results = [];
  const seen = new Set();

  for (let line of lines) {

    const speaker =
      line.match(
        /^[A-Za-z0-9 .'-]{1,40}:\s+(.+)$/
      );

    if (speaker) {
      line =
        cleanLine(speaker[1]);
    }

    if (!usableQuote(line)) {
      continue;
    }

    const key =
      line
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    results.push(line);

    if (results.length >= 5) {
      break;
    }
  }

  return results;
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
      movie.original_title ||
      "";

    const year =
      movie.release_date
        ? movie.release_date.slice(0, 4)
        : "";

    const key =
      normalizeTitle(title);

    /*
      STEP 1:
      Check Reelwise's curated quote vault.
    */

    const curated =
      ICONIC_QUOTES[key] || [];

    if (curated.length) {

      return res.status(200).json({
        movie: title,
        year,
        quotes: curated,
        source: "Reelwise Vault",
        curated: true
      });

    }

    /*
      STEP 2:
      No curated entry yet.

      Use Wikiquote as the automatic
      fallback so Reelwise still works
      across the movie database.
    */

    const possibleTitles = [
      title,
      `${title} (film)`,
      year
        ? `${title} (${year} film)`
        : ""
    ].filter(Boolean);

    let extract = "";

    for (
      const pageTitle of possibleTitles
    ) {

      extract =
        await getWikiquotePage(pageTitle);

      if (extract) {
        break;
      }
    }

    const fallback =
      extractFallbackQuotes(extract);

    return res.status(200).json({
      movie: title,
      year,
      quotes: fallback,
      source: fallback.length
        ? "Wikiquote"
        : "No quote source found",
      curated: false
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

import QUOTE_VAULT from "../data/quotes.js";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  REELWISE QUOTE ENGINE
  Verified Vault version

  - TMDB identifies the exact movie.
  - Reelwise Vault supplies the quotes.
  - No Wikiquote/web fallback.
  - Structured records are published only when verified === true.
  - Legacy string quotes remain temporarily compatible.
*/

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/’/g, "'")
    .replace(/\s+/g, " ");
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getMovie(id) {
  if (!TOKEN) {
    throw new Error("TMDB token is not configured.");
  }

  const url =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(id) +
    "?language=en-US";

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/json"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.status_message || "Movie lookup failed."
    );
  }

  return data;
}

function prepareQuote(item) {
  // Existing Vault strings remain usable during migration.
  if (typeof item === "string") {
    const quote = cleanText(item);

    if (!quote) return null;

    return {
      quote: quote,
      verified: false,
      legacy: true
    };
  }

  // Structured records must explicitly be verified.
  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item) ||
    item.verified !== true
  ) {
    return null;
  }

  const quote = cleanText(item.quote || item.text);

  if (!quote) return null;

  const result = {
    quote: quote,
    verified: true,
    legacy: false
  };

  const character = cleanText(item.character);
  const actor = cleanText(item.actor);

  if (character) {
    result.character = character;
  }

  if (actor) {
    result.actor = actor;
  }

  return result;
}

function prepareVaultQuotes(items, limit = 8) {
  if (!Array.isArray(items)) {
    return [];
  }

  const results = [];
  const seen = new Set();

  for (const item of items) {
    const record = prepareQuote(item);

    if (!record) continue;

    const key = record.quote.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    results.push(record);

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

export default async function handler(req, res) {
  try {
    const rawId = req.query?.id;
    const id = Array.isArray(rawId)
      ? String(rawId[0] || "").trim()
      : String(rawId || "").trim();

    if (!id) {
      return res.status(400).json({
        error: "Movie ID is required.",
        quotes: [],
        quoteDetails: []
      });
    }

    const movie = await getMovie(id);

    const title = cleanText(
      movie.title || movie.original_title
    );

    const year =
      typeof movie.release_date === "string"
        ? movie.release_date.slice(0, 4)
        : "";

    const key = normalizeTitle(title);

    const vaultItems =
      QUOTE_VAULT && QUOTE_VAULT[key]
        ? QUOTE_VAULT[key]
        : [];

    const prepared = prepareVaultQuotes(
      vaultItems,
      8
    );

    const quotes = prepared.map(function (item) {
      return item.quote;
    });

    const quoteDetails = prepared.map(function (item) {
      const detail = {
        quote: item.quote,
        verified: item.verified === true
      };

      if (item.character) {
        detail.character = item.character;
      }

      if (item.actor) {
        detail.actor = item.actor;
      }

      if (item.legacy === true) {
        detail.legacy = true;
      }

      return detail;
    });

    const verifiedCount = quoteDetails.filter(
      function (item) {
        return item.verified === true;
      }
    ).length;

    const legacyCount = quoteDetails.filter(
      function (item) {
        return item.legacy === true;
      }
    ).length;

    let source = "No Reelwise quotes available";

    if (verifiedCount > 0 && legacyCount > 0) {
      source =
        "Reelwise Verified Vault + Legacy Vault";
    } else if (verifiedCount > 0) {
      source = "Reelwise Verified Vault";
    } else if (legacyCount > 0) {
      source = "Reelwise Legacy Vault";
    }

    return res.status(200).json({
      movie: title,
      year: year,
      quotes: quotes,
      quoteDetails: quoteDetails,
      source: source,
      curated: prepared.length > 0,
      verified:
        prepared.length > 0 &&
        verifiedCount === prepared.length,
      verifiedCount: verifiedCount,
      legacyCount: legacyCount
    });
  } catch (error) {
    console.error(
      "Reelwise quotes error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Quotes could not be loaded.",
      quotes: [],
      quoteDetails: []
    });
  }
}

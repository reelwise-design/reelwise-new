import QUOTE_VAULT from "../data/quotes.js";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  REELWISE QUOTE ENGINE — VERIFIED VAULT MIGRATION

  Accuracy rule:
  - No Wikiquote fallback.
  - No automatic internet quote extraction.
  - Structured quote records display only when verified === true.
  - Existing string entries remain temporarily compatible while
    we verify and migrate the current Vault movie by movie.
*/

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

async function getMovie(id) {
  if (!TOKEN) throw new Error("TMDB token is not configured");

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
    throw new Error(data.status_message || "Movie lookup failed");
  }

  return data;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function quoteKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function isDuplicateQuote(quote, existing) {
  const key = quoteKey(quote);
  if (!key) return true;

  return existing.some(item => {
    const text =
      typeof item === "string"
        ? item
        : item?.quote || item?.text || "";

    const existingKey = quoteKey(text);
    if (!existingKey) return false;
    if (existingKey === key) return true;

    return (
      key.length > 30 &&
      existingKey.length > 30 &&
      (key.includes(existingKey) || existingKey.includes(key))
    );
  });
}

function prepareLegacyQuote(value) {
  const quote = cleanText(value);
  if (!quote) return null;

  return {
    quote,
    text: quote,
    verified: false,
    legacy: true
  };
}

function prepareVerifiedQuote(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  // Fail closed: structured records must be explicitly verified.
  if (value.verified !== true) return null;

  const quote = cleanText(value.quote || value.text || "");
  if (!quote) return null;

  const result = {
    quote,
    text: quote,
    verified: true,
    legacy: false
  };

  const character = cleanText(value.character);
  const actor = cleanText(value.actor);

  if (character) result.character = character;
  if (actor) result.actor = actor;

  return result;
}

function prepareVaultQuotes(vaultQuotes, limit = 8) {
  if (!Array.isArray(vaultQuotes)) return [];

  const prepared = [];

  for (const item of vaultQuotes) {
    const record =
      typeof item === "string"
        ? prepareLegacyQuote(item)
        : prepareVerifiedQuote(item);

    if (!record) continue;
    if (isDuplicateQuote(record.quote, prepared)) continue;

    prepared.push(record);
    if (prepared.length >= limit) break;
  }

  return prepared;
}

function buildPublicResponse(movie, year, prepared) {
  const quotes = prepared.map(item => item.quote);

  const quoteDetails = prepared.map(item => {
    const detail = {
      quote: item.quote,
      verified: item.verified === true
    };

    if (item.character) detail.character = item.character;
    if (item.actor) detail.actor = item.actor;
    if (item.legacy === true) detail.legacy = true;

    return detail;
  });

  const verifiedCount =
    quoteDetails.filter(item => item.verified === true).length;

  const legacyCount =
    quoteDetails.filter(item => item.legacy === true).length;

  let source = "No Reelwise quotes available";

  if (verifiedCount && legacyCount) {
    source = "Reelwise Verified Vault + Legacy Vault";
  } else if (verifiedCount) {
    source = "Reelwise Verified Vault";
  } else if (legacyCount) {
    source = "Reelwise Legacy Vault";
  }

  return {
    movie,
    year,
    quotes,
    quoteDetails,
    source,
    curated: prepared.length > 0,
    verified:
      prepared.length > 0 &&
      verifiedCount === prepared.length,
    verifiedCount,
    legacyCount
  };
}

export default async function handler(req, res) {
  try {
    const id = String(req.query?.id || "").trim();

    if (!id) {
      return res.status(400).json({
        error: "Movie ID is required.",
        quotes: [],
        quoteDetails: []
      });
    }

    // TMDB identifies the exact movie before the Vault is consulted.
    const movie = await getMovie(id);

    const title =
      movie.title ||
      movie.original_title ||
      "";

    const year =
      movie.release_date
        ? movie.release_date.slice(0, 4)
        : "";

    const key = normalizeTitle(title);
    const vaultQuotes = QUOTE_VAULT[key];

    /*
      Public quotes now come ONLY from the Reelwise Vault.
      No automatic Wikiquote/web fallback is permitted.
    */
    const prepared = prepareVaultQuotes(vaultQuotes, 8);

    return res.status(200).json(
      buildPublicResponse(title, year, prepared)
    );

  } catch (error) {
    console.error("Reelwise quotes error:", error);

    return res.status(500).json({
      error:
        error.message ||
        "Quotes could not be loaded.",
      quotes: [],
      quoteDetails: []
    });
  }
}

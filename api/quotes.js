import QUOTE_VAULT from "../data/quotes.js";
import { neon } from "@neondatabase/serverless";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

function normalizeTitle(value) {
  return String(value || "").toLowerCase().trim().replace(/[’]/g, "'").replace(/\s+/g, " ");
}
async function getMovie(id) {
  if (!TOKEN) throw new Error("TMDB token is not configured");
  const response = await fetch(`https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}?language=en-US`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: "application/json" }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.status_message || "Movie lookup failed");
  return data;
}
function cleanText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function quoteKey(value) { return cleanText(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); }
function isDuplicateQuote(quote, existing) {
  const key = quoteKey(quote);
  if (!key) return true;
  return existing.some(item => {
    const text = typeof item === "string" ? item : item?.quote || item?.text || "";
    const existingKey = quoteKey(text);
    if (!existingKey) return false;
    if (existingKey === key) return true;
    return key.length > 30 && existingKey.length > 30 &&
      (key.includes(existingKey) || existingKey.includes(key));
  });
}
function prepareLegacyQuote(value) {
  const quote = cleanText(value);
  return quote ? { quote, text: quote, verified: false, legacy: true } : null;
}
function prepareVerifiedQuote(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.verified !== true) return null;
  const quote = cleanText(value.quote || value.text || "");
  if (!quote) return null;
  const result = { quote, text: quote, verified: true, legacy: false };
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
    const record = typeof item === "string" ? prepareLegacyQuote(item) : prepareVerifiedQuote(item);
    if (!record || isDuplicateQuote(record.quote, prepared)) continue;
    prepared.push(record);
    if (prepared.length >= limit) break;
  }
  return prepared;
}
function buildPublicResponse(movie, year, prepared) {
  const quotes = prepared.map(item => item.quote);
  const quoteDetails = prepared.map(item => {
    const detail = { quote: item.quote, verified: item.verified === true };
    if (item.character) detail.character = item.character;
    if (item.actor) detail.actor = item.actor;
    if (item.legacy === true) detail.legacy = true;
    return detail;
  });
  const verifiedCount = quoteDetails.filter(item => item.verified === true).length;
  const legacyCount = quoteDetails.filter(item => item.legacy === true).length;
  let source = "No Reelwise quotes available";
  if (verifiedCount && legacyCount) source = "Reelwise Verified Vault + Legacy Vault";
  else if (verifiedCount) source = "Reelwise Verified Vault";
  else if (legacyCount) source = "Reelwise Legacy Vault";
  return {
    movie, year, quotes, quoteDetails, source, curated: prepared.length > 0,
    verified: prepared.length > 0 && verifiedCount === prepared.length,
    verifiedCount, legacyCount
  };
}

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}
function candidateMode(req) {
  return cleanText(req.query?.action).toLowerCase() === "candidates";
}
async function handleCandidates(req, res) {
  const sql = getSql();

  if (req.method === "GET") {
    const tmdbMovieId = cleanText(req.query?.tmdb_movie_id || req.query?.id);
    const reviewStatus = cleanText(req.query?.review_status);
    let rows;
    if (tmdbMovieId && reviewStatus) {
      rows = await sql`SELECT * FROM reelwise_quote_candidates WHERE tmdb_movie_id = ${tmdbMovieId} AND review_status = ${reviewStatus} ORDER BY created_at DESC LIMIT 100`;
    } else if (tmdbMovieId) {
      rows = await sql`SELECT * FROM reelwise_quote_candidates WHERE tmdb_movie_id = ${tmdbMovieId} ORDER BY created_at DESC LIMIT 100`;
    } else if (reviewStatus) {
      rows = await sql`SELECT * FROM reelwise_quote_candidates WHERE review_status = ${reviewStatus} ORDER BY created_at DESC LIMIT 100`;
    } else {
      rows = await sql`SELECT * FROM reelwise_quote_candidates ORDER BY created_at DESC LIMIT 100`;
    }
    return res.status(200).json({ candidates: rows, count: rows.length });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const tmdbMovieId = cleanText(body.tmdb_movie_id);
    const movieTitle = cleanText(body.movie_title);
    const candidateText = cleanText(body.candidate_text);
    if (!tmdbMovieId || !movieTitle || !candidateText) {
      return res.status(400).json({ error: "tmdb_movie_id, movie_title, and candidate_text are required." });
    }
    const characterName = cleanText(body.character_name) || null;
    const actorName = cleanText(body.actor_name) || null;
    const sourceType = cleanText(body.source_type) || null;
    const sourceReference = cleanText(body.source_reference) || null;
    const rows = await sql`
      INSERT INTO reelwise_quote_candidates
        (tmdb_movie_id, movie_title, candidate_text, character_name, actor_name, source_type, source_reference, review_status)
      VALUES
        (${tmdbMovieId}, ${movieTitle}, ${candidateText}, ${characterName}, ${actorName}, ${sourceType}, ${sourceReference}, 'pending')
      ON CONFLICT (tmdb_movie_id, candidate_text)
      DO UPDATE SET
        movie_title = EXCLUDED.movie_title,
        character_name = COALESCE(EXCLUDED.character_name, reelwise_quote_candidates.character_name),
        actor_name = COALESCE(EXCLUDED.actor_name, reelwise_quote_candidates.actor_name),
        source_type = COALESCE(EXCLUDED.source_type, reelwise_quote_candidates.source_type),
        source_reference = COALESCE(EXCLUDED.source_reference, reelwise_quote_candidates.source_reference),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    return res.status(200).json({ candidate: rows[0], saved: true });
  }

  if (req.method === "PATCH") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const id = cleanText(body.id);
    const reviewStatus = cleanText(body.review_status).toLowerCase();
    const allowed = ["pending", "approved", "rejected", "needs_review"];
    if (!id || !allowed.includes(reviewStatus)) {
      return res.status(400).json({ error: "A candidate id and valid review_status are required." });
    }
    const rows = await sql`
      UPDATE reelwise_quote_candidates
      SET review_status = ${reviewStatus}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: "Quote candidate was not found." });
    return res.status(200).json({ candidate: rows[0], updated: true });
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH"]);
  return res.status(405).json({ error: "Method not allowed." });
}

export default async function handler(req, res) {
  try {
    // Candidate database mode: /api/quotes?action=candidates
    if (candidateMode(req)) return await handleCandidates(req, res);

    // Existing public quote mode: /api/quotes?id=<TMDB movie id>
    const id = String(req.query?.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Movie ID is required.", quotes: [], quoteDetails: [] });
    }

    const movie = await getMovie(id);
    const title = movie.title || movie.original_title || "";
    const year = movie.release_date ? movie.release_date.slice(0, 4) : "";
    const key = normalizeTitle(title);
    const vaultQuotes = QUOTE_VAULT[key];
    const prepared = prepareVaultQuotes(vaultQuotes, 8);

    return res.status(200).json(buildPublicResponse(title, year, prepared));
  } catch (error) {
    console.error("Reelwise quotes error:", error);
    return res.status(500).json({
      error: error.message || "Quotes could not be loaded.",
      quotes: [],
      quoteDetails: []
    });
  }
}

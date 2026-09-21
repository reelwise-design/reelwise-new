import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({
        success: false,
        error: "DATABASE_URL is not configured"
      });
    }

    // =========================================================
    // GET — retrieve quote candidates
    // =========================================================
    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          id,
          tmdb_movie_id,
          movie_title,
          release_year,
          candidate_text,
          possible_character,
          possible_actor,
          discovery_source,
          source_reference,
          review_status,
          discovered_at,
          reviewed_at
        FROM reelwise_quote_candidates
        ORDER BY discovered_at DESC
        LIMIT 100
      `;

      return res.status(200).json({
        success: true,
        count: rows.length,
        candidates: rows
      });
    }

    // =========================================================
    // POST — save a new candidate for later verification
    // =========================================================
    if (req.method === "POST") {
      const {
        tmdb_movie_id,
        movie_title,
        release_year,
        candidate_text,
        possible_character,
        possible_actor,
        discovery_source,
        source_reference
      } = req.body || {};

      if (!tmdb_movie_id || !movie_title || !candidate_text) {
        return res.status(400).json({
          success: false,
          error:
            "tmdb_movie_id, movie_title and candidate_text are required"
        });
      }

      const rows = await sql`
        INSERT INTO reelwise_quote_candidates (
          tmdb_movie_id,
          movie_title,
          release_year,
          candidate_text,
          possible_character,
          possible_actor,
          discovery_source,
          source_reference,
          review_status
        )
        VALUES (
          ${tmdb_movie_id},
          ${movie_title},
          ${release_year || null},
          ${candidate_text},
          ${possible_character || null},
          ${possible_actor || null},
          ${discovery_source || null},
          ${source_reference || null},
          'pending'
        )
        ON CONFLICT (tmdb_movie_id, candidate_text)
        DO NOTHING
        RETURNING *
      `;

      return res.status(200).json({
        success: true,
        inserted: rows.length === 1,
        candidate: rows[0] || null
      });
    }

    res.setHeader("Allow", ["GET", "POST"]);

    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  } catch (error) {
    console.error("Quote candidate database error:", error);

    return res.status(500).json({
      success: false,
      error: "Database request failed"
    });
  }
}

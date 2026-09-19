const token = process.env.TMDB_READ_ACCESS_TOKEN;

const OSCARBASE = "https://api.oscarbase.com/api";

/*
  ============================================================
  TMDB PERSON LOOKUP
  ============================================================
*/

async function tmdbPerson(id) {
  if (!token) {
    throw new Error("TMDB token is not configured");
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/person/${encodeURIComponent(id)}?append_to_response=movie_credits&language=en-US`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.status_message ||
      "Person lookup failed"
    );
  }

  return data;
}

/*
  ============================================================
  OSCARBASE
  ============================================================
*/

async function oscarbase(path) {
  const response = await fetch(
    `${OSCARBASE}${path}`,
    {
      headers: {
        accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `OscarBase request failed: ${response.status}`
    );
  }

  return response.json();
}

/*
  ============================================================
  ACTOR ACCOLADES
  ============================================================
*/

async function getAccolades(tmdbPersonId) {
  /*
    Find OscarBase's nominee record using
    the same TMDB person ID Reelwise uses.
  */

  const search = await oscarbase(
    `/nominees?tmdb_person_id=${encodeURIComponent(tmdbPersonId)}&limit=5`
  );

  const nominees = Array.isArray(search)
    ? search
    : Array.isArray(search?.data)
      ? search.data
      : [];

  const nominee =
    nominees.find(
      item =>
        Number(item?.tmdb_person_id) ===
        Number(tmdbPersonId)
    ) ||
    nominees[0] ||
    null;

  /*
    No OscarBase nominee means this person
    has no Academy Award nomination history
    available in the database.
  */

  if (!nominee || !nominee.id) {
    return {
      found: false,
      tmdb_person_id: Number(tmdbPersonId),
      nominations: 0,
      wins: 0,
      history: []
    };
  }

  /*
    Fetch the complete Oscar history
    for this nominee.
  */

  const detailResponse = await oscarbase(
    `/nominees/${encodeURIComponent(nominee.id)}`
  );

  const detail =
    detailResponse?.data &&
    !Array.isArray(detailResponse.data)
      ? detailResponse.data
      : detailResponse;

  const nominations =
    Array.isArray(detail?.nominations)
      ? detail.nominations
      : [];

  /*
    Normalize OscarBase nomination records
    into a simple format for Reelwise.
  */

  const history = nominations
    .map(item => ({
      id: item?.id || null,

      year:
        Number(
          item?.ceremony_year ||
          item?.year
        ) || null,

      category:
        String(
          item?.category ||
          item?.category_name ||
          ""
        ).trim(),

      movie:
        String(
          item?.movie ||
          item?.movie_title ||
          ""
        ).trim(),

      winner:
        item?.winner === true ||
        item?.winner === 1 ||
        String(item?.winner)
          .toLowerCase() === "true"
    }))
    .filter(item =>
      item.category ||
      item.movie
    )
    .sort((a, b) =>
      (b.year || 0) - (a.year || 0)
    );

  const wins =
    history.filter(item => item.winner);

  return {
    found: history.length > 0,

    person: {
      name:
        detail?.name ||
        nominee?.name ||
        "",

      tmdb_person_id:
        Number(tmdbPersonId)
    },

    nominations: history.length,

    wins: wins.length,

    history
  };
}

/*
  ============================================================
  MAIN REELWISE PERSON API
  ============================================================
*/

export default async function handler(req, res) {
  const id = req.query.id;

  if (!id) {
    return res.status(400).json({
      error: "Missing person id"
    });
  }

  const mode =
    String(
      req.query?.mode || "person"
    ).toLowerCase();

  /*
    ==========================================================
    ACCOLADES MODE

    Example:
    /api/person?id=1158&mode=accolades

    The ID remains the person's TMDB ID.
    ==========================================================
  */

  if (mode === "accolades") {
    try {
      const accolades =
        await getAccolades(id);

      res.setHeader(
        "Cache-Control",
        "s-maxage=86400, stale-while-revalidate=604800"
      );

      return res
        .status(200)
        .json(accolades);

    } catch (error) {
      console.error(
        "Reelwise accolades lookup error:",
        error
      );

      /*
        OscarBase being unavailable should
        never break the star page itself.
      */

      return res.status(200).json({
        found: false,
        tmdb_person_id: Number(id),
        nominations: 0,
        wins: 0,
        history: [],
        unavailable: true
      });
    }
  }

  /*
    ==========================================================
    NORMAL PERSON LOOKUP

    This preserves the exact functionality
    Reelwise already had.
    ==========================================================
  */

  try {
    const data =
      await tmdbPerson(id);

    return res
      .status(200)
      .json(data);

  } catch (error) {
    console.error(
      "Reelwise person API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Person lookup failed"
    });
  }
}

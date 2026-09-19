const token = process.env.TMDB_READ_ACCESS_TOKEN;

const OSCARBASE = "https://api.oscarbase.com/api";

async function tmdbPerson(id) {
  if (!token) throw new Error("TMDB token is not configured");

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
    throw new Error(data.status_message || "Person lookup failed");
  }

  return data;
}

async function oscarbase(path) {
  const response = await fetch(`${OSCARBASE}${path}`, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`OscarBase request failed: ${response.status}`);
  }

  return response.json();
}

async function getAccolades(tmdbPersonId) {
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
      item => Number(item?.tmdb_person_id) === Number(tmdbPersonId)
    ) ||
    nominees[0] ||
    null;

  if (!nominee || !nominee.id) {
    return {
      found: false,
      tmdb_person_id: Number(tmdbPersonId),
      nominations: 0,
      wins: 0,
      history: []
    };
  }

  const detailResponse = await oscarbase(
    `/nominees/${encodeURIComponent(nominee.id)}`
  );

  const detail =
    detailResponse?.data && !Array.isArray(detailResponse.data)
      ? detailResponse.data
      : detailResponse;

  const nominations = Array.isArray(detail?.nominations)
    ? detail.nominations
    : [];

  const history = nominations
    .map(item => ({
      id: item?.id || null,
      year: Number(item?.ceremony_year || item?.year) || null,
      category: String(
        item?.category || item?.category_name || ""
      ).trim(),
      movie: String(
        item?.movie || item?.movie_title || ""
      ).trim(),
      winner:
        item?.winner === true ||
        item?.winner === 1 ||
        String(item?.winner).toLowerCase() === "true"
    }))
    .filter(item => item.category || item.movie)
    .sort((a, b) => (b.year || 0) - (a.year || 0));

  const wins = history.filter(item => item.winner);

  return {
    found: history.length > 0,
    person: {
      name: detail?.name || nominee?.name || "",
      tmdb_person_id: Number(tmdbPersonId)
    },
    nominations: history.length,
    wins: wins.length,
    history
  };
}

/*
  ============================================================
  REELWISE SPOTLIGHT BIO
  ============================================================
*/

function uniqueMovies(movies) {
  const seen = new Set();

  return movies.filter(movie => {
    const key = String(movie?.title || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getSignatureMovies(person) {
  const cast = Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];

  const ranked = cast
    .filter(movie =>
      movie &&
      movie.title &&
      movie.release_date &&
      Number(movie.vote_count || 0) >= 100
    )
    .map(movie => {
      const votes = Number(movie.vote_count || 0);
      const rating = Number(movie.vote_average || 0);
      const popularity = Number(movie.popularity || 0);
      const billing = Number.isFinite(Number(movie.order))
        ? Number(movie.order)
        : 20;

      let billingScore = 0;
      if (billing === 0) billingScore = 65;
      else if (billing === 1) billingScore = 55;
      else if (billing === 2) billingScore = 45;
      else if (billing <= 5) billingScore = 30;

      const score =
        billingScore +
        Math.log10(Math.max(votes, 1)) * 18 +
        rating * 3 +
        Math.log10(Math.max(popularity, 1)) * 4;

      return { ...movie, reelwise_score: score };
    })
    .sort((a, b) => b.reelwise_score - a.reelwise_score);

  return uniqueMovies(ranked).slice(0, 6);
}

function movieList(movies) {
  const titles = movies
    .map(movie => String(movie?.title || "").trim())
    .filter(Boolean);

  if (!titles.length) return "";
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;

  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

function buildReelwiseBio(person, accolades) {
  const name = String(person?.name || "").trim();
  if (!name) return "";

  const titles = movieList(getSignatureMovies(person));

  let bio = titles
    ? `${name} is known for a film career that includes ${titles}.`
    : `${name} has built a notable career in movies.`;

  const wins = Number(accolades?.wins || 0);
  const nominations = Number(accolades?.nominations || 0);

  if (wins > 0) {
    bio += ` The Academy has recognized that work with ${wins} Oscar ${wins === 1 ? "win" : "wins"} from ${nominations} ${nominations === 1 ? "nomination" : "nominations"}.`;
  } else if (nominations > 0) {
    bio += ` The Academy has recognized that work with ${nominations} Oscar ${nominations === 1 ? "nomination" : "nominations"}.`;
  }

  return bio;
}

export default async function handler(req, res) {
  const id = req.query.id;

  if (!id) {
    return res.status(400).json({ error: "Missing person id" });
  }

  const mode = String(req.query?.mode || "person").toLowerCase();

  if (mode === "accolades") {
    try {
      const accolades = await getAccolades(id);

      res.setHeader(
        "Cache-Control",
        "s-maxage=86400, stale-while-revalidate=604800"
      );

      return res.status(200).json(accolades);
    } catch (error) {
      console.error("Reelwise accolades lookup error:", error);

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

  try {
    const data = await tmdbPerson(id);

    let accolades = {
      found: false,
      nominations: 0,
      wins: 0,
      history: []
    };

    try {
      accolades = await getAccolades(id);
    } catch (awardError) {
      console.warn("Reelwise bio awards unavailable:", awardError);
    }

    data.reelwise_bio = buildReelwiseBio(data, accolades);
    data.reelwise_academy_awards = {
      wins: Number(accolades?.wins || 0),
      nominations: Number(accolades?.nominations || 0)
    };

    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800"
    );

    return res.status(200).json(data);
  } catch (error) {
    console.error("Reelwise person API error:", error);

    return res.status(500).json({
      error: error.message || "Person lookup failed"
    });
  }
}

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

function cleanBiography(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitSentences(value) {
  const clean = cleanBiography(value);
  if (!clean) return [];
  return clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) || [];
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeMovies(movies) {
  const seen = new Set();
  return movies.filter(movie => {
    const key = normalizeTitle(movie?.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCareerYears(person) {
  const cast = Array.isArray(person?.movie_credits?.cast) ? person.movie_credits.cast : [];
  const years = cast
    .map(movie => Number(String(movie?.release_date || "").slice(0, 4)))
    .filter(year => year >= 1900 && year <= new Date().getFullYear() + 2);

  if (!years.length) return null;

  return {
    first: Math.min(...years),
    last: Math.max(...years)
  };
}

function getBiographyTitleSignals(person) {
  const biography = cleanBiography(person?.biography);
  const normalizedBio = normalizeTitle(biography);
  const cast = Array.isArray(person?.movie_credits?.cast) ? person.movie_credits.cast : [];

  return dedupeMovies(
    cast
      .filter(movie => {
        const key = normalizeTitle(movie?.title);
        return key.length >= 3 && normalizedBio.includes(key);
      })
      .map(movie => {
        const key = normalizeTitle(movie.title);
        const position = normalizedBio.indexOf(key);

        /*
          Titles appearing earlier in the biography receive a
          modest editorial signal, but never enough to dominate
          the structured career score by themselves.
        */
        const bioSignal =
          position >= 0
            ? Math.max(0, 30 - Math.floor(position / 90))
            : 0;

        return { ...movie, bioSignal };
      })
  );
}

function getDefiningMovies(person, accolades) {
  const cast = Array.isArray(person?.movie_credits?.cast) ? person.movie_credits.cast : [];
  const bioSignals = getBiographyTitleSignals(person);
  const bioMap = new Map(
    bioSignals.map(movie => [normalizeTitle(movie.title), Number(movie.bioSignal || 0)])
  );

  const oscarTitles = new Map();

  if (Array.isArray(accolades?.history)) {
    for (const item of accolades.history) {
      const key = normalizeTitle(item?.movie);
      if (!key) continue;

      const current = oscarTitles.get(key) || 0;
      const awardScore = item?.winner ? 95 : 48;
      oscarTitles.set(key, Math.max(current, awardScore));
    }
  }

  const scored = cast
    .filter(movie =>
      movie &&
      movie.title &&
      movie.release_date &&
      Number(movie.vote_count || 0) >= 100
    )
    .map(movie => {
      const key = normalizeTitle(movie.title);
      const votes = Number(movie.vote_count || 0);
      const rating = Number(movie.vote_average || 0);
      const popularity = Number(movie.popularity || 0);
      const order = Number.isFinite(Number(movie.order)) ? Number(movie.order) : 99;

      let billingScore = 0;
      if (order === 0) billingScore = 52;
      else if (order === 1) billingScore = 46;
      else if (order === 2) billingScore = 40;
      else if (order <= 5) billingScore = 24;
      else if (order <= 10) billingScore = 8;

      const audienceScore =
        Math.log10(Math.max(votes, 1)) * 12 +
        Math.max(0, rating - 5) * 4 +
        Math.log10(Math.max(popularity, 1)) * 2;

      const bioScore = bioMap.get(key) || 0;
      const oscarScore = oscarTitles.get(key) || 0;

      /*
        Oscar recognition + substantial billing are strong
        evidence that a film is career-defining. Audience
        popularity is deliberately a secondary signal.
      */
      const score =
        billingScore +
        audienceScore +
        bioScore +
        oscarScore;

      return { ...movie, reelwise_score: score };
    })
    .sort((a, b) => b.reelwise_score - a.reelwise_score);

  /*
    Keep the bio selective: at most five films.
  */
  return dedupeMovies(scored).slice(0, 5);
}

function formatFilmList(movies) {
  const titles = movies.map(movie => movie.title).filter(Boolean);

  if (!titles.length) return "";
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;

  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

function findCollaborationSentence(person) {
  const sentences = splitSentences(person?.biography);

  const candidates = sentences.filter(sentence =>
    /\bcollaborat|\bdirector|\bworked with|\bfilms? with\b/i.test(sentence) &&
    !/\bacademy award|\boscar|\bnomination|\bnominated/i.test(sentence) &&
    sentence.length <= 230
  );

  if (!candidates.length) return "";

  /*
    Prefer concise collaboration language, not filmography dumps.
  */
  return candidates.sort((a, b) => a.length - b.length)[0];
}

function academyRecognition(accolades) {
  const wins = Number(accolades?.wins || 0);
  const nominations = Number(accolades?.nominations || 0);

  if (wins > 0) {
    return `The Academy has recognized the work with ${wins} Oscar ${wins === 1 ? "win" : "wins"} from ${nominations} ${nominations === 1 ? "nomination" : "nominations"}.`;
  }

  if (nominations > 0) {
    return `The Academy has recognized the work with ${nominations} Oscar ${nominations === 1 ? "nomination" : "nominations"}.`;
  }

  return "";
}

/*
  ============================================================
  REELWISE BIO ENGINE 4.0
  ============================================================

  This engine COMPOSES a short biography instead of selecting
  entire source-biography sentences.

  Structure:
    1. Identity / career scope
    2. 3-5 defining films
    3. Collaboration context when concise and useful
    4. One short awards statement maximum

  The result is intentionally designed for a mobile star card.
*/

function buildReelwiseBio(person, accolades) {
  const name = String(person?.name || "").trim();
  if (!name) return "";

  const department = String(person?.known_for_department || "Acting").trim().toLowerCase();
  const movies = getDefiningMovies(person, accolades);
  const films = formatFilmList(movies);
  const years = getCareerYears(person);

  let identity;

  if (department === "directing") {
    identity = `${name} is a filmmaker whose career spans`;
  } else if (department === "writing") {
    identity = `${name} is a screenwriter and filmmaker whose career spans`;
  } else {
    identity = `${name} is an actor whose film career spans`;
  }

  if (years && years.first && years.last && years.last > years.first) {
    const decades = Math.max(1, Math.floor((years.last - years.first) / 10));
    identity += ` more than ${decades} ${decades === 1 ? "decade" : "decades"}.`;
  } else {
    identity += ` a wide range of movies.`;
  }

  const parts = [identity];

  if (films) {
    parts.push(`Defining screen work includes ${films}.`);
  }

  const collaboration = findCollaborationSentence(person);

  /*
    A collaboration sentence is useful only if it adds something
    beyond the films already listed and is not itself a long list.
  */
  if (
    collaboration &&
    collaboration.length <= 190 &&
    (collaboration.match(/,/g) || []).length <= 2
  ) {
    parts.push(collaboration);
  }

  const recognition = academyRecognition(accolades);
  if (recognition) parts.push(recognition);

  let bio = parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  /*
    Hard ceiling for the profile card. Preserve whole sentences.
  */
  if (bio.length > 560) {
    const sentences = splitSentences(bio);

    while (sentences.length > 2 && sentences.join(" ").length > 560) {
      /*
        Drop collaboration before identity, films or recognition.
      */
      if (collaboration) {
        const index = sentences.findIndex(sentence =>
          normalizeTitle(sentence) === normalizeTitle(collaboration)
        );
        if (index >= 0) {
          sentences.splice(index, 1);
          continue;
        }
      }

      sentences.splice(sentences.length - 2, 1);
    }

    bio = sentences.join(" ");
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

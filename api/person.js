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
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(value) {
  const clean = cleanBiography(value);
  if (!clean) return [];

  return clean
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map(sentence => sentence.trim())
    .filter(Boolean) || [];
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isAwardsHeavy(sentence) {
  return /\bacademy award|\boscar|\bgolden globe|\bbafta|\bemmy|\bscreen actors guild|\baward|\bnomination|\bnominated|\bwon\b/i.test(sentence);
}

function isHousekeeping(sentence) {
  return /\bwas born\b|\bborn on\b|\bborn in\b|\braised in\b|\bgrew up\b|\bmother\b|\bfather\b|\bparents\b|\bchildhood\b|\battended\b|\bschool\b|\bfirst credited\b|\bfirst screen role\b|\bmade (?:his|her|their) film debut\b/i.test(sentence);
}

function academySummary(accolades) {
  const wins = Number(accolades?.wins || 0);
  const nominations = Number(accolades?.nominations || 0);

  if (wins > 0) {
    return `Academy Award recognition includes ${wins} ${wins === 1 ? "win" : "wins"} from ${nominations} ${nominations === 1 ? "nomination" : "nominations"}.`;
  }

  if (nominations > 0) {
    return `The Academy has recognized the work with ${nominations} Oscar ${nominations === 1 ? "nomination" : "nominations"}.`;
  }

  return "";
}

/*
  ============================================================
  REELWISE BIO ENGINE 3.0
  ============================================================

  Target structure:
  1. WHO THEY ARE — career identity/significance
  2. WHY MOVIE FANS KNOW THEM — defining work/collaborations
  3. RECOGNITION — one short awards statement maximum

  Awards never dominate the bio because the profile already
  has a dedicated Awards & Accolades section.
*/

function buildReelwiseBio(person, accolades) {
  const name = String(person?.name || "").trim();
  const biography = cleanBiography(person?.biography);

  if (!name || !biography) return biography;

  const sentences = splitSentences(biography);
  if (!sentences.length) return biography;

  const cast = Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];

  const credits = cast
    .map(movie => ({
      title: String(movie?.title || "").trim(),
      key: normalizeTitle(movie?.title || "")
    }))
    .filter(movie => movie.title && movie.key.length >= 3);

  const identityPatterns = [
    /\bknown for\b/i,
    /\bbest known\b/i,
    /\bacclaimed\b/i,
    /\bcelebrated\b/i,
    /\bregarded\b/i,
    /\bconsidered\b/i,
    /\bprominent\b/i,
    /\binfluential\b/i,
    /\bactor\b/i,
    /\bactress\b/i,
    /\bfilmmaker\b/i,
    /\bdirector\b/i,
    /\bcomedian\b/i,
    /\bproducer\b/i
  ];

  const workPatterns = [
    /\bperformance/i,
    /\brole/i,
    /\bstarred\b/i,
    /\bportray/i,
    /\bcollaborat/i,
    /\bworked with\b/i,
    /\bdirected by\b/i,
    /\bfilmography\b/i,
    /\bcareer\b/i
  ];

  const analyzed = sentences.map((sentence, index) => {
    const normalized = normalizeTitle(sentence);

    const movieCount = credits.filter(movie =>
      normalized.includes(movie.key)
    ).length;

    const identity =
      identityPatterns.some(pattern => pattern.test(sentence));

    const work =
      workPatterns.some(pattern => pattern.test(sentence));

    const awards = isAwardsHeavy(sentence);
    const housekeeping = isHousekeeping(sentence);

    let identityScore = 0;
    let workScore = 0;

    if (identity) identityScore += 20;
    if (work) identityScore += 8;
    if (movieCount) identityScore += Math.min(movieCount, 3) * 5;
    if (index === 0) identityScore += 6;
    if (awards) identityScore -= 24;
    if (housekeeping) identityScore -= 22;

    workScore += Math.min(movieCount, 5) * 15;
    if (work) workScore += 12;
    if (identity) workScore += 5;
    if (awards) workScore -= 20;
    if (housekeeping) workScore -= 18;

    return {
      sentence,
      index,
      movieCount,
      awards,
      housekeeping,
      identityScore,
      workScore
    };
  });

  /*
    Sentence 1: career identity.
    It must not be an awards résumé or early-life sentence.
  */

  const identityCandidates = analyzed
    .filter(item => !item.awards && !item.housekeeping)
    .sort((a, b) => b.identityScore - a.identityScore);

  let identity = identityCandidates[0] || null;

  /*
    Sentence 2: defining work/collaborations.
    Prefer a different sentence containing real movie credits.
  */

  const workCandidates = analyzed
    .filter(item =>
      !item.awards &&
      !item.housekeeping &&
      (!identity || item.index !== identity.index)
    )
    .sort((a, b) => b.workScore - a.workScore);

  let work =
    workCandidates.find(item => item.movieCount > 0) ||
    workCandidates[0] ||
    null;

  /*
    If the source biography does not contain a useful identity
    sentence, create a restrained factual opener rather than
    forcing an awards sentence into that role.
  */

  const department =
    String(person?.known_for_department || "Acting").trim();

  let parts = [];

  if (identity && identity.identityScore > 0) {
    parts.push(identity.sentence);
  } else {
    if (department.toLowerCase() === "directing") {
      parts.push(`${name} is a filmmaker with a career spanning a wide range of movies.`);
    } else if (department.toLowerCase() === "writing") {
      parts.push(`${name} is a screenwriter and filmmaker with an extensive career in movies.`);
    } else {
      parts.push(`${name} is an actor with an extensive career in movies.`);
    }
  }

  if (work && work.workScore > 0) {
    parts.push(work.sentence);
  }

  /*
    Keep only one short recognition sentence.
    Prefer a concise source sentence; otherwise use OscarBase's
    structured totals. Never include a long list of nominations.
  */

  const awardCandidates = analyzed
    .filter(item => item.awards)
    .filter(item => item.sentence.length <= 220)
    .sort((a, b) => {
      const aListPenalty =
        (a.sentence.match(/\(\d{4}\)/g) || []).length * 15;
      const bListPenalty =
        (b.sentence.match(/\(\d{4}\)/g) || []).length * 15;

      return (
        (b.movieCount * 4 - bListPenalty) -
        (a.movieCount * 4 - aListPenalty)
      );
    });

  let recognition = awardCandidates[0]?.sentence || "";

  /*
    Reject award sentences that still look like nomination
    inventories. The Awards & Accolades page is the right place
    for that level of detail.
  */

  if (
    recognition &&
    (
      recognition.length > 220 ||
      (recognition.match(/,\s/g) || []).length >= 4 ||
      (recognition.match(/\(\d{4}\)/g) || []).length >= 3
    )
  ) {
    recognition = "";
  }

  if (!recognition) {
    recognition = academySummary(accolades);
  }

  if (recognition) {
    parts.push(recognition);
  }

  /*
    Remove duplicate sentences and preserve narrative order.
  */

  const seen = new Set();

  parts = parts.filter(part => {
    const key = normalizeTitle(part);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let bio = parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  /*
    The profile already displays birth date separately.
  */

  bio = bio
    .replace(
      new RegExp(
        `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\([^)]*(?:born|\\d{4})[^)]*\\)\\s*`,
        "i"
      ),
      `${name} `
    )
    .replace(/\s+/g, " ")
    .trim();

  /*
    Mobile-first length ceiling.
  */

  if (bio.length > 620) {
    const compact = splitSentences(bio).slice(0, 3);
    bio = compact.join(" ");

    if (bio.length > 620) {
      bio = bio
        .slice(0, 617)
        .replace(/\s+\S*$/, "") + "...";
    }
  }

  return bio || biography;
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

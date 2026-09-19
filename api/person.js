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

function academySentence(accolades) {
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
  REELWISE BIO ENGINE 2.0
  ============================================================

  The old version built a sentence from popularity-ranked
  movie credits. That could mistake a popular supporting film
  for a defining career film.

  This version treats the person's existing biography as the
  factual narrative source, then intelligently condenses it.

  It favors sentences containing:
  - career-defining films already named in the biography
  - awards and recognition
  - directors/collaborations
  - career identity and significance

  It removes low-value encyclopedia material such as:
  - full legal-name introductions
  - birth-date repetition
  - early-life/family details
  - isolated first-credit chronology

  TMDB credits are used only to help identify which movie
  titles mentioned in the biography are genuine film credits.
*/

function buildReelwiseBio(person, accolades) {
  const name = String(person?.name || "").trim();
  const biography = cleanBiography(person?.biography);

  if (!name || !biography) {
    return biography;
  }

  const sentences = splitSentences(biography);

  if (!sentences.length) {
    return biography;
  }

  const cast = Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];

  const creditTitles = cast
    .map(movie => String(movie?.title || "").trim())
    .filter(Boolean);

  const normalizedCredits = creditTitles.map(title => ({
    title,
    key: normalizeTitle(title)
  }));

  const lowValuePatterns = [
    /\bwas born\b/i,
    /\bborn on\b/i,
    /\bborn in\b/i,
    /\braised in\b/i,
    /\bgrew up\b/i,
    /\bmother\b/i,
    /\bfather\b/i,
    /\bparents\b/i,
    /\bchildhood\b/i,
    /\battended\b/i,
    /\bschool\b/i,
    /\bfirst credited\b/i,
    /\bfirst screen role\b/i,
    /\bmade (?:his|her|their) film debut\b/i,
    /\bfull name\b/i
  ];

  const careerPatterns = [
    /\bknown for\b/i,
    /\bbest known\b/i,
    /\bacclaimed\b/i,
    /\bcelebrated\b/i,
    /\bregarded\b/i,
    /\bprominent\b/i,
    /\binfluential\b/i,
    /\bcareer\b/i,
    /\bperformance/i,
    /\brole/i,
    /\bcollaborat/i,
    /\bdirector/i,
    /\bactor/i,
    /\bactress/i,
    /\bfilmmaker/i,
    /\bcomed/i,
    /\bdram/i
  ];

  const awardPatterns = [
    /\bacademy award/i,
    /\boscar/i,
    /\bgolden globe/i,
    /\bbafta/i,
    /\bemmy/i,
    /\bscreen actors guild/i,
    /\baward/i,
    /\bnomination/i,
    /\bwon\b/i
  ];

  const scored = sentences.map((sentence, index) => {
    const normalizedSentence = normalizeTitle(sentence);

    const mentionedMovies = normalizedCredits.filter(movie =>
      movie.key.length >= 3 &&
      normalizedSentence.includes(movie.key)
    );

    let score = 0;

    if (index === 0) score += 12;
    if (index === 1) score += 5;

    score += Math.min(mentionedMovies.length, 4) * 16;

    if (careerPatterns.some(pattern => pattern.test(sentence))) {
      score += 12;
    }

    if (awardPatterns.some(pattern => pattern.test(sentence))) {
      score += 18;
    }

    if (lowValuePatterns.some(pattern => pattern.test(sentence))) {
      score -= 22;
    }

    if (sentence.length < 45) score -= 5;
    if (sentence.length > 360) score -= 4;

    return {
      sentence,
      index,
      score,
      movieCount: mentionedMovies.length
    };
  });

  /*
    Keep a compact narrative. We choose the strongest material
    but restore its original order so it reads naturally.
  */

  let selected = scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index);

  if (!selected.length) {
    selected = scored.slice(0, 2);
  }

  /*
    Avoid opening with a sentence that is almost entirely
    biographical housekeeping. Prefer the strongest career
    sentence when available.
  */

  const strongCareer = scored
    .filter(item =>
      item.score >= 12 &&
      !lowValuePatterns.some(pattern => pattern.test(item.sentence))
    )
    .sort((a, b) => b.score - a.score)[0];

  if (
    selected.length &&
    lowValuePatterns.some(pattern => pattern.test(selected[0].sentence)) &&
    strongCareer
  ) {
    selected[0] = strongCareer;
    selected = Array.from(
      new Map(selected.map(item => [item.index, item])).values()
    ).sort((a, b) => a.index - b.index);
  }

  let bio = selected
    .map(item => item.sentence)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  /*
    The profile already displays the birth date separately.
    Remove a parenthetical birth-date clause when it appears
    near the beginning of the source biography.
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
    Keep the on-card bio readable on a phone.
  */

  if (bio.length > 700) {
    const shorter = splitSentences(bio);
    bio = shorter.slice(0, 2).join(" ");

    if (bio.length > 700) {
      bio = bio.slice(0, 697).replace(/\s+\S*$/, "") + "...";
    }
  }

  /*
    Only append Oscar information if the selected biography
    did not already discuss Academy Awards/Oscars.
  */

  const awardLine = academySentence(accolades);

  if (
    awardLine &&
    !/\bacademy award|\boscar/i.test(bio)
  ) {
    bio = `${bio} ${awardLine}`.trim();
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

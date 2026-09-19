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
    nominees.find(item => Number(item?.tmdb_person_id) === Number(tmdbPersonId)) ||
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
      category: String(item?.category || item?.category_name || "").trim(),
      movie: String(item?.movie || item?.movie_title || "").trim(),
      winner:
        item?.winner === true ||
        item?.winner === 1 ||
        String(item?.winner).toLowerCase() === "true"
    }))
    .filter(item => item.category || item.movie)
    .sort((a, b) => (b.year || 0) - (a.year || 0));

  return {
    found: history.length > 0,
    person: {
      name: detail?.name || nominee?.name || "",
      tmdb_person_id: Number(tmdbPersonId)
    },
    nominations: history.length,
    wins: history.filter(item => item.winner).length,
    history
  };
}

/*
  ============================================================
  REELWISE BIO ENGINE 7.0
  ============================================================

  Major stars can have a finished editorial Reelwise bio.
  These bios are intentionally short: 3-5 sentences.

  Everyone else uses the scalable automatic career-summary
  fallback below.

  IMPORTANT:
  - The API owns the biography.
  - index.html should display `reelwise_bio` as returned.
  - The browser should NOT rewrite or re-summarize it.
*/

function cleanBiography(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitSentences(value) {
  const clean = cleanBiography(value);
  if (!clean) return [];

  return (
    clean
      .match(/[^.!?]+[.!?]+(?:["'’”)]*)|[^.!?]+$/g)
      ?.map(sentence => sentence.trim())
      .filter(Boolean) || []
  );
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
  const cast = Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];

  const years = cast
    .map(movie => Number(String(movie?.release_date || "").slice(0, 4)))
    .filter(year => year >= 1900 && year <= new Date().getFullYear() + 2);

  if (!years.length) return null;

  return {
    first: Math.min(...years),
    last: Math.max(...years)
  };
}

/*
  ============================================================
  REELWISE CURATED CAREER INTELLIGENCE
  ============================================================

  `reelwiseBio` is the preferred path for major stars.
  Keep each one at 3-5 sentences and career-focused.
*/

const CAREER_INTELLIGENCE = {
  3: {
    name: "Harrison Ford",
    reelwiseBio:
      "Harrison Ford became one of Hollywood’s defining movie stars through iconic roles including Han Solo in Star Wars and Indiana Jones in Raiders of the Lost Ark. Before his breakthrough, he famously worked as a carpenter while taking smaller acting roles. His career includes classics such as Blade Runner, Witness, The Fugitive, and Air Force One. Known for his dry delivery and reluctant-hero persona, Ford has remained a major screen presence for more than five decades.",
    roles: ["actor", "producer"],
    signatureFilms: [
      "Star Wars",
      "Raiders of the Lost Ark",
      "Blade Runner",
      "Witness",
      "The Fugitive"
    ]
  },

  500: {
    name: "Tom Cruise",
    reelwiseBio:
      "Tom Cruise became one of Hollywood’s biggest stars after breakout roles in Risky Business and Top Gun. He went on to headline films including Rain Man, A Few Good Men, Jerry Maguire, and the Mission: Impossible series. Known for performing many of his own stunts and for his commitment to large-scale action filmmaking, Cruise has remained a major box-office star for more than four decades. His career spans action, drama, science fiction, and comedy, with multiple Academy Award nominations for acting.",
    roles: ["actor", "producer"],
    signatureFilms: [
      "Risky Business",
      "Top Gun",
      "Rain Man",
      "A Few Good Men",
      "Jerry Maguire",
      "Mission: Impossible"
    ]
  },

  16483: {
    name: "Sylvester Stallone",
    reelwiseBio:
      "Sylvester Stallone became a movie icon by writing and starring in Rocky, the underdog drama that launched one of cinema’s most enduring franchises. He created another signature character as John Rambo in First Blood and its sequels. Stallone’s career has mixed action hits with more dramatic performances, including Cop Land and Creed. As an actor, writer, and filmmaker, he has remained closely identified with characters built around perseverance, toughness, and redemption.",
    roles: ["actor", "screenwriter"],
    signatureFilms: [
      "Rocky",
      "First Blood",
      "Rocky III",
      "Cop Land",
      "Creed"
    ]
  },

  380: {
    name: "Robert De Niro",
    reelwiseBio:
      "Robert De Niro became one of the defining actors of his generation through intense, transformative performances in American cinema. His celebrated collaboration with Martin Scorsese produced films including Taxi Driver, Raging Bull, GoodFellas, and Casino. De Niro won an Academy Award for The Godfather Part II and later showed a strong comic side in films such as Meet the Parents. His career has spanned crime dramas, character studies, comedy, and independent films for more than five decades.",
    roles: ["actor", "producer"],
    signatureFilms: [
      "The Godfather Part II",
      "Taxi Driver",
      "Raging Bull",
      "GoodFellas",
      "Casino"
    ]
  },

  1158: {
    name: "Al Pacino",
    reelwiseBio:
      "Al Pacino emerged as one of the defining actors of the 1970s with performances in The Godfather, Serpico, and Dog Day Afternoon. His portrayal of Michael Corleone across The Godfather films became one of his signature screen roles. Pacino later delivered memorable performances in Scarface, Heat, and Scent of a Woman, for which he won the Academy Award for Best Actor. His career is known for intense character work, distinctive delivery, and a long association with some of American cinema’s most celebrated dramas.",
    roles: ["actor", "filmmaker"],
    signatureFilms: [
      "The Godfather",
      "The Godfather Part II",
      "Serpico",
      "Dog Day Afternoon",
      "Scarface",
      "Scent of a Woman"
    ]
  },

  5064: {
    name: "Meryl Streep",
    reelwiseBio:
      "Meryl Streep is widely known for her range and her ability to transform across dramatic, comedic, and historical roles. Her acclaimed performances include Kramer vs. Kramer, Sophie's Choice, Out of Africa, The Devil Wears Prada, and The Iron Lady. Over a career spanning several decades, she has received extensive Academy Award recognition and worked with many of the industry’s leading filmmakers. Her performances are especially associated with detailed character work, distinctive accents, and versatility across genres.",
    roles: ["actor"],
    signatureFilms: [
      "Kramer vs. Kramer",
      "Sophie's Choice",
      "Out of Africa",
      "The Devil Wears Prada",
      "The Iron Lady"
    ]
  },

  5292: {
    name: "Denzel Washington",
    reelwiseBio:
      "Denzel Washington became one of the most prominent American actors of his generation through powerful performances in drama, biography, crime, and action films. His defining roles include Glory, Malcolm X, Training Day, Remember the Titans, and Fences. Washington has also built a career behind the camera as a director and producer. Known for his commanding screen presence and precise delivery, he has remained a leading film actor for more than four decades.",
    roles: ["actor", "filmmaker"],
    signatureFilms: [
      "Glory",
      "Malcolm X",
      "Training Day",
      "Remember the Titans",
      "Fences"
    ]
  },

  1204: {
    name: "Julia Roberts",
    reelwiseBio:
      "Julia Roberts became one of Hollywood’s biggest stars after her breakthrough in Pretty Woman. She followed it with a run of major romantic comedies and dramas including My Best Friend's Wedding, Notting Hill, and Erin Brockovich, which earned her the Academy Award for Best Actress. Roberts later joined ensemble hits such as Ocean's Eleven while continuing to move between comedy and drama. Her screen persona and long run of successful films made her one of the most recognizable stars of the 1990s and 2000s.",
    roles: ["actor", "producer"],
    signatureFilms: [
      "Pretty Woman",
      "My Best Friend's Wedding",
      "Notting Hill",
      "Erin Brockovich",
      "Ocean's Eleven"
    ]
  }
};

function getCareerIntelligence(person) {
  return CAREER_INTELLIGENCE[Number(person?.id)] || null;
}

/*
  ============================================================
  AUTOMATIC CAREER FALLBACK
  ============================================================

  This does NOT pretend to be a hand-written editorial bio.
  It produces a concise 3-4 sentence career summary from
  available TMDB credits and career dates.
*/

function baseMovieScores(person) {
  const cast = Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];

  const currentYear = new Date().getFullYear();

  return dedupeMovies(cast)
    .filter(movie => {
      const title = String(movie?.title || "").trim();
      const year = Number(String(movie?.release_date || "").slice(0, 4)) || 0;

      if (!title) return false;
      if (year && year > currentYear + 2) return false;
      return true;
    })
    .map(movie => {
      const popularity = Number(movie?.popularity || 0);
      const voteCount = Number(movie?.vote_count || 0);
      const voteAverage = Number(movie?.vote_average || 0);
      const year = Number(String(movie?.release_date || "").slice(0, 4)) || 0;

      let score = 0;
      score += Math.min(40, Math.log10(voteCount + 1) * 11);
      score += Math.min(25, popularity / 5);

      if (voteAverage >= 8) score += 9;
      else if (voteAverage >= 7) score += 6;
      else if (voteAverage >= 6) score += 3;

      if (year && year <= currentYear) {
        const age = currentYear - year;
        if (age >= 10) score += 4;
        if (age >= 20) score += 3;
        if (age >= 30) score += 2;
      }

      return { ...movie, reelwise_score: score };
    })
    .sort((a, b) => b.reelwise_score - a.reelwise_score);
}

function formatFilmList(movies, limit = 4) {
  const titles = movies
    .slice(0, limit)
    .map(movie => String(movie?.title || "").trim())
    .filter(Boolean);

  if (!titles.length) return "";
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;

  return `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;
}

function automaticRoles(person) {
  const department = String(person?.known_for_department || "Acting").toLowerCase();

  if (department === "directing") return "filmmaker";
  if (department === "writing") return "screenwriter";
  if (department === "production") return "producer";
  return "actor";
}

function buildAutomaticBio(person) {
  const name = String(person?.name || "").trim();
  if (!name) return "";

  const role = automaticRoles(person);
  const years = getCareerYears(person);
  const films = baseMovieScores(person).slice(0, 4);
  const filmList = formatFilmList(films);

  const parts = [];

  if (years && years.last > years.first) {
    const span = years.last - years.first;
    const decades = Math.max(1, Math.floor(span / 10));

    parts.push(
      `${name} is a ${role} whose screen career spans more than ${decades} ${decades === 1 ? "decade" : "decades"}.`
    );
  } else {
    parts.push(`${name} is a ${role} with an established career in film.`);
  }

  if (filmList) {
    parts.push(`Notable film credits include ${filmList}.`);
  }

  const rawSentences = splitSentences(person?.biography);
  const usefulSentence = rawSentences.find(sentence => {
    if (sentence.length < 45 || sentence.length > 190) return false;
    if (/\bwas born\b|\bfamily\b|\bhigh school\b|\bcollege\b|\bchildhood\b/i.test(sentence)) {
      return false;
    }
    return /\bcareer\b|\bfilm\b|\brole\b|\bperformance\b|\bactor\b|\bdirector\b|\bstar\b/i.test(sentence);
  });

  if (usefulSentence) {
    parts.push(usefulSentence);
  }

  parts.push(
    `Reelwise focuses on the films and performances that have helped define ${name}’s screen career.`
  );

  return parts.slice(0, 4).join(" ").replace(/\s+/g, " ").trim();
}

function buildReelwiseBio(person) {
  const intelligence = getCareerIntelligence(person);

  if (intelligence?.reelwiseBio) {
    return cleanBiography(intelligence.reelwiseBio);
  }

  return buildAutomaticBio(person);
}

export default async function handler(req, res) {
  const id = req.query.id;

  if (!id) {
    return res.status(400).json({ error: "Missing person id" });
  }

  const mode = String(req.query?.mode || "person").toLowerCase();

  /*
    ==========================================================
    AWARDS / ACCOLADES MODE
    ==========================================================
  */

  if (mode === "accolades") {
    try {
      const accolades = await getAccolades(id);

      res.setHeader("Cache-Control", "no-store, max-age=0");
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

  /*
    ==========================================================
    NORMAL PERSON MODE
    ==========================================================
  */

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

    let reelwiseBio = "";

    try {
      reelwiseBio = buildReelwiseBio(data);
    } catch (bioError) {
      console.error("Reelwise bio generation error:", bioError);

      /*
        Last-resort fallback only. Keep it short.
        Never send the entire raw TMDB biography to the page.
      */
      const rawSentences = splitSentences(data?.biography);

      reelwiseBio =
        rawSentences.slice(0, 3).join(" ").trim() ||
        "Biography information is not available.";
    }

    data.reelwise_bio = String(reelwiseBio || "").trim();

    data.reelwise_academy_awards = {
      wins: Number(accolades?.wins || 0),
      nominations: Number(accolades?.nominations || 0)
    };

    res.setHeader("Cache-Control", "no-store, max-age=0");

    return res.status(200).json({
      ...data,
      reelwise_bio: data.reelwise_bio
    });
  } catch (error) {
    console.error("Reelwise person API error:", error);

    return res.status(500).json({
      error: error.message || "Person lookup failed"
    });
  }
}

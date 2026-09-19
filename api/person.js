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

function biographySignals(person) {
  const bio = cleanBiography(person?.biography);
  const normalizedBio = normalizeTitle(bio);
  const cast = Array.isArray(person?.movie_credits?.cast) ? person.movie_credits.cast : [];

  const titleSignals = new Map();

  for (const movie of cast) {
    const key = normalizeTitle(movie?.title);
    if (!key || key.length < 3) continue;

    const position = normalizedBio.indexOf(key);
    if (position < 0) continue;

    const signal = Math.max(8, 38 - Math.floor(position / 75));
    titleSignals.set(key, Math.max(titleSignals.get(key) || 0, signal));
  }

  return { bio, normalizedBio, titleSignals };
}

function oscarSignals(accolades) {
  const map = new Map();

  if (!Array.isArray(accolades?.history)) return map;

  for (const item of accolades.history) {
    const key = normalizeTitle(item?.movie);
    if (!key) continue;

    /*
      Awards are evidence of career importance, not the final
      editorial decision. Wins matter, but cannot dominate.
    */
    const score = item?.winner ? 52 : 24;
    map.set(key, Math.max(map.get(key) || 0, score));
  }

  return map;
}

function baseMovieScores(person, accolades) {
  const cast = Array.isArray(person?.movie_credits?.cast) ? person.movie_credits.cast : [];
  const { titleSignals } = biographySignals(person);
  const awards = oscarSignals(accolades);

  return dedupeMovies(
    cast
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
        const order = Number.isFinite(Number(movie.order)) ? Number(movie.order) : 99;

        let billing = 0;
        if (order === 0) billing = 58;
        else if (order === 1) billing = 50;
        else if (order === 2) billing = 42;
        else if (order <= 5) billing = 25;
        else if (order <= 10) billing = 8;

        /*
          Vote count is used as a durable recognition signal.
          Current TMDB popularity is intentionally excluded.
        */
        const recognition =
          Math.log10(Math.max(votes, 1)) * 20 +
          Math.max(0, rating - 5) * 4;

        const score =
          billing +
          recognition +
          (titleSignals.get(key) || 0) +
          (awards.get(key) || 0);

        return {
          ...movie,
          reelwise_score: score
        };
      })
      .sort((a, b) => b.reelwise_score - a.reelwise_score)
  );
}

/*
  ============================================================
  FRANCHISE / CHARACTER INTELLIGENCE
  ============================================================

  Groups obvious recurring title families so a biography does
  not waste three of five slots on sequels from one franchise.
*/

function franchiseKey(title) {
  const raw = String(title || "").trim();
  const normalized = normalizeTitle(raw);

  const explicit = [
    ["mission impossible", "Mission: Impossible"],
    ["top gun", "Top Gun"],
    ["rocky", "Rocky"],
    ["rambo", "Rambo"],
    ["creed", "Rocky / Creed"],
    ["terminator", "Terminator"],
    ["indiana jones", "Indiana Jones"],
    ["die hard", "Die Hard"],
    ["lethal weapon", "Lethal Weapon"],
    ["jurassic", "Jurassic"],
    ["fast and furious", "Fast & Furious"],
    ["fast furious", "Fast & Furious"],
    ["star wars", "Star Wars"],
    ["harry potter", "Harry Potter"],
    ["lord of the rings", "The Lord of the Rings"],
    ["hobbit", "The Hobbit"],
    ["pirates of the caribbean", "Pirates of the Caribbean"],
    ["hunger games", "The Hunger Games"],
    ["matrix", "The Matrix"],
    ["bourne", "Bourne"],
    ["spider man", "Spider-Man"],
    ["batman", "Batman"],
    ["avengers", "Avengers"],
    ["guardians of the galaxy", "Guardians of the Galaxy"],
    ["toy story", "Toy Story"],
    ["shrek", "Shrek"]
  ];

  for (const [needle, label] of explicit) {
    if (normalized.includes(needle)) {
      return { key: needle, label };
    }
  }

  /*
    Generic sequel cleanup catches numbered title families.
  */
  const generic = normalized
    .replace(/\bpart\s+(one|two|three|four|five|six|seven|eight|nine|\d+)\b/g, "")
    .replace(/\bchapter\s+\d+\b/g, "")
    .replace(/\bepisode\s+\d+\b/g, "")
    .replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b$/g, "")
    .replace(/\b\d+\b$/g, "")
    .trim();

  if (generic && generic !== normalized && generic.length >= 4) {
    return { key: generic, label: raw.replace(/\s+(?:\d+|II|III|IV|V|VI|VII|VIII|IX|X)$/i, "") };
  }

  return null;
}

function detectFranchises(scoredMovies) {
  const groups = new Map();

  for (const movie of scoredMovies) {
    const family = franchiseKey(movie.title);
    if (!family) continue;

    if (!groups.has(family.key)) {
      groups.set(family.key, {
        key: family.key,
        label: family.label,
        movies: [],
        bestScore: 0
      });
    }

    const group = groups.get(family.key);
    group.movies.push(movie);
    group.bestScore = Math.max(group.bestScore, Number(movie.reelwise_score || 0));
  }

  /*
    A real franchise signal requires multiple credited films,
    except Rocky/Creed which are one connected screen legacy.
  */
  return Array.from(groups.values())
    .filter(group =>
      group.movies.length >= 2 ||
      group.label === "Rocky / Creed"
    )
    .sort((a, b) => b.bestScore - a.bestScore);
}

function getDefiningCareer(person, accolades) {
  const scored = baseMovieScores(person, accolades);
  const franchises = detectFranchises(scored);

  /*
    Reserve at most one franchise concept in the short bio.
    This prevents franchise-heavy careers from becoming a list
    of sequels while still recognizing signature series.
  */
  const signatureFranchise = franchises[0] || null;

  const excludedTitles = new Set();

  if (signatureFranchise) {
    for (const movie of signatureFranchise.movies) {
      excludedTitles.add(normalizeTitle(movie.title));
    }
  }

  const standalone = scored
    .filter(movie => !excludedTitles.has(normalizeTitle(movie.title)))
    .slice(0, signatureFranchise ? 4 : 5);

  return {
    movies: standalone,
    franchise: signatureFranchise
  };
}

function formatFilmList(movies) {
  const titles = movies.map(movie => movie.title).filter(Boolean);

  if (!titles.length) return "";
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;

  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

function collaborationContext(person) {
  const sentences = splitSentences(person?.biography);

  const candidate = sentences
    .filter(sentence =>
      /\bcollaborat|\bworked with|\bfilms? with\b/i.test(sentence) &&
      !/\bacademy award|\boscar|\bnomination|\bnominated/i.test(sentence) &&
      sentence.length <= 220 &&
      (sentence.match(/,/g) || []).length <= 2
    )
    .sort((a, b) => a.length - b.length)[0];

  if (!candidate) return "";

  const first = candidate.match(
    /^(.+?)'?s first collaboration with (.+?) was with /i
  );

  if (first) {
    const subject = first[1].trim();
    const collaborator = first[2].trim();
    return `${subject}'s celebrated collaboration with ${collaborator} became a defining part of the career.`;
  }

  return candidate;
}

function academyRecognition(accolades) {
  const wins = Number(accolades?.wins || 0);
  const nominations = Number(accolades?.nominations || 0);

  if (wins > 0) {
    return `${wins === 1 ? "An Academy Award win" : `${wins} Academy Award wins`} and ${nominations} total ${nominations === 1 ? "nomination" : "nominations"} reflect the critical recognition earned along the way.`;
  }

  if (nominations > 0) {
    return `The work has earned ${nominations} Academy Award ${nominations === 1 ? "nomination" : "nominations"}.`;
  }

  return "";
}

function creatorSignals(person) {
  const bio = cleanBiography(person?.biography);

  return {
    writer:
      /\bscreenwriter\b|\bwriter\b|\bwrote\b|\bco-wrote\b|\bwritten by\b/i.test(bio),

    producer:
      /\bproducer\b|\bproduced\b/i.test(bio),

    director:
      /\bdirector\b|\bdirected\b/i.test(bio),

    creator:
      /\bcreated\b|\bcreator\b/i.test(bio)
  };
}

/*
  ============================================================
  REELWISE BIO ENGINE 5.0
  ============================================================

  Career-aware composition:
  - signature franchises are grouped
  - sequels do not consume multiple defining-film slots
  - current popularity is removed from the ranking
  - lead billing + durable audience recognition matter
  - Oscars support selection without controlling it
  - writer/producer/director identity can enrich the opener
*/

function buildReelwiseBio(person, accolades) {
  const name = String(person?.name || "").trim();
  if (!name) return "";

  const years = getCareerYears(person);
  const career = getDefiningCareer(person, accolades);
  const signals = creatorSignals(person);
  const department = String(person?.known_for_department || "Acting").toLowerCase();

  let roles = [];

  if (department === "directing") {
    roles.push("filmmaker");
  } else if (department === "writing") {
    roles.push("screenwriter");
  } else {
    roles.push("actor");
  }

  if (signals.writer && !roles.includes("screenwriter")) roles.push("screenwriter");
  if (signals.producer && roles.length < 3) roles.push("producer");
  if (signals.director && !roles.includes("filmmaker") && roles.length < 3) roles.push("filmmaker");

  const roleText =
    roles.length === 1
      ? roles[0]
      : roles.length === 2
        ? `${roles[0]} and ${roles[1]}`
        : `${roles.slice(0, -1).join(", ")} and ${roles[roles.length - 1]}`;

  let identity = `${name} is an acclaimed ${roleText}`;

  if (years && years.last > years.first) {
    const decades = Math.max(1, Math.floor((years.last - years.first) / 10));
    identity += ` whose film career spans more than ${decades} ${decades === 1 ? "decade" : "decades"}.`;
  } else {
    identity += ` with an extensive career in movies.`;
  }

  const parts = [identity];

  /*
    Signature franchise gets narrative treatment instead of
    appearing as several sequel titles.
  */
  if (career.franchise) {
    const label = career.franchise.label;

    if (label === "Rocky / Creed") {
      parts.push(`The Rocky and Creed films form one of the defining screen legacies of the career.`);
    } else {
      parts.push(`The ${label} films became a signature part of the career.`);
    }
  }

  const films = formatFilmList(career.movies);

  if (films) {
    parts.push(`Other defining films include ${films}.`);
  }

  /*
    Collaboration context is especially valuable for careers
    such as De Niro/Scorsese, but remains optional.
  */
  const collaboration = collaborationContext(person);

  if (collaboration) {
    parts.splice(1, 0, collaboration);
  }

  /*
    Keep awards brief because the dedicated accolades screen
    contains the full history.
  */
  const recognition = academyRecognition(accolades);
  if (recognition) parts.push(recognition);

  let bio = parts.join(" ").replace(/\s+/g, " ").trim();

  /*
    Mobile card ceiling. Remove awards first, then collaboration,
    before sacrificing the career identity or defining work.
  */
  if (bio.length > 620) {
    const withoutAwards = recognition
      ? parts.filter(part => part !== recognition)
      : [...parts];

    bio = withoutAwards.join(" ").replace(/\s+/g, " ").trim();
  }

  if (bio.length > 620 && collaboration) {
    const withoutCollab = parts.filter(
      part => part !== collaboration && part !== recognition
    );

    bio = withoutCollab.join(" ").replace(/\s+/g, " ").trim();
  }

  if (bio.length > 620) {
    bio = bio.slice(0, 617).replace(/\s+\S*$/, "") + "...";
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

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
  REELWISE CAREER INTELLIGENCE
  ============================================================

  This is not a hand-written biography database.

  It is a compact editorial fact layer for major stars where
  raw credits alone cannot reliably determine:
    - signature films
    - signature franchises
    - iconic characters
    - defining collaborators
    - creator/writer significance

  Everyone not listed here still receives a fully automatic bio.
*/

const CAREER_INTELLIGENCE = {
  380: {
    name: "Robert De Niro",
    roles: ["actor", "producer"],
    collaborationText:
      "His celebrated collaboration with Martin Scorsese produced some of his most memorable performances.",
    narrativeFilms: [],
    signatureFilms: [
      "The Godfather Part II",
      "Taxi Driver",
      "Raging Bull",
      "GoodFellas",
      "Casino"
    ]
  },

  500: {
    name: "Tom Cruise",
    roles: ["actor", "producer"],
    franchiseTexts: [
      {
        text: "Top Gun made him a global movie star.",
        films: ["Top Gun"]
      },
      {
        text: "Mission: Impossible became his signature franchise.",
        films: ["Mission: Impossible"]
      }
    ],
    signatureFilms: [
      "Top Gun",
      "A Few Good Men",
      "Jerry Maguire",
      "Mission: Impossible",
      "Top Gun: Maverick"
    ]
  },

  16483: {
    name: "Sylvester Stallone",
    roles: ["actor", "screenwriter"],
    franchiseTexts: [
      {
        text: "As the writer and star of Rocky, he created one of cinema's most enduring characters.",
        films: ["Rocky"]
      },
      {
        text: "John Rambo established another signature character and franchise.",
        films: ["First Blood", "Rambo"]
      }
    ],
    signatureFilms: [
      "Rocky",
      "First Blood",
      "Rocky III",
      "Creed",
      "Cop Land"
    ]
  },

  1158: {
    name: "Al Pacino",
    roles: ["actor", "filmmaker"],
    franchiseTexts: [
      {
        text: "Michael Corleone in The Godfather films became one of his defining screen roles.",
        films: ["The Godfather", "The Godfather Part II"]
      }
    ],
    signatureFilms: [
      "The Godfather",
      "The Godfather Part II",
      "Serpico",
      "Dog Day Afternoon",
      "Scarface",
      "Scent of a Woman"
    ]
  },

  3: {
    name: "Harrison Ford",
    roles: ["actor", "producer"],
    franchiseTexts: [
      {
        text: "Han Solo in Star Wars helped establish him as a global movie star.",
        films: ["Star Wars"]
      },
      {
        text: "Indiana Jones became his other signature screen character and franchise.",
        films: ["Raiders of the Lost Ark", "Indiana Jones"]
      }
    ],
    signatureFilms: [
      "Star Wars",
      "Raiders of the Lost Ark",
      "Blade Runner",
      "Witness",
      "The Fugitive"
    ]
  },

  5064: {
    name: "Meryl Streep",
    roles: ["actor"],
    signatureFilms: [
      "Kramer vs. Kramer",
      "Sophie's Choice",
      "The Devil Wears Prada",
      "The Iron Lady",
      "Out of Africa"
    ]
  },

  5292: {
    name: "Denzel Washington",
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
    roles: ["actor", "producer"],
    signatureFilms: [
      "Pretty Woman",
      "Erin Brockovich",
      "Notting Hill",
      "My Best Friend's Wedding",
      "Ocean's Eleven"
    ]
  }
};

function getCareerIntelligence(person) {
  const id = Number(person?.id);
  return CAREER_INTELLIGENCE[id] || null;
}

function findCreditByTitle(person, wantedTitle) {
  const cast = Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];

  const wanted = normalizeTitle(wantedTitle);

  return cast.find(movie =>
    normalizeTitle(movie?.title) === wanted
  ) || null;
}

function validatedIntelligenceFilms(person, intelligence) {
  if (!intelligence?.signatureFilms) return [];

  return intelligence.signatureFilms
    .map(title => {
      const credit = findCreditByTitle(person, title);
      return credit || { title };
    })
    .filter(movie => movie?.title);
}

/*
  ============================================================
  AUTOMATIC CAREER SCORING
  ============================================================
*/

function biographySignals(person) {
  const bio = cleanBiography(person?.biography);
  const normalizedBio = normalizeTitle(bio);
  const cast = Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];

  const titleSignals = new Map();

  for (const movie of cast) {
    const key = normalizeTitle(movie?.title);
    if (!key || key.length < 3) continue;

    const position = normalizedBio.indexOf(key);
    if (position < 0) continue;

    const signal = Math.max(8, 38 - Math.floor(position / 75));
    titleSignals.set(
      key,
      Math.max(titleSignals.get(key) || 0, signal)
    );
  }

  return { titleSignals };
}

function oscarSignals(accolades) {
  const map = new Map();

  if (!Array.isArray(accolades?.history)) return map;

  for (const item of accolades.history) {
    const key = normalizeTitle(item?.movie);
    if (!key) continue;

    const score = item?.winner ? 48 : 22;
    map.set(key, Math.max(map.get(key) || 0, score));
  }

  return map;
}

function baseMovieScores(person, accolades) {
  const cast = Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];

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
        const order = Number.isFinite(Number(movie.order))
          ? Number(movie.order)
          : 99;

        let billing = 0;

        if (order === 0) billing = 62;
        else if (order === 1) billing = 54;
        else if (order === 2) billing = 45;
        else if (order <= 5) billing = 26;
        else if (order <= 10) billing = 8;

        const durableRecognition =
          Math.log10(Math.max(votes, 1)) * 21 +
          Math.max(0, rating - 5) * 4;

        return {
          ...movie,

          reelwise_score:
            billing +
            durableRecognition +
            (titleSignals.get(key) || 0) +
            (awards.get(key) || 0)
        };
      })
      .sort((a, b) =>
        b.reelwise_score - a.reelwise_score
      )
  );
}

/*
  ============================================================
  AUTOMATIC FRANCHISE INTELLIGENCE
  ============================================================
*/

function franchiseKey(title) {
  const normalized = normalizeTitle(title);

  const families = [
    ["mission impossible", "Mission: Impossible"],
    ["top gun", "Top Gun"],
    ["rocky", "Rocky"],
    ["creed", "Rocky / Creed"],
    ["rambo", "Rambo"],
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

  for (const [needle, label] of families) {
    if (normalized.includes(needle)) {
      return { key: needle, label };
    }
  }

  return null;
}

function detectSignatureFranchise(scoredMovies) {
  const groups = new Map();

  for (const movie of scoredMovies) {
    const family = franchiseKey(movie.title);
    if (!family) continue;

    if (!groups.has(family.key)) {
      groups.set(family.key, {
        label: family.label,
        movies: [],
        score: 0
      });
    }

    const group = groups.get(family.key);
    group.movies.push(movie);
    group.score += Number(movie.reelwise_score || 0);
  }

  return Array.from(groups.values())
    .filter(group => group.movies.length >= 2)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function automaticCareer(person, accolades) {
  const scored = baseMovieScores(person, accolades);
  const franchise = detectSignatureFranchise(scored);

  const excluded = new Set(
    franchise
      ? franchise.movies.map(movie => normalizeTitle(movie.title))
      : []
  );

  const movies = scored
    .filter(movie => !excluded.has(normalizeTitle(movie.title)))
    .slice(0, franchise ? 4 : 5);

  return { movies, franchise };
}

function formatFilmList(movies) {
  const titles = movies
    .map(movie => String(movie?.title || "").trim())
    .filter(Boolean);

  if (!titles.length) return "";
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) {
    return `${titles[0]} and ${titles[1]}`;
  }

  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

function automaticCollaboration(person) {
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
    return `The work has earned ${wins} Academy Award ${wins === 1 ? "win" : "wins"} from ${nominations} ${nominations === 1 ? "nomination" : "nominations"}.`;
  }

  if (nominations > 0) {
    return `The work has earned ${nominations} Academy Award ${nominations === 1 ? "nomination" : "nominations"}.`;
  }

  return "";
}

function automaticRoles(person) {
  const bio = cleanBiography(person?.biography);
  const department =
    String(person?.known_for_department || "Acting").toLowerCase();

  const roles = [];

  if (department === "directing") roles.push("filmmaker");
  else if (department === "writing") roles.push("screenwriter");
  else roles.push("actor");

  if (
    /\bscreenwriter\b|\bwrote\b|\bco-wrote\b/i.test(bio) &&
    !roles.includes("screenwriter")
  ) {
    roles.push("screenwriter");
  }

  if (
    /\bproducer\b|\bproduced\b/i.test(bio) &&
    roles.length < 3
  ) {
    roles.push("producer");
  }

  if (
    /\bdirector\b|\bdirected\b/i.test(bio) &&
    !roles.includes("filmmaker") &&
    roles.length < 3
  ) {
    roles.push("filmmaker");
  }

  return roles;
}

function rolePhrase(roles) {
  if (!roles.length) return "movie star";
  if (roles.length === 1) return roles[0];
  if (roles.length === 2) {
    return `${roles[0]} and ${roles[1]}`;
  }

  return `${roles.slice(0, -1).join(", ")} and ${roles[roles.length - 1]}`;
}

/*
  ============================================================
  REELWISE BIO ENGINE 6.2
  ============================================================

  Hybrid architecture + multi-franchise Career Intelligence:

  Films already explained in a franchise/character sentence are
  removed from the follow-up defining-film list.

  A) CAREER INTELLIGENCE
     Editorial facts for major stars where signature-career
     knowledge matters.

  B) AUTOMATIC ENGINE
     Scalable fallback for every person in TMDB.

  The intelligence layer supplies facts, NOT finished prose.
  The same composer writes the final Reelwise biography.
*/

function buildReelwiseBio(person, accolades) {
  const name = String(person?.name || "").trim();
  if (!name) return "";

  const intelligence = getCareerIntelligence(person);
  const years = getCareerYears(person);

  const roles =
    intelligence?.roles?.length
      ? intelligence.roles
      : automaticRoles(person);

  let identity =
    `${name} is an acclaimed ${rolePhrase(roles)}`;

  if (years && years.last > years.first) {
    const decades = Math.max(
      1,
      Math.floor((years.last - years.first) / 10)
    );

    identity +=
      ` whose film career spans more than ${decades} ${decades === 1 ? "decade" : "decades"}.`;
  } else {
    identity += " with an extensive career in movies.";
  }

  const parts = [identity];

  /*
    Career Intelligence path
  */
  if (intelligence) {
    if (intelligence.collaborationText) {
      parts.push(intelligence.collaborationText);
    }

    /*
      6.2 supports more than one signature franchise/character.
      Each narrative item declares the films it already represents,
      and those titles are automatically suppressed below.
    */
    const franchiseTexts =
      Array.isArray(intelligence.franchiseTexts)
        ? intelligence.franchiseTexts
        : intelligence.franchiseText
          ? [{
              text: intelligence.franchiseText,
              films: intelligence.narrativeFilms || []
            }]
          : [];

    const narrativeTitles = new Set(
      (intelligence.narrativeFilms || [])
        .map(title => normalizeTitle(title))
        .filter(Boolean)
    );

    for (const item of franchiseTexts) {
      if (item?.text) {
        parts.push(String(item.text).trim());
      }

      for (const title of (item?.films || [])) {
        const normalized = normalizeTitle(title);
        if (normalized) narrativeTitles.add(normalized);
      }
    }

    const intelligentFilms =
      validatedIntelligenceFilms(person, intelligence)
        .filter(movie =>
          !narrativeTitles.has(normalizeTitle(movie?.title))
        );

    const films = formatFilmList(intelligentFilms);

    if (films) {
      parts.push(
        `${franchiseTexts.length ? "Other defining films" : "Defining films"} include ${films}.`
      );
    }
  }

  /*
    Fully automatic path
  */
  else {
    const career = automaticCareer(person, accolades);

    const collaboration =
      automaticCollaboration(person);

    if (collaboration) {
      parts.push(collaboration);
    }

    if (career.franchise) {
      parts.push(
        `The ${career.franchise.label} films became a signature part of the career.`
      );
    }

    const films = formatFilmList(career.movies);

    if (films) {
      parts.push(`Defining films include ${films}.`);
    }
  }

  /*
    Awards remain intentionally brief because the dedicated
    Awards & Accolades screen carries the full record.
  */
  const recognition = academyRecognition(accolades);

  if (recognition) {
    parts.push(recognition);
  }

  let bio =
    parts.join(" ").replace(/\s+/g, " ").trim();

  /*
    Mobile-first ceiling:
    awards are removed first if the card gets too long.
  */
  if (bio.length > 650 && recognition) {
    bio = parts
      .filter(part => part !== recognition)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (bio.length > 650) {
    bio =
      bio.slice(0, 647)
        .replace(/\s+\S*$/, "") +
      "...";
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

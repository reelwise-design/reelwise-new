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

  return clean
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map(s => s.trim())
    .filter(Boolean) || [];
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
    .map(movie =>
      Number(String(movie?.release_date || "").slice(0, 4))
    )
    .filter(
      year =>
        year >= 1900 &&
        year <= new Date().getFullYear() + 2
    );

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
        text:
          "As the writer and star of Rocky, he created one of cinema's most enduring characters.",
        films: ["Rocky"]
      },
      {
        text:
          "John Rambo established another signature character and franchise.",
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
        text:
          "Michael Corleone in The Godfather films became one of his defining screen roles.",
        films: [
          "The Godfather",
          "The Godfather Part II"
        ]
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
        text:
          "Han Solo in Star Wars helped establish him as a global movie star.",
        films: ["Star Wars"]
      },
      {
        text:
          "Indiana Jones became his other signature screen character and franchise.",
        films: [
          "Raiders of the Lost Ark",
          "Indiana Jones and the Temple of Doom",
          "Indiana Jones and the Last Crusade",
          "Indiana Jones and the Kingdom of the Crystal Skull",
          "Indiana Jones and the Dial of Destiny"
        ]
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

  return (
    cast.find(
      movie =>
        normalizeTitle(movie?.title) === wanted
    ) || null
  );
}

function validatedIntelligenceFilms(
  person,
  intelligence
) {
  if (!intelligence?.signatureFilms) return [];

  /*
    Career Intelligence titles are editorial facts.

    They must not disappear simply because TMDB uses
    slightly different punctuation, localization,
    or an alternate credit title.
  */

  return intelligence.signatureFilms
    .map(title => {
      const credit = findCreditByTitle(person, title);

      return credit
        ? {
            ...credit,
            title:
              String(title).trim() ||
              credit.title
          }
        : {
            title: String(title).trim()
          };
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

    const signal = Math.max(
      8,
      38 - Math.floor(position / 75)
    );

    titleSignals.set(
      key,
      Math.max(
        titleSignals.get(key) || 0,
        signal
      )
    );
  }

  return { titleSignals };
}

function oscarSignals(accolades) {
  const map = new Map();

  if (!Array.isArray(accolades?.history)) {
    return map;
  }

  for (const item of accolades.history) {
    const key = normalizeTitle(item?.movie);

    if (!key) continue;

    const score = item?.winner ? 48 : 22;

    map.set(
      key,
      Math.max(map.get(key) || 0, score)
    );
  }

  return map;
}

function baseMovieScores(person, accolades) {
  const cast = Array.isArray(person?.movie_credits?.cast)
    ? person.movie_credits.cast
    : [];

  const { titleSignals } =
    biographySignals(person);

  const academy = oscarSignals(accolades);

  const currentYear =
    new Date().getFullYear();

  return dedupeMovies(cast)
    .filter(movie => {
      const title =
        String(movie?.title || "").trim();

      const year =
        Number(
          String(
            movie?.release_date || ""
          ).slice(0, 4)
        ) || 0;

      if (!title) return false;

      if (
        year &&
        year > currentYear + 2
      ) {
        return false;
      }

      return true;
    })
    .map(movie => {
      const titleKey =
        normalizeTitle(movie.title);

      const popularity =
        Number(movie?.popularity || 0);

      const voteCount =
        Number(movie?.vote_count || 0);

      const voteAverage =
        Number(movie?.vote_average || 0);

      const year =
        Number(
          String(
            movie?.release_date || ""
          ).slice(0, 4)
        ) || 0;

      let score = 0;

      score += Math.min(
        38,
        Math.log10(voteCount + 1) * 10
      );

      score += Math.min(
        24,
        popularity / 5
      );

      if (voteAverage >= 8) {
        score += 9;
      } else if (voteAverage >= 7) {
        score += 6;
      } else if (voteAverage >= 6) {
        score += 3;
      }

      if (year && year <= currentYear) {
        const age =
          currentYear - year;

        if (age >= 10) score += 4;
        if (age >= 20) score += 4;
        if (age >= 30) score += 3;
      }

      score +=
        titleSignals.get(titleKey) || 0;

      score +=
        academy.get(titleKey) || 0;

      return {
        ...movie,
        reelwise_score: score
      };
    })
    .sort(
      (a, b) =>
        b.reelwise_score -
        a.reelwise_score
    );
}

function franchiseRoot(title) {
  let value = normalizeTitle(title);

  value = value
    .replace(
      /\b(part|chapter|episode|volume)\s+[ivx0-9]+\b/g,
      ""
    )
    .replace(
      /\b[ivx]{1,5}\b$/g,
      ""
    )
    .replace(
      /\b[0-9]+\b$/g,
      ""
    )
    .trim();

  return value;
}

function detectFranchise(scored) {
  const groups = new Map();

  for (const movie of scored) {
    const root =
      franchiseRoot(movie?.title);

    if (!root || root.length < 4) {
      continue;
    }

    if (!groups.has(root)) {
      groups.set(root, []);
    }

    groups.get(root).push(movie);
  }

  const candidates =
    [...groups.entries()]
      .filter(
        ([, movies]) =>
          movies.length >= 2
      )
      .map(([root, movies]) => ({
        root,
        movies,
        score: movies.reduce(
          (sum, movie) =>
            sum +
            Number(
              movie.reelwise_score || 0
            ),
          0
        )
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (!candidates.length) {
    return null;
  }

  const best = candidates[0];

  const representative =
    [...best.movies].sort(
      (a, b) =>
        Number(
          b.reelwise_score || 0
        ) -
        Number(
          a.reelwise_score || 0
        )
    )[0];

  return {
    root: best.root,
    label:
      representative?.title ||
      best.root,
    movies: best.movies
  };
}

function automaticCareer(
  person,
  accolades
) {
  const scored =
    baseMovieScores(person, accolades);

  const franchise =
    detectFranchise(scored);

  const excluded = new Set(
    franchise
      ? franchise.movies.map(movie =>
          normalizeTitle(movie.title)
        )
      : []
  );

  const movies = scored
    .filter(
      movie =>
        !excluded.has(
          normalizeTitle(movie.title)
        )
    )
    .slice(
      0,
      franchise ? 4 : 5
    );

  return {
    movies,
    franchise
  };
}

function formatFilmList(movies) {
  const titles = movies
    .map(movie =>
      String(movie?.title || "").trim()
    )
    .filter(Boolean);

  if (!titles.length) return "";

  if (titles.length === 1) {
    return titles[0];
  }

  if (titles.length === 2) {
    return `${titles[0]} and ${titles[1]}`;
  }

  return `${titles
    .slice(0, -1)
    .join(", ")} and ${
    titles[titles.length - 1]
  }`;
}

function automaticCollaboration(person) {
  const sentences =
    splitSentences(person?.biography);

  const candidate = sentences
    .filter(
      sentence =>
        /\bcollaborat|\bworked with|\bfilms? with\b/i.test(
          sentence
        ) &&
        !/\bacademy award|\boscar|\bnomination|\bnominated/i.test(
          sentence
        ) &&
        sentence.length <= 220 &&
        (
          sentence.match(/,/g) || []
        ).length <= 2
    )
    .sort(
      (a, b) =>
        a.length - b.length
    )[0];

  if (!candidate) return "";

  const first = candidate.match(
    /^(.+?)'?s first collaboration with (.+?) was with /i
  );

  if (first) {
    const subject =
      first[1].trim();

    const collaborator =
      first[2].trim();

    return `${subject}'s celebrated collaboration with ${collaborator} became a defining part of the career.`;
  }

  return candidate;
}

function academyRecognition(accolades) {
  const wins =
    Number(accolades?.wins || 0);

  const nominations =
    Number(
      accolades?.nominations || 0
    );

  if (wins > 0) {
    return `The work has earned ${wins} Academy Award ${
      wins === 1 ? "win" : "wins"
    } from ${nominations} ${
      nominations === 1
        ? "nomination"
        : "nominations"
    }.`;
  }

  if (nominations > 0) {
    return `The work has earned ${nominations} Academy Award ${
      nominations === 1
        ? "nomination"
        : "nominations"
    }.`;
  }

  return "";
}

function automaticRoles(person) {
  const bio =
    cleanBiography(
      person?.biography
    );

  const department =
    String(
      person?.known_for_department ||
      "Acting"
    ).toLowerCase();

  const roles = [];

  if (department === "directing") {
    roles.push("filmmaker");
  } else if (
    department === "writing"
  ) {
    roles.push("screenwriter");
  } else {
    roles.push("actor");
  }

  if (
    /\bscreenwriter\b|\bwrote\b|\bco-wrote\b/i.test(
      bio
    ) &&
    !roles.includes(
      "screenwriter"
    )
  ) {
    roles.push("screenwriter");
  }

  if (
    /\bproducer\b|\bproduced\b/i.test(
      bio
    ) &&
    roles.length < 3
  ) {
    roles.push("producer");
  }

  if (
    /\bdirector\b|\bdirected\b/i.test(
      bio
    ) &&
    !roles.includes(
      "filmmaker"
    ) &&
    roles.length < 3
  ) {
    roles.push("filmmaker");
  }

  return roles;
}

function rolePhrase(roles) {
  if (!roles.length) {
    return "movie star";
  }

  if (roles.length === 1) {
    return roles[0];
  }

  if (roles.length === 2) {
    return `${roles[0]} and ${roles[1]}`;
  }

  return `${roles
    .slice(0, -1)
    .join(", ")} and ${
    roles[roles.length - 1]
  }`;
}

/*
  ============================================================
  REELWISE BIO ENGINE 6.2.4
  ============================================================

  Hybrid architecture + multi-franchise Career Intelligence.

  Films already explained in a franchise/character
  sentence are removed from the follow-up
  defining-film list.

  A) CAREER INTELLIGENCE
     Editorial facts for major stars where
     signature-career knowledge matters.

  B) AUTOMATIC ENGINE
     Scalable fallback for every person in TMDB.

  The intelligence layer supplies facts,
  NOT finished biographies.
*/

function buildReelwiseBio(
  person,
  accolades
) {
  const name =
    String(
      person?.name || ""
    ).trim();

  if (!name) return "";

  const intelligence =
    getCareerIntelligence(person);

  const years =
    getCareerYears(person);

  const roles =
    intelligence?.roles?.length
      ? intelligence.roles
      : automaticRoles(person);

  let identity =
    `${name} is an acclaimed ${rolePhrase(
      roles
    )}`;

  if (
    years &&
    years.last > years.first
  ) {
    const decades =
      Math.max(
        1,
        Math.floor(
          (
            years.last -
            years.first
          ) / 10
        )
      );

    identity +=
      ` whose film career spans more than ${decades} ${
        decades === 1
          ? "decade"
          : "decades"
      }.`;
  } else {
    identity +=
      " with an extensive career in movies.";
  }

  const parts = [identity];

  /*
    CAREER INTELLIGENCE PATH
  */

  if (intelligence) {
    if (
      intelligence.collaborationText
    ) {
      parts.push(
        intelligence.collaborationText
      );
    }

    const franchiseTexts =
      Array.isArray(
        intelligence.franchiseTexts
      )
        ? intelligence.franchiseTexts
        : intelligence.franchiseText
          ? [
              {
                text:
                  intelligence.franchiseText,
                films:
                  intelligence.narrativeFilms ||
                  []
              }
            ]
          : [];

    const narrativeTitles =
      new Set(
        (
          intelligence.narrativeFilms ||
          []
        )
          .map(title =>
            normalizeTitle(title)
          )
          .filter(Boolean)
      );

    for (
      const item of franchiseTexts
    ) {
      if (item?.text) {
        parts.push(
          String(
            item.text
          ).trim()
        );
      }

      for (
        const title of
        item?.films || []
      ) {
        const normalized =
          normalizeTitle(title);

        if (normalized) {
          narrativeTitles.add(
            normalized
          );
        }
      }
    }

    const intelligentFilms =
      validatedIntelligenceFilms(
        person,
        intelligence
      ).filter(
        movie =>
          !narrativeTitles.has(
            normalizeTitle(
              movie?.title
            )
          )
      );

    const films =
      formatFilmList(
        intelligentFilms
      );

    if (films) {
      parts.push(
        `${
          franchiseTexts.length
            ? "Other defining films"
            : "Defining films"
        } include ${films}.`
      );
    }
  }

  /*
    FULLY AUTOMATIC PATH
  */

  else {
    const career =
      automaticCareer(
        person,
        accolades
      );

    const collaboration =
      automaticCollaboration(
        person
      );

    if (collaboration) {
      parts.push(
        collaboration
      );
    }

    if (career.franchise) {
      parts.push(
        `The ${career.franchise.label} films became a signature part of the career.`
      );
    }

    const films =
      formatFilmList(
        career.movies
      );

    if (films) {
      parts.push(
        `Defining films include ${films}.`
      );
    }
  }

  /*
    Awards remain intentionally brief
    because the dedicated Awards &
    Accolades screen carries the full record.
  */

  const recognition =
    academyRecognition(
      accolades
    );

  if (recognition) {
    parts.push(recognition);
  }

  let bio =
    parts
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  /*
    SMART LENGTH HANDLING

    Never sacrifice meaningful career
    information just to hit an arbitrary
    character ceiling.

    Priority:
      1. career identity
      2. signature characters/franchises
      3. collaborations
      4. defining films
      5. brief Academy Awards summary

    Awards are the first section removed
    for length because the dedicated
    Awards & Accolades page already
    contains the complete record.
  */

  if (
    bio.length > 650 &&
    recognition
  ) {
    bio = parts
      .filter(
        part =>
          part !== recognition
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /*
    Career Intelligence biographies can
    legitimately be longer when multiple
    franchises need context.

    Preserve complete career information
    rather than chopping off the final
    defining-film section.
  */

  const hardCeiling =
    intelligence
      ? 900
      : 720;

  if (
    bio.length > hardCeiling
  ) {
    bio =
      bio
        .slice(
          0,
          hardCeiling - 3
        )
        .replace(
          /\s+\S*$/,
          ""
        ) +
      "...";
  }

  return bio;
}

export default async function handler(
  req,
  res
) {
  const id = req.query.id;

  if (!id) {
    return res
      .status(400)
      .json({
        error:
          "Missing person id"
      });
  }

  const mode =
    String(
      req.query?.mode ||
      "person"
    ).toLowerCase();

  /*
    ==========================================================
    AWARDS / ACCOLADES MODE
    ==========================================================
  */

  if (mode === "accolades") {
    try {
      const accolades =
        await getAccolades(id);

      res.setHeader(
        "Cache-Control",
        "no-store, max-age=0"
      );

      return res
        .status(200)
        .json(accolades);
    } catch (error) {
      console.error(
        "Reelwise accolades lookup error:",
        error
      );

      return res
        .status(200)
        .json({
          found: false,
          tmdb_person_id:
            Number(id),
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
    const data =
      await tmdbPerson(id);

    let accolades = {
      found: false,
      nominations: 0,
      wins: 0,
      history: []
    };

    try {
      accolades =
        await getAccolades(id);
    } catch (awardError) {
      console.warn(
        "Reelwise bio awards unavailable:",
        awardError
      );
    }

    /*
      REELWISE BIO ENGINE 6.2.4

      The star page expects the exact
      property:

          reelwise_bio

      Bio generation is isolated from
      the profile request so a bio-engine
      problem can never force the page
      back to the raw TMDB biography.
    */

    let reelwiseBio = "";

    try {
      reelwiseBio =
        buildReelwiseBio(
          data,
          accolades
        );
    } catch (bioError) {
      console.error(
        "Reelwise bio generation error:",
        bioError
      );

      const rawBio =
        String(
          data?.biography || ""
        )
          .replace(/\s+/g, " ")
          .trim();

      const fallbackSentences =
        rawBio.match(
          /[^.!?]+[.!?]+(?:["'’”)]*)/g
        ) || [];

      reelwiseBio =
        fallbackSentences
          .slice(0, 3)
          .join(" ")
          .trim() ||
        rawBio
          .slice(0, 650)
          .trim() ||
        "Biography information is not available.";
    }

    data.reelwise_bio =
      String(
        reelwiseBio || ""
      ).trim();

    data.reelwise_academy_awards = {
      wins:
        Number(
          accolades?.wins || 0
        ),
      nominations:
        Number(
          accolades?.nominations || 0
        )
    };

    res.setHeader(
      "Cache-Control",
      "no-store, max-age=0"
    );

    return res
      .status(200)
      .json({
        ...data,
        reelwise_bio:
          data.reelwise_bio
      });
  } catch (error) {
    console.error(
      "Reelwise person API error:",
      error
    );

    return res
      .status(500)
      .json({
        error:
          error.message ||
          "Person lookup failed"
      });
  }
}

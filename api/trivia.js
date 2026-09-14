const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

async function tmdb(path) {
  let url = `https://api.themoviedb.org/3${path}`;

  const headers = {
    accept: "application/json"
  };

  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  } else if (API_KEY) {
    const separator = url.includes("?") ? "&" : "?";
    url += `${separator}api_key=${API_KEY}`;
  } else {
    throw new Error("TMDB credentials are not configured.");
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }

  return response.json();
}

async function wikipedia(params) {
  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      origin: "*",
      format: "json",
      formatversion: "2",
      ...params
    }).toString();

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Reelwise/1.0 movie-trivia"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Wikipedia request failed: ${response.status}`
    );
  }

  return response.json();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function splitSentences(text) {
  return String(text || "")
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(cleanText)
    .filter(Boolean);
}

function interestingSentence(sentence) {
  const text = sentence.toLowerCase();

  if (sentence.length < 55 || sentence.length > 320) {
    return false;
  }

  const interestingWords = [
    "cast",
    "casting",
    "actor",
    "actress",
    "role",
    "audition",
    "director",
    "filming",
    "filmed",
    "shot",
    "production",
    "scene",
    "script",
    "screenplay",
    "wrote",
    "writer",
    "originally",
    "initially",
    "original choice",
    "considered",
    "offered",
    "rejected",
    "replaced",
    "hired",
    "improvised",
    "improvisation",
    "location",
    "stunt",
    "studio",
    "development"
  ];

  const unwantedWords = [
    "box office",
    "grossed",
    "review aggregator",
    "rotten tomatoes",
    "metacritic",
    "critical response",
    "awards and nominations",
    "soundtrack album"
  ];

  if (
    unwantedWords.some(word =>
      text.includes(word)
    )
  ) {
    return false;
  }

  return interestingWords.some(word =>
    text.includes(word)
  );
}

function uniqueSentences(sentences) {
  const seen = new Set();

  return sentences.filter(sentence => {
    const key = sentence
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 160);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

async function findWikipediaPage(title, year) {
  const searchTerms = [
    `"${title}" ${year || ""} film`,
    `${title} ${year || ""} film`,
    `${title} film`
  ];

  for (const searchTerm of searchTerms) {
    const data = await wikipedia({
      action: "query",
      list: "search",
      srsearch: searchTerm,
      srlimit: "8",
      srnamespace: "0"
    });

    const results =
      data?.query?.search || [];

    if (!results.length) {
      continue;
    }

    const normalizedTitle =
      String(title).toLowerCase();

    const scored = results
      .map(result => {
        const candidate =
          String(result.title || "");

        const lower =
          candidate.toLowerCase();

        let score = 0;

        if (lower === normalizedTitle) {
          score += 20;
        }

        if (
          lower.startsWith(
            normalizedTitle + " ("
          )
        ) {
          score += 18;
        }

        if (
          lower.includes(
            normalizedTitle
          )
        ) {
          score += 10;
        }

        if (
          lower.includes("film")
        ) {
          score += 6;
        }

        if (
          year &&
          lower.includes(String(year))
        ) {
          score += 8;
        }

        return {
          ...result,
          score
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score
      );

    if (scored.length) {
      return scored[0].title;
    }
  }

  return null;
}

async function getSections(pageTitle) {
  const data = await wikipedia({
    action: "parse",
    page: pageTitle,
    prop: "sections"
  });

  return data?.parse?.sections || [];
}

async function getSectionText(
  pageTitle,
  sectionIndex
) {
  const data = await wikipedia({
    action: "parse",
    page: pageTitle,
    prop: "wikitext",
    section: String(sectionIndex)
  });

  const raw =
    data?.parse?.wikitext || "";

  return cleanWikiText(raw);
}

function cleanWikiText(text) {
  let value = String(text || "");

  value = value
    .replace(
      /<!--[\s\S]*?-->/g,
      " "
    )
    .replace(
      /<ref[^>]*>[\s\S]*?<\/ref>/gi,
      " "
    )
    .replace(
      /<ref[^/>]*\/>/gi,
      " "
    )
    .replace(
      /\{\{[\s\S]*?\}\}/g,
      " "
    )
    .replace(
      /\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g,
      "$1"
    )
    .replace(
      /\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g,
      "$1"
    )
    .replace(
      /'{2,5}/g,
      ""
    )
    .replace(
      /^=+.*?=+$/gm,
      " "
    )
    .replace(
      /<[^>]+>/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    );

  return cleanText(value);
}

function chooseRelevantSections(
  sections
) {
  const wanted = [
    "development",
    "pre-production",
    "preproduction",
    "production",
    "casting",
    "filming",
    "writing",
    "screenplay"
  ];

  const chosen = [];

  for (const section of sections) {
    const name =
      String(
        section.line || ""
      )
        .toLowerCase()
        .trim();

    if (
      wanted.some(wantedName =>
        name.includes(wantedName)
      )
    ) {
      chosen.push(section);
    }
  }

  return chosen.slice(0, 6);
}

export default async function handler(
  req,
  res
) {
  try {
    const movieId =
      req.query.id;

    if (!movieId) {
      return res.status(400).json({
        error:
          "Movie ID is required."
      });
    }

    const movie =
      await tmdb(
        `/movie/${movieId}?append_to_response=credits`
      );

    const title =
      movie.title;

    const year =
      movie.release_date
        ? movie.release_date.slice(
            0,
            4
          )
        : "";

    const pageTitle =
      await findWikipediaPage(
        title,
        year
      );

    if (!pageTitle) {
      return res.status(200).json({
        movie: {
          id: movie.id,
          title,
          year
        },
        trivia: [],
        message:
          "No reliable trivia source was found for this movie."
      });
    }

    const sections =
      await getSections(
        pageTitle
      );

    const relevantSections =
      chooseRelevantSections(
        sections
      );

    let sentences = [];

    for (
      const section
      of relevantSections
    ) {
      try {
        const text =
          await getSectionText(
            pageTitle,
            section.index
          );

        const sectionSentences =
          splitSentences(text)
            .filter(
              interestingSentence
            );

        sentences.push(
          ...sectionSentences
        );
      } catch (error) {
        console.error(
          "Wikipedia section error:",
          error
        );
      }
    }

    sentences =
      uniqueSentences(sentences)
        .slice(0, 8);

    const sourceUrl =
      "https://en.wikipedia.org/wiki/" +
      encodeURIComponent(
        pageTitle.replace(
          / /g,
          "_"
        )
      );

    const trivia =
      sentences.map(
        sentence => ({
          text: sentence,
          source:
            sourceUrl,
          sourceName:
            "Wikipedia"
        })
      );

    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800"
    );

    return res.status(200).json({
      movie: {
        id: movie.id,
        title,
        year
      },

      source: {
        name: "Wikipedia",
        page: pageTitle,
        url: sourceUrl
      },

      trivia,

      message:
        trivia.length
          ? `Found ${trivia.length} trivia items.`
          : "No suitable production trivia was found for this movie."
    });
  } catch (error) {
    console.error(
      "Trivia API error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to load Reelwise trivia."
    });
  }
}

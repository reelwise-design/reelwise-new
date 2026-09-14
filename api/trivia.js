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
    .replace(/\[[0-9]+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function stripTemplates(value) {
  let text = String(value || "");

  for (let i = 0; i < 8; i++) {
    const cleaned = text.replace(
      /\{\{[^{}]*\}\}/g,
      " "
    );

    if (cleaned === text) {
      break;
    }

    text = cleaned;
  }

  return text;
}

function cleanWikiText(text) {
  let value = String(text || "");

  value = value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<ref[^>]*>[\s\S]*?<\/ref>/gi,
      " "
    )
    .replace(
      /<ref[^/>]*\/>/gi,
      " "
    )
    .replace(
      /\{\|[\s\S]*?\|\}/g,
      " "
    )
    .replace(
      /<gallery[^>]*>[\s\S]*?<\/gallery>/gi,
      " "
    );

  value = stripTemplates(value);

  for (let i = 0; i < 8; i++) {
    const cleaned = value.replace(
      /\[\[(?:File|Image|Media):[\s\S]*?\]\]/gi,
      " "
    );

    if (cleaned === value) {
      break;
    }

    value = cleaned;
  }

  value = value
    .replace(
      /\[\[(?:Category|Help|Portal|Template):[^\]]+\]\]/gi,
      " "
    )
    .replace(
      /\[\[([^|\]]+)\|([^\]]+)\]\]/g,
      "$2"
    )
    .replace(
      /\[\[([^\]]+)\]\]/g,
      "$1"
    )
    .replace(
      /\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g,
      "$1"
    )
    .replace(
      /\[https?:\/\/[^\]]+\]/g,
      " "
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
      /^[*#:;]+/gm,
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

function splitSentences(text) {
  return String(text || "")
    .replace(/\n+/g, " ")
    .split(
      /(?<=[.!?])\s+(?=[A-Z0-9“"'(])/
    )
    .map(cleanText)
    .filter(Boolean);
}

function containsBrokenWikiFormatting(sentence) {
  const text =
    String(sentence || "").toLowerCase();

  const garbage = [
    "thumb|",
    "px|",
    "upright|",
    "alt=",
    "caption=",
    "file:",
    "image:",
    "frameless|",
    "border|",
    "thumbtime=",
    "{{",
    "}}",
    "[[",
    "]]",
    "|right",
    "|left"
  ];

  return garbage.some(item =>
    text.includes(item)
  );
}

function lacksContext(sentence) {
  const text =
    String(sentence || "")
      .trim()
      .toLowerCase();

  const vagueStarts = [
    "it was ",
    "it is ",
    "it had ",
    "it also ",
    "this was ",
    "this is ",
    "this had ",
    "this also ",
    "that was ",
    "that is ",
    "the scene was ",
    "the scene is ",
    "the role was ",
    "the role is ",
    "he was ",
    "he had ",
    "he also ",
    "she was ",
    "she had ",
    "she also ",
    "they were ",
    "they had ",
    "they also ",
    "his role ",
    "her role ",
    "their role "
  ];

  return vagueStarts.some(start =>
    text.startsWith(start)
  );
}

function quotationHeavy(sentence) {
  const quoteCharacters =
    (
      String(sentence || "").match(
        /["“”]/g
      ) || []
    ).length;

  return quoteCharacters >= 4;
}

function sentenceScore(sentence) {
  const text =
    String(sentence || "").toLowerCase();

  const weights = [
    ["improvised", 10],
    ["improvisation", 10],
    ["originally", 8],
    ["initially", 8],
    ["casting", 8],
    ["cast as", 8],
    ["audition", 8],
    ["offered the role", 9],
    ["turned down", 9],
    ["rejected", 7],
    ["replaced", 7],
    ["considered", 6],
    ["filming", 7],
    ["filmed", 7],
    ["shot", 5],
    ["scene", 6],
    ["stunt", 8],
    ["location", 5],
    ["screenplay", 5],
    ["script", 6],
    ["director", 4],
    ["production", 4],
    ["development", 5],
    ["writer", 4],
    ["role", 4]
  ];

  let score = 0;

  for (const [term, value] of weights) {
    if (text.includes(term)) {
      score += value;
    }
  }

  return score;
}

function interestingSentence(sentence) {
  const text =
    String(sentence || "").trim();

  const lower =
    text.toLowerCase();

  if (
    text.length < 60 ||
    text.length > 300
  ) {
    return false;
  }

  if (containsBrokenWikiFormatting(text)) {
    return false;
  }

  if (lacksContext(text)) {
    return false;
  }

  if (quotationHeavy(text)) {
    return false;
  }

  const unwanted = [
    "box office",
    "grossed",
    "review aggregator",
    "rotten tomatoes",
    "metacritic",
    "critical response",
    "awards and nominations",
    "soundtrack album",
    "home media",
    "references",
    "external links",
    "bibliography"
  ];

  if (
    unwanted.some(term =>
      lower.includes(term)
    )
  ) {
    return false;
  }

  return sentenceScore(text) > 0;
}

function uniqueSentences(sentences) {
  const seen = new Set();

  return sentences.filter(sentence => {
    const key = sentence
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 180);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function tidyTriviaSentence(sentence) {
  let text = cleanText(sentence);

  text = text
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text;
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
      String(title)
        .toLowerCase()
        .trim();

    const scored =
      results
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
            lower.includes(normalizedTitle)
          ) {
            score += 10;
          }

          if (lower.includes("film")) {
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

function chooseRelevantSections(sections) {
  const priority = [
    "casting",
    "filming",
    "development",
    "production",
    "pre-production",
    "preproduction",
    "writing",
    "screenplay"
  ];

  const chosen = [];

  for (const wantedName of priority) {
    for (const section of sections) {
      const name =
        String(section.line || "")
          .toLowerCase()
          .trim();

      if (
        name.includes(wantedName) &&
        !chosen.some(
          item =>
            item.index === section.index
        )
      ) {
        chosen.push(section);
      }
    }
  }

  return chosen.slice(0, 7);
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
        error: "Movie ID is required."
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
        ? movie.release_date.slice(0, 4)
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
      await getSections(pageTitle);

    const relevantSections =
      chooseRelevantSections(sections);

    let candidates = [];

    for (const section of relevantSections) {
      try {
        const text =
          await getSectionText(
            pageTitle,
            section.index
          );

        const sentences =
          splitSentences(text);

        for (const sentence of sentences) {
          if (
            interestingSentence(sentence)
          ) {
            candidates.push({
              text:
                tidyTriviaSentence(
                  sentence
                ),
              score:
                sentenceScore(
                  sentence
                ),
              section:
                section.line
            });
          }
        }

      } catch (error) {
        console.error(
          "Wikipedia section error:",
          error
        );
      }
    }

    const uniqueTexts =
      uniqueSentences(
        candidates.map(
          item => item.text
        )
      );

    candidates =
      uniqueTexts
        .map(text => {
          const original =
            candidates.find(
              item =>
                item.text === text
            );

          return {
            text,
            score:
              original?.score || 0,
            section:
              original?.section || ""
          };
        })
        .sort(
          (a, b) =>
            b.score - a.score
        )
        .slice(0, 6);

    const sourceUrl =
      "https://en.wikipedia.org/wiki/" +
      encodeURIComponent(
        pageTitle.replace(
          / /g,
          "_"
        )
      );

    const trivia =
      candidates.map(
        item => ({
          text: item.text,
          category:
            item.section ||
            "Production",
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
          ? `Found ${trivia.length} movie trivia items.`
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

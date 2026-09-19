import TRIVIA_VAULT from "../data/trivia.js";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;


/*
  ============================================================
  REELWISE TRIVIA ENGINE
  ============================================================

  1. Identify the exact movie through TMDB.
  2. Check the Reelwise curated Trivia Vault FIRST.
  3. Curated Reelwise trivia always wins.
  4. If the movie is not curated, locate its Wikipedia page.
  5. Prefer behind-the-scenes sections such as:
       - Development
       - Writing
       - Casting
       - Filming
       - Production
       - Effects
       - Design
       - Music
       - Post-production
  6. Extract interesting movie-making facts.
  7. Reject plot, box office, reviews and release information.
  8. Return up to 6 useful trivia items.
  ============================================================
*/


/* ============================================================
   TITLE HELPERS
   ============================================================ */

function normalizeTitle(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}


function looseTitle(value = "") {
  return normalizeTitle(value)
    .replace(/\(\d{4}\s+film\)/g, "")
    .replace(/\(film\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


/* ============================================================
   TMDB MOVIE LOOKUP
   ============================================================ */

async function getMovie(id) {

  if (!TOKEN) {
    throw new Error(
      "TMDB_READ_ACCESS_TOKEN is missing"
    );
  }


  const response = await fetch(
    `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}?language=en-US`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        accept: "application/json"
      }
    }
  );


  const data = await response.json();


  if (!response.ok) {
    throw new Error(
      data?.status_message ||
      `TMDB request failed: ${response.status}`
    );
  }


  return data;
}


/* ============================================================
   WIKIPEDIA REQUEST
   ============================================================ */

async function wikipediaRequest(params) {

  try {

    const query = new URLSearchParams({
      format: "json",
      formatversion: "2",
      origin: "*",
      ...params
    });


    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?${query.toString()}`,
      {
        headers: {
          "User-Agent":
            "Reelwise/1.0 movie trivia discovery"
        }
      }
    );


    if (!response.ok) {
      return null;
    }


    return await response.json();

  } catch (error) {

    console.error(
      "Wikipedia request failed:",
      error
    );

    return null;
  }
}


/* ============================================================
   GET WIKIPEDIA PAGE
   ============================================================ */

async function getWikipediaPage(title) {

  const data =
    await wikipediaRequest({
      action: "parse",
      page: title,
      prop: "sections|displaytitle",
      redirects: "1"
    });


  if (
    !data ||
    data.error ||
    !data.parse
  ) {

    return null;
  }


  return {
    title:
      data.parse.title ||
      title,

    sections:
      Array.isArray(data.parse.sections)
        ? data.parse.sections
        : []
  };
}


/* ============================================================
   GET WIKIPEDIA SECTION TEXT
   ============================================================ */

async function getWikipediaSection(
  title,
  sectionIndex
) {

  const data =
    await wikipediaRequest({
      action: "parse",
      page: title,
      prop: "wikitext",
      section: String(sectionIndex),
      redirects: "1"
    });


  if (
    !data ||
    data.error ||
    !data.parse
  ) {
    return "";
  }


  const wikitext =
    data.parse.wikitext;


  if (typeof wikitext === "string") {
    return wikitext;
  }


  if (
    wikitext &&
    typeof wikitext["*"] === "string"
  ) {
    return wikitext["*"];
  }


  return "";
}


/* ============================================================
   GET FULL ARTICLE WIKITEXT
   ============================================================ */

async function getWikipediaWikitext(title) {

  const data =
    await wikipediaRequest({
      action: "parse",
      page: title,
      prop: "wikitext",
      redirects: "1"
    });


  if (
    !data ||
    data.error ||
    !data.parse
  ) {
    return "";
  }


  const wikitext =
    data.parse.wikitext;


  if (typeof wikitext === "string") {
    return wikitext;
  }


  if (
    wikitext &&
    typeof wikitext["*"] === "string"
  ) {
    return wikitext["*"];
  }


  return "";
}


/* ============================================================
   SEARCH WIKIPEDIA
   ============================================================ */

async function searchWikipedia(
  title,
  year
) {

  const searches = [

    year
      ? `"${title}" ${year} film`
      : "",

    `"${title}" film`,

    title

  ].filter(Boolean);


  const found = [];
  const seen = new Set();


  for (const searchText of searches) {

    const data =
      await wikipediaRequest({
        action: "query",
        list: "search",
        srnamespace: "0",
        srlimit: "8",
        srsearch: searchText
      });


    const results =
      data?.query?.search || [];


    for (const result of results) {

      const candidate =
        String(
          result?.title || ""
        ).trim();


      const key =
        candidate.toLowerCase();


      if (
        !candidate ||
        seen.has(key)
      ) {
        continue;
      }


      seen.add(key);

      found.push(candidate);
    }


    if (found.length >= 15) {
      break;
    }
  }


  return found;
}


/* ============================================================
   VERIFY MOVIE PAGE
   ============================================================ */

function likelyMoviePage(
  candidate,
  title,
  year
) {

  const wanted =
    looseTitle(title);

  const got =
    looseTitle(candidate);


  if (!wanted || !got) {
    return false;
  }


  if (got === wanted) {
    return true;
  }


  if (
    got.startsWith(`${wanted} `) &&
    got.length <= wanted.length + 24
  ) {
    return true;
  }


  if (
    year &&
    normalizeTitle(candidate)
      .includes(String(year)) &&
    got.includes(wanted)
  ) {
    return true;
  }


  return false;
}


/* ============================================================
   FIND EXACT WIKIPEDIA MOVIE PAGE
   ============================================================ */

async function findWikipediaMoviePage(
  title,
  year
) {

  const possibleTitles = [

    year
      ? `${title} (${year} film)`
      : "",

    `${title} (film)`,

    title

  ].filter(Boolean);


  const tried = new Set();


  /*
    Try obvious page names first.
  */

  for (const pageTitle of possibleTitles) {

    const key =
      normalizeTitle(pageTitle);


    if (tried.has(key)) {
      continue;
    }


    tried.add(key);


    const page =
      await getWikipediaPage(
        pageTitle
      );


    if (page) {
      return page;
    }
  }


  /*
    Search Wikipedia if obvious page names fail.
  */

  const candidates =
    await searchWikipedia(
      title,
      year
    );


  for (const candidate of candidates) {

    const key =
      normalizeTitle(candidate);


    if (tried.has(key)) {
      continue;
    }


    tried.add(key);


    if (
      !likelyMoviePage(
        candidate,
        title,
        year
      )
    ) {
      continue;
    }


    const page =
      await getWikipediaPage(
        candidate
      );


    if (page) {
      return page;
    }
  }


  return null;
}


/* ============================================================
   SECTION PRIORITY
   ============================================================ */

function sectionScore(sectionName = "") {

  const name =
    normalizeTitle(sectionName);


  let score = 0;


  const excellent = [
    "casting",
    "filming",
    "development",
    "production",
    "writing"
  ];


  const strong = [
    "pre-production",
    "post-production",
    "visual effects",
    "special effects",
    "practical effects",
    "design",
    "costume",
    "makeup",
    "stunts",
    "photography",
    "music",
    "score"
  ];


  const rejected = [
    "plot",
    "release",
    "reception",
    "box office",
    "critical response",
    "accolades",
    "awards",
    "home media",
    "marketing",
    "legacy",
    "sequel",
    "soundtrack",
    "references",
    "external links",
    "see also"
  ];


  if (
    rejected.some(term =>
      name.includes(term)
    )
  ) {
    return -100;
  }


  if (
    excellent.some(term =>
      name.includes(term)
    )
  ) {
    score += 10;
  }


  if (
    strong.some(term =>
      name.includes(term)
    )
  ) {
    score += 7;
  }


  return score;
}


/* ============================================================
   SELECT USEFUL ARTICLE SECTIONS
   ============================================================ */

function selectTriviaSections(
  sections = []
) {

  return sections
    .map(section => ({
      index:
        section.index,

      name:
        section.line ||
        "",

      score:
        sectionScore(
          section.line || ""
        )
    }))
    .filter(
      section =>
        section.index !== undefined &&
        section.score > 0
    )
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(0, 8);
}


/* ============================================================
   WIKITEXT CLEANING
   ============================================================ */

function cleanWikiText(value = "") {

  let text =
    String(value || "");


  /*
    Remove comments.
  */

  text =
    text.replace(
      /<!--[\s\S]*?-->/g,
      " "
    );


  /*
    Remove references.
  */

  text =
    text.replace(
      /<ref[^>]*>[\s\S]*?<\/ref>/gi,
      " "
    );


  text =
    text.replace(
      /<ref[^/>]*\/>/gi,
      " "
    );


  /*
    Remove tables.
  */

  text =
    text.replace(
      /\{\|[\s\S]*?\|\}/g,
      " "
    );


  /*
    Remove file/image blocks.
  */

  text =
    text.replace(
      /\[\[(?:File|Image):[^\]]+\]\]/gi,
      " "
    );


  /*
    Convert Wiki links to readable text.
  */

  text =
    text.replace(
      /\[\[([^\]|]+)\|([^\]]+)\]\]/g,
      "$2"
    );


  text =
    text.replace(
      /\[\[([^\]]+)\]\]/g,
      "$1"
    );


  /*
    External links: keep label, remove URL.
  */

  text =
    text.replace(
      /\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g,
      "$1"
    );


  text =
    text.replace(
      /\[https?:\/\/[^\]]+\]/g,
      " "
    );


  /*
    Remove simple templates.
  */

  for (let i = 0; i < 5; i++) {

    text =
      text.replace(
        /\{\{[^{}]*\}\}/g,
        " "
      );
  }


  /*
    Remove headings.
  */

  text =
    text.replace(
      /^=+.*?=+$/gm,
      " "
    );


  /*
    Remove HTML tags.
  */

  text =
    text.replace(
      /<[^>]+>/g,
      " "
    );


  /*
    Remove formatting markup.
  */

  text =
    text
      .replace(/'''/g, "")
      .replace(/''/g, "");


  /*
    Remove list markers.
  */

  text =
    text.replace(
      /^[*#:;]+\s*/gm,
      ""
    );


  /*
    Decode common HTML entities.
  */

  text =
    text
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, "&")
      .replace(/&nbsp;/gi, " ")
      .replace(/&ndash;/gi, "–")
      .replace(/&mdash;/gi, "—");


  return text
    .replace(/\s+/g, " ")
    .trim();
}


/* ============================================================
   SENTENCE SPLITTING
   ============================================================ */

function splitSentences(text = "") {

  return String(text || "")
    .replace(/\s+/g, " ")
    .split(
      /(?<=[.!?])\s+(?=[A-Z0-9"'(])/
    )
    .map(
      sentence =>
        sentence.trim()
    )
    .filter(Boolean);
}


/* ============================================================
   BROKEN CONTENT FILTER
   ============================================================ */

function looksBroken(sentence = "") {

  const text =
    String(sentence || "")
      .trim();


  if (!text) {
    return true;
  }


  if (text.length < 45) {
    return true;
  }


  if (text.length > 500) {
    return true;
  }


  if (/^[a-z]/.test(text)) {
    return true;
  }


  const badMarkup = [
    "{{",
    "}}",
    "[[",
    "]]",
    "|-",
    "thumb|",
    "px|",
    "category:"
  ];


  if (
    badMarkup.some(term =>
      text.toLowerCase()
        .includes(term)
    )
  ) {
    return true;
  }


  return false;
}


/* ============================================================
   REJECT NON-TRIVIA CONTENT
   ============================================================ */

function weakTrivia(sentence = "") {

  const lower =
    sentence.toLowerCase();


  const rejected = [

    "the plot",
    "the story follows",
    "the film follows",
    "the movie follows",
    "the film tells",
    "the movie tells",

    "grossed",
    "box office",
    "opening weekend",
    "worldwide total",

    "critical reception",
    "critical response",
    "review aggregator",
    "rotten tomatoes",
    "metacritic",
    "cinemascore",

    "was released on",
    "released theatrically",
    "premiered at",
    "premiered on",

    "dvd",
    "blu-ray",
    "home media",

    "awards and nominations",
    "was nominated for",
    "won the award",

    "sequel was released",
    "became a franchise"

  ];


  return rejected.some(
    term =>
      lower.includes(term)
  );
}


/* ============================================================
   TRIVIA QUALITY SCORE
   ============================================================ */

function triviaScore(sentence = "") {

  const lower =
    sentence.toLowerCase();


  let score = 0;


  /*
    Casting stories.
  */

  const castingTerms = [

    "cast",
    "casting",
    "audition",
    "auditioned",
    "role",
    "offered the role",
    "considered for",
    "turned down",
    "replaced",
    "actor",
    "actress"

  ];


  /*
    Filming stories.
  */

  const filmingTerms = [

    "filmed",
    "filming",
    "shot",
    "location",
    "set",
    "principal photography",
    "camera",
    "cinematography"

  ];


  /*
    Behind-the-scenes production.
  */

  const productionTerms = [

    "production",
    "development",
    "screenplay",
    "script",
    "writer",
    "director",
    "originally",
    "improvised",
    "improvisation",
    "rewrote",
    "rewrite",
    "changed",
    "idea",
    "inspired"

  ];


  /*
    Physical filmmaking.
  */

  const craftTerms = [

    "stunt",
    "effects",
    "visual effects",
    "special effects",
    "practical effects",
    "makeup",
    "prosthetic",
    "costume",
    "designed",
    "constructed",
    "built",
    "training",
    "trained",
    "injury",
    "injured"

  ];


  castingTerms.forEach(term => {
    if (lower.includes(term)) {
      score += 3;
    }
  });


  filmingTerms.forEach(term => {
    if (lower.includes(term)) {
      score += 3;
    }
  });


  productionTerms.forEach(term => {
    if (lower.includes(term)) {
      score += 3;
    }
  });


  craftTerms.forEach(term => {
    if (lower.includes(term)) {
      score += 3;
    }
  });


  /*
    Particularly Reelwise-style phrases.
  */

  const bonusTerms = [

    "was originally",
    "originally intended",
    "was considered",
    "was offered",
    "was chosen",
    "was cast",
    "was replaced",
    "improvised",
    "shot on location",
    "filmed on location",
    "performed",
    "trained for",
    "built for the film",
    "created for the film",
    "designed for the film",
    "during filming",
    "during production"

  ];


  bonusTerms.forEach(term => {
    if (lower.includes(term)) {
      score += 4;
    }
  });


  /*
    Favor readable fact length.
  */

  if (
    sentence.length >= 70 &&
    sentence.length <= 330
  ) {
    score += 3;
  }


  if (
    sentence.length > 330 &&
    sentence.length <= 430
  ) {
    score += 1;
  }


  if (sentence.length < 60) {
    score -= 3;
  }


  return score;
}


/* ============================================================
   DUPLICATE DETECTION
   ============================================================ */

function triviaWords(text = "") {

  return new Set(

    normalizeTitle(text)
      .replace(
        /[^a-z0-9\s]/g,
        " "
      )
      .split(/\s+/)
      .filter(
        word =>
          word.length > 3
      )

  );
}


function triviaSimilarity(
  a = "",
  b = ""
) {

  const wordsA =
    triviaWords(a);


  const wordsB =
    triviaWords(b);


  if (
    !wordsA.size ||
    !wordsB.size
  ) {
    return 0;
  }


  let overlap = 0;


  for (const word of wordsA) {

    if (wordsB.has(word)) {
      overlap++;
    }
  }


  return (
    overlap /
    Math.min(
      wordsA.size,
      wordsB.size
    )
  );
}


/* ============================================================
   SELECT BEST TRIVIA
   ============================================================ */

function selectBestTrivia(
  sentences = [],
  existingTrivia = []
) {

  const candidates =
    sentences

      .filter(
        sentence =>
          !looksBroken(sentence)
      )

      .filter(
        sentence =>
          !weakTrivia(sentence)
      )

      .map(sentence => ({
        text:
          sentence,

        score:
          triviaScore(sentence)
      }))

      .filter(
        item =>
          item.score >= 3
      )

      .sort(
        (a, b) =>
          b.score - a.score
      );


  const selected = [];


  for (const item of candidates) {

    const duplicateExisting =
      existingTrivia.some(
        trivia =>
          triviaSimilarity(
            trivia,
            item.text
          ) > 0.55
      );


    const duplicateSelected =
      selected.some(
        trivia =>
          triviaSimilarity(
            trivia,
            item.text
          ) > 0.55
      );


    if (
      !duplicateExisting &&
      !duplicateSelected
    ) {

      selected.push(
        item.text
      );
    }


    if (selected.length >= 6) {
      break;
    }
  }


  return selected;
}


/* ============================================================
   EXTRACT TRIVIA FROM WIKITEXT
   ============================================================ */

function extractTrivia(
  wikitext = "",
  existingTrivia = []
) {

  if (!wikitext) {
    return [];
  }


  const clean =
    cleanWikiText(
      wikitext
    );


  if (!clean) {
    return [];
  }


  const sentences =
    splitSentences(
      clean
    );


  return selectBestTrivia(
    sentences,
    existingTrivia
  );
}


/* ============================================================
   GET TRIVIA FROM PRIORITY SECTIONS
   ============================================================ */

async function getSectionTrivia(
  page,
  existingTrivia = []
) {

  if (!page) {
    return [];
  }


  const sections =
    selectTriviaSections(
      page.sections
    );


  let trivia = [];


  for (const section of sections) {

    const text =
      await getWikipediaSection(
        page.title,
        section.index
      );


    if (!text) {
      continue;
    }


    const found =
      extractTrivia(
        text,
        [
          ...existingTrivia,
          ...trivia
        ]
      );


    trivia.push(
      ...found
    );


    /*
      Remove near-duplicates.
    */

    const unique = [];


    for (const item of trivia) {

      if (
        !unique.some(
          existing =>
            triviaSimilarity(
              existing,
              item
            ) > 0.55
        )
      ) {

        unique.push(item);
      }
    }


    trivia = unique;


    if (trivia.length >= 6) {
      break;
    }
  }


  return trivia.slice(0, 6);
}


/* ============================================================
   FULL ARTICLE BACKUP
   ============================================================ */

async function getFullArticleTrivia(
  page,
  existingTrivia = []
) {

  if (!page) {
    return [];
  }


  const text =
    await getWikipediaWikitext(
      page.title
    );


  if (!text) {
    return [];
  }


  return extractTrivia(
    text,
    existingTrivia
  );
}


/* ============================================================
   AUTOMATIC TRIVIA DISCOVERY
   ============================================================ */

async function findAutomaticTrivia(
  title,
  year
) {

  const page =
    await findWikipediaMoviePage(
      title,
      year
    );


  if (!page) {

    return {
      trivia: [],
      page: ""
    };
  }


  /*
    FIRST:
    Mine the sections most likely to contain
    Reelwise-style behind-the-scenes material.
  */

  let trivia =
    await getSectionTrivia(
      page
    );


  /*
    SECOND:
    If specialized sections did not give us enough,
    mine the complete article as backup.
  */

  if (trivia.length < 4) {

    const additional =
      await getFullArticleTrivia(
        page,
        trivia
      );


    for (const item of additional) {

      const duplicate =
        trivia.some(
          existing =>
            triviaSimilarity(
              existing,
              item
            ) > 0.55
        );


      if (!duplicate) {
        trivia.push(item);
      }


      if (trivia.length >= 6) {
        break;
      }
    }
  }


  return {

    trivia:
      trivia.slice(0, 6),

    page:
      page.title
  };
}


/* ============================================================
   MAIN REELWISE API
   ============================================================ */

export default async function handler(
  req,
  res
) {

  try {

    const id =
      String(
        req.query?.id || ""
      ).trim();


    if (!id) {

      return res.status(400).json({
        error:
          "Missing movie id",
        trivia: []
      });
    }


    /*
      Identify exact movie.
    */

    const movie =
      await getMovie(id);


    const title =
      movie?.title ||
      movie?.original_title ||
      "";


    const year =
      movie?.release_date
        ? movie.release_date.slice(0, 4)
        : "";


    const key =
      normalizeTitle(title);


    /*
      ========================================================
      FIRST: REELWISE CURATED TRIVIA VAULT
      ========================================================

      Curated Reelwise trivia always wins.
    */

    const curated =
      TRIVIA_VAULT[key];


    if (
      Array.isArray(curated) &&
      curated.length
    ) {

      return res.status(200).json({

        movie: title,

        year,

        trivia:
          curated.slice(0, 6),

        source:
          "Reelwise Trivia Vault",

        curated: true

      });
    }


    /*
      ========================================================
      SECOND: AUTOMATIC WIKIPEDIA DISCOVERY
      ========================================================
    */

    const automatic =
      await findAutomaticTrivia(
        title,
        year
      );


    /*
      ========================================================
      RETURN RESULTS
      ========================================================
    */

    return res.status(200).json({

      movie: title,

      year,

      trivia:
        automatic.trivia,

      source:
        automatic.trivia.length
          ? "Wikipedia"
          : "No trivia source found",

      curated: false,

      page:
        automatic.trivia.length
          ? automatic.page
          : undefined

    });


  } catch (error) {

    console.error(
      "Reelwise trivia error:",
      error
    );


    return res.status(500).json({

      error:
        "Unable to load trivia",

      details:
        error?.message ||
        "Unknown error",

      trivia: []

    });
  }
}

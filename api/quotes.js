import QUOTE_VAULT from "../data/quotes.js";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE QUOTE ENGINE
  ============================================================

  1. Identify the exact movie through TMDB.
  2. Check the Reelwise curated Quote Vault first.
  3. Curated Reelwise quotes always win.
  4. If not curated, locate the movie on Wikiquote.
  5. Pull the actual Wikiquote page wikitext.
  6. Extract usable quotes while rejecting junk sections.
  7. Return up to 8 fallback quotes.

  This lets the curated Vault remain the premium Reelwise layer
  without requiring every movie to be entered manually.
  ============================================================
*/


/* ============================================================
   TITLE HELPERS
   ============================================================ */

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}


function looseTitle(value) {
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
    throw new Error("TMDB token is not configured");
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
      data.status_message ||
      "Movie lookup failed"
    );
  }

  return data;
}


/* ============================================================
   WIKIQUOTE REQUEST
   ============================================================ */

async function wikiquoteRequest(params) {

  try {

    const query = new URLSearchParams({
      format: "json",
      formatversion: "2",
      origin: "*",
      ...params
    });

    const response = await fetch(
      `https://en.wikiquote.org/w/api.php?${query.toString()}`,
      {
        headers: {
          "User-Agent":
            "Reelwise/1.0 movie quote discovery"
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();

  } catch (error) {

    console.error(
      "Wikiquote request failed:",
      error
    );

    return null;
  }
}


/* ============================================================
   GET ACTUAL WIKIQUOTE PAGE WIKITEXT
   ============================================================ */

async function getWikiquotePage(title) {

  const data = await wikiquoteRequest({
    action: "parse",
    page: title,
    prop: "wikitext|displaytitle",
    redirects: "1"
  });

  if (
    !data ||
    data.error ||
    !data.parse
  ) {
    return {
      title: "",
      text: ""
    };
  }

  const parse = data.parse;

  let text = "";

  if (typeof parse.wikitext === "string") {
    text = parse.wikitext;
  } else if (
    parse.wikitext &&
    typeof parse.wikitext["*"] === "string"
  ) {
    text = parse.wikitext["*"];
  }

  return {
    title:
      parse.title ||
      title,

    text
  };
}


/* ============================================================
   SEARCH WIKIQUOTE
   ============================================================ */

async function searchWikiquote(title, year) {

  const searches = [

    year
      ? `"${title}" ${year} film`
      : "",

    `"${title}" film`,

    `"${title}"`,

    title

  ].filter(Boolean);


  const found = [];
  const seen = new Set();


  for (const searchText of searches) {

    const data =
      await wikiquoteRequest({
        action: "query",
        list: "search",
        srnamespace: "0",
        srlimit: "10",
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


    if (found.length >= 20) {
      break;
    }
  }


  return found;
}


/* ============================================================
   VERIFY THAT SEARCH RESULT MATCHES MOVIE
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
   TEXT CLEANING
   ============================================================ */

function decodeEntities(value) {

  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}


function cleanWikiMarkup(value) {

  let line =
    String(value || "");


  /*
    Remove HTML comments.
  */

  line =
    line.replace(
      /<!--[\s\S]*?-->/g,
      ""
    );


  /*
    Remove references.
  */

  line =
    line.replace(
      /<ref[^>]*>[\s\S]*?<\/ref>/gi,
      ""
    );

  line =
    line.replace(
      /<ref[^/>]*\/>/gi,
      ""
    );


  /*
    Convert common Wiki links:

    [[Target|visible text]] -> visible text
    [[Target]] -> Target
  */

  line =
    line.replace(
      /\[\[([^\]|]+)\|([^\]]+)\]\]/g,
      "$2"
    );

  line =
    line.replace(
      /\[\[([^\]]+)\]\]/g,
      "$1"
    );


  /*
    Remove external-link URL while keeping label.

    [https://example.com Label] -> Label
  */

  line =
    line.replace(
      /\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g,
      "$1"
    );

  line =
    line.replace(
      /\[https?:\/\/[^\]]+\]/g,
      ""
    );


  /*
    Remove simple formatting markup.
  */

  line =
    line
      .replace(/'''/g, "")
      .replace(/''/g, "");


  /*
    Remove simple templates that remain on one line.
  */

  line =
    line.replace(
      /\{\{[^{}]*\}\}/g,
      ""
    );


  /*
    Remove basic HTML tags.
  */

  line =
    line.replace(
      /<[^>]+>/g,
      ""
    );


  /*
    Remove Wiki list characters.
  */

  line =
    line.replace(
      /^[*#:;]+\s*/,
      ""
    );


  /*
    Remove surrounding quotation marks.
  */

  line =
    line.replace(
      /^["“”]+|["“”]+$/g,
      ""
    );


  line =
    decodeEntities(line);


  return line
    .replace(/\s+/g, " ")
    .trim();
}


function quoteKey(value) {

  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}


function sectionName(value) {

  return String(value || "")
    .replace(/^=+\s*/, "")
    .replace(/\s*=+$/, "")
    .trim()
    .toLowerCase();
}


/* ============================================================
   SECTION FILTERS
   ============================================================ */

function blockedSection(section) {

  const blocked = [

    "cast",
    "taglines",
    "tagline",
    "external links",
    "external link",
    "references",
    "reference",
    "see also",
    "sources",
    "source",
    "notes",
    "note",
    "about",
    "about the film",
    "quotes about",
    "links"

  ];

  return blocked.includes(section);
}


/* ============================================================
   FALLBACK SAFETY FILTER
   ============================================================ */

function usableQuote(line) {

  if (!line) {
    return false;
  }


  if (
    line.length < 8 ||
    line.length > 240
  ) {
    return false;
  }


  const lower =
    line.toLowerCase();


  const junk = [

    "is a film",
    "is a movie",
    "directed by",
    "starring ",
    "released in",
    "written by",
    "produced by",
    "based on the",
    "based on a",
    "screenplay by",
    "distributed by",
    "external link",
    "wikipedia",
    "wikiquote",
    "category:",
    "file:",
    "image:",
    "isbn",
    "official website"

  ];


  if (
    junk.some(term =>
      lower.includes(term)
    )
  ) {
    return false;
  }


  if (
    lower.includes("http://") ||
    lower.includes("https://") ||
    lower.includes("www.")
  ) {
    return false;
  }


  if (
    /^\[.*\]$/.test(line) ||
    /^\(.*\)$/.test(line)
  ) {
    return false;
  }


  if (
    line.endsWith(":") ||
    line.endsWith("—") ||
    line.endsWith("–")
  ) {
    return false;
  }


  /*
    Reject leftover Wiki markup.
  */

  if (
    line.includes("{{") ||
    line.includes("}}") ||
    line.includes("[[") ||
    line.includes("]]") ||
    line.startsWith("|")
  ) {
    return false;
  }


  const words =
    line
      .split(/\s+/)
      .filter(Boolean);


  if (words.length < 2) {
    return false;
  }


  const numbers =
    line.match(/\d+/g) || [];


  if (numbers.length >= 4) {
    return false;
  }


  return true;
}


/* ============================================================
   SPEAKER LABEL CLEANING
   ============================================================ */

function removeSpeakerLabel(line) {

  /*
    Examples:

    Rocky: Yo, Adrian!
    Tony Stark: We have a Hulk.

    Keep the actual spoken line.
  */

  const match =
    line.match(
      /^[A-Za-z0-9 .'"’()_-]{1,50}:\s+(.+)$/
    );


  if (!match) {
    return line;
  }


  return cleanWikiMarkup(
    match[1]
  );
}


/* ============================================================
   DUPLICATE CHECK
   ============================================================ */

function isDuplicateQuote(
  quote,
  existing
) {

  const key =
    quoteKey(quote);


  if (!key) {
    return true;
  }


  return existing.some(item => {

    const existingKey =
      quoteKey(item);


    if (!existingKey) {
      return false;
    }


    if (existingKey === key) {
      return true;
    }


    if (
      key.length > 30 &&
      existingKey.length > 30 &&
      (
        key.includes(existingKey) ||
        existingKey.includes(key)
      )
    ) {
      return true;
    }


    return false;
  });
}


/* ============================================================
   EXTRACT QUOTES FROM WIKIQUOTE WIKITEXT
   ============================================================ */

function extractFallbackQuotes(text) {

  if (!text) {
    return [];
  }


  const lines =
    String(text)
      .split(/\r?\n/);


  const primary = [];
  const dialogue = [];

  let section = "";


  for (const raw of lines) {

    const rawLine =
      String(raw || "").trim();


    if (!rawLine) {
      continue;
    }


    /*
      Detect section headings.
    */

    const headingMatch =
      rawLine.match(
        /^(={2,6})\s*(.*?)\s*\1$/
      );


    if (headingMatch) {

      section =
        sectionName(
          headingMatch[2]
        );

      continue;
    }


    if (blockedSection(section)) {
      continue;
    }


    /*
      Wikiquote quote entries are normally list items.
      Ignore template/table/category infrastructure.
    */

    if (
      rawLine.startsWith("{{") ||
      rawLine.startsWith("}}") ||
      rawLine.startsWith("{|") ||
      rawLine.startsWith("|}") ||
      rawLine.startsWith("|-") ||
      rawLine.startsWith("[[Category:") ||
      rawLine.startsWith("[[File:") ||
      rawLine.startsWith("[[Image:")
    ) {
      continue;
    }


    /*
      Most real Wikiquote material appears as list items.
      This prevents introductory prose from becoming quotes.
    */

    const isListItem =
      /^[*#:;]/.test(rawLine);


    if (!isListItem) {
      continue;
    }


    let line =
      cleanWikiMarkup(
        rawLine
      );


    if (!line) {
      continue;
    }


    /*
      Remove stage direction at beginning.
    */

    line =
      line
        .replace(
          /^\[[^\]]{1,100}\]\s*/,
          ""
        )
        .trim();


    /*
      Remove character/speaker label.
    */

    line =
      removeSpeakerLabel(
        line
      );


    if (!usableQuote(line)) {
      continue;
    }


    /*
      Dialogue sections can contain fragments from
      multi-line exchanges, so keep them supplemental.
    */

    if (
      section === "dialogue"
    ) {

      if (
        !isDuplicateQuote(
          line,
          dialogue
        )
      ) {
        dialogue.push(line);
      }

      continue;
    }


    if (
      !isDuplicateQuote(
        line,
        primary
      )
    ) {
      primary.push(line);
    }
  }


  /*
    Prefer standalone character quotes.
  */

  const combined =
    [...primary];


  /*
    Supplement with dialogue only when necessary.
  */

  for (const line of dialogue) {

    if (combined.length >= 8) {
      break;
    }


    if (
      !isDuplicateQuote(
        line,
        combined
      )
    ) {
      combined.push(line);
    }
  }


  return combined.slice(0, 8);
}


/* ============================================================
   TRY A SPECIFIC WIKIQUOTE PAGE
   ============================================================ */

async function tryWikiquotePage(
  pageTitle
) {

  const page =
    await getWikiquotePage(
      pageTitle
    );


  if (!page.text) {

    return {
      page: "",
      quotes: []
    };
  }


  const quotes =
    extractFallbackQuotes(
      page.text
    );


  return {
    page:
      page.title ||
      pageTitle,

    quotes
  };
}


/* ============================================================
   FIND AUTOMATIC QUOTES
   ============================================================ */

async function findAutomaticQuotes(
  title,
  year
) {

  /*
    Try the most likely exact Wikiquote page names first.
  */

  const possibleTitles = [

    year
      ? `${title} (${year} film)`
      : "",

    `${title} (film)`,

    title

  ].filter(Boolean);


  const tried =
    new Set();


  for (const pageTitle of possibleTitles) {

    const key =
      normalizeTitle(pageTitle);


    if (tried.has(key)) {
      continue;
    }


    tried.add(key);


    const result =
      await tryWikiquotePage(
        pageTitle
      );


    if (result.quotes.length) {
      return result;
    }
  }


  /*
    If the obvious titles fail, search Wikiquote.
  */

  const candidates =
    await searchWikiquote(
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


    const result =
      await tryWikiquotePage(
        candidate
      );


    if (result.quotes.length) {
      return result;
    }
  }


  return {
    page: "",
    quotes: []
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
          "Movie ID is required.",
        quotes: []
      });
    }


    /*
      Identify exact movie through TMDB.
    */

    const movie =
      await getMovie(id);


    const title =
      movie.title ||
      movie.original_title ||
      "";


    const year =
      movie.release_date
        ? movie.release_date.slice(0, 4)
        : "";


    const key =
      normalizeTitle(title);


    /*
      ========================================================
      REELWISE CURATED QUOTE VAULT
      ========================================================

      Curated Reelwise quotes always win.
    */

    const curated =
      QUOTE_VAULT[key] || [];


    if (
      Array.isArray(curated) &&
      curated.length
    ) {

      return res.status(200).json({

        movie: title,

        year,

        quotes:
          curated.slice(0, 8),

        source:
          "Reelwise Vault",

        curated: true

      });
    }


    /*
      ========================================================
      AUTOMATIC WIKIQUOTE FALLBACK
      ========================================================
    */

    const automatic =
      await findAutomaticQuotes(
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

      quotes:
        automatic.quotes,

      source:
        automatic.quotes.length
          ? "Wikiquote"
          : "No verified quote source found",

      curated: false,

      page:
        automatic.quotes.length
          ? automatic.page
          : undefined

    });


  } catch (error) {

    console.error(
      "Reelwise quotes error:",
      error
    );


    return res.status(500).json({

      error:
        error.message ||
        "Quotes could not be loaded.",

      quotes: []

    });
  }
}

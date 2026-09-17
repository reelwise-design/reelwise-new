import QUOTE_VAULT from "../data/quotes.js";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE QUOTE ENGINE
  ============================================================

  1. Identify the exact movie through TMDB.
  2. Check the separate Reelwise Quote Vault first.
  3. Curated Reelwise quotes always win.
  4. If the movie is not yet curated, try Wikiquote.
  5. Automatic results are clearly fallback material.
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
      data.status_message || "Movie lookup failed"
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

  } catch {
    return null;
  }
}


/* ============================================================
   GET WIKIQUOTE PAGE
   ============================================================ */

async function getWikiquotePage(title) {

  const data = await wikiquoteRequest({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    redirects: "1",
    titles: title
  });

  const pages =
    data?.query?.pages || {};

  const page =
    Object.values(pages)[0];

  if (
    !page ||
    page.missing !== undefined
  ) {
    return {
      title: "",
      extract: ""
    };
  }

  return {
    title: page.title || title,
    extract: page.extract || ""
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

    if (found.length >= 12) {
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
    got.length <= wanted.length + 18
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
   QUOTE CLEANING
   ============================================================ */

function cleanLine(value) {

  return String(value || "")
    .replace(/^[-*#]+\s*/, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\[edit\]/gi, "")
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


function blockedSection(section) {

  return [
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
    "notes"
  ].includes(section);
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
    line.length > 220
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
    "wikiquote"
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

  const words =
    line
      .split(/\s+/)
      .filter(Boolean);

  if (words.length < 2) {
    return false;
  }

  const numbers =
    line.match(/\d+/g) || [];

  if (numbers.length >= 3) {
    return false;
  }

  return true;
}


/* ============================================================
   EXTRACT FALLBACK QUOTES
   ============================================================ */

function extractFallbackQuotes(text) {

  if (!text) {
    return [];
  }

  const lines =
    text.split(/\r?\n/);

  const standalone = [];
  const dialogue = [];

  const standaloneSeen =
    new Set();

  const dialogueSeen =
    new Set();

  let section = "";


  for (const raw of lines) {

    const rawLine =
      String(raw || "").trim();

    if (!rawLine) {
      continue;
    }


    /*
      Detect Wikiquote section headings.
    */

    if (/^=+.*=+$/.test(rawLine)) {

      section =
        sectionName(rawLine);

      continue;
    }


    let line =
      cleanLine(rawLine);

    if (!line) {
      continue;
    }


    /*
      Some plain-text extracts expose headings
      without Wiki markup.
    */

    const heading =
      sectionName(line);

    const knownHeadings = [
      "dialogue",
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
      "notes"
    ];

    if (
      knownHeadings.includes(heading)
    ) {

      section = heading;

      continue;
    }


    if (blockedSection(section)) {
      continue;
    }


    /*
      Remove speaker label.

      Example:

      Red: Hope is a dangerous thing.

      becomes:

      Hope is a dangerous thing.
    */

    const speakerMatch =
      line.match(
        /^[A-Za-z0-9 .'"’()_-]{1,45}:\s+(.+)$/
      );

    if (speakerMatch) {

      line =
        cleanLine(
          speakerMatch[1]
        );
    }


    /*
      Remove a short stage direction.
    */

    line =
      line
        .replace(
          /^\[[^\]]{1,80}\]\s*/,
          ""
        )
        .trim();


    if (!usableQuote(line)) {
      continue;
    }


    const key =
      quoteKey(line);

    if (!key) {
      continue;
    }


    /*
      Keep dialogue separate.

      Standalone Wikiquote entries are preferred.
    */

    if (section === "dialogue") {

      if (
        dialogueSeen.has(key)
      ) {
        continue;
      }

      dialogueSeen.add(key);

      dialogue.push(line);

    } else {

      if (
        standaloneSeen.has(key)
      ) {
        continue;
      }

      standaloneSeen.add(key);

      standalone.push(line);
    }
  }


  /*
    Standalone quotes come first.
  */

  const combined =
    [...standalone];


  /*
    Dialogue is only supplemental.
  */

  for (const line of dialogue) {

    if (combined.length >= 5) {
      break;
    }

    const key =
      quoteKey(line);

    const duplicate =
      combined.some(existing => {

        const existingKey =
          quoteKey(existing);

        if (
          existingKey === key
        ) {
          return true;
        }

        if (
          key.length > 25 &&
          existingKey.length > 25 &&
          (
            key.includes(existingKey) ||
            existingKey.includes(key)
          )
        ) {
          return true;
        }

        return false;
      });


    if (!duplicate) {
      combined.push(line);
    }
  }


  return combined.slice(0, 5);
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
          "Movie ID is required."
      });
    }


    /*
      Identify exact movie.
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
      REELWISE QUOTE VAULT
      ========================================================

      This is now stored separately in:

      data/quotes.js

      That means we can grow the Vault without touching
      this API engine.
    */

    const curated =
      QUOTE_VAULT[key] || [];


    if (curated.length) {

      return res.status(200).json({

        movie: title,

        year,

        quotes: curated,

        source:
          "Reelwise Vault",

        curated: true

      });
    }


    /*
      ========================================================
      AUTOMATIC FALLBACK
      ========================================================
    */

    const possibleTitles = [

      year
        ? `${title} (${year} film)`
        : "",

      `${title} (film)`,

      title

    ].filter(Boolean);


    let pageUsed = "";

    let fallback = [];


    for (
      const pageTitle
      of possibleTitles
    ) {

      const page =
        await getWikiquotePage(
          pageTitle
        );


      if (!page.extract) {
        continue;
      }


      const quotes =
        extractFallbackQuotes(
          page.extract
        );


      if (quotes.length) {

        pageUsed =
          page.title ||
          pageTitle;

        fallback =
          quotes;

        break;
      }
    }


    /*
      Search Wikiquote if the obvious
      page names did not work.
    */

    if (!fallback.length) {

      const candidates =
        await searchWikiquote(
          title,
          year
        );


      for (
        const candidate
        of candidates
      ) {

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
          await getWikiquotePage(
            candidate
          );


        if (!page.extract) {
          continue;
        }


        const quotes =
          extractFallbackQuotes(
            page.extract
          );


        if (quotes.length) {

          pageUsed =
            page.title ||
            candidate;

          fallback =
            quotes;

          break;
        }
      }
    }


    /*
      ========================================================
      RETURN RESULTS
      ========================================================
    */

    return res.status(200).json({

      movie: title,

      year,

      quotes: fallback,

      source:
        fallback.length
          ? "Wikiquote"
          : "No quote source found",

      curated: false,

      page:
        fallback.length
          ? pageUsed
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

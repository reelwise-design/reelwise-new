import QUOTE_VAULT from "../data/quotes.js";

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE QUOTE ENGINE
  Verified Vault + Automatic Fallback
  ============================================================

  ORDER:

  1. TMDB identifies the exact movie.
  2. Reelwise Quote Vault is checked first.
  3. If Vault quotes exist, they are returned immediately.
  4. If the Vault has no quotes, Wikiquote is searched.
  5. Wikiquote material is aggressively filtered.
  6. Dialogue/conversation sections are rejected.
  7. Headings, descriptions, cast lists and junk are rejected.
  8. Automatic quotes are NEVER marked Reelwise Verified.

  Reelwise Verified = manually verified structured Vault record.
  ============================================================
*/


/* ============================================================
   BASIC HELPERS
   ============================================================ */

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/’/g, "'")
    .replace(/\s+/g, " ");
}

function cleanText(value) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/'''?/g, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}


/* ============================================================
   TMDB
   ============================================================ */

async function getMovie(id) {
  if (!TOKEN) {
    throw new Error("TMDB token is not configured.");
  }

  const url =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(id) +
    "?language=en-US";

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/json"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.status_message || "Movie lookup failed."
    );
  }

  return data;
}


/* ============================================================
   REELWISE VAULT
   ============================================================ */

function prepareQuote(item) {
  /*
    Legacy Vault strings remain compatible.
    They are NOT automatically considered verified.
  */

  if (typeof item === "string") {
    const quote = cleanText(item);

    if (!quote) return null;

    return {
      quote: quote,
      verified: false,
      legacy: true
    };
  }

  /*
    Structured Vault records must explicitly say:
    verified: true
  */

  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item) ||
    item.verified !== true
  ) {
    return null;
  }

  const quote = cleanText(
    item.quote || item.text
  );

  if (!quote) return null;

  const result = {
    quote: quote,
    verified: true,
    legacy: false
  };

  const character = cleanText(item.character);
  const actor = cleanText(item.actor);

  if (character) {
    result.character = character;
  }

  if (actor) {
    result.actor = actor;
  }

  return result;
}


function prepareVaultQuotes(items, limit = 8) {
  if (!Array.isArray(items)) {
    return [];
  }

  const results = [];
  const seen = new Set();

  for (const item of items) {
    const record = prepareQuote(item);

    if (!record) continue;

    const key = record.quote.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    results.push(record);

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}


/* ============================================================
   WIKIQUOTE API
   ============================================================ */

async function wikiquoteRequest(params) {
  const searchParams = new URLSearchParams({
    origin: "*",
    format: "json",
    formatversion: "2",
    ...params
  });

  const url =
    "https://en.wikiquote.org/w/api.php?" +
    searchParams.toString();

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      "Wikiquote request failed."
    );
  }

  return response.json();
}


/* ============================================================
   FIND THE CORRECT WIKIQUOTE PAGE
   ============================================================ */

async function findWikiquotePage(title, year) {
  const searches = [];

  if (year) {
    searches.push(title + " " + year + " film");
  }

  searches.push(title + " film");
  searches.push(title);

  for (const search of searches) {
    try {
      const data = await wikiquoteRequest({
        action: "query",
        list: "search",
        srsearch: search,
        srlimit: "8",
        srnamespace: "0"
      });

      const results =
        data?.query?.search || [];

      if (!results.length) {
        continue;
      }

      /*
        Prefer an exact title match.
      */

      const normalizedMovie =
        normalizeTitle(title);

      const exact = results.find(function (item) {
        const resultTitle =
          normalizeTitle(
            String(item.title || "")
              .replace(/\s*\(film\)\s*$/i, "")
          );

        return resultTitle === normalizedMovie;
      });

      if (exact?.title) {
        return exact.title;
      }

      /*
        Otherwise prefer something explicitly
        identified as a film.
      */

      const filmResult = results.find(
        function (item) {
          return /\(film\)/i.test(
            String(item.title || "")
          );
        }
      );

      if (filmResult?.title) {
        return filmResult.title;
      }

      /*
        Last resort: first search result.
      */

      if (results[0]?.title) {
        return results[0].title;
      }

    } catch (error) {
      console.error(
        "Wikiquote search error:",
        error
      );
    }
  }

  return "";
}


/* ============================================================
   LOAD RAW WIKIQUOTE WIKITEXT
   ============================================================ */

async function getWikiquoteWikitext(pageTitle) {
  if (!pageTitle) return "";

  const data = await wikiquoteRequest({
    action: "parse",
    page: pageTitle,
    prop: "wikitext"
  });

  return String(
    data?.parse?.wikitext || ""
  );
}


/* ============================================================
   SECTION FILTERING
   ============================================================ */

function isRejectedSection(title) {
  const value = normalizeTitle(title);

  if (!value) return false;

  const rejected = [
    "dialogue",
    "dialog",
    "cast",
    "external links",
    "see also",
    "references",
    "notes",
    "about",
    "quotes about",
    "taglines",
    "trivia",
    "production",
    "soundtrack",
    "songs",
    "lyrics",
    "bibliography",
    "footnotes",
    "sources"
  ];

  return rejected.some(function (term) {
    return (
      value === term ||
      value.startsWith(term + " ")
    );
  });
}


/* ============================================================
   BAD LINE FILTERS
   ============================================================ */

function looksLikeHeading(line) {
  return /^=+.*=+$/.test(line);
}


function looksLikeCharacterLabel(line) {
  /*
    Examples we DON'T want as quote cards:

    Superman:
    Clark Kent:
    Lois Lane:
  */

  if (
    /^[A-Z][A-Za-z0-9 .,'’\-]{0,45}:$/.test(line)
  ) {
    return true;
  }

  return false;
}


function looksLikeStageDirection(line) {
  const lower = line.toLowerCase();

  const patterns = [
    /^\[/,
    /^\(/,
    /^scene:/,
    /^cut to:/,
    /^later,/,
    /^meanwhile,/,
    /^after /,
    /^before /,
    /^during /,
    /^as /,
    /^when /,
    /^while /,
    /^the scene/,
    /^in the scene/,
    /^he says/,
    /^she says/,
    /^they say/,
    /^he tells/,
    /^she tells/,
    /^the film/,
    /^the movie/
  ];

  return patterns.some(function (pattern) {
    return pattern.test(lower);
  });
}


function looksLikeMetadata(line) {
  const lower = line.toLowerCase();

  const badPhrases = [
    "directed by",
    "written by",
    "produced by",
    "starring",
    "release date",
    "released on",
    "box office",
    "running time",
    "runtime",
    "based on",
    "screenplay by",
    "music by",
    "cinematography",
    "distributed by",
    "official website",
    "internet movie database",
    "imdb",
    "wikipedia",
    "wikiquote",
    "retrieved from"
  ];

  return badPhrases.some(function (phrase) {
    return lower.includes(phrase);
  });
}


function looksLikeDialogue(line) {
  /*
    Reject obvious multi-character dialogue that slipped
    out of a Dialogue section.
  */

  const characterMatches =
    line.match(
      /(?:^|\s)[A-Z][A-Za-z0-9 .,'’\-]{1,35}:/g
    );

  if (
    characterMatches &&
    characterMatches.length >= 2
  ) {
    return true;
  }

  /*
    Reject common transcript formatting.
  */

  if (
    /\b[A-Z][A-Z .'\-]{2,25}:\s/.test(line)
  ) {
    return true;
  }

  return false;
}


/* ============================================================
   QUOTE QUALITY FILTER
   ============================================================ */

function isGoodAutomaticQuote(value) {
  const line = cleanText(value);

  if (!line) return false;

  /*
    Too short usually means labels/junk.
  */

  if (line.length < 8) {
    return false;
  }

  /*
    Very long lines are usually descriptions,
    conversations or Wikiquote formatting artifacts.
  */

  if (line.length > 260) {
    return false;
  }

  if (looksLikeHeading(line)) {
    return false;
  }

  if (looksLikeCharacterLabel(line)) {
    return false;
  }

  if (looksLikeStageDirection(line)) {
    return false;
  }

  if (looksLikeMetadata(line)) {
    return false;
  }

  if (looksLikeDialogue(line)) {
    return false;
  }

  /*
    Reject raw Wiki markup.
  */

  if (
    line.includes("{{") ||
    line.includes("}}") ||
    line.includes("[[") ||
    line.includes("]]") ||
    line.includes("<ref")
  ) {
    return false;
  }

  /*
    Reject URLs.
  */

  if (
    /https?:\/\//i.test(line) ||
    /www\./i.test(line)
  ) {
    return false;
  }

  /*
    Reject obvious list metadata.
  */

  if (
    /^[0-9]+\./.test(line) ||
    /^[*#:;]+$/.test(line)
  ) {
    return false;
  }

  /*
    Require letters.
  */

  if (!/[A-Za-z]/.test(line)) {
    return false;
  }

  return true;
}


/* ============================================================
   EXTRACT QUOTES
   ============================================================ */

function extractAutomaticQuotes(
  wikitext,
  limit = 8
) {
  if (!wikitext) {
    return [];
  }

  const lines =
    String(wikitext).split(/\r?\n/);

  const results = [];
  const seen = new Set();

  let rejectedSectionLevel = null;

  for (let rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      continue;
    }

    /*
      Detect section headings.
    */

    const headingMatch =
      trimmed.match(
        /^(={2,6})\s*(.*?)\s*\1$/
      );

    if (headingMatch) {
      const level =
        headingMatch[1].length;

      const sectionTitle =
        cleanText(headingMatch[2]);

      if (
        rejectedSectionLevel !== null &&
        level <= rejectedSectionLevel
      ) {
        rejectedSectionLevel = null;
      }

      if (isRejectedSection(sectionTitle)) {
        rejectedSectionLevel = level;
      }

      continue;
    }

    /*
      Skip everything inside rejected sections.
    */

    if (rejectedSectionLevel !== null) {
      continue;
    }

    /*
      Wikiquote's normal quote lines usually
      begin with a bullet.
    */

    if (!/^\*+\s*/.test(trimmed)) {
      continue;
    }

    /*
      Ignore nested bullets because they are often
      citations, notes, translations or responses.
    */

    const bulletMatch =
      trimmed.match(/^(\*+)/);

    if (
      bulletMatch &&
      bulletMatch[1].length > 1
    ) {
      continue;
    }

    let candidate =
      trimmed.replace(/^\*+\s*/, "");

    candidate = cleanText(candidate);

    /*
      Some Wikiquote pages use:
      Character: Quote

      Keep only the quote portion when there is
      exactly one short character prefix.
    */

    const speakerMatch =
      candidate.match(
        /^([A-Z][A-Za-z0-9 .,'’\-]{1,40}):\s+(.+)$/
      );

    if (speakerMatch) {
      const possibleQuote =
        cleanText(speakerMatch[2]);

      /*
        Only strip the speaker when the remainder
        itself looks like a clean standalone quote.
      */

      if (
        possibleQuote &&
        !looksLikeDialogue(possibleQuote)
      ) {
        candidate = possibleQuote;
      }
    }

    if (!isGoodAutomaticQuote(candidate)) {
      continue;
    }

    const key =
      candidate
        .toLowerCase()
        .replace(/[“”"'’.,!?;:—–-]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);

    results.push({
      quote: candidate,
      verified: false,
      automatic: true
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}


/* ============================================================
   AUTOMATIC FALLBACK
   ============================================================ */

async function getAutomaticQuotes(
  title,
  year,
  limit = 8
) {
  try {
    const pageTitle =
      await findWikiquotePage(
        title,
        year
      );

    if (!pageTitle) {
      return {
        quotes: [],
        pageTitle: ""
      };
    }

    const wikitext =
      await getWikiquoteWikitext(
        pageTitle
      );

    const quotes =
      extractAutomaticQuotes(
        wikitext,
        limit
      );

    return {
      quotes: quotes,
      pageTitle: pageTitle
    };

  } catch (error) {
    /*
      Wikiquote failure should NEVER break
      the Reelwise movie page.
    */

    console.error(
      "Automatic quote fallback error:",
      error
    );

    return {
      quotes: [],
      pageTitle: ""
    };
  }
}


/* ============================================================
   API HANDLER
   ============================================================ */

export default async function handler(req, res) {
  try {
    const rawId = req.query?.id;

    const id = Array.isArray(rawId)
      ? String(rawId[0] || "").trim()
      : String(rawId || "").trim();

    if (!id) {
      return res.status(400).json({
        error: "Movie ID is required.",
        quotes: [],
        quoteDetails: []
      });
    }


    /* --------------------------------------------------------
       IDENTIFY MOVIE
       -------------------------------------------------------- */

    const movie = await getMovie(id);

    const title = cleanText(
      movie.title ||
      movie.original_title
    );

    const year =
      typeof movie.release_date === "string"
        ? movie.release_date.slice(0, 4)
        : "";

    const key =
      normalizeTitle(title);


    /* --------------------------------------------------------
       CHECK REELWISE VAULT FIRST
       -------------------------------------------------------- */

    const vaultItems =
      QUOTE_VAULT &&
      QUOTE_VAULT[key]
        ? QUOTE_VAULT[key]
        : [];

    const prepared =
      prepareVaultQuotes(
        vaultItems,
        8
      );


    /*
      IMPORTANT:

      If Reelwise already has quotes for this movie,
      DO NOT mix automatic quotes into them.

      This protects Top Gun, Forrest Gump and every
      other existing Vault movie.
    */

    if (prepared.length > 0) {
      const quotes =
        prepared.map(function (item) {
          return item.quote;
        });

      const quoteDetails =
        prepared.map(function (item) {
          const detail = {
            quote: item.quote,
            verified:
              item.verified === true
          };

          if (item.character) {
            detail.character =
              item.character;
          }

          if (item.actor) {
            detail.actor =
              item.actor;
          }

          if (item.legacy === true) {
            detail.legacy = true;
          }

          return detail;
        });

      const verifiedCount =
        quoteDetails.filter(
          function (item) {
            return item.verified === true;
          }
        ).length;

      const legacyCount =
        quoteDetails.filter(
          function (item) {
            return item.legacy === true;
          }
        ).length;

      let source =
        "Reelwise Quote Vault";

      if (
        verifiedCount > 0 &&
        legacyCount > 0
      ) {
        source =
          "Reelwise Verified Vault + Legacy Vault";
      } else if (verifiedCount > 0) {
        source =
          "Reelwise Verified Vault";
      } else if (legacyCount > 0) {
        source =
          "Reelwise Legacy Vault";
      }

      return res.status(200).json({
        movie: title,
        year: year,
        quotes: quotes,
        quoteDetails: quoteDetails,
        source: source,
        curated: true,
        automatic: false,
        verified:
          prepared.length > 0 &&
          verifiedCount ===
            prepared.length,
        verifiedCount: verifiedCount,
        legacyCount: legacyCount
      });
    }


    /* --------------------------------------------------------
       NO VAULT QUOTES:
       TRY AUTOMATIC FALLBACK
       -------------------------------------------------------- */

    const automaticResult =
      await getAutomaticQuotes(
        title,
        year,
        8
      );

    const automaticQuotes =
      automaticResult.quotes || [];

    const quotes =
      automaticQuotes.map(
        function (item) {
          return item.quote;
        }
      );

    const quoteDetails =
      automaticQuotes.map(
        function (item) {
          return {
            quote: item.quote,
            verified: false,
            automatic: true
          };
        }
      );


    /* --------------------------------------------------------
       RETURN AUTOMATIC RESULTS
       -------------------------------------------------------- */

    return res.status(200).json({
      movie: title,
      year: year,
      quotes: quotes,
      quoteDetails: quoteDetails,

      source:
        automaticQuotes.length > 0
          ? "Automatic Wikiquote fallback"
          : "No Reelwise quotes available",

      wikiquotePage:
        automaticResult.pageTitle || "",

      curated: false,

      automatic:
        automaticQuotes.length > 0,

      verified: false,

      verifiedCount: 0,

      legacyCount: 0
    });

  } catch (error) {
    console.error(
      "Reelwise quotes error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Quotes could not be loaded.",
      quotes: [],
      quoteDetails: []
    });
  }
}

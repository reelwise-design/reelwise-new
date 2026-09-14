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

async function wikiquote(params) {
  const url =
    "https://en.wikiquote.org/w/api.php?" +
    new URLSearchParams({
      origin: "*",
      format: "json",
      formatversion: "2",
      ...params
    }).toString();

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Reelwise/1.0 movie-quotes"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Wikiquote request failed: ${response.status}`
    );
  }

  return response.json();
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\[[0-9]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTemplates(value) {
  let text = String(value || "");

  for (let i = 0; i < 10; i++) {
    const next = text.replace(
      /\{\{[^{}]*\}\}/g,
      " "
    );

    if (next === text) {
      break;
    }

    text = next;
  }

  return text;
}

function cleanWikiText(value) {
  let text = String(value || "");

  text = text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<ref[^>]*>[\s\S]*?<\/ref>/gi,
      " "
    )
    .replace(
      /<ref[^/>]*\/>/gi,
      " "
    );

  text = stripTemplates(text);

  text = text
    .replace(
      /\[\[(?:File|Image|Media):[\s\S]*?\]\]/gi,
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
    .replace(/\s+/g, " ");

  return cleanText(text);
}

async function findWikiquotePage(
  title,
  year
) {
  const searches = [
    `"${title}" film`,
    `${title} ${year || ""} film`,
    title
  ];

  for (const query of searches) {
    const data = await wikiquote({
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: "10",
      srnamespace: "0"
    });

    const results =
      data?.query?.search || [];

    if (!results.length) {
      continue;
    }

    const normalized =
      String(title)
        .toLowerCase()
        .trim();

    const ranked =
      results
        .map(result => {
          const candidate =
            String(
              result.title || ""
            );

          const lower =
            candidate.toLowerCase();

          let score = 0;

          if (lower === normalized) {
            score += 30;
          }

          if (
            lower.startsWith(
              normalized + " ("
            )
          ) {
            score += 25;
          }

          if (
            lower.includes(normalized)
          ) {
            score += 15;
          }

          if (
            lower.includes("film")
          ) {
            score += 5;
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

    if (ranked.length) {
      return ranked[0].title;
    }
  }

  return null;
}

async function getPageWikiText(
  pageTitle
) {
  const data = await wikiquote({
    action: "parse",
    page: pageTitle,
    prop: "wikitext"
  });

  return (
    data?.parse?.wikitext || ""
  );
}

function looksLikeMetadata(line) {
  const lower =
    String(line || "")
      .toLowerCase();

  const blocked = [
    "tagline",
    "external links",
    "see also",
    "references",
    "wikipedia",
    "official website",
    "about ",
    "cast:",
    "director:",
    "written by",
    "produced by",
    "category:",
    "thumb|",
    "file:",
    "image:"
  ];

  return blocked.some(
    term =>
      lower.includes(term)
  );
}

function parseQuoteLine(rawLine) {
  let line =
    String(rawLine || "")
      .trim();

  if (!line) {
    return null;
  }

  /*
    Wikiquote commonly uses bullet points for quotes.
  */
  if (
    !line.startsWith("*") &&
    !line.startsWith("#")
  ) {
    return null;
  }

  line = line.replace(
    /^[*#:;]+\s*/,
    ""
  );

  line = cleanWikiText(line);

  if (!line) {
    return null;
  }

  if (looksLikeMetadata(line)) {
    return null;
  }

  /*
    Avoid large dialogue exchanges.
  */
  if (
    line.length < 8 ||
    line.length > 140
  ) {
    return null;
  }

  /*
    Skip lines that look like paragraphs
    rather than memorable quotes.
  */
  const sentenceCount =
    (
      line.match(/[.!?]/g) || []
    ).length;

  if (sentenceCount > 2) {
    return null;
  }

  let speaker = null;
  let quote = line;

  /*
    Common Wikiquote format:
    Maverick: I feel the need...
  */
  const colonMatch =
    line.match(
      /^([^:]{2,40}):\s*(.+)$/
    );

  if (colonMatch) {
    speaker =
      colonMatch[1].trim();

    quote =
      colonMatch[2].trim();

    /*
      Don't mistake normal prose for
      a speaker label.
    */
    if (
      speaker.split(" ").length > 6
    ) {
      speaker = null;
      quote = line;
    }
  }

  quote = quote
    .replace(/^["“]/, "")
    .replace(/["”]$/, "")
    .trim();

  if (
    quote.length < 8 ||
    quote.length > 110
  ) {
    return null;
  }

  return {
    text: quote,
    speaker
  };
}

function uniqueQuotes(quotes) {
  const seen = new Set();

  return quotes.filter(item => {
    const key =
      item.text
        .toLowerCase()
        .replace(
          /[^a-z0-9]/g,
          ""
        );

    if (
      key.length < 6 ||
      seen.has(key)
    ) {
      return false;
    }

    seen.add(key);

    return true;
  });
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
        `/movie/${movieId}`
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
      await findWikiquotePage(
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

        quotes: [],

        message:
          "No Reelwise quote source was found for this movie."
      });
    }

    const raw =
      await getPageWikiText(
        pageTitle
      );

    const lines =
      String(raw || "")
        .split("\n");

    let quotes =
      lines
        .map(parseQuoteLine)
        .filter(Boolean);

    quotes =
      uniqueQuotes(quotes)
        /*
          Keep the selection deliberately small.
        */
        .slice(0, 6);

    const sourceUrl =
      "https://en.wikiquote.org/wiki/" +
      encodeURIComponent(
        pageTitle.replace(
          / /g,
          "_"
        )
      );

    quotes =
      quotes.map(item => ({
        ...item,
        sourceName:
          "Wikiquote",
        source:
          sourceUrl
      }));

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
        name:
          "Wikiquote",
        page:
          pageTitle,
        url:
          sourceUrl
      },

      quotes,

      message:
        quotes.length
          ? `Found ${quotes.length} short movie quotes.`
          : "No suitable short quotes were found for this movie."
    });

  } catch (error) {
    console.error(
      "Quotes API error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to load Reelwise quotes."
    });
  }
}

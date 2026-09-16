const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
const youtubeKey = process.env.YOUTUBE_API_KEY;

async function tmdb(path) {
  if (!tmdbToken) {
    throw new Error("TMDB token is not configured");
  }

  const response = await fetch(
    `https://api.themoviedb.org/3${path}`,
    {
      headers: {
        Authorization: `Bearer ${tmdbToken}`,
        accept: "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.status_message ||
      "Movie information could not be loaded"
    );
  }

  return data;
}

async function searchYouTube(query) {
  if (!youtubeKey) {
    throw new Error("YouTube API key is not configured");
  }

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "25",
    q: query,
    key: youtubeKey,
    safeSearch: "moderate"
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "YouTube videos could not be loaded"
    );
  }

  return Array.isArray(data.items)
    ? data.items
        .filter(item =>
          item?.id?.videoId &&
          item?.snippet?.title
        )
        .map(item => ({
          key: item.id.videoId,
          name: decodeText(item.snippet.title),
          description: decodeText(
            item.snippet.description || ""
          ),
          channel: decodeText(
            item.snippet.channelTitle || ""
          ),
          published_at:
            item.snippet.publishedAt || ""
        }))
    : [];
}

function decodeText(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, terms) {
  return terms.some(term =>
    text.includes(term)
  );
}

/*
  Creates useful title variants.

  Example:
  Rocky III becomes:
  - rocky iii
  - rocky 3

  This lets YouTube results using either
  spelling count as an exact movie match.
*/
function titleVariants(title) {
  const normalized = normalize(title);

  const romanToNumber = {
    " i": " 1",
    " ii": " 2",
    " iii": " 3",
    " iv": " 4",
    " v": " 5",
    " vi": " 6",
    " vii": " 7",
    " viii": " 8",
    " ix": " 9",
    " x": " 10"
  };

  const numberToRoman = {
    " 1": " i",
    " 2": " ii",
    " 3": " iii",
    " 4": " iv",
    " 5": " v",
    " 6": " vi",
    " 7": " vii",
    " 8": " viii",
    " 9": " ix",
    " 10": " x"
  };

  const variants = new Set([normalized]);

  for (const [roman, number] of Object.entries(romanToNumber)) {
    if (normalized.endsWith(roman)) {
      variants.add(
        normalized.slice(0, -roman.length) + number
      );
    }
  }

  for (const [number, roman] of Object.entries(numberToRoman)) {
    if (normalized.endsWith(number)) {
      variants.add(
        normalized.slice(0, -number.length) + roman
      );
    }
  }

  return [...variants];
}

function exactMovieMatch(text, title) {
  const normalizedText = normalize(text);
  const variants = titleVariants(title);

  return variants.some(variant =>
    normalizedText.includes(variant)
  );
}

function getBaseTitle(title) {
  const normalized = normalize(title);

  return normalized
    .replace(
      /\s+(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|\d+)$/,
      ""
    )
    .trim();
}

function hasWrongSequelNumber(text, title) {
  const normalizedText = normalize(text);
  const normalizedTitle = normalize(title);
  const base = getBaseTitle(title);

  if (!base || !normalizedText.includes(base)) {
    return false;
  }

  const variants = titleVariants(title);

  if (
    variants.some(variant =>
      normalizedText.includes(variant)
    )
  ) {
    return false;
  }

  /*
    If this movie has a sequel number but the
    result mentions the franchise with another
    sequel number, reject it.
  */
  const titleHasNumber =
    /\s+(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|\d+)$/.test(
      normalizedTitle
    );

  if (!titleHasNumber) {
    return false;
  }

  const sequelPattern =
    new RegExp(
      `\\b${escapeRegExp(base)}\\s+(?:1|2|3|4|5|6|7|8|9|10|i|ii|iii|iv|v|vi|vii|viii|ix|x)\\b`
    );

  return sequelPattern.test(normalizedText);
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function movieExtrasScore(video, title, year) {
  const name = normalize(video.name);
  const description = normalize(video.description);

  const combined =
    `${name} ${description}`;

  /*
    The exact movie title must appear somewhere
    in the YouTube title or description.

    Rocky III and Rocky 3 are treated as
    equivalent.
  */
  if (!exactMovieMatch(combined, title)) {
    return -1000;
  }

  if (hasWrongSequelNumber(combined, title)) {
    return -1000;
  }

  let score = 200;

  if (exactMovieMatch(name, title)) {
    score += 150;
  }

  if (year && combined.includes(String(year))) {
    score += 50;
  }

  const veryStrong = [
    "behind the scenes",
    "behind the movie",
    "making of",
    "the making of",
    "making the movie",
    "making the film"
  ];

  const strong = [
    "featurette",
    "on set",
    "on the set",
    "cast interview",
    "cast interviews",
    "director interview",
    "director interviews",
    "crew interview",
    "production",
    "filming",
    "retrospective",
    "documentary",
    "oral history",
    "anniversary",
    "screen test",
    "screen tests",
    "audition",
    "auditions"
  ];

  const useful = [
    "interview",
    "interviews",
    "cast",
    "director",
    "filmmaker",
    "filmmakers",
    "crew",
    "story of",
    "how they made",
    "how it was made",
    "inside",
    "backstage",
    "production story",
    "reunion",
    "remembering",
    "legacy",
    "facts"
  ];

  if (includesAny(name, veryStrong)) {
    score += 300;
  } else if (includesAny(combined, veryStrong)) {
    score += 200;
  }

  if (includesAny(name, strong)) {
    score += 180;
  } else if (includesAny(combined, strong)) {
    score += 90;
  }

  if (includesAny(name, useful)) {
    score += 100;
  } else if (includesAny(combined, useful)) {
    score += 40;
  }

  const ordinaryClipTerms = [
    "official trailer",
    "trailer",
    "teaser",
    "official clip",
    "movie clip",
    "film clip",
    "full scene",
    "fight scene",
    "final fight",
    "training scene",
    "opening scene",
    "ending scene",
    "best scene",
    "best scenes",
    "movie scene",
    "film scene",
    "tv spot",
    "commercial"
  ];

  if (includesAny(name, ordinaryClipTerms)) {
    score -= 500;
  }

  const clipWords = [
    "clip",
    "scene"
  ];

  const extrasWords = [
    "behind",
    "making",
    "interview",
    "featurette",
    "production",
    "filming",
    "documentary",
    "retrospective",
    "cast",
    "director",
    "crew",
    "on set",
    "story of",
    "anniversary",
    "reunion",
    "facts"
  ];

  if (
    includesAny(name, clipWords) &&
    !includesAny(name, extrasWords)
  ) {
    score -= 350;
  }

  return score;
}

function blooperScore(video, title, year) {
  const name = normalize(video.name);
  const description = normalize(video.description);

  const combined =
    `${name} ${description}`;

  if (!exactMovieMatch(combined, title)) {
    return -1000;
  }

  if (hasWrongSequelNumber(combined, title)) {
    return -1000;
  }

  let score = 200;

  if (exactMovieMatch(name, title)) {
    score += 150;
  }

  if (year && combined.includes(String(year))) {
    score += 50;
  }

  const blooperTerms = [
    "bloopers",
    "blooper",
    "outtakes",
    "outtake",
    "gag reel",
    "gag reels"
  ];

  if (includesAny(name, blooperTerms)) {
    score += 350;
  } else if (includesAny(combined, blooperTerms)) {
    score += 200;
  } else {
    return -1000;
  }

  return score;
}

function removeDuplicates(videos) {
  const seen = new Set();

  return videos.filter(video => {
    if (!video.key || seen.has(video.key)) {
      return false;
    }

    seen.add(video.key);
    return true;
  });
}

export default async function handler(req, res) {
  try {
    const id =
      String(req.query?.id || "").trim();

    const feature =
      String(req.query?.feature || "behind")
        .trim()
        .toLowerCase();

    if (!id) {
      return res.status(400).json({
        error: "Missing movie id"
      });
    }

    if (
      feature !== "behind" &&
      feature !== "bloopers"
    ) {
      return res.status(400).json({
        error: "Invalid extras category"
      });
    }

    const movie = await tmdb(
      `/movie/${encodeURIComponent(id)}?language=en-US`
    );

    const title =
      String(movie.title || "").trim();

    const year =
      movie.release_date
        ? movie.release_date.slice(0, 4)
        : "";

    if (!title) {
      throw new Error(
        "Movie title could not be determined"
      );
    }

    /*
      Search with both title formats when
      applicable.

      Example:
      Rocky III → "Rocky III" "Rocky 3"
    */
    const variants = titleVariants(title);

    const searchTitle =
      variants.length > 1
        ? variants.map(item => `"${item}"`).join(" ")
        : `"${title}"`;

    let query = "";

    if (feature === "behind") {
      query =
        `${searchTitle} ${year} making of behind the scenes interview featurette`;
    } else {
      query =
        `${searchTitle} ${year} bloopers outtakes gag reel`;
    }

    const youtubeVideos =
      await searchYouTube(query);

    let selected = [];

    if (feature === "behind") {
      selected = removeDuplicates(
        youtubeVideos
          .map(video => ({
            ...video,
            score: movieExtrasScore(
              video,
              title,
              year
            )
          }))
          .filter(video =>
            video.score >= 200
          )
          .sort(
            (a, b) =>
              b.score - a.score
          )
      ).slice(0, 6);
    }

    if (feature === "bloopers") {
      selected = removeDuplicates(
        youtubeVideos
          .map(video => ({
            ...video,
            score: blooperScore(
              video,
              title,
              year
            )
          }))
          .filter(video =>
            video.score >= 200
          )
          .sort(
            (a, b) =>
              b.score - a.score
          )
      ).slice(0, 6);
    }

    return res.status(200).json({
      feature,
      movie: title,
      year,

      videos: selected.map(video => ({
        key: video.key,
        name: video.name,
        type:
          feature === "behind"
            ? "Movie Extra"
            : "Blooper",
        official: false
      }))
    });

  } catch (error) {
    console.error(
      "Reelwise extras API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Movie extras could not be loaded"
    });
  }
}

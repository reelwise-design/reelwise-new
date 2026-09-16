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
          item &&
          item.id &&
          item.id.videoId &&
          item.snippet &&
          item.snippet.title
        )
        .map(item => ({
          key: item.id.videoId,
          name: decodeYouTubeText(item.snippet.title),
          description: decodeYouTubeText(
            item.snippet.description || ""
          ),
          channel: decodeYouTubeText(
            item.snippet.channelTitle || ""
          ),
          published_at:
            item.snippet.publishedAt || ""
        }))
    : [];
}

function decodeYouTubeText(value) {
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

function movieExtrasScore(video, title, year) {
  const name = normalize(video.name);
  const description = normalize(video.description);
  const channel = normalize(video.channel);

  const combined =
    `${name} ${description} ${channel}`;

  const normalizedTitle = normalize(title);

  let score = 0;

  /*
    The result should clearly relate to
    the movie we're looking for.
  */

  if (name.includes(normalizedTitle)) {
    score += 90;
  } else if (combined.includes(normalizedTitle)) {
    score += 45;
  }

  if (year && combined.includes(String(year))) {
    score += 20;
  }

  /*
    Strong Movie Extras signals.
  */

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
    "production stories",
    "reunion",
    "remembering",
    "legacy"
  ];

  if (includesAny(name, veryStrong)) {
    score += 300;
  } else if (includesAny(combined, veryStrong)) {
    score += 220;
  }

  if (includesAny(name, strong)) {
    score += 180;
  } else if (includesAny(combined, strong)) {
    score += 100;
  }

  if (includesAny(name, useful)) {
    score += 90;
  } else if (includesAny(combined, useful)) {
    score += 45;
  }

  /*
    Ordinary movie scenes should be pushed
    out of Movie Extras.
  */

  const ordinaryClipTerms = [
    "official trailer",
    "trailer",
    "teaser",
    "official clip",
    "movie clip",
    "film clip",
    "full scene",
    "scene hd",
    "fight scene",
    "final fight",
    "training scene",
    "opening scene",
    "ending scene",
    "best scene",
    "best scenes",
    "movie scene",
    "movie scenes",
    "film scene",
    "film scenes",
    "clip hd",
    "clips hd",
    "tv spot",
    "commercial"
  ];

  if (includesAny(name, ordinaryClipTerms)) {
    score -= 400;
  }

  /*
    Extra protection against titles that
    look like ordinary scene uploads.
  */

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
    "reunion"
  ];

  if (
    includesAny(name, clipWords) &&
    !includesAny(name, extrasWords)
  ) {
    score -= 250;
  }

  return score;
}

function blooperScore(video, title, year) {
  const name = normalize(video.name);
  const description = normalize(video.description);

  const combined =
    `${name} ${description}`;

  const normalizedTitle = normalize(title);

  let score = 0;

  if (name.includes(normalizedTitle)) {
    score += 100;
  } else if (combined.includes(normalizedTitle)) {
    score += 40;
  }

  if (year && combined.includes(String(year))) {
    score += 20;
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
    /*
      Don't show unrelated videos in
      the Bloopers section.
    */
    score -= 500;
  }

  const blocked = [
    "trailer",
    "teaser",
    "movie clip",
    "official clip",
    "full scene",
    "fight scene",
    "ending scene",
    "tv spot"
  ];

  if (includesAny(name, blocked)) {
    score -= 400;
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

    /*
      First get the exact movie title and year
      from TMDB. This helps distinguish movies
      with similar titles and remakes.
    */

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

    let query = "";

    if (feature === "behind") {
      query =
        `"${title}" ${year} making of behind the scenes interview featurette`;
    } else {
      query =
        `"${title}" ${year} bloopers outtakes gag reel`;
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
            video.score >= 100
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
            video.score >= 150
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

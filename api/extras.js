const token = process.env.TMDB_READ_ACCESS_TOKEN;

async function tmdb(path) {
  if (!token) {
    throw new Error("TMDB token is not configured");
  }

  const response = await fetch(
    `https://api.themoviedb.org/3${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.status_message ||
      "Movie extras could not be loaded"
    );
  }

  return data;
}

function cleanVideos(videos) {
  const seen = new Set();

  return (videos || [])
    .filter(video =>
      video &&
      video.site === "YouTube" &&
      video.key &&
      video.name
    )
    .filter(video => {
      if (seen.has(video.key)) return false;
      seen.add(video.key);
      return true;
    })
    .map(video => ({
      key: video.key,
      name: video.name,
      type: video.type || "",
      official: Boolean(video.official),
      published_at: video.published_at || ""
    }));
}

function isMovieClip(video) {
  const name =
    String(video.name || "").toLowerCase();

  const blocked = [
    "official trailer",
    "trailer",
    "teaser",
    "official clip",
    "movie clip",
    "film clip",
    "exclusive clip",
    "extended clip",
    "full scene",
    "fight scene",
    "training scene",
    "final fight",
    "opening scene",
    "ending scene",
    "promo",
    "tv spot",
    "commercial"
  ];

  return blocked.some(term =>
    name.includes(term)
  );
}

function behindScore(video) {
  const name =
    String(video.name || "").toLowerCase();

  const type =
    String(video.type || "").toLowerCase();

  if (isMovieClip(video)) {
    return 0;
  }

  let score = 0;

  if (name.includes("behind the scenes")) {
    score += 250;
  }

  if (name.includes("behind-the-scenes")) {
    score += 250;
  }

  if (name.includes("making of")) {
    score += 230;
  }

  if (name.includes("making-of")) {
    score += 230;
  }

  if (name.includes("the making of")) {
    score += 230;
  }

  if (name.includes("on set")) {
    score += 190;
  }

  if (name.includes("on-set")) {
    score += 190;
  }

  if (name.includes("bts")) {
    score += 180;
  }

  if (name.includes("production")) {
    score += 140;
  }

  if (name.includes("featurette")) {
    score += 130;
  }

  if (name.includes("cast interview")) {
    score += 150;
  }

  if (name.includes("director interview")) {
    score += 150;
  }

  if (name.includes("interview")) {
    score += 100;
  }

  if (name.includes("documentary")) {
    score += 120;
  }

  if (name.includes("inside")) {
    score += 90;
  }

  if (name.includes("backstage")) {
    score += 150;
  }

  if (type === "behind the scenes") {
    score += 180;
  }

  if (type === "featurette") {
    score += 80;
  }

  if (video.official) {
    score += 10;
  }

  return score;
}

function blooperScore(video) {
  const name =
    String(video.name || "").toLowerCase();

  if (isMovieClip(video)) {
    return 0;
  }

  let score = 0;

  if (name.includes("bloopers")) {
    score += 250;
  }

  if (name.includes("blooper")) {
    score += 250;
  }

  if (name.includes("outtakes")) {
    score += 250;
  }

  if (name.includes("outtake")) {
    score += 250;
  }

  if (name.includes("gag reel")) {
    score += 250;
  }

  if (name.includes("gag-reel")) {
    score += 250;
  }

  if (name.includes("funny outtakes")) {
    score += 200;
  }

  if (video.official) {
    score += 10;
  }

  return score;
}

async function getAllMovieVideos(id) {

  /*
    TMDB can return different video sets
    depending on language filtering.

    We check the normal English results and
    then a broader result set, combine them,
    and remove duplicates.
  */

  const paths = [
    `/movie/${encodeURIComponent(id)}/videos?language=en-US`,
    `/movie/${encodeURIComponent(id)}/videos?include_video_language=en,null`
  ];

  const collected = [];

  for (const path of paths) {
    try {
      const data = await tmdb(path);

      if (Array.isArray(data.results)) {
        collected.push(...data.results);
      }
    } catch (error) {
      console.error(
        "Video lookup failed:",
        path,
        error.message
      );
    }
  }

  return cleanVideos(collected);
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

    const videos =
      await getAllMovieVideos(id);

    let selected = [];

    if (feature === "behind") {

      selected = videos
        .map(video => ({
          ...video,
          score: behindScore(video)
        }))
        .filter(video =>
          video.score > 0
        )
        .sort(
          (a, b) =>
            b.score - a.score
        )
        .slice(0, 6);
    }

    if (feature === "bloopers") {

      selected = videos
        .map(video => ({
          ...video,
          score: blooperScore(video)
        }))
        .filter(video =>
          video.score > 0
        )
        .sort(
          (a, b) =>
            b.score - a.score
        )
        .slice(0, 6);
    }

    return res.status(200).json({
      feature,

      videos: selected.map(video => ({
        key: video.key,
        name: video.name,
        type: video.type,
        official: video.official
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

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
  const name = String(video.name || "").toLowerCase();

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
    "scene",
    "fight scene",
    "training scene",
    "final fight",
    "opening scene",
    "ending scene",
    "promo",
    "tv spot",
    "commercial"
  ];

  return blocked.some(term => name.includes(term));
}

function behindScore(video) {
  const name = String(video.name || "").toLowerCase();
  const type = String(video.type || "").toLowerCase();

  if (isMovieClip(video)) {
    return 0;
  }

  let score = 0;

  if (name.includes("behind the scenes")) score += 200;
  if (name.includes("behind-the-scenes")) score += 200;

  if (name.includes("making of")) score += 190;
  if (name.includes("making-of")) score += 190;
  if (name.includes("the making of")) score += 190;

  if (name.includes("on set")) score += 160;
  if (name.includes("on-set")) score += 160;

  if (name.includes("bts")) score += 140;

  if (name.includes("production featurette")) score += 140;
  if (name.includes("behind the movie")) score += 140;

  if (name.includes("cast interview")) score += 120;
  if (name.includes("director interview")) score += 120;
  if (name.includes("interview")) score += 80;

  if (name.includes("featurette")) score += 100;

  if (type === "behind the scenes") score += 100;

  /*
    A generic TMDB "Featurette" label alone
    is not enough. The title must also look
    like genuine supplemental material.
  */
  if (
    type === "featurette" &&
    (
      name.includes("featurette") ||
      name.includes("making") ||
      name.includes("behind") ||
      name.includes("interview") ||
      name.includes("on set") ||
      name.includes("production")
    )
  ) {
    score += 70;
  }

  if (video.official) score += 10;

  return score;
}

function blooperScore(video) {
  const name = String(video.name || "").toLowerCase();

  let score = 0;

  if (name.includes("bloopers")) score += 200;
  if (name.includes("blooper")) score += 200;

  if (name.includes("outtakes")) score += 200;
  if (name.includes("outtake")) score += 200;

  if (name.includes("gag reel")) score += 200;
  if (name.includes("gag-reel")) score += 200;

  if (name.includes("funny outtakes")) score += 150;

  if (video.official) score += 10;

  return score;
}

export default async function handler(req, res) {
  try {
    const id = String(req.query?.id || "").trim();

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

    const data = await tmdb(
      `/movie/${encodeURIComponent(id)}/videos?language=en-US`
    );

    const videos = cleanVideos(data.results);

    let selected = [];

    if (feature === "bloopers") {
      selected = videos
        .map(video => ({
          ...video,
          score: blooperScore(video)
        }))
        .filter(video => video.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    }

    if (feature === "behind") {
      selected = videos
        .map(video => ({
          ...video,
          score: behindScore(video)
        }))
        .filter(video => video.score > 0)
        .sort((a, b) => b.score - a.score)
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

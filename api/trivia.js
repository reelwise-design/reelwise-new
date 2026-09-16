const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  REELWISE CURATED TRIVIA VAULT

  Curated trivia is written as complete,
  self-contained stories — never fragments.
*/

const CURATED_TRIVIA = {

  "rocky iv": [
    "Sylvester Stallone wanted the Rocky–Drago fight to look unusually realistic. Stallone has said he asked Dolph Lundgren to hit him for real during filming. The resulting blows were so severe that Stallone later required hospital treatment.",

    "Dolph Lundgren was a relative newcomer when he was cast as Ivan Drago. His imposing size and background in martial arts helped create the physically intimidating opponent Stallone wanted for Rocky.",

    "Rocky's isolated training scenes were filmed in Wyoming, including locations around Jackson Hole and Grand Teton National Park, which stood in for the Soviet Union.",

    "Rocky IV marked the final appearance of Apollo Creed in the original Rocky series. His exhibition fight against Ivan Drago becomes the event that drives Rocky to challenge Drago.",

    "The film contrasts Drago's highly technological training with Rocky's old-fashioned workouts in the snow, mountains and barn. The visual contrast is one of the movie's central themes.",

    "Rocky IV became one of the biggest commercial successes of the Rocky series and remains closely associated with its 1980s soundtrack, training montages and Cold War setting."
  ]

};

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

async function getMovie(id) {
  if (!TOKEN) {
    throw new Error(
      "TMDB token is not configured"
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
      data.status_message ||
      "Movie lookup failed"
    );
  }

  return data;
}

async function getWikipediaExtract(title) {
  try {
    const url =
      "https://en.wikipedia.org/w/api.php" +
      "?action=query" +
      "&prop=extracts" +
      "&explaintext=1" +
      "&redirects=1" +
      "&format=json" +
      "&origin=*" +
      "&titles=" +
      encodeURIComponent(title);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Reelwise/1.0 movie trivia"
      }
    });

    if (!response.ok) {
      return "";
    }

    const data = await response.json();

    const pages =
      data?.query?.pages || {};

    const page =
      Object.values(pages)[0];

    if (
      !page ||
      page.missing !== undefined
    ) {
      return "";
    }

    return page.extract || "";

  } catch {
    return "";
  }
}

function extractTrivia(text) {
  if (!text) return [];

  /*
    Split Wikipedia prose into sentences,
    then keep substantial self-contained
    facts rather than tiny fragments.
  */

  const cleaned =
    text
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const sentences =
    cleaned.match(
      /[^.!?]+[.!?]+/g
    ) || [];

  const candidates =
    sentences
      .map(sentence =>
        sentence.trim()
      )
      .filter(sentence =>
        sentence.length >= 70 &&
        sentence.length <= 300
      )
      .filter(sentence => {
        const lower =
          sentence.toLowerCase();

        return !(
          lower.includes("references") ||
          lower.includes("external links") ||
          lower.includes("see also") ||
          lower.includes("bibliography")
        );
      });

  const results = [];
  const seen = new Set();

  for (const sentence of candidates) {

    const key =
      sentence
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    results.push(sentence);

    if (results.length >= 6) {
      break;
    }
  }

  return results;
}

export default async function handler(req, res) {

  try {

    const id =
      String(req.query?.id || "").trim();

    if (!id) {
      return res.status(400).json({
        error: "Movie ID is required."
      });
    }

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
      STEP 1:
      Reelwise curated trivia.
    */

    const curated =
      CURATED_TRIVIA[key] || [];

    if (curated.length) {

      return res.status(200).json({
        movie: title,
        year,
        trivia: curated,
        source: "Reelwise Vault",
        curated: true
      });

    }

    /*
      STEP 2:
      Automatic fallback for movies
      not yet curated by Reelwise.
    */

    const possibleTitles = [
      title,
      `${title} (film)`,
      year
        ? `${title} (${year} film)`
        : ""
    ].filter(Boolean);

    let extract = "";

    for (
      const pageTitle of possibleTitles
    ) {

      extract =
        await getWikipediaExtract(
          pageTitle
        );

      if (extract) {
        break;
      }
    }

    const trivia =
      extractTrivia(extract);

    return res.status(200).json({
      movie: title,
      year,
      trivia,
      source:
        trivia.length
          ? "Wikipedia"
          : "No trivia source found",
      curated: false
    });

  } catch (error) {

    console.error(
      "Reelwise trivia error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Trivia could not be loaded.",
      trivia: []
    });

  }
}

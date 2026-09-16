const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  REELWISE ICONIC QUOTE VAULT

  Curated quotes always appear first.
  Each quote must belong to the exact movie.
*/

const ICONIC_QUOTES = {

  "it's a wonderful life": [
    "Every time a bell rings, an angel gets his wings.",
    "No man is a failure who has friends.",
    "I want to live again!",
    "You want the moon? Just say the word and I'll throw a lasso around it and pull it down.",
    "Merry Christmas, you wonderful old Building and Loan!",
    "To my big brother George, the richest man in town."
  ],

  "rocky": [
    "Yo, Adrian!",
    "All I wanna do is go the distance.",
    "Nobody's ever gone the distance with Creed.",
    "It really don't matter if I lose this fight.",
    "I just wanna prove somethin' — I ain't no bum."
  ],

  "rocky ii": [
    "Yo, Adrian! I did it!",
    "You're gonna eat lightning and you're gonna crap thunder!",
    "There's one thing I want you to do for me. Win.",
    "I just gotta be around you.",
    "I never asked you to stop being a woman. Please don't ask me to stop being a man."
  ],

  "rocky iii": [
    "I don't hate Balboa. I pity the fool.",
    "There is no tomorrow!",
    "You ain't so bad!",
    "Nothing is real if you don't believe in who you are."
  ],

  "rocky iv": [
    "I must break you.",
    "If he dies, he dies.",
    "He's not a machine. He's a man!",
    "I guess what I'm trying to say is, if I can change, and you can change, everybody can change!"
  ],

  "jaws": [
    "You're gonna need a bigger boat.",
    "Smile, you son of a—",
    "That's some bad hat, Harry.",
    "Here's to swimmin' with bow-legged women."
  ],

  "top gun": [
    "I feel the need — the need for speed!",
    "You can be my wingman any time.",
    "That's right, Iceman. I am dangerous.",
    "Talk to me, Goose.",
    "Your ego is writing checks your body can't cash."
  ],

  "a few good men": [
    "You can't handle the truth!",
    "I want the truth!",
    "You want answers?",
    "You don't need to wear a patch on your arm to have honor."
  ],

  "back to the future": [
    "Where we're going, we don't need roads.",
    "Great Scott!",
    "Nobody calls me chicken.",
    "If my calculations are correct, when this baby hits 88 miles per hour, you're gonna see some serious stuff."
  ],

  "the godfather": [
    "I'm gonna make him an offer he can't refuse.",
    "Leave the gun. Take the cannoli.",
    "It's not personal, Sonny. It's strictly business.",
    "A man who doesn't spend time with his family can never be a real man."
  ],

  "goodfellas": [
    "As far back as I can remember, I always wanted to be a gangster.",
    "Funny how? I mean, funny like I'm a clown?",
    "Never rat on your friends, and always keep your mouth shut.",
    "For us to live any other way was nuts.",
    "Now go home and get your shine box."
  ],

  "the hangover": [
    "What happens in Vegas stays in Vegas. Except herpes.",
    "I'm not supposed to be within two hundred feet of a school.",
    "You guys might not know this, but I consider myself a bit of a loner."
  ],

  "old school": [
    "We're going streaking!",
    "You're my boy, Blue!",
    "Once it hits your lips, it's so good!",
    "Just ring the bell, you pansy.",
    "I have a nice little Saturday planned."
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

async function getWikiquotePage(title) {
  try {
    const url =
      "https://en.wikiquote.org/w/api.php" +
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
          "Reelwise/1.0 movie quote discovery"
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

function cleanLine(line) {
  return String(line || "")
    .replace(/^[-*#:]+\s*/, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function usableQuote(line) {
  if (!line) return false;
  if (line.length < 15) return false;
  if (line.length > 150) return false;

  const lower =
    line.toLowerCase();

  if (
    lower.startsWith("see also") ||
    lower.startsWith("external links") ||
    lower.startsWith("references") ||
    lower.startsWith("cast") ||
    lower.startsWith("about ") ||
    lower.startsWith("tagline")
  ) {
    return false;
  }

  if (
    line.includes("[") ||
    line.includes("]")
  ) {
    return false;
  }

  return true;
}

function extractFallbackQuotes(text) {
  if (!text) return [];

  const lines =
    text
      .split(/\r?\n/)
      .map(cleanLine)
      .filter(usableQuote);

  const results = [];
  const seen = new Set();

  for (let line of lines) {

    const speaker =
      line.match(
        /^[A-Za-z0-9 .'-]{1,40}:\s+(.+)$/
      );

    if (speaker) {
      line =
        cleanLine(speaker[1]);
    }

    if (!usableQuote(line)) {
      continue;
    }

    const key =
      line
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    results.push(line);

    if (results.length >= 5) {
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

    const curated =
      ICONIC_QUOTES[key] || [];

    /*
      REELWISE CURATED VAULT
    */

    if (curated.length) {

      return res.status(200).json({
        movie: title,
        year,
        quotes: curated,
        source: "Reelwise Vault",
        curated: true
      });

    }

    /*
      AUTOMATIC FALLBACK

      Movies without a curated Reelwise
      entry still receive quotes.
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
        await getWikiquotePage(pageTitle);

      if (extract) {
        break;
      }
    }

    const fallback =
      extractFallbackQuotes(extract);

    return res.status(200).json({
      movie: title,
      year,
      quotes: fallback,
      source:
        fallback.length
          ? "Wikiquote"
          : "No quote source found",
      curated: false
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

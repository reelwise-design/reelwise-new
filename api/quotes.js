const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  REELWISE QUOTE ENGINE

  Curated quotes always appear first.

  For movies not yet in the curated Reelwise Vault,
  Reelwise searches Wikiquote and separates:

  QUOTE:
  A standalone memorable line.

  DIALOGUE:
  Consecutive speaker-to-speaker conversation.

  Dialogue exchanges are rejected rather than displayed
  as separate quote cards.
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
    "If I can change, and you can change, everybody can change!"
  ],

  "rocky balboa": [
    "It ain't about how hard you hit.",
    "It's about how hard you can get hit and keep moving forward.",
    "That's how winning is done!",
    "The world ain't all sunshine and rainbows.",
    "You, me, or nobody is gonna hit as hard as life.",
    "Until you start believing in yourself, you ain't gonna have a life."
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

  "top gun: maverick": [
    "It's not the plane, it's the pilot.",
    "Don't think. Just do.",
    "Talk to me, Goose.",
    "It's time to let go.",
    "You'll know when I'm gone."
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

  "the godfather part ii": [
    "Keep your friends close, but your enemies closer.",
    "I know it was you, Fredo. You broke my heart.",
    "We're both part of the same hypocrisy, Senator.",
    "If anything in this life is certain, if history has taught us anything, it is that you can kill anyone."
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
  ],

  "forrest gump": [
    "Life was like a box of chocolates.",
    "Run, Forrest, run!",
    "Stupid is as stupid does.",
    "I'm not a smart man, but I know what love is."
  ],

  "the sixth sense": [
    "I see dead people.",
    "They don't know they're dead.",
    "They only see what they want to see."
  ],

  "fight club": [
    "The first rule of Fight Club is: you do not talk about Fight Club.",
    "The second rule of Fight Club is: you do not talk about Fight Club.",
    "It's only after we've lost everything that we're free to do anything.",
    "This is your life, and it's ending one minute at a time."
  ],

  "jerry maguire": [
    "Show me the money!",
    "You complete me.",
    "You had me at hello.",
    "Help me help you."
  ],

  "dirty harry": [
    "You've got to ask yourself one question: Do I feel lucky?",
    "Well, do ya, punk?"
  ],

  "taxi driver": [
    "You talkin' to me?",
    "Well, I'm the only one here.",
    "Someday a real rain will come and wash all this scum off the streets."
  ],

  "scream": [
    "What's your favorite scary movie?",
    "Movies don't create psychos. Movies make psychos more creative.",
    "There are certain rules that one must abide by in order to successfully survive a horror movie."
  ],

  "dirty dancing": [
    "Nobody puts Baby in a corner.",
    "I carried a watermelon.",
    "I'm scared of walking out of this room and never feeling the rest of my whole life the way I feel when I'm with you."
  ],

  "the sandlot": [
    "You're killing me, Smalls!",
    "Heroes get remembered, but legends never die.",
    "For-ev-er."
  ],

  "airplane!": [
    "Surely you can't be serious.",
    "I am serious. And don't call me Shirley.",
    "Looks like I picked the wrong week to quit smoking.",
    "Roger, Roger. What's our vector, Victor?"
  ],

  "groundhog day": [
    "Well, what if there is no tomorrow? There wasn't one today.",
    "Don't drive angry!",
    "I'm a god. I'm not the God... I don't think."
  ],

  "when harry met sally...": [
    "I'll have what she's having.",
    "You made a woman meow?",
    "Men and women can't be friends because the sex part always gets in the way."
  ],

  "rudy": [
    "You're five-foot-nothin', a hundred-and-nothin'.",
    "In this lifetime, you don't have to prove nothin' to nobody except yourself.",
    "I've been ready for this my whole life."
  ]
};

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
    throw new Error(data.status_message || "Movie lookup failed");
  }

  return data;
}

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
          "User-Agent": "Reelwise/2.0 movie quote discovery"
        }
      }
    );

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

async function getWikiquotePage(title) {
  const data = await wikiquoteRequest({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    redirects: "1",
    titles: title
  });

  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];

  if (!page || page.missing !== undefined) {
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

async function searchWikiquote(title, year) {
  const searches = [
    year ? `"${title}" ${year} film` : "",
    `"${title}" film`,
    title
  ].filter(Boolean);

  const found = [];
  const seen = new Set();

  for (const searchText of searches) {
    const data = await wikiquoteRequest({
      action: "query",
      list: "search",
      srnamespace: "0",
      srlimit: "10",
      srsearch: searchText
    });

    const searchResults = data?.query?.search || [];

    for (const result of searchResults) {
      const candidate = String(result?.title || "").trim();
      const key = candidate.toLowerCase();

      if (!candidate || seen.has(key)) continue;

      seen.add(key);
      found.push(candidate);
    }

    if (found.length >= 15) break;
  }

  return found;
}

function likelyMoviePage(candidate, title, year) {
  const wanted = looseTitle(title);
  const got = looseTitle(candidate);

  if (!wanted || !got) return false;

  if (got === wanted) return true;

  if (
    got.startsWith(`${wanted} `) &&
    got.length <= wanted.length + 20
  ) {
    return true;
  }

  if (
    year &&
    normalizeTitle(candidate).includes(String(year)) &&
    got.includes(wanted)
  ) {
    return true;
  }

  return false;
}

function cleanLine(line) {
  return String(line || "")
    .replace(/^[-*#:]+\s*/, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/*
  Detect:

  Daniel: Hello.
  Miranda: What are you doing?

  Speaker labels are detected BEFORE they are removed.
*/
function parseSpeakerLine(line) {
  const cleaned = cleanLine(line);

  const match = cleaned.match(
    /^([A-Za-z0-9][A-Za-z0-9 .,'’\-]{0,44}):\s+(.+)$/
  );

  if (!match) return null;

  return {
    speaker: match[1].trim(),
    text: cleanLine(match[2])
  };
}

function looksLikeHeading(line) {
  const lower = normalizeTitle(line);

  const headings = [
    "dialogue",
    "quotes",
    "cast",
    "taglines",
    "about",
    "see also",
    "external links",
    "references",
    "sources",
    "notes"
  ];

  return headings.includes(lower);
}

function usableQuote(line) {
  if (!line) return false;

  if (line.length < 12) return false;
  if (line.length > 220) return false;

  const lower = line.toLowerCase();

  if (looksLikeHeading(line)) return false;

  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("wikipedia") ||
    lower.startsWith("wikiquote")
  ) {
    return false;
  }

  if (
    lower.includes(" is a film") ||
    lower.includes(" is a movie") ||
    lower.includes("directed by") ||
    lower.includes("written by") ||
    lower.includes("produced by") ||
    lower.includes("starring ") ||
    lower.includes("released in")
  ) {
    return false;
  }

  if (
    line.includes("[") ||
    line.includes("]")
  ) {
    return false;
  }

  if (
    line.endsWith(":") ||
    line.endsWith("—")
  ) {
    return false;
  }

  if (
    /^\(.*\)$/.test(line) ||
    /^\[.*\]$/.test(line)
  ) {
    return false;
  }

  return true;
}

/*
  REELWISE DIALOGUE DETECTOR

  A speaker line becomes dialogue when another speaker line
  appears immediately before or after it.

  Example:

  Lou: Well, I thought I should comment...
  Daniel: What situation?
  Lou: The fact that Pudgy...

  All three are rejected.

  But:

  Daniel: Help is on the way, dear!

  standing by itself can still qualify as a quote.
*/
function extractFallbackQuotes(text) {
  if (!text) return [];

  const rawLines = String(text).split(/\r?\n/);

  const entries = rawLines.map(raw => {
    const cleaned = cleanLine(raw);

    return {
      raw,
      cleaned,
      speaker: parseSpeakerLine(raw)
    };
  });

  const candidates = [];
  const seen = new Set();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (!entry.cleaned) continue;

    /*
      Skip obvious section headings.
    */
    if (looksLikeHeading(entry.cleaned)) {
      continue;
    }

    let quoteText = entry.cleaned;

    if (entry.speaker) {

      /*
        Find nearest meaningful line above.
      */
      let previous = null;

      for (let p = i - 1; p >= 0; p--) {
        if (!entries[p].cleaned) continue;
        previous = entries[p];
        break;
      }

      /*
        Find nearest meaningful line below.
      */
      let next = null;

      for (let n = i + 1; n < entries.length; n++) {
        if (!entries[n].cleaned) continue;
        next = entries[n];
        break;
      }

      /*
        Consecutive speaker lines = conversation/dialogue.

        Do NOT turn each piece of that conversation into
        a separate quote card.
      */
      const previousIsSpeaker =
        previous &&
        previous.speaker;

      const nextIsSpeaker =
        next &&
        next.speaker;

      if (
        previousIsSpeaker ||
        nextIsSpeaker
      ) {
        continue;
      }

      quoteText = entry.speaker.text;
    }

    quoteText = cleanLine(quoteText);

    if (!usableQuote(quoteText)) {
      continue;
    }

    /*
      Reject lines that still contain multiple speaker markers.
    */
    const embeddedSpeakers = quoteText.match(
      /(?:^|\s)[A-Z][A-Za-z0-9 .,'’\-]{1,35}:\s/g
    );

    if (
      embeddedSpeakers &&
      embeddedSpeakers.length > 1
    ) {
      continue;
    }

    const key = quoteText
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    candidates.push(quoteText);
  }

  /*
    Prefer lines that look more like memorable quotations
    rather than explanatory prose.
  */
  const scored = candidates.map((quote, index) => {
    let score = 0;

    const length = quote.length;

    if (length >= 20 && length <= 120) {
      score += 4;
    } else if (length <= 170) {
      score += 2;
    }

    if (/[!?]$/.test(quote)) {
      score += 2;
    }

    if (/["']/.test(quote)) {
      score += 1;
    }

    /*
      Preserve Wikiquote ordering as a secondary signal.
    */
    score += Math.max(0, 2 - index * 0.03);

    return {
      quote,
      score,
      index
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.index - b.index;
  });

  return scored
    .slice(0, 6)
    .map(item => item.quote);
}

export default async function handler(req, res) {
  try {
    const id = String(req.query?.id || "").trim();

    if (!id) {
      return res.status(400).json({
        error: "Movie ID is required."
      });
    }

    const movie = await getMovie(id);

    const title =
      movie.title ||
      movie.original_title ||
      "";

    const year = movie.release_date
      ? movie.release_date.slice(0, 4)
      : "";

    const key = normalizeTitle(title);

    /*
      FIRST CHOICE:
      Reelwise's hand-curated quote vault.
    */
    const curated =
      ICONIC_QUOTES[key] ||
      [];

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
      SECOND CHOICE:
      Try likely Wikiquote page names.
    */
    const possibleTitles = [
      year ? `${title} (${year} film)` : "",
      `${title} (film)`,
      title
    ].filter(Boolean);

    let pageUsed = "";
    let fallback = [];

    for (const pageTitle of possibleTitles) {
      const page =
        await getWikiquotePage(pageTitle);

      if (!page.extract) {
        continue;
      }

      const quotes =
        extractFallbackQuotes(page.extract);

      if (quotes.length) {
        pageUsed =
          page.title ||
          pageTitle;

        fallback = quotes;
        break;
      }
    }

    /*
      THIRD CHOICE:
      Search Wikiquote if the obvious page name didn't work.
    */
    if (!fallback.length) {
      const candidates =
        await searchWikiquote(title, year);

      for (const candidate of candidates) {
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
          await getWikiquotePage(candidate);

        if (!page.extract) {
          continue;
        }

        const quotes =
          extractFallbackQuotes(page.extract);

        if (quotes.length) {
          pageUsed =
            page.title ||
            candidate;

          fallback = quotes;
          break;
        }
      }
    }

    return res.status(200).json({
      movie: title,
      year,
      quotes: fallback,
      source: fallback.length
        ? "Wikiquote — Reelwise filtered"
        : "No standalone quote source found",
      curated: false,
      page: fallback.length
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

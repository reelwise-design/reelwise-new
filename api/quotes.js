const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  REELWISE ICONIC QUOTE VAULT

  Curated quotes always appear first.
  For all other movies, Reelwise uses Wikiquote but deliberately
  excludes dialogue/conversation sections.

  Goal:
  Quotes = memorable standalone lines.
  Quotes ≠ chunks of back-and-forth dialogue.
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
          "User-Agent": "Reelwise/1.0 movie quote discovery"
        }
      }
    );

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

/*
  Get Wikiquote's raw page markup.

  Raw markup is important because it lets Reelwise see section
  headings such as == Dialogue == before extracting lines.
*/
async function getWikiquotePage(title) {
  const data = await wikiquoteRequest({
    action: "parse",
    page: title,
    prop: "wikitext",
    redirects: "1"
  });

  if (!data?.parse?.wikitext?.["*"]) {
    return {
      title: "",
      text: ""
    };
  }

  return {
    title: data.parse.title || title,
    text: data.parse.wikitext["*"] || ""
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
      srlimit: "8",
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

    if (found.length >= 12) break;
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
    got.length <= wanted.length + 18
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

/*
  Remove Wiki markup without destroying the quote itself.
*/
function cleanWikiLine(value) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/^[:*#;\-\s]+/, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headingName(line) {
  const match = String(line || "").trim().match(
    /^(={2,6})\s*(.*?)\s*\1$/
  );

  return match
    ? normalizeTitle(match[2])
    : "";
}

/*
  Sections that do NOT contain standalone movie quotes.

  Most importantly, Dialogue is excluded completely.
*/
function blockedSection(name) {
  const value = normalizeTitle(name);

  if (!value) return false;

  const blocked = [
    "dialogue",
    "dialogs",
    "dialog",
    "cast",
    "taglines",
    "tagline",
    "about",
    "about the film",
    "external links",
    "external link",
    "references",
    "reference",
    "sources",
    "source",
    "see also",
    "notes",
    "soundtrack",
    "songs",
    "lyrics"
  ];

  return blocked.some(section =>
    value === section ||
    value.startsWith(section + " ")
  );
}

function usableStandaloneQuote(line) {
  if (!line) return false;

  if (line.length < 12) return false;
  if (line.length > 220) return false;

  const lower = line.toLowerCase();

  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("category:") ||
    lower.startsWith("file:") ||
    lower.startsWith("image:")
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
    line.endsWith(":") ||
    line.endsWith("—") ||
    line.endsWith("-")
  ) {
    return false;
  }

  return true;
}

/*
  REELWISE STANDALONE QUOTE EXTRACTOR

  Important behavior:

  1. Reads Wikiquote section-by-section.
  2. Completely ignores Dialogue.
  3. Ignores metadata/reference sections.
  4. Accepts normal character quote sections.
  5. Removes a speaker label when Wikiquote includes one.
  6. Deduplicates results.
*/
function extractStandaloneQuotes(wikitext) {
  if (!wikitext) return [];

  const lines = String(wikitext).split(/\r?\n/);

  const quotes = [];
  const seen = new Set();

  let section = "";
  let sectionIsBlocked = false;

  for (const rawLine of lines) {

    const heading = headingName(rawLine);

    if (heading) {
      section = heading;
      sectionIsBlocked = blockedSection(section);
      continue;
    }

    if (sectionIsBlocked) {
      continue;
    }

    const trimmed = String(rawLine || "").trim();

    /*
      Wikiquote quotes normally appear as list items.
      Avoid treating ordinary article prose as a quote.
    */
    if (
      !trimmed.startsWith("*") &&
      !trimmed.startsWith(":") &&
      !trimmed.startsWith("#")
    ) {
      continue;
    }

    let line = cleanWikiLine(trimmed);

    if (!line) continue;

    /*
      Remove a speaker label such as:

      Daniel: Good morning!

      But only when what follows it is substantial enough
      to function as a standalone line.
    */
    const speakerMatch = line.match(
      /^[A-Za-z0-9 .,'’\-]{1,45}:\s+(.+)$/
    );

    if (speakerMatch) {
      line = cleanWikiLine(speakerMatch[1]);
    }

    if (!usableStandaloneQuote(line)) {
      continue;
    }

    /*
      Reject stage directions and obvious descriptions.
    */
    if (
      /^\(.*\)$/.test(line) ||
      /^\[.*\]$/.test(line)
    ) {
      continue;
    }

    /*
      Reject lines that still look like multiple speakers
      packed into one quote.
    */
    const speakerMarkers = line.match(
      /(?:^|\s)[A-Z][A-Za-z .'-]{1,30}:\s/g
    );

    if (speakerMarkers && speakerMarkers.length > 1) {
      continue;
    }

    const key = line
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    quotes.push(line);

    if (quotes.length >= 6) {
      break;
    }
  }

  return quotes;
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

    const curated =
      ICONIC_QUOTES[key] ||
      [];

    /*
      REELWISE CURATED VAULT

      These are hand-selected and always take priority.
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
      FALLBACK 1

      Try the most likely Wikiquote movie pages.
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

      if (!page.text) {
        continue;
      }

      const quotes =
        extractStandaloneQuotes(page.text);

      if (quotes.length) {
        pageUsed =
          page.title ||
          pageTitle;

        fallback = quotes;
        break;
      }
    }

    /*
      FALLBACK 2

      Search Wikiquote if the obvious page names fail.
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

        if (!page.text) {
          continue;
        }

        const quotes =
          extractStandaloneQuotes(page.text);

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
        ? "Wikiquote — standalone quotes"
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

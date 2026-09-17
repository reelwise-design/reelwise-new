const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  ============================================================
  REELWISE QUOTE ENGINE
  ============================================================

  REELWISE RULES:

  1. Curated Reelwise quotes ALWAYS win.
  2. Automatic quotes come from the movie's Wikiquote page.
  3. Standalone quotes are strongly preferred.
  4. Dialogue exchanges are not treated as standalone quotes.
  5. Cast lists, headings, descriptions, credits, stage
     directions and Wiki artifacts are rejected.
  6. The automatic system favors complete, concise lines
     rather than trying to guess "iconic" quotes from words.
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
  ],

  "mrs. doubtfire": [
    "Help is on the way, dear!",
    "It was a run-by fruiting!",
    "Oh, sir. I saw it! Some angry member of the kitchen staff. Did you not tip them?",
    "Carpe dentum. Seize the teeth.",
    "I admire that honesty, Natalie. That's a noble quality. Never lose that, because it often disappears with age, or entering politics."
  ]
};


/* ============================================================
   TITLE HELPERS
   ============================================================ */

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


/* ============================================================
   TMDB
   ============================================================ */

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
    throw new Error(
      data.status_message || "Movie lookup failed"
    );
  }

  return data;
}


/* ============================================================
   WIKIQUOTE
   ============================================================ */

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

    if (!response.ok) {
      return null;
    }

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
      srlimit: "8",
      srsearch: searchText
    });

    const results = data?.query?.search || [];

    for (const result of results) {

      const candidate =
        String(result?.title || "").trim();

      const key = candidate.toLowerCase();

      if (!candidate || seen.has(key)) {
        continue;
      }

      seen.add(key);
      found.push(candidate);
    }

    if (found.length >= 12) {
      break;
    }
  }

  return found;
}


function likelyMoviePage(candidate, title, year) {

  const wanted = looseTitle(title);
  const got = looseTitle(candidate);

  if (!wanted || !got) {
    return false;
  }

  if (got === wanted) {
    return true;
  }

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


/* ============================================================
   CLEANING
   ============================================================ */

function cleanLine(line) {

  return String(line || "")
    .replace(/^[-*#:]+\s*/, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\[edit\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}


function quoteKey(line) {

  return String(line || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}


function headingName(line) {

  return String(line || "")
    .replace(/^=+\s*/, "")
    .replace(/\s*=+$/, "")
    .trim()
    .toLowerCase();
}


function isBlockedSection(section) {

  return [
    "dialogue",
    "cast",
    "taglines",
    "tagline",
    "external links",
    "external link",
    "references",
    "reference",
    "see also",
    "sources",
    "source",
    "notes",
    "about",
    "links"
  ].includes(section);
}


function usableStandaloneQuote(line) {

  if (!line) {
    return false;
  }

  if (line.length < 10 || line.length > 190) {
    return false;
  }

  const lower = line.toLowerCase();

  if (
    /^=+.*=+$/.test(line) ||
    line.startsWith("==") ||
    line.endsWith("==")
  ) {
    return false;
  }

  /*
    Reject stage directions and annotations.
  */
  if (
    /^\[.*\]$/.test(line) ||
    /^\(.*\)$/.test(line) ||
    /^\[/.test(line)
  ) {
    return false;
  }

  /*
    Reject obvious article/description language.
  */
  const descriptionTerms = [
    "is a film",
    "is a movie",
    "directed by",
    "starring ",
    "released in",
    "written by",
    "produced by",
    "based on the",
    "based on a",
    "screenplay by",
    "distributed by",
    "external link",
    "wikipedia",
    "wikiquote"
  ];

  if (
    descriptionTerms.some(term =>
      lower.includes(term)
    )
  ) {
    return false;
  }

  /*
    Reject URLs.
  */
  if (
    lower.includes("http://") ||
    lower.includes("https://") ||
    lower.includes("www.")
  ) {
    return false;
  }

  /*
    Reject cast-credit formatting.
  */
  if (
    /^[A-Za-z .'-]{2,45}\s+[—–-]\s+[A-Za-z ./'’-]{2,80}$/.test(line)
  ) {
    return false;
  }

  /*
    Reject unfinished labels/fragments.
  */
  if (
    line.endsWith(":") ||
    line.endsWith("—") ||
    line.endsWith("–")
  ) {
    return false;
  }

  /*
    Reject lines that are mostly metadata.
  */
  const words = line.split(/\s+/);

  if (words.length < 3) {
    return false;
  }

  const numbers = line.match(/\d+/g) || [];

  if (numbers.length >= 3) {
    return false;
  }

  return true;
}


/* ============================================================
   QUOTE QUALITY
   ============================================================ */

function quoteQuality(line, position) {

  const words =
    line.split(/\s+/).filter(Boolean);

  const count = words.length;

  let score = 0;

  /*
    Favor the normal length range of memorable standalone
    movie lines without pretending certain vocabulary makes
    something "iconic."
  */
  if (count >= 3 && count <= 8) {
    score += 35;
  } else if (count <= 16) {
    score += 30;
  } else if (count <= 24) {
    score += 20;
  } else if (count <= 32) {
    score += 8;
  } else {
    score -= 15;
  }

  /*
    Complete sentence punctuation gets a modest advantage.
  */
  if (/[.!?…]["']?$/.test(line)) {
    score += 10;
  }

  /*
    Exclamation/question marks often indicate a self-contained
    line, but only give a small bonus.
  */
  if (line.includes("!")) {
    score += 4;
  }

  if (line.includes("?")) {
    score += 3;
  }

  /*
    Avoid long explanatory lines containing lots of
    semicolons/parentheticals.
  */
  const commas = (line.match(/,/g) || []).length;
  const semicolons = (line.match(/;/g) || []).length;

  if (commas >= 4) {
    score -= 8;
  }

  if (semicolons >= 2) {
    score -= 10;
  }

  /*
    Earlier quotes receive only a tiny advantage.
  */
  score += Math.max(0, 6 - Math.floor(position / 3));

  return score;
}


/* ============================================================
   EXTRACT STANDALONE QUOTES
   ============================================================ */

function extractFallbackQuotes(text) {

  if (!text) {
    return [];
  }

  const rawLines = text.split(/\r?\n/);

  const candidates = [];
  const seen = new Set();

  let section = "";
  let position = 0;

  for (const raw of rawLines) {

    const rawTrimmed =
      String(raw || "").trim();

    if (!rawTrimmed) {
      continue;
    }

    /*
      Detect Wikiquote section headings before cleaning them.
  */
    if (/^=+.*=+$/.test(rawTrimmed)) {

      section = headingName(rawTrimmed);

      continue;
    }

    let line = cleanLine(rawTrimmed);

    if (!line) {
      continue;
    }

    /*
      Plain-text extracts can also expose headings without
      equals signs.
  */
    const possibleHeading =
      headingName(line);

    if (
      [
        "dialogue",
        "cast",
        "taglines",
        "tagline",
        "external links",
        "external link",
        "references",
        "reference",
        "see also",
        "sources",
        "source",
        "notes"
      ].includes(possibleHeading)
    ) {

      section = possibleHeading;
      continue;
    }

    /*
      Critical Reelwise change:

      Do NOT mine the Dialogue section automatically.

      A dialogue exchange may contain famous material, but
      separating one speaker's response from the surrounding
      conversation is exactly what created many of the poor
      quote results we were seeing.
  */
    if (isBlockedSection(section)) {
      continue;
    }

    /*
      Wikiquote often uses:

      Character: quote

      Character labels are fine when the quote exists as a
      standalone entry outside the Dialogue section.
  */
    const speaker =
      line.match(
        /^[A-Za-z0-9 .'"’()-]{1,45}:\s+(.+)$/
      );

    if (speaker) {
      line = cleanLine(speaker[1]);
    }

    if (!usableStandaloneQuote(line)) {
      continue;
    }

    const key = quoteKey(line);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);

    candidates.push({
      text: line,
      score: quoteQuality(line, position),
      position
    });

    position++;
  }

  candidates.sort((a, b) => {

    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.position - b.position;
  });

  const selected = [];
  const selectedKeys = [];

  for (const candidate of candidates) {

    const key = quoteKey(candidate.text);

    const duplicate =
      selectedKeys.some(existing => {

        if (existing === key) {
          return true;
        }

        if (
          key.length > 25 &&
          existing.length > 25 &&
          (
            key.includes(existing) ||
            existing.includes(key)
          )
        ) {
          return true;
        }

        return false;
      });

    if (duplicate) {
      continue;
    }

    selected.push(candidate.text);
    selectedKeys.push(key);

    if (selected.length >= 5) {
      break;
    }
  }

  return selected;
}


/* ============================================================
   MAIN API
   ============================================================ */

export default async function handler(req, res) {

  try {

    const id =
      String(req.query?.id || "").trim();

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

    const year =
      movie.release_date
        ? movie.release_date.slice(0, 4)
        : "";

    const key = normalizeTitle(title);


    /*
      ========================================================
      REELWISE CURATED VAULT
      ========================================================
  */

    const curated =
      ICONIC_QUOTES[key] || [];

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
      ========================================================
      AUTOMATIC FALLBACK 1
      ========================================================
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
          page.title || pageTitle;

        fallback = quotes;

        break;
      }
    }


    /*
      ========================================================
      AUTOMATIC FALLBACK 2
      ========================================================
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
            page.title || candidate;

          fallback = quotes;

          break;
        }
      }
    }


    /*
      ========================================================
      RETURN
      ========================================================
  */

    return res.status(200).json({
      movie: title,
      year,
      quotes: fallback,
      source:
        fallback.length
          ? "Wikiquote"
          : "No quote source found",
      curated: false,
      page:
        fallback.length
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

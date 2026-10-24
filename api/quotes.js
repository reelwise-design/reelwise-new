import QUOTE_VAULT from "../data/quotes.js";

// REELWISE QUOTES 3 — source-corroborated character aliases.
// Curated wording and verification flags are preserved; source matches fill remaining slots.
// IDENTITY_BINDINGS is generated from the reviewed existing Vault catalogue.
const IDENTITY_BINDINGS = {
  "630": {
    "key": "the wizard of oz",
    "title": "The Wizard of Oz",
    "year": 1939
  },
  "770": {
    "key": "gone with the wind",
    "title": "Gone with the Wind",
    "year": 1939
  },
  "289": {
    "key": "casablanca",
    "title": "Casablanca",
    "year": 1943
  },
  "15": {
    "key": "citizen kane",
    "title": "Citizen Kane",
    "year": 1941
  },
  "1585": {
    "key": "it's a wonderful life",
    "title": "It's a Wonderful Life",
    "year": 1946
  },
  "599": {
    "key": "sunset boulevard",
    "title": "Sunset Boulevard",
    "year": 1950
  },
  "702": {
    "key": "a streetcar named desire",
    "title": "A Streetcar Named Desire",
    "year": 1951
  },
  "872": {
    "key": "singin' in the rain",
    "title": "Singin' in the Rain",
    "year": 1952
  },
  "654": {
    "key": "on the waterfront",
    "title": "On the Waterfront",
    "year": 1954
  },
  "10653": {
    "key": "the seven year itch",
    "title": "The Seven Year Itch",
    "year": 1955
  },
  "6844": {
    "key": "the ten commandments",
    "title": "The Ten Commandments",
    "year": 1956
  },
  "239": {
    "key": "some like it hot",
    "title": "Some Like It Hot",
    "year": 1959
  },
  "539": {
    "key": "psycho",
    "title": "Psycho",
    "year": 1960
  },
  "967": {
    "key": "spartacus",
    "title": "Spartacus",
    "year": 1960
  },
  "646": {
    "key": "dr. no",
    "title": "Dr. No",
    "year": 1962
  },
  "935": {
    "key": "dr. strangelove",
    "title": "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
    "year": 1964
  },
  "658": {
    "key": "goldfinger",
    "title": "Goldfinger",
    "year": 1964
  },
  "37247": {
    "key": "the graduate",
    "title": "The Graduate",
    "year": 1967
  },
  "903": {
    "key": "cool hand luke",
    "title": "Cool Hand Luke",
    "year": 1967
  },
  "62": {
    "key": "2001: a space odyssey",
    "title": "2001: A Space Odyssey",
    "year": 1968
  },
  "3116": {
    "key": "midnight cowboy",
    "title": "Midnight Cowboy",
    "year": 1969
  },
  "984": {
    "key": "dirty harry",
    "title": "Dirty Harry",
    "year": 1971
  },
  "238": {
    "key": "the godfather",
    "title": "The Godfather",
    "year": 1972
  },
  "9552": {
    "key": "the exorcist",
    "title": "The Exorcist",
    "year": 1973
  },
  "240": {
    "key": "the godfather part ii",
    "title": "The Godfather Part II",
    "year": 1974
  },
  "578": {
    "key": "jaws",
    "title": "Jaws",
    "year": 1975
  },
  "762": {
    "key": "monty python and the holy grail",
    "title": "Monty Python and the Holy Grail",
    "year": 1975
  },
  "103": {
    "key": "taxi driver",
    "title": "Taxi Driver",
    "year": 1976
  },
  "1366": {
    "key": "rocky",
    "title": "Rocky",
    "year": 1976
  },
  "11": {
    "key": "star wars",
    "title": "Star Wars",
    "year": 1977
  },
  "840": {
    "key": "close encounters of the third kind",
    "title": "Close Encounters of the Third Kind",
    "year": 1977
  },
  "8469": {
    "key": "animal house",
    "title": "Animal House",
    "year": 1978
  },
  "1367": {
    "key": "rocky ii",
    "title": "Rocky II",
    "year": 1979
  },
  "28": {
    "key": "apocalypse now",
    "title": "Apocalypse Now",
    "year": 1979
  },
  "813": {
    "key": "airplane!",
    "title": "Airplane!",
    "year": 1980
  },
  "694": {
    "key": "the shining",
    "title": "The Shining",
    "year": 1980
  },
  "1891": {
    "key": "the empire strikes back",
    "title": "The Empire Strikes Back",
    "year": 1980
  },
  "11977": {
    "key": "caddyshack",
    "title": "Caddyshack",
    "year": 1980
  },
  "85": {
    "key": "raiders of the lost ark",
    "title": "Raiders of the Lost Ark",
    "year": 1981
  },
  "1371": {
    "key": "rocky iii",
    "title": "Rocky III",
    "year": 1982
  },
  "601": {
    "key": "e.t. the extra-terrestrial",
    "title": "E.T. the Extra-Terrestrial",
    "year": 1982
  },
  "111": {
    "key": "scarface",
    "title": "Scarface",
    "year": 1983
  },
  "620": {
    "key": "ghostbusters",
    "title": "Ghostbusters",
    "year": 1984
  },
  "218": {
    "key": "the terminator",
    "title": "The Terminator",
    "year": 1984
  },
  "1885": {
    "key": "the karate kid",
    "title": "The Karate Kid",
    "year": 1984
  },
  "1374": {
    "key": "rocky iv",
    "title": "Rocky IV",
    "year": 1985
  },
  "105": {
    "key": "back to the future",
    "title": "Back to the Future",
    "year": 1985
  },
  "744": {
    "key": "top gun",
    "title": "Top Gun",
    "year": 1986
  },
  "9377": {
    "key": "ferris bueller's day off",
    "title": "Ferris Bueller's Day Off",
    "year": 1986
  },
  "235": {
    "key": "stand by me",
    "title": "Stand by Me",
    "year": 1986
  },
  "679": {
    "key": "aliens",
    "title": "Aliens",
    "year": 1986
  },
  "792": {
    "key": "platoon",
    "title": "Platoon",
    "year": 1986
  },
  "2493": {
    "key": "the princess bride",
    "title": "The Princess Bride",
    "year": 1987
  },
  "600": {
    "key": "full metal jacket",
    "title": "Full Metal Jacket",
    "year": 1987
  },
  "106": {
    "key": "predator",
    "title": "Predator",
    "year": 1987
  },
  "88": {
    "key": "dirty dancing",
    "title": "Dirty Dancing",
    "year": 1987
  },
  "10673": {
    "key": "wall street",
    "title": "Wall Street",
    "year": 1987
  },
  "562": {
    "key": "die hard",
    "title": "Die Hard",
    "year": 1988
  },
  "4011": {
    "key": "beetlejuice",
    "title": "Beetlejuice",
    "year": 1988
  },
  "2323": {
    "key": "field of dreams",
    "title": "Field of Dreams",
    "year": 1989
  },
  "207": {
    "key": "dead poets society",
    "title": "Dead Poets Society",
    "year": 1989
  },
  "268": {
    "key": "batman",
    "title": "Batman",
    "year": 1989
  },
  "639": {
    "key": "when harry met sally...",
    "title": "When Harry Met Sally...",
    "year": 1989
  },
  "5825": {
    "key": "national lampoon's christmas vacation",
    "title": "National Lampoon's Christmas Vacation",
    "year": 1989
  },
  "771": {
    "key": "home alone",
    "title": "Home Alone",
    "year": 1990
  },
  "769": {
    "key": "goodfellas",
    "title": "GoodFellas",
    "year": 1990
  },
  "274": {
    "key": "the silence of the lambs",
    "title": "The Silence of the Lambs",
    "year": 1991
  },
  "280": {
    "key": "terminator 2: judgment day",
    "title": "Terminator 2: Judgment Day",
    "year": 1991
  },
  "11287": {
    "key": "a league of their own",
    "title": "A League of Their Own",
    "year": 1992
  },
  "500": {
    "key": "reservoir dogs",
    "title": "Reservoir Dogs",
    "year": 1992
  },
  "881": {
    "key": "a few good men",
    "title": "A Few Good Men",
    "year": 1992
  },
  "137": {
    "key": "groundhog day",
    "title": "Groundhog Day",
    "year": 1993
  },
  "329": {
    "key": "jurassic park",
    "title": "Jurassic Park",
    "year": 1993
  },
  "5503": {
    "key": "the fugitive",
    "title": "The Fugitive",
    "year": 1993
  },
  "11969": {
    "key": "tombstone",
    "title": "Tombstone",
    "year": 1993
  },
  "788": {
    "key": "mrs. doubtfire",
    "title": "Mrs. Doubtfire",
    "year": 1993
  },
  "13": {
    "key": "forrest gump",
    "title": "Forrest Gump",
    "year": 1994
  },
  "680": {
    "key": "pulp fiction",
    "title": "Pulp Fiction",
    "year": 1994
  },
  "278": {
    "key": "the shawshank redemption",
    "title": "The Shawshank Redemption",
    "year": 1994
  },
  "8587": {
    "key": "the lion king",
    "title": "The Lion King",
    "year": 1994
  },
  "568": {
    "key": "apollo 13",
    "title": "Apollo 13",
    "year": 1995
  },
  "197": {
    "key": "braveheart",
    "title": "Braveheart",
    "year": 1995
  },
  "862": {
    "key": "toy story",
    "title": "Toy Story",
    "year": 1995
  },
  "9390": {
    "key": "jerry maguire",
    "title": "Jerry Maguire",
    "year": 1996
  },
  "4232": {
    "key": "scream",
    "title": "Scream",
    "year": 1996
  },
  "489": {
    "key": "good will hunting",
    "title": "Good Will Hunting",
    "year": 1997
  },
  "597": {
    "key": "titanic",
    "title": "Titanic",
    "year": 1997
  },
  "115": {
    "key": "the big lebowski",
    "title": "The Big Lebowski",
    "year": 1998
  },
  "857": {
    "key": "saving private ryan",
    "title": "Saving Private Ryan",
    "year": 1998
  },
  "37165": {
    "key": "the truman show",
    "title": "The Truman Show",
    "year": 1998
  },
  "10663": {
    "key": "the waterboy",
    "title": "The Waterboy",
    "year": 1998
  },
  "745": {
    "key": "the sixth sense",
    "title": "The Sixth Sense",
    "year": 1999
  },
  "550": {
    "key": "fight club",
    "title": "Fight Club",
    "year": 1999
  },
  "603": {
    "key": "the matrix",
    "title": "The Matrix",
    "year": 1999
  },
  "2105": {
    "key": "american pie",
    "title": "American Pie",
    "year": 1999
  },
  "1271": {
    "key": "300",
    "title": "300",
    "year": 2007
  },
  "98": {
    "key": "gladiator",
    "title": "Gladiator",
    "year": 2000
  },
  "1597": {
    "key": "meet the parents",
    "title": "Meet the Parents",
    "year": 2000
  },
  "10637": {
    "key": "remember the titans",
    "title": "Remember the Titans",
    "year": 2000
  },
  "8358": {
    "key": "cast away",
    "title": "Cast Away",
    "year": 2000
  },
  "2034": {
    "key": "training day",
    "title": "Training Day",
    "year": 2001
  },
  "120": {
    "key": "the lord of the rings: the fellowship of the ring",
    "title": "The Lord of the Rings: The Fellowship of the Ring",
    "year": 2001
  },
  "9398": {
    "key": "zoolander",
    "title": "Zoolander",
    "year": 2001
  },
  "808": {
    "key": "shrek",
    "title": "Shrek",
    "year": 2001
  },
  "557": {
    "key": "spider-man",
    "title": "Spider-Man",
    "year": 2002
  },
  "121": {
    "key": "the lord of the rings: the two towers",
    "title": "The Lord of the Rings: The Two Towers",
    "year": 2002
  },
  "640": {
    "key": "catch me if you can",
    "title": "Catch Me If You Can",
    "year": 2002
  },
  "12": {
    "key": "finding nemo",
    "title": "Finding Nemo",
    "year": 2003
  },
  "22": {
    "key": "pirates of the caribbean: the curse of the black pearl",
    "title": "Pirates of the Caribbean: The Curse of the Black Pearl",
    "year": 2003
  },
  "10719": {
    "key": "elf",
    "title": "Elf",
    "year": 2003
  },
  "11635": {
    "key": "old school",
    "title": "Old School",
    "year": 2003
  },
  "8699": {
    "key": "anchorman: the legend of ron burgundy",
    "title": "Anchorman: The Legend of Ron Burgundy",
    "year": 2004
  },
  "10625": {
    "key": "mean girls",
    "title": "Mean Girls",
    "year": 2004
  },
  "9472": {
    "key": "dodgeball: a true underdog story",
    "title": "DodgeBall: A True Underdog Story",
    "year": 2004
  },
  "6957": {
    "key": "the 40-year-old virgin",
    "title": "The 40 Year-Old Virgin",
    "year": 2005
  },
  "272": {
    "key": "batman begins",
    "title": "Batman Begins",
    "year": 2005
  },
  "9522": {
    "key": "wedding crashers",
    "title": "Wedding Crashers",
    "year": 2005
  },
  "1246": {
    "key": "rocky balboa",
    "title": "Rocky Balboa",
    "year": 2006
  },
  "1422": {
    "key": "the departed",
    "title": "The Departed",
    "year": 2006
  },
  "8363": {
    "key": "superbad",
    "title": "Superbad",
    "year": 2007
  },
  "6977": {
    "key": "no country for old men",
    "title": "No Country for Old Men",
    "year": 2007
  },
  "12133": {
    "key": "step brothers",
    "title": "Step Brothers",
    "year": 2008
  },
  "155": {
    "key": "the dark knight",
    "title": "The Dark Knight",
    "year": 2008
  },
  "8681": {
    "key": "taken",
    "title": "Taken",
    "year": 2008
  },
  "18785": {
    "key": "the hangover",
    "title": "The Hangover",
    "year": 2009
  },
  "27205": {
    "key": "inception",
    "title": "Inception",
    "year": 2010
  },
  "10193": {
    "key": "toy story 3",
    "title": "Toy Story 3",
    "year": 2010
  },
  "37799": {
    "key": "the social network",
    "title": "The Social Network",
    "year": 2010
  },
  "55721": {
    "key": "bridesmaids",
    "title": "Bridesmaids",
    "year": 2011
  },
  "50646": {
    "key": "crazy, stupid, love.",
    "title": "Crazy, Stupid, Love.",
    "year": 2011
  },
  "45243": {
    "key": "the hangover part ii",
    "title": "The Hangover Part II",
    "year": 2011
  },
  "24428": {
    "key": "the avengers",
    "title": "The Avengers",
    "year": 2012
  },
  "68718": {
    "key": "django unchained",
    "title": "Django Unchained",
    "year": 2012
  },
  "82693": {
    "key": "silver linings playbook",
    "title": "Silver Linings Playbook",
    "year": 2012
  },
  "106646": {
    "key": "the wolf of wall street",
    "title": "The Wolf of Wall Street",
    "year": 2013
  },
  "118340": {
    "key": "guardians of the galaxy",
    "title": "Guardians of the Galaxy",
    "year": 2014
  },
  "157336": {
    "key": "interstellar",
    "title": "Interstellar",
    "year": 2014
  },
  "244786": {
    "key": "whiplash",
    "title": "Whiplash",
    "year": 2014
  },
  "245891": {
    "key": "john wick",
    "title": "John Wick",
    "year": 2014
  },
  "257091": {
    "key": "get hard",
    "title": "Get Hard",
    "year": 2015
  },
  "76341": {
    "key": "mad max: fury road",
    "title": "Mad Max: Fury Road",
    "year": 2015
  },
  "274167": {
    "key": "daddy's home",
    "title": "Daddy's Home",
    "year": 2015
  },
  "281957": {
    "key": "the revenant",
    "title": "The Revenant",
    "year": 2015
  },
  "293660": {
    "key": "deadpool",
    "title": "Deadpool",
    "year": 2016
  },
  "313369": {
    "key": "la la land",
    "title": "La La Land",
    "year": 2016
  },
  "381284": {
    "key": "hidden figures",
    "title": "Hidden Figures",
    "year": 2016
  },
  "419430": {
    "key": "get out",
    "title": "Get Out",
    "year": 2017
  },
  "297762": {
    "key": "wonder woman",
    "title": "Wonder Woman",
    "year": 2017
  },
  "332562": {
    "key": "a star is born",
    "title": "A Star Is Born",
    "year": 2018
  },
  "424694": {
    "key": "bohemian rhapsody",
    "title": "Bohemian Rhapsody",
    "year": 2018
  },
  "466272": {
    "key": "once upon a time... in hollywood",
    "title": "Once Upon a Time... in Hollywood",
    "year": 2019
  },
  "359724": {
    "key": "ford v ferrari",
    "title": "Ford v Ferrari",
    "year": 2019
  },
  "361743": {
    "key": "top gun: maverick",
    "title": "Top Gun: Maverick",
    "year": 2022
  }
};
const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const LIMIT = 8;
const responseCache = new Map();

function normalize(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
function cleanText(value) {
  return String(value || "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<ref\b[^>]*\/>/gi, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—").replace(/&hellip;/gi, "…")
    .replace(/\s+/g, " ").trim();
}
function quoteKey(value) { return normalize(value); }
async function requestJSON(url, options, deadline) {
  const remaining = deadline - Date.now();
  if (remaining < 150) throw new Error("Quote lookup time limit reached.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(4000, remaining));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error("Quote source request failed (" + response.status + ").");
    const data = await response.json();
    if (data.error) throw new Error(data.error.info || "Quote source returned an error.");
    return data;
  } finally { clearTimeout(timer); }
}
async function getMovie(id, deadline) {
  if (!TOKEN) throw new Error("TMDB token is not configured.");
  const movie = await requestJSON("https://api.themoviedb.org/3/movie/" + id +
    "?language=en-US&append_to_response=credits", {
      headers: { Authorization: "Bearer " + TOKEN, Accept: "application/json" }
    }, deadline);
  if (String(movie.id) !== String(id) || !/^\d{4}-\d{2}-\d{2}$/.test(movie.release_date || "")) {
    throw new Error("Movie identity and release year could not be confirmed.");
  }
  return movie;
}
function movieYear(movie) { return String(movie.release_date || "").slice(0, 4); }
function matchingBinding(movie) {
  const binding = IDENTITY_BINDINGS[String(movie.id)];
  if (!binding || String(binding.year) !== movieYear(movie)) return null;
  const titles = [movie.title, movie.original_title].filter(Boolean).map(normalize);
  return [binding.key, binding.title].some(t => titles.includes(normalize(t))) ? binding : null;
}
function characterIndex(movie, wikitext = "") {
  const fullNames = new Map(), aliases = new Map();
  const actors = new Map(), sourceNames = new Map();
  function register(map, alias, entry) {
    const key = normalize(alias); if (!key) return;
    const owners = map.get(key) || [];
    if (!owners.some(e => e.actor === entry.actor && e.character === entry.character)) owners.push(entry);
    map.set(key, owners);
  }
  for (const cast of movie.credits?.cast || []) {
    const character = cleanText(cast.character).replace(/\s*\((?:voice|uncredited)\)\s*/gi, " ").trim();
    const actor = cleanText(cast.name);
    if (!character || !actor || /\b(?:self|archive footage)\b/i.test(character)) continue;
    const entry = { character, actor };
    const actorEntries = actors.get(normalize(actor)) || [];
    actorEntries.push(entry); actors.set(normalize(actor), actorEntries);
    register(fullNames, character, entry);
    for (const part of character.split(/\s*\/\s*/)) {
      register(fullNames, part, entry);
      const plain = part.replace(/\b(?:dr|mr|mrs|ms|prof|capt|captain|lt|lieutenant|sgt|sergeant|chief|commander)\.?\s+/gi, "");
      register(aliases, plain, entry);
      // TMDB uses both Pete 'Maverick' Mitchell and Pete "Maverick" Mitchell.
      for (const m of part.matchAll(/(?:^|\s)["“‘']([^"”’']+)["”’'](?=\s|$)/g)) register(aliases, m[1], entry);
      const words = normalize(plain).split(" ").filter(w => w.length > 1);
      if (words.length) { register(aliases, words[0], entry); register(aliases, words.at(-1), entry); }
    }
  }
  // Quote sources may use a fuller role name than TMDB. Accept that alias
  // only from a Cast entry with an exact actor match and an overlapping role
  // name; never infer it from a quote, review, dialogue block or surname alone.
  let castLevel = null;
  for (const raw of String(wikitext).split(/\r?\n/)) {
    const line = raw.trim(), heading = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if (heading) {
      const level = heading[1].length;
      castLevel = level === 2 && /^(?:cast|voice cast)$/.test(normalize(cleanText(heading[2]))) ? level : null;
      continue;
    }
    if (castLevel === null || !/^\*(?!\*)/.test(line)) continue;
    const credit = cleanText(line.replace(/^\*\s*/, "")).match(/^(.+?)\s+(?:as|[-–—])\s+(.+)$/i);
    if (!credit) continue;
    const matches = actors.get(normalize(credit[1]));
    if (matches?.length !== 1) continue;
    const sourceRole = credit[2].replace(/\s*\((?:voice|uncredited)\)\s*/gi, " ").trim();
    if (!sourceRole || /[{}<>:]/.test(sourceRole) || sourceRole.length > 100) continue;
    const withoutTitles = value => normalize(value.replace(/\b(?:dr|mr|mrs|ms|prof|capt|captain|lt|lieutenant|sgt|sergeant|chief|commander)\.?\s+/gi, ""));
    const sourceWords = new Set(withoutTitles(sourceRole).split(" ").filter(w => w.length >= 3));
    if (!withoutTitles(matches[0].character).split(" ").some(w => w.length >= 3 && sourceWords.has(w))) continue;
    register(sourceNames, sourceRole, { character: sourceRole, actor: matches[0].actor });
  }
  for (const [name, entries] of sourceNames) {
    if (entries.length !== 1) continue;
    const existing = fullNames.get(name) || aliases.get(name);
    if (existing?.some(e => e.actor !== entries[0].actor)) continue;
    register(fullNames, name, entries[0]);
  }
  return value => {
    const key = normalize(value);
    const matches = fullNames.get(key) || aliases.get(key);
    return matches?.length === 1 ? matches[0] : null;
  };
}
function prepareVaultQuotes(movie, limit = LIMIT) {
  const binding = matchingBinding(movie);
  const explicit = Object.values(QUOTE_VAULT).filter(Array.isArray).flat().filter(item =>
    item && typeof item === "object" && !Array.isArray(item) && String(item.tmdb_id) === String(movie.id));
  const items = [...(binding && Array.isArray(QUOTE_VAULT[binding.key]) ? QUOTE_VAULT[binding.key] : []), ...explicit];
  const results = [], seen = new Set();
  for (const item of items) {
    const legacy = typeof item === "string";
    if (!legacy && (!item || typeof item !== "object" || Array.isArray(item))) continue;
    if (!legacy && item.tmdb_id != null && String(item.tmdb_id) !== String(movie.id)) continue;
    if (!legacy && item.year != null && String(item.year) !== movieYear(movie)) continue;
    // Unknown title-only entries are never assigned to a remake or sequel.
    if (!binding && (legacy || String(item.tmdb_id) !== String(movie.id))) continue;
    const quote = cleanText(legacy ? item : item.quote || item.text);
    const key = quoteKey(quote); if (!key || seen.has(key)) continue;
    seen.add(key);
    const record = { quote, verified: !legacy && item.verified === true, curated: true };
    if (legacy) record.legacy = true;
    for (const field of ["character", "actor"]) if (!legacy && cleanText(item[field])) record[field] = cleanText(item[field]);
    results.push(record); if (results.length >= limit) break;
  }
  return results;
}
async function wikiRequest(params, deadline) {
  const search = new URLSearchParams({ origin: "*", format: "json", formatversion: "2", ...params });
  return requestJSON("https://en.wikiquote.org/w/api.php?" + search, {
    headers: { Accept: "application/json" }
  }, deadline);
}
function movieAliases(movie) {
  const binding = matchingBinding(movie);
  return [...new Set([movie.title, movie.original_title, binding?.key, binding?.title].filter(Boolean))];
}
function pageNameMatches(pageTitle, aliases, year) {
  const qualifier = String(pageTitle).match(/\s*\((?:(\d{4})(?:\s+film)?|film)\)\s*$/i);
  if (qualifier?.[1] && qualifier[1] !== String(year)) return false;
  const base = String(pageTitle).replace(/\s*\((?:\d{4}(?:\s+film)?|film)\)\s*$/i, "");
  return aliases.some(title => normalize(base) === normalize(title));
}
function pageDescribesMovie(wikitext, pageTitle, aliases, year) {
  if (!/^\d{4}$/.test(year) || !pageNameMatches(pageTitle, aliases, year)) return false;
  let lead = String(wikitext).split(/^\s*={2,6}[^\n]*={2,6}\s*$/m)[0];
  lead = lead.replace(/\[\[(?:File|Image):[^\n]*?\]\]/gi, "").replace(/\{\{[\s\S]*?\}\}/g, "");
  lead = cleanText(lead).slice(0, 2000);
  if (!aliases.some(title => (" " + normalize(lead) + " ").includes(" " + normalize(title) + " "))) return false;
  // Use the first film-year claim, never a later mention of a remake.
  const before = /\b((?:18|19|20)\d{2})(?:\s*\))?\s+(?:(?!\b(?:18|19|20)\d{2}\b)[^.!?]){0,160}\b(?:film|movie)\b(?!\s+series)/i.exec(lead);
  const after = /\b(?:film|movie)\b\s+(?:released\s+in\s+|from\s+|\()((?:18|19|20)\d{2})\b/i.exec(lead);
  const claims = [before, after].filter(Boolean).sort((a,b) => a.index-b.index);
  return Boolean(claims.length && claims[0][1] === String(year));
}
async function getAutomaticPage(movie, deadline) {
  const year = movieYear(movie), aliases = movieAliases(movie);
  const titles = [...new Set(aliases.flatMap(title => [title + " (" + year + " film)", title + " (film)", title]))];
  const checked = new Set();
  async function inspect(candidates) {
    if (!candidates.length) return null;
    const data = await wikiRequest({ action: "query", titles: candidates.join("|"), redirects: "1",
      prop: "revisions", rvprop: "content", rvslots: "main" }, deadline);
    for (const page of data.query?.pages || []) {
      if (page.missing || checked.has(page.title)) continue;
      checked.add(page.title);
      const raw = page.revisions?.[0]?.slots?.main?.content;
      if (raw && pageDescribesMovie(raw, page.title, aliases, year)) return { pageTitle: page.title, wikitext: raw };
    }
    return null;
  }
  const direct = await inspect(titles); if (direct) return direct;
  const data = await wikiRequest({ action: "query", list: "search", srnamespace: "0", srlimit: "8",
    srsearch: '"' + movie.title + '" ' + year + " film" }, deadline);
  const exact = (data.query?.search || []).map(item => item.title)
    .filter(title => !checked.has(title) && pageNameMatches(title, aliases, year));
  return inspect(exact);
}
function rejectedSection(value) {
  return /^(?:dialogues?|dialogs?|conversations?|cast|external links|see also|references|notes|about|quotes about|taglines?|trivia|production|soundtrack|songs?|lyrics|bibliography|footnotes|sources|plot|synopsis|reception|reviews|deleted scenes|outtakes)\b/i.test(normalize(value));
}
function genericQuoteSection(value) {
  return /^(?:quotes|quotations|memorable quotes|film quotes|movie quotes|character quotes)$/.test(normalize(value));
}
function validStandalone(value) {
  const text = cleanText(value);
  if (text.length < 5 || text.length > 260 || !/[a-z]/i.test(text)) return false;
  if (/\{\{|\}\}|<|>|https?:\/\/|www\.|\[[^\]]*\]|^[*#:;=]/i.test(text)) return false;
  if (/\b(?:ranked|american film institute|quotation[s]? in american cinema|bolded portion|citation needed|retrieved from|release date|running time|box office|screenplay by|directed by|written by|official website|wikipedia|wikiquote|imdb)\b/i.test(text)) return false;
  if (/^(?:note|source|citation|translation|variant|tagline|scene|cut to|the film|the movie|he says|she says|they say|this quote)\s*[:\s]/i.test(text)) return false;
  return true;
}
function speakerLabel(text) { return cleanText(text).match(/^([^:]{1,70}):\s*(.+)$/); }
function extractAutomaticQuotes(wikitext, movie, pageTitle, limit = LIMIT) {
  const resolve = characterIndex(movie, wikitext), sections = [], results = [], seen = new Map();
  let block = null;
  const active = () => sections.at(-1);
  function finish() {
    if (!block) return;
    const entry = block; block = null;
    if (entry.rejected || !entry.allowed || entry.dialogue) return;
    let text = cleanText(entry.lines.join(" ")), speaker = entry.speaker;
    const label = speakerLabel(text);
    if (label) {
      const named = resolve(label[1]);
      if (named) { speaker = named; text = cleanText(label[2]); }
      else if (/^\s*(?:'''|\[\[)/.test(entry.lines[0]) || !speaker) return;
    }
    // Detect all speaker changes BEFORE removing bracketed stage directions.
    if (/(?:^|\s)[A-Z][A-Za-z ."'’–-]{1,45}:\s/.test(text)) return;
    // Standalone character quotes may carry simple non-spoken stage directions.
    // Templates, hyperlinks, multiple speakers and multiline exchanges stay rejected.
    text = text.replace(/\[[^\[\]\n]{1,180}\]/g, " ").replace(/\s+/g, " ").trim();
    if (!validStandalone(text)) return;
    const key = quoteKey(text); if (!key) return;
    if (seen.has(key)) {
      const previous = seen.get(key);
      if (previous.actor !== speaker?.actor || previous.character !== speaker?.character) {
        delete previous.actor; delete previous.character; previous.attribution_status = "ambiguous";
      }
      return;
    }
    const record = { quote: text, verified: false, automatic: true, source_page: pageTitle,
      source_url: "https://en.wikiquote.org/wiki/" + encodeURIComponent(pageTitle.replace(/ /g, "_")),
      attribution_status: speaker ? "cast_matched" : "unavailable" };
    if (speaker) { record.character = speaker.character; record.actor = speaker.actor; }
    seen.set(key, record); results.push(record);
  }
  for (const raw of String(wikitext).split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if (heading) {
      finish(); const level = heading[1].length;
      while (sections.length && active().level >= level) sections.pop();
      const title = cleanText(heading[2]), named = resolve(title), parent = active();
      const generic = genericQuoteSection(title);
      sections.push({ level, rejected: Boolean(parent?.rejected || rejectedSection(title)),
        allowed: Boolean(named || generic), speaker: named || (generic ? parent?.speaker : null) });
      continue;
    }
    // A definition-style character heading is allowed only within a quote section.
    if (/^;[^:]+:?$/.test(line)) {
      finish(); const section = active(), named = resolve(line.slice(1).replace(/:$/, "").trim());
      if (section) section.definitionSpeaker = section.allowed && !section.rejected ? named : null;
      continue;
    }
    if (/^\*(?!\*)/.test(line)) {
      finish(); const section = active();
      block = { lines: [line.replace(/^\*\s*/, "")], rejected: section?.rejected ?? true,
        allowed: section?.allowed ?? false, speaker: section?.definitionSpeaker || section?.speaker, dialogue: false };
      continue;
    }
    if (!block || !line) continue;
    if (/^[*#:;]/.test(line)) {
      const content = cleanText(line.replace(/^[*#:;]+\s*/, "")), label = speakerLabel(content);
      const metadata = label && /^(?:source|note|citation|translation|variant|reference)$/i.test(label[1]);
      if (/^[:;]/.test(line) || label && !metadata &&
        (resolve(label[1]) || /^[A-Z][A-Za-z ."'’-]{1,60}$/.test(label[1]))) block.dialogue = true;
      continue;
    }
    if (/<br\b/i.test(line) || /'''[^']{1,60}:/.test(line)) block.dialogue = true;
    block.lines.push(line);
  }
  finish();
  // Prefer attributed, compact statements without changing the words spoken.
  const score = r => (r.actor ? 100 : 0) + (r.quote.length <= 180 ? 20 : 0) + (/[.!?…]$/.test(r.quote) ? 5 : 0);
  return results.sort((a,b) => score(b)-score(a)).slice(0, limit);
}
function duplicateQuote(a, b) {
  const x = quoteKey(a), y = quoteKey(b);
  if (x === y) return true;
  const shorter = x.length < y.length ? x : y, longer = x.length < y.length ? y : x;
  return shorter.length >= 28 && shorter.split(" ").length >= 5 &&
    shorter.length / longer.length >= 0.65 && longer.startsWith(shorter + " ");
}
function mergeQuotes(vault, automatic, limit = LIMIT) {
  const results = vault.map(item => ({ ...item }));
  for (const candidate of automatic) {
    const existing = results.find(item => duplicateQuote(item.quote, candidate.quote));
    if (existing) {
      // Exact wording plus an unambiguous source speaker can add missing credits.
      // This does not promote an unchecked quote to Reelwise Verified.
      if (quoteKey(existing.quote) === quoteKey(candidate.quote) && candidate.actor && candidate.character &&
          (!existing.actor || existing.actor === candidate.actor) && (!existing.character || existing.character === candidate.character)) {
        if (!existing.actor) existing.actor = candidate.actor;
        if (!existing.character) existing.character = candidate.character;
        existing.attribution_status = "cast_matched";
        existing.source_page = candidate.source_page; existing.source_url = candidate.source_url;
      }
      continue;
    }
    if (results.length < limit) results.push({ ...candidate });
  }
  return results.slice(0, limit);
}
async function buildResponse(id) {
  const deadline = Date.now() + 9000;
  const movie = await getMovie(id, deadline), vault = prepareVaultQuotes(movie);
  let automatic = [], pageTitle = "", lookupStatus = vault.length ? "vault_match" : "no_reliable_match", sourceUnavailable = false;
  const needsSource = vault.length < LIMIT || vault.some(r => !r.character || !r.actor);
  if (needsSource) {
    try {
      const page = await getAutomaticPage(movie, deadline);
      if (page) {
        pageTitle = page.pageTitle;
        automatic = extractAutomaticQuotes(page.wikitext, movie, pageTitle, 80);
        lookupStatus = automatic.length ? "source_match" : "no_standalone_entries";
      }
    } catch (error) {
      console.error("Reelwise automatic quote source:", error.message);
      lookupStatus = "source_unavailable"; sourceUnavailable = true;
    }
  }
  const records = mergeQuotes(vault, automatic), added = records.filter(r => r.automatic === true).length;
  if (vault.length) lookupStatus = added ? "vault_plus_source" : "vault_match";
  const verifiedCount = records.filter(r => r.verified === true).length;
  const legacyCount = records.filter(r => r.legacy === true).length;
  const sources = [];
  if (verifiedCount) sources.push("Reelwise Verified Vault");
  if (legacyCount) sources.push("Reelwise Legacy Vault");
  if (vault.some(r => !r.verified && !r.legacy)) sources.push("Reelwise Curated Vault");
  if (added) sources.push("Wikiquote source-matched quotes");
  return { movie: cleanText(movie.title || movie.original_title), movie_id: movie.id, year: movieYear(movie),
    quotes: records.map(r => r.quote), quoteDetails: records, source: sources.join(" + ") || "No Reelwise quotes available",
    wikiquotePage: pageTitle, curated: vault.length > 0, automatic: added > 0,
    verified: records.length > 0 && verifiedCount === records.length, verifiedCount, legacyCount,
    lookup_status: lookupStatus, source_status: sourceUnavailable ? "unavailable" : pageTitle ? "matched" : needsSource ? "no_match" : "not_needed",
    selection_policy: "exact_movie_standalone_v3" };
}
export default async function handler(req, res) {
  const rawId = req.query?.id, id = String(Array.isArray(rawId) ? rawId[0] || "" : rawId || "").trim();
  if (!/^[1-9]\d*$/.test(id)) return res.status(400).json({ error: "A valid movie ID is required.", quotes: [], quoteDetails: [] });
  try {
    const cached = responseCache.get(id);
    if (cached && cached.expires > Date.now()) return res.status(200).json(cached.body);
    if (cached) responseCache.delete(id);
    const body = await buildResponse(id);
    // A source outage is not cached, so recovery can be immediate.
    if (body.source_status !== "unavailable") {
      if (responseCache.size >= 100) responseCache.delete(responseCache.keys().next().value);
      responseCache.set(id, { body, expires: Date.now() + (body.quotes.length ? 600000 : 60000) });
    }
    return res.status(200).json(body);
  } catch (error) {
    console.error("Reelwise quotes error:", error.message);
    return res.status(500).json({ error: error.message || "Quotes could not be loaded.", quotes: [], quoteDetails: [] });
  }
}

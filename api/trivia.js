const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

/*
  REELWISE CURATED TRIVIA VAULT

  Curated trivia is written as complete,
  self-contained stories — never fragments.
*/

const CURATED_TRIVIA = {

  "rocky": [
    "Sylvester Stallone wrote the screenplay for Rocky and insisted on playing Rocky Balboa himself, even though there was interest in casting a more established actor in the lead role.",

    "The famous training sequence on the steps of the Philadelphia Museum of Art helped turn the location into one of the most recognizable movie landmarks in Philadelphia.",

    "Rocky's dog Butkus was Sylvester Stallone's real dog. Stallone had owned the bullmastiff before making the film.",

    "The ice-rink scene between Rocky and Adrian was filmed with the characters alone in the arena, helping create one of the movie's most intimate and memorable sequences.",

    "Rocky was made on a relatively modest budget but became a major box-office success and won the Academy Award for Best Picture.",

    "The movie's success transformed Rocky Balboa into one of cinema's most recognizable characters and launched a franchise that continued for decades."
  ],

  "rocky ii": [
    "Sylvester Stallone returned as Rocky Balboa and also directed Rocky II, taking over directing duties from John G. Avildsen, who directed the original Rocky.",

    "Stallone suffered a chest injury while training for Rocky II, and the injury influenced how some of the boxing action was staged.",

    "Sylvester Stallone and Carl Weathers trained for roughly two and a half months with boxing adviser Al Silvani before filming the rematch scenes.",

    "Stallone's real bullmastiff, Butkus, returned to appear as Rocky's dog in Rocky II.",

    "Future world champion Roberto Durán appears in the film as one of Rocky's sparring partners.",

    "Rocky's Philadelphia training-run sequence used hundreds of local schoolchildren, creating the large crowd that follows him through the city."
  ],

  "rocky iii": [
    "Mr. T made his major film breakthrough as Clubber Lang in Rocky III. The role turned him into one of the most recognizable personalities of the 1980s.",

    "Professional wrestler Hulk Hogan appears as Thunderlips, the enormous wrestler who faces Rocky in a charity exhibition match early in the film.",

    "Rocky III dramatically changes the relationship between Rocky and Apollo Creed. After Mickey's death and Rocky's loss to Clubber Lang, Apollo becomes Rocky's trainer.",

    "The beach-training sequence between Rocky and Apollo became one of the series' most recognizable training scenes and represents Rocky regaining his confidence.",

    "Survivor's Eye of the Tiger became closely identified with Rocky III and went on to become one of the most famous songs associated with the Rocky franchise.",

    "The movie ends with Rocky and Apollo privately beginning a third fight, fulfilling Rocky's promise to give Apollo a personal rematch."
  ],

  "rocky iv": [
    "Sylvester Stallone wanted the Rocky–Drago fight to look unusually realistic. Stallone has said he asked Dolph Lundgren to hit him for real during filming. The resulting blows were so severe that Stallone later required hospital treatment.",

    "Dolph Lundgren was a relative newcomer when he was cast as Ivan Drago. His imposing size and background in martial arts helped create the physically intimidating opponent Stallone wanted for Rocky.",

    "Rocky's isolated training scenes were filmed in Wyoming, including locations around Jackson Hole and Grand Teton National Park, which stood in for the Soviet Union.",

    "Rocky IV marked the final appearance of Apollo Creed in the original Rocky series. His exhibition fight against Ivan Drago becomes the event that drives Rocky to challenge Drago.",

    "The film contrasts Drago's highly technological training with Rocky's old-fashioned workouts in the snow, mountains and barn. The visual contrast is one of the movie's central themes.",

    "Rocky IV became one of the biggest commercial successes of the Rocky series and remains closely associated with its 1980s soundtrack, training montages and Cold War setting."
  ],

  "jaws": [
    "The mechanical shark used during production was nicknamed Bruce, a name associated with Steven Spielberg's lawyer Bruce Ramer.",

    "Problems with the mechanical shark forced Steven Spielberg to show the shark less frequently than originally planned. The limitation helped create the movie's suspense by keeping the threat largely unseen during much of the film.",

    "The shark's point-of-view shots, John Williams' music and the use of floating barrels allowed the filmmakers to suggest the shark's presence without constantly showing it.",

    "Much of Jaws was filmed on and around Martha's Vineyard, Massachusetts, which stood in for the fictional community of Amity Island.",

    "Robert Shaw's character Quint delivers the famous USS Indianapolis speech, one of the movie's most memorable scenes and a crucial explanation of Quint's fear and hatred of sharks.",

    "John Williams' famous two-note shark theme became one of the most recognizable pieces of suspense music in movie history."
  ],

  "top gun": [
    "Top Gun was made with cooperation from the United States Navy, allowing the production to photograph real aircraft and flight operations.",

    "Many of the aerial sequences used real Navy aircraft. The actors were also filmed in cockpit environments to help give the flying scenes a more authentic appearance.",

    "The Navy's real Fighter Weapons School inspired the Top Gun setting, although the movie dramatized the school and its competition for entertainment.",

    "Val Kilmer initially had reservations about appearing in Top Gun but ultimately played Tom 'Iceman' Kazansky, one of the defining roles of his career.",

    "The soundtrack became a major part of the movie's identity, with songs including Danger Zone and Take My Breath Away becoming strongly associated with the film.",

    "Top Gun became a major box-office success and helped establish Tom Cruise as one of Hollywood's biggest movie stars."
  ],

  "top gun: maverick": [
    "Top Gun: Maverick arrived more than three decades after the original Top Gun, with Tom Cruise returning as Pete 'Maverick' Mitchell.",

    "The production placed actors in aircraft during filming so their faces could be photographed while experiencing real forces of flight rather than relying entirely on studio simulations.",

    "The actors underwent extensive preparation for the aerial filming so they could operate cameras and perform while flying in military aircraft.",

    "Val Kilmer returned as Iceman, giving the sequel a direct emotional connection to Maverick's relationship with his former rival and longtime friend.",

    "Miles Teller plays Bradley 'Rooster' Bradshaw, the son of Maverick's late friend and radar intercept officer Nick 'Goose' Bradshaw.",

    "The movie became a major theatrical success and introduced the Top Gun story to a new generation while continuing Maverick's relationship with characters from the original film."
  ],

  "back to the future": [
    "Michael J. Fox was the filmmakers' preferred choice to play Marty McFly, but his television schedule initially prevented him from taking the role.",

    "Eric Stoltz was originally cast as Marty and filming began with him in the role. The filmmakers later decided the performance was not the right fit for the movie's comic tone and recast the part with Michael J. Fox.",

    "The time machine was originally conceived differently during development before the DeLorean became the movie's famous time-travel vehicle.",

    "Christopher Lloyd's Doc Brown became one of the movie's defining characters, with his wild appearance and energetic personality helping establish the film's eccentric sense of humor.",

    "The Hill Valley clock tower becomes central to the climax, when Doc and Marty attempt to harness a precisely timed lightning strike to send Marty back to 1985.",

    "Back to the Future became a major success and launched a trilogy that continued the adventures of Marty McFly and Doc Brown."
  ],

  "the godfather": [
    "Marlon Brando transformed his appearance for Don Vito Corleone by altering the shape of his jaw, creating the character's distinctive heavy-jowled look.",

    "The studio initially had concerns about casting both Marlon Brando and the relatively unknown Al Pacino, but director Francis Ford Coppola strongly supported his casting choices.",

    "The opening wedding sequence introduces much of the Corleone family while Don Vito conducts family business inside his office.",

    "The horse-head sequence became one of the film's most infamous images and demonstrates the Corleone family's ability to intimidate powerful people.",

    "Al Pacino's Michael Corleone begins the movie distancing himself from his family's criminal business before gradually becoming its leader.",

    "The Godfather won the Academy Award for Best Picture and became one of the most influential American films of its era."
  ],

  "goodfellas": [
    "Goodfellas was based on Nicholas Pileggi's nonfiction book Wiseguy, which told the story of mob associate Henry Hill.",

    "Martin Scorsese and Nicholas Pileggi collaborated on the screenplay, adapting events from Henry Hill's life into the film's fast-moving narrative.",

    "The famous Copacabana sequence follows Henry and Karen through the club in a long continuous moving shot, visually demonstrating the privileged world Henry can access through his mob connections.",

    "Joe Pesci's performance as Tommy DeVito earned him the Academy Award for Best Supporting Actor.",

    "The movie frequently uses popular music to establish time period and mood, with its soundtrack changing as Henry Hill's life moves through different decades.",

    "Henry Hill's narration allows the audience to experience both the attraction of gangster life and the paranoia and consequences that eventually consume it."
  ],

  "forrest gump": [
    "Forrest Gump places its fictional main character into recreated footage of major historical events and meetings with famous public figures.",

    "Tom Hanks won the Academy Award for Best Actor for his performance as Forrest Gump.",

    "The visual-effects team used digital techniques to place Forrest into historical footage and to remove Lieutenant Dan's legs after the character becomes a double amputee.",

    "The bench where Forrest tells much of his story became one of the film's most recognizable visual settings.",

    "The film follows Forrest through several decades of American history while repeatedly bringing him into contact with significant cultural and political events.",

    "Forrest Gump won the Academy Award for Best Picture and became one of the biggest theatrical successes of 1994."
  ],

  "the sixth sense": [
    "The Sixth Sense was written and directed by M. Night Shyamalan and became widely known for the revelation near the end of the film.",

    "Haley Joel Osment received an Academy Award nomination for his performance as Cole Sear.",

    "The line 'I see dead people' became one of the movie's most recognizable pieces of dialogue and one of the most frequently referenced movie lines of its era.",

    "The movie uses visual clues throughout the story that take on a different meaning once the audience understands what has actually been happening.",

    "Bruce Willis plays child psychologist Malcolm Crowe in a restrained dramatic performance that differed from many of the action roles for which he was already famous.",

    "The Sixth Sense became a major box-office success and received multiple Academy Award nominations, including Best Picture."
  ],

  "the hangover": [
    "The Hangover was filmed extensively in Las Vegas, using the city itself as a major part of the comedy's setting.",

    "The story is structured around the characters reconstructing a night they cannot remember, with each new discovery revealing another piece of what happened.",

    "Zach Galifianakis' performance as Alan became one of the movie's breakout elements and significantly increased his mainstream recognition.",

    "Mike Tyson appears as himself in one of the film's most memorable surprise appearances.",

    "The photographs shown during the end credits reveal events from the missing night that the characters spent the entire movie trying to reconstruct.",

    "The Hangover became a major box-office hit and led to two sequels featuring the central group of characters."
  ],

  "old school": [
    "Old School stars Luke Wilson, Will Ferrell and Vince Vaughn as three friends whose attempt to recapture their college years leads them to create a fraternity.",

    "Will Ferrell's Frank 'The Tank' became one of the film's most recognizable characters and helped establish Ferrell as a major movie-comedy star.",

    "The streaking sequence became one of the movie's signature scenes and produced the often-quoted line 'We're going streaking!'",

    "The film was directed by Todd Phillips, who later directed The Hangover trilogy.",

    "The character Blue became a cult favorite despite his relatively limited screen time, leading to the frequently quoted line 'You're my boy, Blue!'",

    "Old School developed a strong following after its theatrical release and became one of the defining R-rated comedies of the early 2000s."
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
      "&exsectionformat=plain" +
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

/*
  SITE-WIDE TRIVIA QUALITY FILTER

  The goal is to favor production, casting,
  filming, performance, music, effects and
  historical facts while rejecting plot recap.
*/

function triviaScore(sentence) {
  const lower =
    sentence.toLowerCase();

  let score = 0;

  const strongTerms = [
    "filmed",
    "filming",
    "production",
    "producer",
    "director",
    "directed",
    "screenplay",
    "script",
    "writer",
    "written",
    "cast",
    "casting",
    "audition",
    "actor",
    "actress",
    "role",
    "performance",
    "stunt",
    "injury",
    "injured",
    "camera",
    "cinematography",
    "visual effects",
    "special effects",
    "practical effects",
    "makeup",
    "costume",
    "soundtrack",
    "score",
    "composer",
    "song",
    "location",
    "shot in",
    "academy award",
    "oscar",
    "golden globe",
    "box office",
    "budget",
    "based on",
    "adapted from",
    "originally cast",
    "originally planned",
    "recast",
    "improvised",
    "improvisation",
    "behind the scenes"
  ];

  for (const term of strongTerms) {
    if (lower.includes(term)) {
      score += 22;
    }
  }

  const veryStrongTerms = [
    "was filmed",
    "were filmed",
    "during filming",
    "during production",
    "was cast",
    "were cast",
    "was originally cast",
    "was directed by",
    "was written by",
    "was shot",
    "filming took place",
    "won the academy award",
    "nominated for",
    "grossed",
    "budget of"
  ];

  for (const term of veryStrongTerms) {
    if (lower.includes(term)) {
      score += 25;
    }
  }

  /*
    Plot-summary language gets heavily penalized.
  */

  const plotTerms = [
    "the story follows",
    "the film follows",
    "the movie follows",
    "the plot follows",
    "the story centers on",
    "the film centers on",
    "the movie centers on",
    "the plot centers on",
    "the story revolves around",
    "the film revolves around",
    "the movie revolves around",
    "the plot revolves around",
    "must find",
    "attempts to",
    "tries to",
    "sets out to",
    "falls in love",
    "returns home",
    "discovers that",
    "learns that",
    "realizes that",
    "decides to",
    "agrees to",
    "plans to",
    "travels to",
    "goes to",
    "escapes",
    "is killed",
    "is murdered",
    "dies",
    "defeats",
    "wins the",
    "loses the",
    "faces off",
    "fights",
    "battles",
    "confronts",
    "rescues",
    "reveals that",
    "ends with",
    "the ending",
    "in the climax",
    "the climax",
    "after he",
    "after she",
    "after they",
    "before he",
    "before she",
    "before they"
  ];

  for (const term of plotTerms) {
    if (lower.includes(term)) {
      score -= 45;
    }
  }

  /*
    Character-heavy sentences are more likely
    to be synopsis unless they also contain
    clear production language.
  */

  const productionSignal =
    strongTerms.some(term =>
      lower.includes(term)
    );

  const characterActionTerms = [
    "character",
    "hero",
    "villain",
    "protagonist",
    "friend",
    "wife",
    "husband",
    "son",
    "daughter",
    "brother",
    "sister",
    "father",
    "mother",
    "team",
    "police",
    "detective"
  ];

  if (
    !productionSignal &&
    characterActionTerms.some(term =>
      lower.includes(term)
    )
  ) {
    score -= 18;
  }

  return score;
}

function extractTrivia(text) {
  if (!text) return [];

  const cleaned =
    text
      .replace(/==+[^=]+==+/g, " ")
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
          lower.includes("bibliography") ||
          lower.includes("citation needed") ||
          lower.startsWith("the film is a") ||
          lower.startsWith("the film was released") ||
          lower.startsWith("the film stars") ||
          lower.startsWith("the movie is a") ||
          lower.startsWith("the story follows") ||
          lower.startsWith("the film follows") ||
          lower.startsWith("the movie follows") ||
          lower.startsWith("the plot follows") ||
          lower.startsWith("the film centers on") ||
          lower.startsWith("the movie centers on") ||
          lower.startsWith("the story centers on") ||
          lower.startsWith("the plot centers on")
        );
      })
      .map(sentence => ({
        sentence,
        score: triviaScore(sentence)
      }))
      /*
        A sentence must show at least some
        evidence that it is trivia rather
        than ordinary plot description.
      */
      .filter(item =>
        item.score >= 18
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  const results = [];
  const seen = new Set();

  for (const item of candidates) {

    const sentence =
      item.sentence;

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
      REELWISE CURATED TRIVIA

      Curated movies never use the
      automatic fallback.
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
      AUTOMATIC FALLBACK

      Try the year-specific Wikipedia
      movie page first to reduce the
      chance of retrieving the wrong film.
    */

    const possibleTitles = [
      year
        ? `${title} (${year} film)`
        : "",
      `${title} (film)`,
      title
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

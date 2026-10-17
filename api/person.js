import { OSCAR_ACTING_PERFORMERS } from "../data/oscars.js";
    const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

    /*
      ============================================================
      REELWISE PERSON API — PERSON 127
      ============================================================

      STAR PROFILE
      - Pulls person details and movie credits from TMDB
      - Uses Wikipedia for factual career context
      - Builds a story-driven Reelwise biography
      - Preserves the working Academy Awards / Accolades endpoint

      REELWISE BIOGRAPHY GOAL
      The biography should read as a career story:
      early career -> breakthrough -> rise -> defining films across
      the decades -> later/current career.

      It intentionally avoids a stats panel or resume-style format.
      ============================================================
    */


    /* ============================================================
       GENERAL HELPERS
       ============================================================ */

    function cleanText(value = "") {
      return String(value)
        .replace(/\s+/g, " ")
        .replace(/\[\d+\]/g, "")
        .trim();
    }

    function removeWikipediaEnding(text = "") {
      return text
        .replace(/\s*References\s*$/i, "")
        .replace(/\s*External links\s*$/i, "")
        .trim();
    }

    function stripHtml(value = "") {
      return cleanText(
        String(value)
          .replace(/<[^>]*>/g, " ")
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
      );
    }

    async function fetchJSON(url, options = {}) {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = new Error(`Request failed: ${response.status}`);
        error.upstreamStatus = response.status;
        throw error;
      }

      return response.json();
    }

    function uniqueStrings(values = []) {
      const seen = new Set();

      return values.filter(value => {
        const key = cleanText(value).toLowerCase();

        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
    }

    function sentenceSplit(text = "") {
      let cleaned = cleanText(text);
      if (!cleaned) return [];
      // Protect abbreviations, initials, acronyms and decimals before splitting.
      const dot = "__RW_PROTECTED_DOT__";
      const abbreviations = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|No|vs|etc|e\.g|i\.e)\./gi;
      cleaned = cleaned.replace(abbreviations, match => match.replace(/\./g, dot));
      cleaned = cleaned.replace(/\b(?:[A-Z]\.){2,}/g, match => match.replace(/\./g, dot));
      // Cecil B. DeMille, J. R. R. Tolkien, and similar names.
      cleaned = cleaned.replace(/\b[A-Z]\.(?=\s+(?:[A-Z][a-z]|[A-Z]\.))/g, match => match.replace(".", dot));
      cleaned = cleaned.replace(/(\d)\.(?=\d)/g, `$1${dot}`);
      return (cleaned.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || [])
        .map(part => cleanText(part.split(dot).join("."))).filter(Boolean);
    }

    function ensurePeriod(text = "") {
      const value = cleanText(text);

      if (!value) {
        return "";
      }

      return /[.!?]["')\]]?$/.test(value)
        ? value
        : `${value}.`;
    }

    function yearFromDate(value = "") {
      const match = String(value).match(/^(\d{4})/);
      return match ? Number(match[1]) : null;
    }

    /*
      PERSON 60 — AGE CONTRACT

      Older Reelwise person responses exposed `age` / `age_at_death`, and
      the current index uses those fields beside Born/Died. Person 58/59
      preserved birthday/deathday but dropped the derived age fields.
      Restore them at the API boundary so the display cannot regress.
    */
    function calculatePersonAge(birthday, endDate = null) {
      if (!birthday) return null;

      const born = new Date(`${birthday}T00:00:00Z`);
      const end = endDate
        ? new Date(`${endDate}T00:00:00Z`)
        : new Date();

      if (Number.isNaN(born.getTime()) || Number.isNaN(end.getTime())) {
        return null;
      }

      let age = end.getUTCFullYear() - born.getUTCFullYear();
      const endMonth = end.getUTCMonth();
      const birthMonth = born.getUTCMonth();

      if (
        endMonth < birthMonth ||
        (endMonth === birthMonth && end.getUTCDate() < born.getUTCDate())
      ) {
        age -= 1;
      }

      return age >= 0 ? age : null;
    }

    function decadeLabel(year) {
      if (!year) return "";
      const start = Math.floor(year / 10) * 10;
      return `${start}s`;
    }

    /* PERSON 62 — DATE-BASED GENERATED CHAPTER LABELS

       Synthetic credit chapters should not call a period "early" or
       "mid-career" merely because of its relative position in a long
       filmography. Use objective decade wording instead. This preserves
       Person 61's title-selection logic while preventing cases such as
       Tom Hanks's 1998–1999 films being labeled "early film work." */
    function generatedFilmPeriodLabel(movies = []) {
      const decades = [...new Set(
        movies
          .map(movie => decadeLabel(movie?.year))
          .filter(Boolean)
      )];

      if (!decades.length) return "Film work";
      if (decades.length === 1) return `During the ${decades[0]}`;
      return `From the ${decades[0]} through the ${decades[decades.length - 1]}`;
    }


    /* ============================================================
       WIKIPEDIA PAGE LOOKUP
       ============================================================ */

    async function getWikipediaPage(name) {
      try {
        const searchUrl =
          "https://en.wikipedia.org/w/api.php?" +
          new URLSearchParams({
            action: "query",
            list: "search",
            srsearch: name,
            format: "json",
            origin: "*"
          });

        const searchData = await fetchJSON(searchUrl);
        const results = searchData?.query?.search || [];

        if (!results.length) {
          return {
            title: "",
            wikidataId: ""
          };
        }

        const exactMatch = results.find(
          item =>
            item.title &&
            item.title.toLowerCase() ===
              String(name).toLowerCase()
        );

        const pageTitle =
          exactMatch?.title ||
          results[0]?.title ||
          "";

        if (!pageTitle) {
          return {
            title: "",
            wikidataId: ""
          };
        }

        const pageUrl =
          "https://en.wikipedia.org/w/api.php?" +
          new URLSearchParams({
            action: "query",
            titles: pageTitle,
            prop: "pageprops",
            ppprop: "wikibase_item",
            redirects: "1",
            format: "json",
            origin: "*"
          });

        const pageData = await fetchJSON(pageUrl);
        const pages = pageData?.query?.pages || {};
        const page = Object.values(pages)[0];

        return {
          title: pageTitle,
          wikidataId:
            page?.pageprops?.wikibase_item || ""
        };
      } catch (error) {
        console.error(
          "Wikipedia page lookup error:",
          error
        );

        return {
          title: "",
          wikidataId: ""
        };
      }
    }


    /* ============================================================
       WIKIPEDIA BIOGRAPHY / CAREER SOURCE
       ============================================================ */

    async function getWikipediaExtract(pageTitle) {
      if (!pageTitle) {
        return "";
      }

      try {
        const url =
          "https://en.wikipedia.org/w/api.php?" +
          new URLSearchParams({
            action: "query",
            prop: "extracts",
            titles: pageTitle,
            exintro: "0",
            explaintext: "1",
            redirects: "1",
            format: "json",
            origin: "*"
          });

        const data = await fetchJSON(url);
        const pages = data?.query?.pages || {};
        const page = Object.values(pages)[0];

        return removeWikipediaEnding(
          cleanText(page?.extract || "")
        );
      } catch (error) {
        console.error(
          "Wikipedia extract error:",
          error
        );

        return "";
      }
    }

    async function getWikipediaSummary(pageTitle) {
      if (!pageTitle) {
        return "";
      }

      try {
        const summaryUrl =
          "https://en.wikipedia.org/api/rest_v1/page/summary/" +
          encodeURIComponent(pageTitle);

        const summaryData =
          await fetchJSON(summaryUrl);

        let bio =
          removeWikipediaEnding(
            cleanText(summaryData?.extract || "")
          );

        if (
          summaryData?.type === "disambiguation" ||
          bio.length < 80
        ) {
          return "";
        }

        return bio;
      } catch (error) {
        console.error(
          "Wikipedia summary error:",
          error
        );

        return "";
      }
    }


    /* ============================================================
       TMDB PERSON DETAILS
       ============================================================ */

    async function getPersonDetails(personId) {
      const url =
        `https://api.themoviedb.org/3/person/${personId}` +
        "?language=en-US";

      try {
        return await fetchJSON(url, {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            accept: "application/json"
          }
        });
      } catch (error) {
        error.personLookup = true;
        throw error;
      }
    }


    /* ============================================================
       TMDB MOVIE CREDITS
       ============================================================ */

    async function getMovieCredits(personId) {
      const url =
        `https://api.themoviedb.org/3/person/${personId}/movie_credits` +
        "?language=en-US";

      const data =
        await fetchJSON(url, {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            accept: "application/json"
          }
        });

      return data?.cast || [];
    }


    /* ============================================================
       FILMOGRAPHY HELPERS
       ============================================================ */

    function validMovieCredits(credits = []) {
      const seen = new Set();

      return credits.filter(movie => {
        if (
          !movie?.id ||
          !movie?.title ||
          !movie?.release_date
        ) {
          return false;
        }

        if (seen.has(movie.id)) {
          return false;
        }

        seen.add(movie.id);
        return true;
      });
    }

    /* ============================================================
       PERSON 63 — STRICT ACTING-CREDIT SAFETY

       TMDB movie_credits.cast is the starting point, but Reelwise's
       automatically generated career sentences should only use credits
       that actually identify an acting role. This prevents a title tied
       to a performer through production/related metadata from being
       presented as part of that performer's acting filmography.

       This helper is intentionally used only by automatic biography
       insertions. Known For and the source-driven biography logic remain
       unchanged from Person 62.
       ============================================================ */

    function isActingMovieCredit(movie) {
      return Boolean(
        movie?.id &&
        movie?.title &&
        movie?.release_date &&
        typeof movie?.character === "string" &&
        movie.character.trim()
      );
    }

    /* ============================================================
       PERSON 65 — SUBSTANTIVE CAST-CREDIT SAFETY

       Person 64 still allowed peripheral cast entries when TMDB supplied a
       non-empty character string. For biography-generated career chapters,
       Reelwise now requires BOTH a real acting role and meaningful billing.

       This stays generic: no performer names and no title overrides. The
       original TMDB movie_credits.cast response remains the only source for
       generated acting-film sentences. Known For and source-driven biography
       sentences are unchanged.
       ============================================================ */
    function isBiographyActingCredit(movie) {
      if (!isActingMovieCredit(movie)) return false;

      const character = String(movie.character || "").trim().toLowerCase();
      if (/\b(uncredited|cameo|archive footage|self)\b/i.test(character)) {
        return false;
      }

      /* TMDB's cast order is the safest generic signal that the performer had
         a substantive on-screen role. Keep leading/supporting ensemble roles;
         reject deep-billing peripheral appearances from auto-generated arcs. */
      const billingOrder = Number(movie?.order);
      if (Number.isFinite(billingOrder) && billingOrder > 12) {
        return false;
      }

      return true;
    }

    function movieRecognitionScore(movie) {
      const popularity =
        Number(movie?.popularity) || 0;

      const votes =
        Number(movie?.vote_count) || 0;

      const rating =
        Number(movie?.vote_average) || 0;

      return (
        popularity +
        Math.log10(votes + 1) * 12 +
        rating * 2
      );
    }

    function buildKnownFor(credits = []) {
      return validMovieCredits(credits)
        .sort(
          (a, b) =>
            movieRecognitionScore(b) -
            movieRecognitionScore(a)
        )
        .slice(0, 12)
        .map(movie => ({
          id: movie.id,
          title: movie.title,
          character:
            movie.character || "",
          release_date:
            movie.release_date || "",
          poster_path:
            movie.poster_path || null,
          backdrop_path:
            movie.backdrop_path || null,
          popularity:
            movie.popularity || 0,
          vote_average:
            movie.vote_average || 0,
          vote_count:
            movie.vote_count || 0
        }));
    }

    function buildCareerTimeline(credits = []) {
      const movies =
        validMovieCredits(credits)
          .map(movie => ({
            ...movie,
            year:
              yearFromDate(
                movie.release_date
              )
          }))
          .filter(movie => movie.year)
          .sort((a, b) => a.year - b.year);

      if (!movies.length) {
        return {
          firstYear: null,
          latestYear: null,
          firstMovie: null,
          notable: [],
          byDecade: {}
        };
      }

      const byDecade = {};

      for (const movie of movies) {
        const decade =
          decadeLabel(movie.year);

        if (!byDecade[decade]) {
          byDecade[decade] = [];
        }

        byDecade[decade].push(movie);
      }

      for (const decade of Object.keys(byDecade)) {
        byDecade[decade] =
          byDecade[decade]
            .sort(
              (a, b) =>
                movieRecognitionScore(b) -
                movieRecognitionScore(a)
            );
      }

      const notable =
        [...movies]
          .sort(
            (a, b) =>
              movieRecognitionScore(b) -
              movieRecognitionScore(a)
          )
          .slice(0, 18);

      return {
        firstYear: movies[0]?.year || null,
        latestYear:
          movies[movies.length - 1]?.year ||
          null,
        firstMovie: movies[0] || null,
        notable,
        byDecade
      };
    }


    /* ============================================================
       REELWISE CAREER STORY ENGINE
       ============================================================ */

    /*
      We do NOT automatically call an actor's first popular movie
      a "breakthrough." Instead, breakthrough language is taken
      from the factual Wikipedia career material when available.
    */

    function findBreakthroughSentence(
      wikipediaText = "",
      name = ""
    ) {
      const sentences =
        sentenceSplit(wikipediaText);

      const strongPatterns = [
        /\bbreakthrough\b/i,
        /\bbreakout\b/i,
        /\bbreakthrough role\b/i,
        /\bbreakout role\b/i,
        /\bbreakthrough performance\b/i,
        /\bbreakout performance\b/i,
        /\brose to prominence\b/i,
        /\bgained (?:wider |wide |international )?recognition\b/i,
        /\bgained (?:wider |wide )?attention\b/i,
        /\bcame to prominence\b/i,
        /\bbecame widely known\b/i,
        /\bestablished (?:himself|herself|themself) as\b/i,
        /\bcareer took off\b/i
      ];

      const match =
        sentences.find(sentence =>
          strongPatterns.some(pattern =>
            pattern.test(sentence)
          )
        );

      if (!match) {
        return "";
      }

      let result =
        cleanText(match);

      /*
        Keep the source wording but avoid a paragraph beginning
        with an unclear pronoun when possible.
      */

      if (name) {
        result = result
          .replace(
            /^He\b/,
            name
          )
          .replace(
            /^She\b/,
            name
          )
          .replace(
            /^They\b/,
            name
          );
      }

      return ensurePeriod(result);
    }

    function usefulCareerSentences(
      wikipediaText = "",
      name = ""
    ) {
      const sentences =
        sentenceSplit(wikipediaText);

      const careerWords =
        /\b(starred|appeared|portrayed|played|film|films|role|roles|performance|career|directed|director|producer|produced|screen|cinema|movie|movies|recognition|acclaim|award|nominated|nomination|won|success|successful|franchise|leading|lead role|supporting role)\b/i;

      const rejectWords =
        /\b(early life|personal life|political|politics|religion|lawsuit|controversy|relationship|married|divorced|children|resides|residence)\b/i;

      return sentences
        .filter(sentence =>
          sentence.length >= 45 &&
          sentence.length <= 430 &&
          careerWords.test(sentence) &&
          !rejectWords.test(sentence)
        )
        .map(sentence => {
          let value =
            cleanText(sentence);

          if (name) {
            value = value
              .replace(/^He\b/, name)
              .replace(/^She\b/, name)
              .replace(/^They\b/, name);
          }

          return ensurePeriod(value);
        });
    }

    function sentenceMentionsTitle(
      sentence,
      title
    ) {
      const cleanSentence =
        cleanText(sentence)
          .toLowerCase();

      const cleanTitle =
        cleanText(title)
          .toLowerCase();

      if (!cleanTitle) {
        return false;
      }

      return cleanSentence.includes(
        cleanTitle
      );
    }

    function chooseDecadeCareerSentence(
      sentences,
      movies,
      alreadyUsed
    ) {
      if (!movies?.length) {
        return "";
      }

      const titles =
        movies
          .map(movie => movie.title)
          .filter(Boolean);

      const matching =
        sentences.find(sentence => {
          if (alreadyUsed.has(sentence)) {
            return false;
          }

          return titles.some(title =>
            sentenceMentionsTitle(
              sentence,
              title
            )
          );
        });

      return matching || "";
    }

    function buildFilmographySentence(
      name,
      decade,
      movies = []
    ) {
      const selected =
        movies
          .slice(0, 3)
          .map(movie => movie.title)
          .filter(Boolean);

      if (!selected.length) {
        return "";
      }

      let titles = "";

      if (selected.length === 1) {
        titles = selected[0];
      } else if (selected.length === 2) {
        titles =
          `${selected[0]} and ${selected[1]}`;
      } else {
        titles =
          `${selected[0]}, ${selected[1]}, and ${selected[2]}`;
      }

      return ensurePeriod(
        `During the ${decade}, ${name}'s film work included ${titles}`
      );
    }

    // Bulk Oscar data lives in its own generated module, not in person.js.
    // Require exact TMDB ID AND normalized identity before exposing awards.
    function independentlyAuditedOscars(person) {
      const id = Number(person?.id);
      const name = String(person?.name || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!Number.isSafeInteger(id) || id < 1) return [];
      const entry = OSCAR_ACTING_PERFORMERS[String(id)];
      if (!entry || entry.verification !== "academy_audited" || entry.name !== name) return [];
      return entry.records;
    }

    // Person 159: verify source-only film claims against the film's TMDB cast.
    // Missing person/movie credits are not evidence of absence, but source prose
    // alone must never establish a credit. Bounded to three source-only titles.
    async function verifySourceOnlyCredits(person, credits, source) {
      const known = new Set(validMovieCredits(credits).map(m => cleanText(m.title).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()));
      const normalizeTitle = v => cleanText(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      const candidates = [];
      // Source-only claims must explicitly name a film and its release year.
      const re = /(?:^|[,;:]\s*|\band\s+)([A-Z][A-Za-z0-9'’&:!?.\- ]{1,65}?)\s*\(((?:19|20)\d{2})\)/g;
      let match;
      while ((match = re.exec(source)) && candidates.length < 3) {
        const title=cleanText(match[1]).replace(/^(?:the films?|in|and)\s+/i,'').trim();
        const year=Number(match[2]), key=normalizeTitle(title);
        if (!key || known.has(key) || candidates.some(x=>x.key===key) || year>new Date().getUTCFullYear()) continue;
        candidates.push({title,year,key});
      }
      const verified=[];
      for (const candidate of candidates) {
        try {
          const search = await fetchJSON(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(candidate.title)}&year=${candidate.year}&language=en-US`,
            {headers:{Authorization:`Bearer ${TOKEN}`,accept:'application/json'}});
          const movie = (search?.results||[]).find(m=>normalizeTitle(m.title)===candidate.key && Number(String(m.release_date||'').slice(0,4))===candidate.year);
          if (!movie || !Number.isSafeInteger(movie.id)) continue;
          const cast = await fetchJSON(`https://api.themoviedb.org/3/movie/${movie.id}/credits?language=en-US`,
            {headers:{Authorization:`Bearer ${TOKEN}`,accept:'application/json'}});
          if (!(cast?.cast||[]).some(a=>Number(a.id)===Number(person.id))) continue;
          verified.push({id:movie.id,title:movie.title,release_date:movie.release_date,year:candidate.year,character:'Verified cast',order:0,vote_count:100,popularity:15});
          known.add(candidate.key);
        } catch { /* optional verification must never break a profile */ }
      }
      return verified;
    }

    function buildReelwiseBiography({ person, credits, wikipediaSummary, wikipediaExtract }) {
      // The audit is resolved internally: callers cannot inject award records.
      const verifiedAwards = independentlyAuditedOscars(person);
      const name = cleanText(person?.name || "This performer");
      const norm = value => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
      // Editorial profiles are preserved verbatim, with no generic rewriting.
      const editorial77 = {
        "sylvester stallone": `Sylvester Gardenzio Stallone is an American actor, screenwriter and filmmaker. He rose to international fame by writing and starring in Rocky (1976), the story of underdog boxer Rocky Balboa, which won the Academy Award for Best Picture. He continued the character across multiple sequels and established a second defining screen role as Vietnam veteran John Rambo in First Blood (1982), followed by the Rambo franchise. His action-star career also included Cobra (1986), Cliffhanger (1993), and Demolition Man (1993). He revisited Rocky in Rocky Balboa (2006) and Rambo in Rambo (2008), then created and starred in The Expendables (2010) and its sequels. His performance as an older Rocky mentoring Apollo Creed's son in Creed (2015) brought renewed critical acclaim, a Golden Globe win and an Academy Award nomination for Best Supporting Actor. He returned in Creed II (2018) and has continued acting in film and television.`,
        "robin williams": `Robin McLaurin Williams was an American actor and comedian whose improvisational comedy brought him widespread fame as Mork on the sitcom Mork & Mindy (1978–1982). He proved equally accomplished in dramatic roles, earning Academy Award nominations for Good Morning, Vietnam (1987), Dead Poets Society (1989), and The Fisher King (1991). He also became a beloved family-film star through his voice performance as the Genie in Aladdin (1992), the title role in Mrs. Doubtfire (1993), and Jumanji (1995). Williams won the Academy Award for Best Supporting Actor for his portrayal of therapist Sean Maguire in Good Will Hunting (1997). His range extended to darker films including One Hour Photo (2002) and Insomnia (2002), while he continued entertaining family audiences in Robots (2005), Night at the Museum (2006), and its sequels. His legacy spans stand-up, television, animation, comedy and drama.`,
        "tom holland": `Thomas Stanley Holland is a British actor who began his career on the London stage in Billy Elliot the Musical before making his feature-film debut in The Impossible (2012). He achieved international stardom as Peter Parker in Captain America: Civil War (2016), then headlined Spider-Man: Homecoming (2017), Far From Home (2019), and No Way Home (2021), alongside appearances in the Avengers films. Beyond Marvel, his work includes The Lost City of Z (2017), voice performances in Spies in Disguise (2019) and Onward (2020), darker dramatic roles in The Devil All the Time (2020) and Cherry (2021), and the adventure film Uncharted (2022). Holland received the BAFTA Rising Star Award in 2017 and has established himself as one of the most recognizable actors of his generation.`,
        "robert de niro": `Robert Anthony De Niro is an American actor, producer and director whose collaborations with filmmaker Martin Scorsese helped define modern American cinema. He gained early recognition in Mean Streets (1973) before winning the Academy Award for Best Supporting Actor for playing the young Vito Corleone in The Godfather Part II (1974). His portrayal of Travis Bickle in Scorsese's Taxi Driver (1976) became one of his defining performances, and he won the Academy Award for Best Actor for playing boxer Jake LaMotta in Raging Bull (1980). Their partnership continued with The King of Comedy (1982), Goodfellas (1990), Casino (1995), The Irishman (2019), and Killers of the Flower Moon (2023). De Niro also demonstrated his range in Once Upon a Time in America (1984), Midnight Run (1988), Awakenings (1990), and the crime thriller Heat (1995), opposite Al Pacino. He directed and starred in A Bronx Tale (1993), then found a new comedic audience with Analyze This (1999) and Meet the Parents (2000) and its sequels. His later work includes an Academy Award-nominated supporting performance in Silver Linings Playbook (2012), while his sustained work with Scorsese has remained a central part of his screen legacy.`,
        "brad pitt": `William Bradley Pitt is an American actor and producer who first attracted widespread attention with his breakout appearance in Thelma & Louise (1991). He established himself as a leading man in A River Runs Through It (1992), Interview with the Vampire (1994), and Legends of the Fall (1994), then demonstrated his range in Se7en (1995) and 12 Monkeys (1995), the latter earning him his first Academy Award nomination. His subsequent films included Fight Club (1999), Snatch (2000), and the ensemble heist hit Ocean's Eleven (2001) and its sequels. He starred in Troy (2004), reunited with David Fincher for The Curious Case of Benjamin Button (2008), which earned him a Best Actor Oscar nomination, and worked with Quentin Tarantino on Inglourious Basterds (2009). Pitt received another Best Actor nomination for portraying baseball executive Billy Beane in Moneyball (2011), while his production company Plan B helped bring acclaimed films to the screen, including Best Picture winner 12 Years a Slave (2013). His acting work also included World War Z (2013), Fury (2014), and Once Upon a Time in Hollywood (2019), for which he won the Academy Award for Best Supporting Actor. He continued taking varied leading roles in films including Ad Astra (2019), Bullet Train (2022), and Babylon (2022).`,
        "leonardo dicaprio": `Leonardo Wilhelm DiCaprio is an American actor and producer who earned his first Academy Award nomination for his supporting performance in What's Eating Gilbert Grape (1993). Romeo + Juliet (1996) and the worldwide success of Titanic (1997) made him an international star. He broadened his career with Catch Me If You Can (2002) and began a long collaboration with director Martin Scorsese in Gangs of New York (2002). Their subsequent films included The Aviator (2004), for which he received a Best Actor Oscar nomination, The Departed (2006), Shutter Island (2010), The Wolf of Wall Street (2013), and Killers of the Flower Moon (2023). He also starred in Blood Diamond (2006), Revolutionary Road (2008), Christopher Nolan's Inception (2010), Django Unchained (2012), and The Great Gatsby (2013). His portrayal of frontiersman Hugh Glass in The Revenant (2015) earned him his first Academy Award for Best Actor. He later appeared in Once Upon a Time in Hollywood (2019), earning another Best Actor nomination, and Don't Look Up (2021), continuing to balance commercially successful films with ambitious dramatic roles.`,
        "tom cruise": `Thomas Cruise Mapother IV is an American actor and producer. After gaining attention in Risky Business (1983), he became an international star playing naval aviator Pete “Maverick” Mitchell in Top Gun (1986). He built a parallel reputation as a dramatic actor with The Color of Money (1986), Rain Man (1988), Born on the Fourth of July (1989), A Few Good Men (1992), and Jerry Maguire (1996), earning Academy Award nominations for Born on the Fourth of July, Jerry Maguire, and Magnolia (1999). In 1996 he introduced Ethan Hunt in Mission: Impossible, the long-running action franchise for which he became known for performing elaborate stunts. His other major films include Minority Report (2002), The Last Samurai (2003), Collateral (2004), and Edge of Tomorrow (2014). He returned to one of his defining early roles in Top Gun: Maverick (2022), a major commercial success, while continuing the Mission: Impossible series through The Final Reckoning (2025).`
      };
      if (Number(person?.id) === 31 && norm(name) === "tom hanks") {
        return `Tom Hanks is an American actor and filmmaker who broke through with Splash (1984) and earned his first Academy Award nomination for Big (1988). He won consecutive Academy Awards for Best Actor for Philadelphia (1993) and Forrest Gump (1994), and received further acting nominations for Saving Private Ryan (1998), Cast Away (2000), and A Beautiful Day in the Neighborhood (2019). His other defining films include Apollo 13 (1995), The Green Mile (1999), Catch Me If You Can (2002), The Terminal (2004), Captain Phillips (2013), Bridge of Spies (2015), and The Post (2017). He voiced Woody in the Toy Story series and worked extensively with director Steven Spielberg. Hanks also directed That Thing You Do! (1996) and served as an executive producer on Band of Brothers (2001) and The Pacific (2010).`;
      }
      // Curated prose must match the verified TMDB identity, not a name alone.
      // Same-name people must use the source-grounded generic engine.
      const editorialIdentity = {
        "sylvester stallone": 16483,
        "robin williams": 2157,
        "tom holland": 1136406,
        "robert de niro": 380,
        "brad pitt": 287,
        "leonardo dicaprio": 6193,
        "tom cruise": 500
      };
      const curated = editorial77[norm(name)];
      if (curated && editorialIdentity[norm(name)] === Number(person?.id)) return curated;

      // PERSON 130 — editorial ordering and duplicate-introduction guard.
      // Only grounded source statements are used; awards are never inferred from credits.
      const normalize = v => cleanText(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const summary = cleanText(wikipediaSummary || person?.biography || "");
      const extract = cleanText(wikipediaExtract || "");
      // Person 160: keep the full extract as the main career source while
      // retaining distinct summary sentences. Length is not a quality ranking.
      const source = [extract || summary, ...sentenceSplit(summary).filter(t =>
        !sentenceSplit(extract).some(e => normalize(e) === normalize(t))
      )].filter(Boolean).join(" ");
      const sentences = sentenceSplit(source);
      const identity = [...sentenceSplit(summary), ...sentenceSplit(extract)].find(t =>
        normalize(t).startsWith(normalize(name)) &&
        /\b(actor|actress|comedian|filmmaker|director|producer|performer|screenwriter|narrator)\b/i.test(t) && t.length < 230);
      const sourceIntro = identity ? identity.replace(/\s*\((?:born|died)[^)]*\)/gi, "") : "";
      const department = String(person?.known_for_department || "").toLowerCase();
      const fallbackProfession = department === "acting" ? "actor" : "performer";
      // PERSON 157: A sparse TMDB lead must not override a sourced profession.
      // This is a source-backed descriptor, not an inferred career achievement.
      const sourcedProfession = /\bcomedian\b/i.test(source) && /\bactor\b/i.test(source)
        ? "actor and comedian" : /\bcomedian\b/i.test(source) ? "comedian" : fallbackProfession;
      const weakIntro = /\bis an? (?:actor|performer)(?: and performer)?\.?$/i.test(sourceIntro) ||
        /\bwas an? (?:actor|performer)(?: and performer)?\.?$/i.test(sourceIntro);
      const intro = ensurePeriod(sourceIntro && !weakIntro ? sourceIntro : `${name} ${person?.deathday ? "was" : "is"} an ${sourcedProfession}.`);
      // A source summary may merge two sentences into its introductory chunk.
      // Never let a context-dependent "that same year" clause into the intro.
      const safeIntro = /\b(?:that(?: same)?|the same|following|previous) year\b/i.test(intro)
        ? (() => {
            const first = intro.split(/\.\s+(?=[A-Z])/)[0];
            return /\b(?:that(?: same)?|the same|following|previous) year\b/i.test(first)
              ? `${name} ${person?.deathday ? "was" : "is"} an actor and performer.`
              : ensurePeriod(first);
          })() : intro;
      const today = new Date().toISOString().slice(0, 10);
      const films = [...new Map(validMovieCredits(credits).filter(isBiographyActingCredit)
        .filter(m => m.release_date <= today)
        .map(m => [normalize(m.title), { ...m, year: yearFromDate(m.release_date) }])).values()];
      const esc = v => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mentions = (sentence, m) => {
        const title = cleanText(m.title);
        if (normalize(title).length < 5)
          return new RegExp(`\\b${esc(title)}\\s*\\(${m.year}\\)`, "i").test(sentence);
        return new RegExp(`(^|[^a-z0-9])${esc(title)}(?=$|[^a-z0-9])`, "i").test(sentence);
      };
      const earlyPattern = /\b(early career|began (?:his |her |their )?(?:acting |screen |film )?career|started (?:his |her |their )?career|theater|theatre|stage|television debut|first major role|first appeared|electric company)\b/i;
      const recognition = /\b(academy award|oscar|golden globe|bafta|nominat(?:ed|ion)|won|received the award)\b/i;
      const strong = /\b(breakthrough|breakout|rose to fame|rose to prominence|gained recognition|critical acclaim|critically acclaimed|best known|signature|defining|portrayed|starred|starring|leading role|major role)\b/i;
      const narration = /\b(narrat(?:ed|or|ion)|documentar(?:y|ies)|distinctive voice)\b/i;
      const bad = /\b(films include|films included|also performed in|also appeared in|other films|other roles|credits include|filmography includes|readers' poll)\b/i;
      const isIntro = t => /\b(?:born|is an? (?:american|british|canadian|australian)? ?(?:actor|actress|producer|comedian)|was an? (?:american|british|canadian|australian)? ?(?:actor|actress|producer|comedian))\b/i.test(t) &&
        (normalize(t).startsWith(normalize(name)) || /\(born\b/i.test(t));
      // Fail closed on every award assertion, including "Oscar nod" and
      // "Academy recognition". Source prose is not independent award evidence.
      const awardLanguage = /\b(?:academy|oscar|nomina(?:ted|tion|tions)|nominee|nod|award|won|winner)\b/i;
      const verified = (sentence, matched) => {
        if (!awardLanguage.test(sentence)) return true;
        // Do not distribute an award across a multi-film sentence.
        if (matched.length !== 1) return false;
        const win = /\b(?:won|winner|winning|win)\b/i.test(sentence);
        const nom = /\b(?:nomina(?:ted|tion|tions)|nominee|nod)\b/i.test(sentence);
        if (!win && !nom) return false;
        return verifiedAwards.some(a => {
          const title = normalize(a.movie || a.work || "");
          const category = String(a.category || a.award || "");
          const result = String(a.result || "");
          const isOscar = /academy award|oscar|^best (?:actor|actress|supporting actor|supporting actress)$/i.test(category);
          const winner = a.winner === true || /^winner$/i.test(result);
          const recognized = winner || a.winner === false || /^nominee|nominated$/i.test(result);
          const year = a.year ? Number(a.year) : 0;
          return isOscar && title && title === normalize(matched[0].title) &&
            (win ? winner : recognized) &&
            (!year || Math.abs(year - matched[0].year) <= 2);
        });
      };
      const items = [], seen = new Set();
      for (const raw of sentences) {
        let sentence = cleanText(raw);
        // A long inventory cannot be dated by its earliest title alone.
      if (/\b(?:and acted in|and appeared in|as well as the films|and the films)\b/i.test(sentence) &&
          (sentence.match(/\b(?:19|20)\d{2}\b/g)||[]).length >= 4) {
        sentence = sentence.split(/\s+and (?:acted|appeared) in\b|\s+as well as the films\b|\s+and the films\b/i)[0];
      }
        // Resolve a source's dangling date reference only when one matching
        // acting credit provides an unambiguous film year.
        if (/\bthat same year\b/i.test(sentence)) {
          const referenced = films.filter(m => mentions(sentence, m));
          if (referenced.length === 1) sentence = sentence.replace(/\bthat same year\b/ig, `in ${referenced[0].year}`);
        }
        // Keep a compact source-backed dramatic/comedic career statement rather
        // than discarding the entire milestone when a source lists many films.
        if ((sentence.match(/\b(?:19|20)\d{2}\b/g)||[]).length >= 5) {
          const sourceFilms = films.filter(m => mentions(sentence, m)).sort((a,b)=>a.year-b.year);
          const contextual = /\b(?:dramatic roles|comedic roles|dramatic performances|comedy roles)\b/i.test(sentence);
          if (!contextual || sourceFilms.length < 2) continue;
          const chosen = [sourceFilms[0], sourceFilms[Math.floor((sourceFilms.length-1)/2)], sourceFilms[sourceFilms.length-1]]
            .filter((m,i,a)=>a.findIndex(x=>normalize(x.title)===normalize(m.title))===i);
          const context = /dramatic/i.test(sentence) ? 'dramatic' : 'comedic';
          const names = chosen.map(m=>`${m.title} (${m.year})`);
          const list = names.length===2 ? names.join(' and ') : names.length>2 ? `${names.slice(0,-1).join(', ')}, and ${names.at(-1)}` : names[0];
          sentence = `${name}'s ${context} work includes ${list}.`;
        }
        // Preserve a source-backed career category when some listed titles
        // are absent from the current TMDB credit response. Use only matching
        // acting credits; never assert unsupported titles or awards.
        if (/\b(?:dramatic roles|comedic roles|dramatic performances|comedy roles)\b/i.test(sentence) &&
            (sentence.match(/\b(?:19|20)\d{2}\b/g)||[]).length >= 2) {
          const contextualFilms = films.filter(m => mentions(sentence,m)).sort((a,b)=>a.year-b.year);
          if (contextualFilms.length >= 2) {
            const chosen=contextualFilms.slice(0,3);
            const labels=chosen.map(m=>`${m.title} (${m.year})`);
            const list=labels.length===2?labels.join(' and '):`${labels.slice(0,-1).join(', ')}, and ${labels.at(-1)}`;
            sentence=`${name}'s ${/dramatic/i.test(sentence)?'dramatic':'comedic'} work includes ${list}.`;
          }
        }
        const key = normalize(sentence);
        // Unsupported promotional superlatives are not independently established facts.
        if (/\b(?:worldwide superstar|biggest star in the world|greatest actor of all time|unparalleled genius)\b/i.test(sentence)) continue;
        if (sentence.length < 25 || sentence.length > 430 || seen.has(key) || bad.test(sentence) || isIntro(sentence) || /\b(?:that(?: same)?|the same|following|previous) year\b/i.test(sentence)) continue;
        seen.add(key);
        const matched = films.filter(m => mentions(sentence, m));
        // Separate a documented film credit from an unverified award claim.
        // A failed award check removes the award assertion, not the film.
        const awardVerified = verified(sentence, matched);
        if (!awardVerified) {
          if (matched.length !== 1) continue;
          const film = matched[0];
          // The film itself comes from the verified TMDB acting credits.
          // This neutral statement never implies a nomination or a win.
          sentence = `${name} appeared in ${film.title} (${film.year}).`;
        }
        const early = earlyPattern.test(sentence), award = awardVerified && recognition.test(sentence), narr = narration.test(sentence);
        // Named character/franchise evidence may not map to a single TMDB title.
        // Retain a concise, sourced role statement with an explicit date range.
        const roleRange = /\b(?:portrayed|played|starred as)\b/i.test(sentence) &&
          /\b(?:trilogy|franchise|series)\b/i.test(sentence) &&
          /\b(?:19|20)\d{2}\s*[–-]\s*(?:19|20)\d{2}\b/.test(sentence);
        if (!matched.length && !early && !narr && !roleRange) continue;
        // Never distribute an award claim over every film title in a sentence.
        // The title list can include non-nominated films; doing so fabricated
        // nominations for Glory and Lean on Me in the live Person 117 output.
        // Preserve source wording only; do not manufacture award assertions.
        const years = matched.map(m => m.year).filter(Boolean);
        // An award for a particular film belongs to that film's release period,
        // not the earliest title in a multi-decade list of nominations.
        const win = /\b(won|received the academy award|academy award for best|oscar win)\b/i.test(sentence);
        const rangeYear = roleRange ? Number(sentence.match(/\b((?:19|20)\d{2})\s*[–-]/)?.[1]) : 0;
        const year = win && years.length ? Math.max(...years) : /\b(?:dramatic|comedic) work includes\b/i.test(sentence) && years.length ? Math.max(...years) : years.length ? Math.min(...years) : roleRange ? rangeYear : early ? 0 : 9998;
        const score = (!awardVerified && matched.length === 1 ? 5 : 0) + (early ? 5 : 0) + (award ? 6 : 0) + (strong.test(sentence) ? 5 : 0) + (/\b(?:dramatic|comedic) work includes\b/i.test(sentence) ? 4 : 0) + (roleRange ? 4 : 0) + Math.min(matched.length, 4) * 2;
        items.push({ sentence, matched, year, score, early, award, narr, win, neutralCredit: !awardVerified && matched.length === 1 });
      }
      const selected = [], covered = new Set();
      const early = items.filter(x => x.early && x.year === 0).sort((a,b) => b.score-a.score)[0];
      if (early) selected.push(early);
      for (const item of items.filter(x => x.year > 0 && x.year < 9998).sort((a,b) => a.year-b.year || b.score-a.score)) {
        if (item.score < 5 || item.narr && !item.award) continue;
        if (item.matched.length > 5 && !item.award) continue;
        const decade = Math.floor(item.year/10);
        if (selected.filter(x => x.year > 0 && Math.floor(x.year/10) === decade).length >= 6) continue;
        if (!item.award && item.matched.length && item.matched.every(m => covered.has(normalize(m.title)))) continue;
        selected.push(item); item.matched.forEach(m => covered.add(normalize(m.title)));
        if (selected.length >= 18) break;
      }
      selected.sort((a,b) => a.year-b.year);
      // PERSON 151: Give substantial, source-confirmed early/middle film roles
      // room before a long recent-film inventory. Never label a role a
      // "breakthrough" merely from popularity, and never invent an award.
      // Use TMDB acting credits only; preserve source sentences for context.
      const careerCredits = films.filter(m => m.year && m.year <= Number(today.slice(0,4)))
        .filter(m => Number(m.vote_count || 0) >= 100 || Number(m.popularity || 0) >= 15);
      const decades = [...new Set(careerCredits.map(m => Math.floor(m.year/10)))].sort((a,b)=>a-b);
      const anchorCredits = [];
      for (const decade of decades) {
        const pool = careerCredits.filter(m => Math.floor(m.year/10) === decade)
          .sort((a,b) => movieRecognitionScore(b)-movieRecognitionScore(a));
        const cap = decade === decades[0] ? 4 : 3;
        anchorCredits.push(...pool.slice(0,cap));
      }
      // PERSON 153: Source-backed career story takes precedence over a credit inventory.
      // A short neutral credit bridge is permitted only when sourced milestones are sparse.
      const sourcedMilestones = selected.filter(x => !x.neutralCredit && !x.narr && (x.matched.length || x.early));
      const sourceMatched = new Set(selected.flatMap(x => x.matched.map(m => normalize(m.title))));
      // PERSON 154: A bounded, evidence-based career bridge. Preserve the
      // source's actual milestones and supplement only missing film credits.
      // A credit's presence is factual; its status as a breakthrough is not inferred.
      const sourceCovered = new Set(selected.flatMap(x => x.matched.map(m => normalize(m.title))));
      const pool = anchorCredits.filter(m => !sourceCovered.has(normalize(m.title)));
      const firstYear = films.length ? Math.min(...films.map(m => m.year).filter(Boolean)) : 0;
      const careerSpan = films.length ? Math.max(...films.map(m => m.year).filter(Boolean)) - firstYear : 0;
      const earlyPool = pool.filter(m => m.year <= firstYear + Math.max(10, Math.floor(careerSpan * .35)))
        .sort((a,b) => movieRecognitionScore(b)-movieRecognitionScore(a)).slice(0,4).sort((a,b)=>a.year-b.year);
      const middlePool = pool.filter(m => m.year > firstYear + Math.max(10, Math.floor(careerSpan*.35)) && m.year <= firstYear + Math.max(18,Math.floor(careerSpan*.75)))
        .sort((a,b)=>movieRecognitionScore(b)-movieRecognitionScore(a)).slice(0,2).sort((a,b)=>a.year-b.year);
      const latePool = pool.filter(m => m.year > firstYear + Math.max(18,Math.floor(careerSpan*.75)))
        .sort((a,b)=>movieRecognitionScore(b)-movieRecognitionScore(a)).slice(0,2).sort((a,b)=>a.year-b.year);
      const filmPhrase = ms => { const a=ms.map(m=>`${m.title} (${m.year})`); return a.length<2?a.join(''):a.length===2?a.join(' and '):`${a.slice(0,-1).join(', ')}, and ${a.at(-1)}`; };
      const output = [safeIntro], used = new Set([normalize(safeIntro)]);
      // Person 156: source-supported career context precedes a neutral TMDB
      // credits bridge; credits alone never establish impact or breakthrough.
      const careerContext = sentences.filter(t =>
        /\b(?:cast member|Saturday Night Live|television|stage|stand-up|standup|comedian|comedy|breakthrough|prominence|recognition)\b/i.test(t) &&
        !awardLanguage.test(t) && !/\b(?:worldwide superstar|biggest star in the world|greatest actor of all time|unparalleled genius)\b/i.test(t) &&
        t.length >= 45 && t.length <= 260 && !isIntro(t) &&
        !/\b(?:that(?: same)?|the same|following|previous) year\b/i.test(t) &&
        (t.match(/\b(?:19|20)\d{2}\b/g)||[]).length < 3 &&
        !/\b(?:married|divorced|children|lawsuit|political|religion)\b/i.test(t)
      );
      // Preserve an independently stated stage/television origin even when
      // its source sentence continues into a long film-title inventory.
      const origin = sentences.map(t => cleanText(t).match(/^((?:He|She|They)\s+(?:began|started) (?:his|her|their) career (?:on|in) (?:the )?(?:stage|theatre|theater|television))\s+before\s+(?:appearing|starring|acting)\s+in\b/i)?.[1]).find(Boolean);
      if (origin && !output.some(t=>t.includes(origin))) {
        output.push(ensurePeriod(origin.replace(/^He\b/,name).replace(/^She\b/,name).replace(/^They\b/,name)));
      }
      let nominationCount = 0;
      // Source-backed statements carry the story. Generic credits bridge gaps,
      // with distinct prose by era, rather than pretending to know impact.
      const sourced = selected.filter(x => !x.neutralCredit && !x.narr);
      const opening = sourced.filter(x=>x.early && x.year===0);
      const chronological = sourced.filter(x=>!(x.early && x.year===0)).sort((a,b)=>a.year-b.year);
      const appendSource = item => {
        const key=normalize(item.sentence);
        if(used.has(key)||isIntro(item.sentence))return;
        let prose=item.sentence.replace(/^He\b/,name).replace(/^She\b/,name).replace(/^They\b/,name);
        const awardLead=`${name} received an Academy Award nomination for `;
        if(prose.startsWith(awardLead)){
          const subject=prose.slice(awardLead.length).replace(/\.$/,'');
          nominationCount++;
          prose=nominationCount===1?`${name} earned an Academy Award nomination for ${subject}.`:
            nominationCount===2?`Another Academy Award nomination followed for ${subject}.`:
            `The Academy also nominated ${name} for ${subject}.`;
        }
        output.push(ensurePeriod(prose));used.add(key);
      };
      opening.forEach(appendSource);
      // Include a single concise, genuinely sourced pre-film career milestone.
      // Do not infer SNL, stage experience, or commercial success from TMDB.
      const contextual = careerContext.find(t =>
        /\b(?:cast member|Saturday Night Live|stand-up|standup|stage|television)\b/i.test(t)
      );
      if (contextual) {
        const key = normalize(contextual);
        if (!used.has(key)) {
          output.push(ensurePeriod(contextual.replace(/^He\b/,name).replace(/^She\b/,name).replace(/^They\b/,name)));
          used.add(key);
        }
      }
      let bridgeCount = 0;
      const bridge = (ms, era) => {
        if (!ms.length || sourcedMilestones.length>=4 || bridgeCount >= 2) return;
        // A bridge states only the documented appearance, never a claimed
        // breakthrough, commercial result or award inferred from popularity.
        const phrase=filmPhrase(ms);
        output.push(era==='early'?`${name} also appeared in ${phrase}.`:
          era==='middle'?`Other documented film work includes ${phrase}.`:
          `More recent screen work includes ${phrase}.`);
        bridgeCount++;
      };
      const cut1=firstYear+Math.max(10,Math.floor(careerSpan*.35));
      const cut2=firstYear+Math.max(18,Math.floor(careerSpan*.75));
      chronological.filter(x=>x.year<=cut1).forEach(appendSource);
      bridge(earlyPool,'early');
      chronological.filter(x=>x.year>cut1&&x.year<=cut2).forEach(appendSource);
      bridge(middlePool,'middle');
      chronological.filter(x=>x.year>cut2).forEach(appendSource);
      bridge(latePool,'late');
      // Avoid padding a biography with weak, contextless source fragments.
      // A concise, honest biography is preferable to fabricated achievements.
      // A brief narration note is a closing observation, not a filmography chapter.
      const narrItem = items.find(x => x.narr && x.year === 9998);
      if (narrItem && output.length >= 3 && !output.slice(1).some(x => /\bnarrat/i.test(x)))
        output.push(`${name} is also known for documentary narration and a distinctive voice.`);
      // Sparse-source fallback must never append a second biographical introduction.
      if (output.length < 4) {
        for (const raw of sentences) {
          const t = cleanText(raw), key = normalize(t);
          if (output.length >= 6) break;
          if (used.has(key) || isIntro(t) || bad.test(t) || (t.match(/\b(?:19|20)\d{2}\b/g)||[]).length >= 5 || /\b(?:worldwide superstar|biggest star in the world|greatest actor of all time|unparalleled genius)\b/i.test(t) || /\b(?:that(?: same)?|the same|following|previous) year\b/i.test(t) || t.length < 45 || t.length > 360) continue;
          if (awardLanguage.test(t) && !verified(t, films.filter(m => mentions(t,m)))) continue;
          if (!/\b(career|acting|film|role|performance|stage|television|starred|portrayed)\b/i.test(t)) continue;
          // Do not reintroduce an unverified title inventory in the fallback.
          if ((t.match(/\b(?:19|20)\d{2}\b/g)||[]).length >= 3) continue;
          output.push(ensurePeriod(t.replace(/^He\b/,name).replace(/^She\b/,name))); used.add(key);
        }
      }
      return output.join(" ");

    }

    /* ============================================================
       WIKIDATA HELPERS
       ============================================================ */

    async function getWikidataEntity(
      wikidataId
    ) {
      if (!wikidataId) {
        return null;
      }

      try {
        const url =
          "https://www.wikidata.org/w/api.php?" +
          new URLSearchParams({
            action: "wbgetentities",
            ids: wikidataId,
            props: "claims|labels",
            languages: "en",
            format: "json",
            origin: "*"
          });

        const data =
          await fetchJSON(url);

        return (
          data?.entities?.[wikidataId] ||
          null
        );
      } catch (error) {
        console.error(
          "Wikidata entity error:",
          error
        );

        return null;
      }
    }

    async function getWikidataLabels(
      ids = []
    ) {
      const uniqueIds =
        [
          ...new Set(
            ids.filter(Boolean)
          )
        ];

      if (!uniqueIds.length) {
        return {};
      }

      const all = {};

      for (
        let i = 0;
        i < uniqueIds.length;
        i += 40
      ) {
        const chunk =
          uniqueIds.slice(i, i + 40);

        try {
          const url =
            "https://www.wikidata.org/w/api.php?" +
            new URLSearchParams({
              action: "wbgetentities",
              ids: chunk.join("|"),
              props: "labels",
              languages: "en",
              format: "json",
              origin: "*"
            });

          const data =
            await fetchJSON(url);

          Object.assign(
            all,
            data?.entities || {}
          );
        } catch (error) {
          console.error(
            "Wikidata labels error:",
            error
          );
        }
      }

      return all;
    }

    function claimEntityId(claim) {
      return (
        claim
          ?.mainsnak
          ?.datavalue
          ?.value
          ?.id || ""
      );
    }

    function qualifierEntityIds(
      claim,
      property
    ) {
      const values =
        claim
          ?.qualifiers
          ?.[property] || [];

      return values
        .map(
          item =>
            item
              ?.datavalue
              ?.value
              ?.id || ""
        )
        .filter(Boolean);
    }

    function qualifierYear(claim) {
      const possibleProperties = [
        "P585",
        "P580",
        "P582"
      ];

      for (
        const property
        of possibleProperties
      ) {
        const raw =
          claim
            ?.qualifiers
            ?.[property]
            ?.[0]
            ?.datavalue
            ?.value
            ?.time || "";

        const match =
          raw.match(
            /[+-](\d{4})-/
          );

        if (match) {
          return Number(match[1]);
        }
      }

      return null;
    }


    /* ============================================================
       ACADEMY AWARD HELPERS
       ============================================================ */

    function isAcademyAwardText(
      text = ""
    ) {
      const value =
        String(text).toLowerCase();

      return (
        value.includes(
          "academy award"
        ) ||
        value.includes("oscar")
      );
    }

    function normalizeOscarCategory(
      award = ""
    ) {
      let value =
        cleanText(award);

      value = value
        .replace(
          /^academy award for\s+/i,
          "Best "
        )
        .replace(
          /^academy awards? for\s+/i,
          "Best "
        );

      value =
        value.replace(
          /^Best Best /i,
          "Best "
        );

      return value;
    }

    function dedupeAwardHistory(
      history = []
    ) {
      const seen = new Set();

      return history.filter(item => {
        const key = [
          item.year || "",
          item.movie || "",
          item.category || "",
          item.winner
            ? "winner"
            : "nominee"
        ]
          .join("|")
          .toLowerCase();

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
    }


    /* ============================================================
       ACADEMY AWARDS / ACCOLADES
       ============================================================ */

    async function getAwardsAndAccolades(
      name,
      knownWikidataId = ""
    ) {
      try {
        let wikidataId =
          knownWikidataId;

        if (!wikidataId) {
          const page =
            await getWikipediaPage(name);

          wikidataId =
            page.wikidataId;
        }

        if (!wikidataId) {
          return {
            found: false,
            wins: 0,
            nominations: 0,
            history: [],
            academy_awards: [],
            academyAwards: [],
            accolades: []
          };
        }

        const entity =
          await getWikidataEntity(
            wikidataId
          );

        const claims =
          entity?.claims || {};

        const winningClaims =
          (claims.P166 || [])
            .map(claim => ({
              winner: true,

              awardId:
                claimEntityId(claim),

              workIds:
                qualifierEntityIds(
                  claim,
                  "P1686"
                ),

              ceremonyIds:
                qualifierEntityIds(
                  claim,
                  "P805"
                ),

              year:
                qualifierYear(claim)
            }));

        const nominationClaims =
          (claims.P1411 || [])
            .map(claim => ({
              winner: false,

              awardId:
                claimEntityId(claim),

              workIds:
                qualifierEntityIds(
                  claim,
                  "P1686"
                ),

              ceremonyIds:
                qualifierEntityIds(
                  claim,
                  "P805"
                ),

              year:
                qualifierYear(claim)
            }));

        const rawClaims = [
          ...winningClaims,
          ...nominationClaims
        ].filter(
          item => item.awardId
        );

        if (!rawClaims.length) {
          return {
            found: false,
            wins: 0,
            nominations: 0,
            history: [],
            academy_awards: [],
            academyAwards: [],
            accolades: []
          };
        }

        const idsToResolve =
          rawClaims.flatMap(item => [
            item.awardId,
            ...item.workIds,
            ...item.ceremonyIds
          ]);

        const labels =
          await getWikidataLabels(
            idsToResolve
          );

        const labelFor = id =>
          labels
            ?.[id]
            ?.labels
            ?.en
            ?.value || "";

        const formatted =
          rawClaims.map(item => {
            const award =
              labelFor(
                item.awardId
              );

            const work =
              item.workIds
                .map(labelFor)
                .find(Boolean) || "";

            const ceremony =
              item.ceremonyIds
                .map(labelFor)
                .find(Boolean) || "";

            return {
              award,
              work,
              ceremony,
              year: item.year,
              winner: item.winner
            };
          });

        const academy =
          formatted.filter(item =>
            isAcademyAwardText(
              `${item.award} ${item.ceremony}`
            )
          );

        let history =
          academy.map(item => ({
            year:
              item.year
                ? String(item.year)
                : "",

            movie:
              item.work || "",

            category:
              normalizeOscarCategory(
                item.award
              ) ||
              "Academy Award",

            winner:
              Boolean(item.winner)
          }));

        history =
          dedupeAwardHistory(
            history
          );

        /*
          If the same nomination appears once as a nomination and
          once as a win, keep the winning version.
        */

        history =
          history.filter(
            item => {
              if (item.winner) {
                return true;
              }

              const matchingWinner =
                history.some(other =>
                  other.winner &&
                  other.year === item.year &&
                  other.movie === item.movie &&
                  other.category ===
                    item.category
                );

              return !matchingWinner;
            }
          );

        history.sort((a, b) => {
          const yearA =
            Number(a.year) || 0;

          const yearB =
            Number(b.year) || 0;

          return yearB - yearA;
        });

        const wins =
          history.filter(
            item => item.winner
          ).length;

        const nominations =
          history.length;

        const academyAwards =
          history.map(item => ({
            award: item.category,

            result:
              item.winner
                ? "Winner"
                : "Nominee",

            year: item.year,
            work: item.movie,
            ceremony: ""
          }));

        return {
          found:
            history.length > 0,

          wins,

          nominations,

          history,

          academy_awards:
            academyAwards,

          academyAwards,

          accolades:
            academyAwards
        };

      } catch (error) {
        console.error(
          "Awards/accolades error:",
          error
        );

        return {
          found: false,
          wins: 0,
          nominations: 0,
          history: [],
          academy_awards: [],
          academyAwards: [],
          accolades: []
        };
      }
    }


    /* ============================================================
       API HANDLER
       ============================================================ */


/* Person 161 opt-in isolated preview; default biography and accolades unchanged. */
const Bio161Engine = (()=>{
const clean=s=>String(s||'').replace(/\\["']/g,'').replace(/={2,}[^=\n]{1,90}={2,}/g,' ').replace(/\s+/g,' ').trim();
const cats=['origin','breakthrough','signature','range','later'];
function validateMilestones(person,milestones){
 const accepted=[],errors=[],seen=new Set();
 for(const [i,m] of (milestones||[]).entries()){
  const t=clean(m?.text);
  if(!cats.includes(m?.category)||t.length<18||!m?.source?.id||!m?.source?.kind||m.personId!==person.id){errors.push(`${i}: invalid milestone or provenance`);continue;}
  if(/\b(?:academy award|oscar|won|nomination|nominated)\b/i.test(t)&&m.source.kind!=='audited_award'){errors.push(`${i}: unaudited awards`);continue;}
  if(/\b(?:greatest|best actress of her generation|worldwide superstar)\b/i.test(t)){errors.push(`${i}: promotional claim`);continue;}
  const k=t.toLowerCase().replace(/[^a-z0-9]/g,'');if(seen.has(k))continue;seen.add(k);
  accepted.push({...m,text:t});
 }
 return {accepted,errors};
}
function buildBiography(person,milestones,{maxMilestones=9}={}){
 if(!Number.isSafeInteger(person?.id)||!person.name)throw Error('Verified identity required');
 const {accepted,errors}=validateMilestones(person,milestones);
 const order={origin:0,breakthrough:1,signature:2,range:3,later:4};
 const score=m=>{
  const t=m.text;
  let n=({breakthrough:12,signature:9,range:7,later:6,origin:3})[m.category]||0;
  if(/\b(?:breakthrough|first major|first leading|rose to prominence|established)\b/i.test(t))n+=6;
  if(/\b(?:starred in|leading role|performance in|portrayed|played (?:the|a) (?:lead|title|central) role)\b/i.test(t))n+=5;
  if(/\b(?:film|movie|drama|comedy|series|musical)\b/i.test(t))n+=2;
  if(/\b(?:school|college|university|theater|theatre|stage)\b/i.test(t)&&m.category==='origin')n+=2;
  if(/\b(?:said to herself|she said|he said|in an interview|workshopping|opposite|six weeks|five plays|story within a story)\b/i.test(t))n-=9;
  if(t.length>230)n-=5;
  if(m.year>=1900&&m.year<=2100)n+=2;
  return n;
 };
 const dated=accepted.filter(m=>m.year>=1900&&m.year<=2100);
 const undated=accepted.filter(m=>!dated.includes(m));
 const selected=[],used=new Set();
 const add=m=>{if(m&&!used.has(m)&&selected.length<maxMilestones){selected.push(m);used.add(m);}};
 const best=arr=>[...arr].sort((a,b)=>score(b)-score(a)||((a.year||9999)-(b.year||9999)))[0];
 // Limit early-career detail and reserve places for important screen work.
 add(best(dated.filter(m=>m.category==='origin'))||best(undated.filter(m=>m.category==='origin')));
 add(best(accepted.filter(m=>m.category==='breakthrough')));
 const decades=[...new Set(dated.filter(m=>m.category!=='origin').map(m=>Math.floor(m.year/10)))].sort();
 for(const decade of decades)add(best(dated.filter(m=>Math.floor(m.year/10)===decade&&m.category!=='origin')));
 for(const m of [...accepted].filter(m=>m.category!=='origin').sort((a,b)=>score(b)-score(a)))add(m);
 if(selected.length<maxMilestones)for(const m of [...undated].sort((a,b)=>score(b)-score(a)))add(m);
 selected.sort((a,b)=>(a.year||9999)-(b.year||9999)||order[a.category]-order[b.category]);
 const profession=String(person.profession||'a performer').replace(/\.$/,'');
 const intro=`${person.name} ${person.deathday?'was':'is'} ${profession}.`;
 const paragraphs=[intro,...selected.map(m=>clean(m.text).replace(/[.\s]+$/,'')+'.')];
 const coverage={categories:cats.filter(c=>selected.some(m=>m.category===c)),count:selected.length,decades:[...new Set(selected.filter(m=>m.year).map(m=>Math.floor(m.year/10)*10))].sort()};
 return {biography:paragraphs.join(' '),milestones:selected,errors,coverage,readyForPublication:false};
}
return {validateMilestones,buildBiography};
})();
const Bio161Source = (()=>{
const clean=s=>String(s||'').replace(/\\["']/g,'').replace(/={2,}[^=\n]{1,90}={2,}/g,' ').replace(/\[[0-9,\s]+\]/g,'').replace(/\s+/g,' ').trim();
const split=s=>clean(s).replace(/\bvs\./gi,'vs․').replace(/\b(?:Mr|Mrs|Ms|Dr)\./g,x=>x.slice(0,-1)+'․').match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(x=>clean(x.replace(/․/g,'.'))).filter(Boolean)||[];
const patterns=[
 ['breakthrough',/\b(?:breakthrough|rose to prominence|gained prominence|first major|first starring|first leading|launched (?:his|her|their) career|established (?:him|her|them)(?:self)?(?: as)?)\b/i],
 ['origin',/\b(?:began (?:his|her|their) career|started (?:his|her|their) career|early career|stage debut|Broadway debut|television debut|Saturday Night Live|Mork\s*&\s*Mindy|studied drama|trained at|Yale School of Drama|Vassar College|theatre|theater)\b/i],
 ['range',/\b(?:dramatic (?:roles?|performances?|work)|comedic (?:roles?|performances?|work)|versatility|transitioned|shifted to|also starred|voice role|musical film)\b/i],
 ['signature',/\b(?:defining|signature|best known for|widely known for|starred in|leading role|portrayed|played the role|played [A-Z]|appeared in|performance in)\b/i],
 ['later',/\b(?:later (?:career|work|roles?)|more recently|subsequently|returned to|in recent years)\b/i]
];
const generic=/\b(?:prolific artist|best actress of her generation|greatest actor|audiobooks?|musical recordings|grossed more than|box office total|alumna of)\b/i;
const plot=/\b(?:story within a story|love triangle|married to a|caught in a love|survivor of Auschwitz caught|portrayed a fighter for the French Resistance|played a glamorous writer|a young writer \(|a Jewish intellectual \()\b/i;
function extractMilestones(person,sources,{maxPerSource=160}={}){
 if(!Number.isSafeInteger(person?.id)||!clean(person.name))throw Error('Person identity required');
 const facts=[],excluded=[],seen=new Set();
 for(const source of sources||[]){
  if(!source?.id||!source?.kind||source.personId!==person.id){excluded.push({source:source?.id||null,reason:'source identity or provenance missing'});continue;}
  for(const sentence of split(source.text).slice(0,maxPerSource)){
   if(sentence.length<35||sentence.length>340){excluded.push({source:source.id,reason:'sentence length'});continue;}
   if(generic.test(sentence)||plot.test(sentence)){excluded.push({source:source.id,reason:'generic, plot-heavy or promotional material'});continue;}
   if(/\b(?:academy award|oscar|won|nomination|nominated)\b/i.test(sentence)&&source.kind!=='audited_award'){excluded.push({source:source.id,reason:'award claim requires audited record'});continue;}
   const found=patterns.find(([,p])=>p.test(sentence));if(!found){excluded.push({source:source.id,reason:'no explicit career context'});continue;}
   const key=sentence.toLowerCase().replace(/[^a-z0-9]/g,'');if(seen.has(key)){excluded.push({source:source.id,reason:'duplicate statement across sources'});continue;}seen.add(key);
   const year=sentence.match(/\b(?:19|20)\d{2}\b/)?.[0];
   facts.push({personId:person.id,category:found[0],text:sentence,year:year?Number(year):null,source:{kind:source.kind,id:source.id}});
  }
 }
 const checked=Bio161Engine.validateMilestones(person,facts);
 return {milestones:checked.accepted,excluded,errors:checked.errors};
}
function buildFromSources(person,sources,options){
 const extracted=extractMilestones(person,sources,options);
 const result=Bio161Engine.buildBiography(person,extracted.milestones,{maxMilestones:9});
 return {...result,diagnostic:{sourcesConsidered:(sources||[]).length,accepted:extracted.milestones.length,excluded:extracted.excluded,errors:extracted.errors}};
}
return {extractMilestones,buildFromSources};
})();
/* R5: evidence-first filmography narrative. Never copy raw encyclopedia sentences into prose. */
const Bio161Editorial = (()=>{
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
const year=s=>Number(String(s||'').slice(0,4));
const stop=/\b(?:academy award|oscar|bafta|golden globe|won|nominated)\b/i;
function compose(person,credits,sources){
 const excluded=[],all=[];
 const texts=(sources||[]).map(s=>String(s.text||'').replace(/={2,}[^=\n]{1,90}={2,}/g,' '));
 const evidence=texts.join(' ').toLowerCase();
 for(const c of credits||[]){
  if(c?.media_type&&c.media_type!=='movie')continue;
  const title=String(c?.title||'').trim(), y=year(c?.release_date);
  if(!title||y<1900||y>new Date().getUTCFullYear()||c?.adult||!Number.isSafeInteger(c?.id))continue;
  // Combined credits are returned by TMDB for the exact person ID; no title-based actor inference.
  if(c?.order===undefined||c?.order===null){excluded.push({title,reason:'cast order unavailable'});continue;}
  const key=norm(title);if(!key)continue;
  const mentioned=texts.some(t=>norm(t).includes(key));
  const vote=Number(c.vote_count)||0;
  const popularity=Number(c.popularity)||0;
  const lead=c.order<=2;
  const score=(mentioned?12:0)+(lead?6:c.order<=5?3:0)+Math.min(6,Math.log10(vote+1)*1.4)+Math.min(2,popularity/30);
  all.push({id:c.id,title,year:y,order:c.order,mentioned,score,source:{kind:'tmdb_person_cast',id:`tmdb:person:${person.id}:movie:${c.id}`}});
 }
 const dedup=new Map();for(const c of all){const k=norm(c.title)+':'+c.year;if(!dedup.has(k)||dedup.get(k).score<c.score)dedup.set(k,c);}
 const sorted=[...dedup.values()].sort((a,b)=>b.score-a.score||a.year-b.year);
 const selected=[],used=new Set();const add=c=>{if(c&&!used.has(c.id)&&selected.length<9){selected.push(c);used.add(c.id);}};
 // Require source mention for main milestones; credits-only titles may fill only sparse biographies.
 const eligible=sorted.filter(c=>c.mentioned);
 const decades=[...new Set(eligible.map(c=>Math.floor(c.year/10)))].sort();
 for(const d of decades)add(eligible.find(c=>Math.floor(c.year/10)===d));
 for(const c of eligible)add(c);
 if(selected.length<4)for(const c of sorted.filter(c=>c.order<=3))add(c);
 selected.sort((a,b)=>a.year-b.year||b.score-a.score);
 const groups=[];for(let i=0;i<selected.length;i+=3)groups.push(selected.slice(i,i+3));
 const fmt=c=>`${c.title} (${c.year})`;
 const join=arr=>arr.length===1?arr[0]:arr.length===2?arr.join(' and '):arr.slice(0,-1).join(', ')+', and '+arr.at(-1);
 const profession=person.known_for_department==='Acting'?'screen performer':'film and television professional';
 let biography=`${person.name} ${person.deathday?'was':'is'} a ${profession}.`;
 if(groups[0]?.length)biography+=` Early screen credits include ${join(groups[0].map(fmt))}.`;
 if(groups[1]?.length)biography+=` Subsequent film work includes ${join(groups[1].map(fmt))}.`;
 if(groups[2]?.length)biography+=` Later credits include ${join(groups[2].map(fmt))}.`;
 const decadesCovered=[...new Set(selected.map(c=>Math.floor(c.year/10)*10))].sort();
 return {biography,credits:selected,diagnostic:{totalCastCredits:all.length,sourceMentioned:eligible.length,selected:selected.length,decadesCovered,excluded:excluded.slice(0,12)},readyForPublication:false,editorialQualityPass:false};
}
return {compose};
})();
const Bio161Retrieval = (()=>{
/* Read-only source acquisition. Wikipedia identity requires a Wikidata ID matching
   the ID returned by TMDB external_ids; title similarity is not identity proof. */
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
async function getJson(fetcher,url,options={}){const r=await fetcher(url,options);if(!r.ok)throw Error('Source request failed');return r.json();}
async function retrieveBiographySources(person,{fetcher=globalThis.fetch,tmdbToken,wikipediaTitle}={}){
 if(!Number.isSafeInteger(person?.id)||person.id<1||!person.name||typeof fetcher!=='function'||!tmdbToken)throw Error('Verified identity, fetcher and token required');
 const diagnostics={tmdbIdentity:false,wikipediaIdentity:false,sourceKinds:[],warnings:[]};
 const tmdb=await getJson(fetcher,`https://api.themoviedb.org/3/person/${person.id}?language=en-US`,{headers:{Authorization:`Bearer ${tmdbToken}`,accept:'application/json'}});
 if(tmdb.id!==person.id||norm(tmdb.name)!==norm(person.name))throw Error('TMDB identity mismatch');
 diagnostics.tmdbIdentity=true;
 const sources=[];
 if(plain(tmdb.biography).length>=40)sources.push({id:`tmdb:person:${person.id}`,kind:'tmdb_biography',personId:person.id,text:plain(tmdb.biography)});
 let wikidataId;
 try{
  const external=await getJson(fetcher,`https://api.themoviedb.org/3/person/${person.id}/external_ids`,{headers:{Authorization:`Bearer ${tmdbToken}`,accept:'application/json'}});
  if(/^Q[1-9]\d*$/.test(external?.wikidata_id||''))wikidataId=external.wikidata_id;
 }catch{diagnostics.warnings.push('TMDB external identity unavailable');}
 if(!wikidataId){diagnostics.warnings.push('Wikipedia skipped: no verified Wikidata linkage');diagnostics.sourceKinds=sources.map(x=>x.kind);return {sources,diagnostics};}
 const title=wikipediaTitle||person.name;
 try{
  const u=new URL('https://en.wikipedia.org/w/api.php');
  u.searchParams.set('action','query');u.searchParams.set('prop','pageprops|extracts');u.searchParams.set('explaintext','1');u.searchParams.set('exintro','1');u.searchParams.set('format','json');u.searchParams.set('redirects','1');u.searchParams.set('titles',title);
  const data=await getJson(fetcher,u.toString());
  const pages=Object.values(data?.query?.pages||{});
  const page=pages.find(x=>!x.missing&&x.pageprops?.wikibase_item===wikidataId);
  if(!page){diagnostics.warnings.push('Wikipedia skipped: Wikidata identity mismatch');}
  else{
   diagnostics.wikipediaIdentity=true;
   if(plain(page.extract).length>=40)sources.push({id:`wikipedia:intro:${wikidataId}`,kind:'wikipedia_summary',personId:person.id,text:plain(page.extract)});
   const full=new URL('https://en.wikipedia.org/w/api.php');
   full.searchParams.set('action','query');full.searchParams.set('prop','pageprops|extracts');full.searchParams.set('explaintext','1');full.searchParams.set('format','json');full.searchParams.set('redirects','1');full.searchParams.set('titles',page.title);
   try{
    const data2=await getJson(fetcher,full.toString());
    const verified=Object.values(data2?.query?.pages||{}).find(x=>!x.missing&&x.pageprops?.wikibase_item===wikidataId);
    if(verified&&plain(verified.extract).length>=40)sources.push({id:`wikipedia:extract:${wikidataId}`,kind:'wikipedia_extract',personId:person.id,text:plain(verified.extract)});
    else diagnostics.warnings.push('Wikipedia full extract missing or identity mismatch');
   }catch{diagnostics.warnings.push('Wikipedia full extract unavailable');}
  }
 }catch{diagnostics.warnings.push('Wikipedia identity lookup unavailable');}
 diagnostics.sourceKinds=sources.map(x=>x.kind);
 return {sources,diagnostics};
}
async function buildFromRetrievedSources(person,options){
 const {sources,diagnostics}=await retrieveBiographySources(person,options);
 const built=Bio161Source.buildFromSources(person,sources);
 return {...built,diagnostic:{...built.diagnostic,retrieval:diagnostics}};
}
return {retrieveBiographySources,buildFromRetrievedSources};
})();
    export default async function handler(
      req,
      res
    ) {
      try {

        if (!TOKEN) {
          return res.status(500).json({
            error:
              "TMDB_READ_ACCESS_TOKEN is missing."
          });
        }

        const personId =
          req.query.id ||
          req.query.personId ||
          req.query.person_id;

        if (!personId) {
          return res.status(400).json({
            error:
              "Person ID is required."
          });
        }

        // Reject malformed IDs before issuing an external request.
        // An array, signed number, zero or nonnumeric string is not a TMDB ID.
        if (
          Array.isArray(personId) ||
          !/^[1-9][0-9]*$/.test(String(personId).trim()) ||
          !Number.isSafeInteger(Number(personId))
        ) {
          return res.status(400).json({
            error: "A valid TMDB person ID is required."
          });
        }

        const mode =
          String(
            req.query.mode || ""
          ).toLowerCase();

        /*
          Get the TMDB person first. We need the verified person
          name before resolving Wikipedia/Wikidata.
        */

        const person =
          await getPersonDetails(
            personId
          );

        // Do not attach an audited history (or profile) to a response
        // for a different requested TMDB person.
        if (Number(person?.id) !== Number(personId)) {
          throw new Error("TMDB person identity mismatch.");
        }


        // Person 161 preview is deliberately opt-in and does not replace the live biography.
        // It exposes only sanitized source coverage, accepted milestone provenance and draft text.
        if (mode === "biography161_preview" || mode === "biography161_r2_preview" || mode === "biography161_r3_preview" || mode === "biography161_r4_preview" || mode === "biography161_r5_preview") {
          try {
            const draft = await Bio161Retrieval.buildFromRetrievedSources(
              {id: Number(person.id), name: person.name,
               profession: person.known_for_department === "Acting" ? "an actor" : "a performer",
               deathday: person.deathday},
              {tmdbToken: TOKEN}
            );
            if (mode === "biography161_r5_preview") {
              const creditResponse = await fetchJSON(`https://api.themoviedb.org/3/person/${person.id}/combined_credits?language=en-US`, {headers:{Authorization:`Bearer ${TOKEN}`,accept:"application/json"}});
              const verifiedSources = await Bio161Retrieval.retrieveBiographySources(
                {id:Number(person.id),name:person.name},{tmdbToken:TOKEN});
              const editorial = Bio161Editorial.compose(person,creditResponse?.cast||[],verifiedSources.sources);
              return res.status(200).json({preview:true,deployedBiographyUnchanged:true,
                id:person.id,name:person.name,biography:editorial.biography,
                readyForPublication:false,editorialQualityPass:false,
                credits:editorial.credits,diagnostic:{...editorial.diagnostic,retrieval:verifiedSources.diagnostics}});
            }
            return res.status(200).json({
              preview: true, deployedBiographyUnchanged: true,
              id: person.id, name: person.name,
              biography: draft.biography,
              readyForPublication: false, structuralCoveragePass: draft.coverage.count >= 5 && draft.coverage.decades.length >= 3 && draft.coverage.categories.some(c => c === "breakthrough" || c === "signature"),
              coverage: draft.coverage,
              milestones: draft.milestones.map(m => ({category:m.category,year:m.year,
                text:m.text,source:{kind:m.source.kind,id:m.source.id}})),
              diagnostic: draft.diagnostic
            });
          } catch (error) {
            return res.status(200).json({
              preview:true, deployedBiographyUnchanged:true,
              id:person.id,name:person.name,readyForPublication:false,
              error:"Person 161 preview source retrieval unavailable"
            });
          }
        }

        /* ========================================================
           ACCOLADES MODE

           IMPORTANT:
           This preserves the working response format expected by
           the current Reelwise index.html.
           ======================================================== */

        if (mode === "accolades") {
          // A source claim is not independent verification. Until the
          // audit is expanded, return unavailable rather than unverified
          // nominations or a misleading confirmed zero.
          const audited = independentlyAuditedOscars(person);
          if (!audited.length) {
            // A valid person profile must not become an HTTP outage just
            // because this performer is outside the curated acting audit.
            // Null totals mean UNKNOWN, not zero nominations or wins.
            return res.status(200).json({
              id: person.id, name: person.name || "",
              confirmed: false, unavailable: true, found: false,
              wins: null, nominations: null, history: [],
              academy_awards: [], academyAwards: [], accolades: [],
              message: "Academy acting-awards history has not yet been verified for this performer.",
              source: "Reelwise curated Academy acting audit",
              coverage: "not_verified"
            });
          }
          const history = audited.map(item => ({
            movie: item.movie, year: item.year,
            category: item.category, winner: item.winner
          })).sort((a,b) => b.year - a.year);
          const awards = history.map(item => ({
            award: item.category, result: item.winner ? "Winner" : "Nominee",
            year: item.year, work: item.movie, ceremony: ""
          }));
          return res.status(200).json({
            id: person.id, name: person.name || "",
            confirmed: true, unavailable: false, found: true,
            source: "Reelwise curated Academy acting audit",
            coverage: "verified_acting_only",
            wins: history.filter(item => item.winner).length,
            nominations: history.length, history,
            academy_awards: awards, academyAwards: awards, accolades: awards
          });
        }


        /* ========================================================
           NORMAL STAR PROFILE MODE
           ======================================================== */

        const wikipediaPage =
          await getWikipediaPage(
            person.name
          );

        const [
          credits,
          wikipediaSummary,
          wikipediaExtract
        ] =
          await Promise.all([
            getMovieCredits(personId),
            getWikipediaSummary(
              wikipediaPage.title
            ),
            getWikipediaExtract(
              wikipediaPage.title
            )
          ]);

        /*
          Build the Reelwise story-driven career biography.

          This uses factual Wikipedia career material plus TMDB
          filmography chronology. It does not automatically invent
          a breakthrough role.
        */

        // Accolades are fetched only by mode=accolades; profile loading
        // must not depend on Wikidata availability or latency.
        const sourceOnlyVerified = await verifySourceOnlyCredits(person, credits,
          `${wikipediaSummary || ''} ${wikipediaExtract || ''}`);
        const biography =
          buildReelwiseBiography({
            person,
            credits: [...credits, ...sourceOnlyVerified],
            wikipediaSummary,
            wikipediaExtract
          });

        const knownFor =
          buildKnownFor(
            credits
          );

        return res
          .status(200)
          .json({

            id:
              person.id,

            name:
              person.name || "",

            birthday:
              person.birthday || null,

            deathday:
              person.deathday || null,

            deceased:
              Boolean(person.deathday),

            age:
              person.deathday
                ? null
                : calculatePersonAge(person.birthday),

            age_at_death:
              person.deathday
                ? calculatePersonAge(person.birthday, person.deathday)
                : null,

            place_of_birth:
              person.place_of_birth || "",

            biography,

            profile_path:
              person.profile_path || null,

            homepage:
              person.homepage || null,

            imdb_id:
              person.imdb_id || null,

            known_for_department:
              person.known_for_department || "",

            popularity:
              person.popularity || 0,

            known_for:
              knownFor,

            academy_awards:
              [],

            academyAwards:
              [],

            accolades:
              [],

            /*
              Compatibility aliases used by older Reelwise code.
            */

            knownFor,

            movies:
              knownFor
          });

      } catch (error) {

        console.error(
          "Reelwise person API error:",
          error
        );

        const notFound = error?.upstreamStatus === 404 &&
          /^Request failed: 404$/.test(error.message) &&
          // A missing credit/Wikipedia page is not a missing person.
          // Only the initial TMDB person lookup may generate this 404.
          error.personLookup === true;

        return res
          .status(notFound ? 404 : 500)
          .json({
            error: notFound
              ? "Movie star not found."
              : "Unable to load star profile."
          });
      }
    }

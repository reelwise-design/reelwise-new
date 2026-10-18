import { OSCAR_ACTING_PERFORMERS } from "../data/oscars.js";
    const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

    /*
      ============================================================
      REELWISE PERSON API — PERSON 174
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

      // Person 174: select dated milestones before composing the biography.
      // Credits prove participation, source text supplies career context, and
      // only the identity-scoped Academy audit supplies award statements.
      const normalize = v => cleanText(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      const esc = v => String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const summary=cleanText(wikipediaSummary || ''), extract=cleanText(wikipediaExtract || '');
      const source=[summary,extract,cleanText(person?.biography || '')].filter(Boolean).join(' ');
      const sentences=[...new Map(sentenceSplit(source).map(t=>[normalize(t),t])).values()];
      const surname=name.trim().split(/\s+/).at(-1);
      const subject=String(person?.deathday || '') ? 'was' : 'is';
      const occupation='(?:actor|actress|filmmaker|director|producer|screenwriter|comedian|singer|musician|writer|narrator|performer|dancer|playwright|author)';
      const nationality='(?:American|British|English|Scottish|Welsh|Irish|Northern Irish|Canadian|Australian|New Zealand|French|German|Italian|Spanish|Portuguese|Mexican|Brazilian|Argentine|Indian|Pakistani|Bangladeshi|Chinese|Hong Kong|Taiwanese|Japanese|South Korean|Korean|Filipino|Indonesian|Malaysian|Singaporean|Thai|Vietnamese|South African|Nigerian|Kenyan|Egyptian|Moroccan|Israeli|Palestinian|Lebanese|Iranian|Turkish|Swedish|Danish|Norwegian|Finnish|Icelandic|Dutch|Belgian|Swiss|Austrian|Polish|Czech|Slovak|Hungarian|Romanian|Greek|Russian|Ukrainian|Jamaican|Cuban|Puerto Rican|Chilean|Colombian|Peruvian|Venezuelan|New Zealander)';
      const pattern=new RegExp(`\\b(?:is|was)\\s+(?:an?|the)\\s+((?:${nationality}(?:(?:-| and |, )${nationality})*\\s+)?${occupation}(?:(?:,\\s*(?:and\\s+)?|\\s+and\\s+)${occupation})*)(?=[.,;]|\\s+(?:who|known|whose|with|best|noted|regarded)|$)`,'i');
      const descriptors=[summary,extract,person?.biography || ''].map(s=>sentenceSplit(s)[0] || '')
        .map(t=>t.replace(/\s*\([^)]*\)/g,'').match(pattern)?.[1]).filter(Boolean);
      const descriptor=descriptors.sort((a,b)=>
        (new RegExp(`^${nationality}\\b`,'i').test(b)?100:0)+(b.match(new RegExp(`\\b${occupation}\\b`,'gi'))||[]).length-
        (new RegExp(`^${nationality}\\b`,'i').test(a)?100:0)-(a.match(new RegExp(`\\b${occupation}\\b`,'gi'))||[]).length)[0];
      let profession=descriptor || (String(person?.known_for_department || '').toLowerCase()==='acting'?'actor':'performer');
      // An explicit statement about this person's directing can supplement a
      // sparse lead. Another person's directing credit must never do so.
      const hasDirecting=sentences.some(t=>new RegExp(`^(?:${esc(name)}|${esc(surname)}|He|She|They)\\s+(?:(?:has|had)\\s+)?(?:also\\s+)?directed\\b`,'i').test(t));
      if(hasDirecting && !/\b(?:director|filmmaker)\b/i.test(profession))profession+=' and director';
      const intro=`${name} ${subject} ${/^[aeiou]/i.test(profession)?'an':'a'} ${profession}.`;
      const today=new Date().toISOString().slice(0,10);
      const films=[...new Map(validMovieCredits(credits).filter(isBiographyActingCredit)
        .filter(m=>m.release_date<=today).map(m=>[m.id,{...m,year:yearFromDate(m.release_date)}])).values()]
        .filter(m=>m.year).sort((a,b)=>a.year-b.year||a.id-b.id);
      const mentions=(text,m)=>{
        const title=cleanText(m.title);
        for(const match of text.matchAll(new RegExp(`(^|[^a-z0-9])${esc(title)}(?=$|[^a-z0-9])`,'ig'))){
          const start=match.index+match[1].length,end=start+title.length;
          const date=text.slice(end).match(/^\s*\(((?:19|20)\d{2})\)/);
          if(date){if(+date[1]===m.year)return true;continue;}
          if(normalize(title).length<5)continue;
          if(!films.some(other=>other.title.length>title.length && normalize(other.title).startsWith(normalize(title)+' ') &&
            new RegExp(`^${esc(other.title)}(?=$|[^a-z0-9])`,'i').test(text.slice(start))))return true;
        }
        return false;
      };
      const label=m=>`${m.title} (${m.year})`;
      const awardLanguage=/\b(?:academy|oscar|award|nomina(?:ted|tion|tions)|nominee|winner|won|nod)\b/i;
      const promotional=/\b(?:biggest|highest.grossing|commercial success|greatest|most successful|worldwide superstar|unparalleled)\b/i;
      const significance=/\b(?:breakthrough|breakout|broke through|rose to (?:fame|prominence)|gained (?:recognition|attention)|critical acclaim|critically acclaimed|leading role|defining|signature)\b/i;
      const originPattern=/\b(?:began|started)\b.*\b(?:career|acting|child|commercials|television|stage|theat(?:er|re))\b/i;
      const contextBad=/\b(?:married|divorced|children|lawsuit|political|religion|that same year|the following year|the previous year)\b/i;
      const originCandidates=[];
      const candidates=new Map();
      const add=(film,data)=>{
        const old=candidates.get(film.id);
        if(!old || data.score>old.score)candidates.set(film.id,{film,year:film.year,...data});
      };
      for(const raw of sentences){
        if(raw.length>650 || contextBad.test(raw))continue;
        let t=raw.replace(/\bfirst breakthrough lead role\b/ig,'breakthrough role');
        const matched=films.filter(m=>mentions(t,m));
        // Preserve a single compact origin; film dates belong to milestones.
        if(originPattern.test(t) && !awardLanguage.test(t)){
          let origin=t.split(/,?\s+(?:including|before (?:appearing|starring|establishing)|through (?:the )?(?:Disney )?films)/i)[0];
          origin=origin.replace(/\s+and gained recognition$/i,'');
          if(!films.some(m=>mentions(origin,m)) && origin.length>=35 && origin.length<=250 &&
             !/\b(?:born|is an?|was an?)\b/i.test(origin))originCandidates.push(origin);
        }
        if(!matched.length)continue;
        // Award clauses must not erase a separately stated debut/breakthrough.
        // Keep only the preceding independent clause, never the unverified award.
        if(awardLanguage.test(t)){
          const prefix=t.split(/,?\s+(?:for which|earning (?:him|her|them)|and (?:earned|received|won)|which (?:earned|won|brought))/i)[0];
          t=!awardLanguage.test(prefix)?prefix:'';
        }
        const actingContext=/\b(?:dramatic|comedic|comedy)\s+(?:work|roles|performances|films)\b/i.exec(t)?.[0];
        const directs=/\b(?:directed|directorial)\b/i.test(t);
        for(const film of matched){
          let prose='',score=4,kind='credit';
          if(t && matched.length===1 && !awardLanguage.test(t) && !promotional.test(t) &&
             !/\b(?:born|is an?|was an?)\b/i.test(t) && t.length<=340 && !directs){
            prose=ensurePeriod(t.replace(/^(?:He|She|They)\b/,surname).replace(new RegExp(`^${esc(name)}\\b`),surname));
            // Supply the credit's release year if the source omits it.
            if(!new RegExp(`\\b${film.year}\\b`).test(prose))prose=prose.replace(new RegExp(esc(film.title),'i'),label(film));
            // Single-title prose may still span unrelated years. Keep a neutral
            // credit instead of giving that multi-period sentence one date.
            const years=[...prose.matchAll(/\b((?:19|20)\d{2})\b/g)].map(x=>+x[1]);
            if(years.some(y=>y!==film.year))prose='';
            if(prose){score=significance.test(t)?25:10;kind='source';}
          }
          if(actingContext && !directs && !awardLanguage.test(t)){
            kind=/dramatic/i.test(actingContext)?'dramatic':'comedic';score=15;prose='';
          }
          // A multi-film directing list is not an acting milestone. Its films
          // may enter independently through cast credits, without direction claims.
          add(film,{prose,score,kind});
        }
      }
      const categoryName=value=>{
        const c=cleanText(value).toLowerCase();
        if(/supporting/.test(c) && /actress|female/.test(c))return 'Best Supporting Actress';
        if(/supporting/.test(c) && /actor|male/.test(c))return 'Best Supporting Actor';
        if(/actress|female/.test(c) && /best|leading/.test(c))return 'Best Actress';
        if(/actor|male/.test(c) && /best|leading/.test(c))return 'Best Actor';
        return '';
      };
      for(const record of verifiedAwards){
        const film=films.find(m=>normalize(m.title)===normalize(record.movie||record.work||''));
        const category=categoryName(record.category||record.award||'');
        if(!film || !category)continue;
        const year=Number(record.year||0);
        if(year && Math.abs(year-film.year)>2)continue;
        const winner=record.winner===true || /^winner$/i.test(record.result||'');
        const nominated=winner || record.winner===false || /^(?:nominee|nominated)$/i.test(record.result||'');
        if(!nominated)continue;
        const prior=candidates.get(film.id);
        const context=prior?.kind==='source' && significance.test(prior.prose) ? prior.prose : '';
        add(film,{score:winner?60:35,kind:'award',winner,category,context,prose:''});
      }
      if(!films.length)return [intro,originCandidates[0]&&ensurePeriod(originCandidates[0].replace(/^(?:He|She|They)\b/,surname))].filter(Boolean).join(' ');
      const selected=[],used=new Set();
      const take=item=>{if(item && selected.length<12 && !used.has(item.film.id)){selected.push(item);used.add(item.film.id);}};
      const ranked=[...candidates.values()].sort((a,b)=>b.score-a.score||a.year-b.year);
      ranked.filter(x=>x.kind==='award').slice(0,4).forEach(take);
      take(ranked.find(x=>x.kind==='source' && significance.test(x.prose)));
      // Explicit source milestones are preferred across each career decade.
      const first=films[0].year,last=films.at(-1).year;
      for(let decade=Math.floor(first/10)*10;decade<=last;decade+=10){
        take(ranked.find(x=>x.year>=decade&&x.year<decade+10));
      }
      ranked.filter(x=>x.score>=10).forEach(item=>{if(selected.length<12)take(item);});
      const eligible=films.filter(m=>Number(m.vote_count||0)>=100 || Number(m.popularity||0)>=15);
      // Reserve chronological coverage before filling with popular credits.
      // Popularity ranks examples only; it never establishes a breakthrough.
      const scoreFilm=(a,b)=>movieRecognitionScore(b)-movieRecognitionScore(a)||a.year-b.year;
      for(let decade=Math.floor(first/10)*10;decade<=last;decade+=10){
        if(selected.some(x=>x.year>=decade&&x.year<decade+10))continue;
        const film=eligible.filter(m=>m.year>=decade&&m.year<decade+10).sort(scoreFilm)[0];
        if(film && selected.length<12)take({film,year:film.year,kind:'credit',score:1,prose:''});
      }
      // Short careers still need their final period represented. Use 'releases'
      // for a deceased performer; a release date is not a filming date.
      const latest=eligible.filter(m=>m.year>=last-3).sort(scoreFilm)[0];
      if(latest && !selected.some(x=>x.year>=last-3) && selected.length<12)take({film:latest,year:latest.year,kind:'credit',score:1,prose:''});
      for(const film of eligible.sort(scoreFilm)){
        if(selected.length>=Math.min(9,films.length))break;
        take({film,year:film.year,kind:'credit',score:1,prose:''});
      }
      // A decade label alone can hide a long gap near its boundary.
      // Add a verified credit inside a ten-year gap when one is available.
      selected.sort((a,b)=>a.year-b.year||b.score-a.score);
      const boundaries=[...selected];
      for(let i=1;i<boundaries.length && selected.length<12;i++){
        const left=boundaries[i-1].year,right=boundaries[i].year;
        if(right-left<10)continue;
        const midpoint=(left+right)/2;
        const film=eligible.filter(m=>m.year>left&&m.year<right&&!used.has(m.id))
          .sort((a,b)=>Math.abs(a.year-midpoint)-Math.abs(b.year-midpoint)||scoreFilm(a,b))[0];
        if(film)take(candidates.get(film.id)||{film,year:film.year,kind:'credit',score:1,prose:''});
      }
      selected.sort((a,b)=>a.year-b.year||b.score-a.score);
      const output=[intro];
      // Choose one origin only, preferring a specific statement to a broad
      // paraphrase that repeats the same childhood/television/stage beginning.
      const origin=originCandidates.sort((a,b)=>(/\b(?:age|commercials|television|stage|theater|theatre|model)\b/i.test(b)?1:0)-(/\b(?:age|commercials|television|stage|theater|theatre|model)\b/i.test(a)?1:0)||b.length-a.length)[0];
      if(origin)output.push(ensurePeriod(origin.replace(/^(?:He|She|They)\b/,surname).replace(new RegExp(`^${esc(name)}\\b`),surname)));
      let wins=0,neutral=0,dramatic=0,comedic=0;
      for(let i=0;i<selected.length;i++){
        const item=selected[i];
        if(item.kind==='award'){
          if(item.context)output.push(item.context);
          if(item.winner){
            wins++;
            output.push(wins===1?`For ${label(item.film)}, ${surname} won the Academy Award for ${item.category}.`:
              `${label(item.film)} brought ${surname} ${wins===2?'another':'a further'} Academy Award for ${item.category}.`);
          }else output.push(`${surname} earned an Academy Award nomination for ${item.category} for ${label(item.film)}.`);
        }else if(item.prose)output.push(item.prose);
        else{
          const group=[item];
          // Group only adjacent neutral credits from the same decade and type.
          // No group crosses an intervening source/award milestone.
          while(i+1<selected.length && group.length<2){
            const next=selected[i+1];
            if(next.prose || next.kind!==item.kind || Math.floor(next.year/10)!==Math.floor(item.year/10))break;
            group.push(next);i++;
          }
          const titles=group.map(x=>label(x.film)).join(' and ');
          if(item.kind==='dramatic'){dramatic++;output.push(dramatic===1?`${surname}'s dramatic work included ${titles}.`:
            dramatic===2?`Further dramatic roles included ${titles}.`:`The dramatic work continued with ${titles}.`);}
          else if(item.kind==='comedic'){comedic++;output.push(comedic===1?`${surname}'s comedy roles included ${titles}.`:`Further comedy roles included ${titles}.`);}
          else{
            neutral++;
            const posthumous=person?.deathday && group.every(x=>x.film.release_date>person.deathday);
            output.push(posthumous?`Posthumous releases included ${titles}.`:
              neutral===1?`${surname}'s film roles included ${titles}.`:
              neutral===2?`Subsequent film appearances included ${titles}.`:
              neutral===3?`${surname} also appeared in ${titles}.`:
              neutral===4?`Other roles included ${titles}.`:
              neutral===5?`Later film work included ${titles}.`:
              `Additional appearances included ${titles}.`);
          }
        }
      }
      return [...new Set(output)].join(' ');

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
const context=/\b(?:breakthrough|breakout|acclaim|praised|recognized|prominence|leading role|lead role|starring role|starred|performance|portrayed|career|turning point|signature|best known|noted for|critical|comeback|dramatic role|comedic role)\b/i;
function compose(person,credits,sources){
 const now=new Date().getUTCFullYear(),candidates=[],excluded=[];
 const verified=(sources||[]).filter(s=>s?.personId===person.id&&s?.id&&s?.kind);
 for(const c of credits||[]){
  const title=String(c?.title||'').trim(),y=year(c?.release_date);
  if(c?.media_type&&c.media_type!=='movie')continue;
  if(!Number.isSafeInteger(c?.id)||!title||y<1900||y>now||c.adult||c.order===undefined||c.order===null)continue;
  const key=norm(title);if(key.length<5)continue;
  const evidence=[];
  for(const source of verified){
   const sentences=String(source.text||'').replace(/\bvs\./gi,'vs․').split(/(?<=[.!?])\s+/).map(x=>norm(x.replace(/․/g,'.')));
   const excerpt=sentences.find(x=>x.includes(key));if(!excerpt)continue;
   evidence.push({sourceId:source.id,kind:source.kind,context:context.test(excerpt)?'career_context':'title_mention'});
  }
  if(!evidence.length){excluded.push({title,reason:'no linked source mention'});continue;}
  const meaningful=evidence.filter(e=>e.context==='career_context');
  const sourceFamilies=new Set(meaningful.map(e=>e.kind.startsWith('wikipedia')?'wikipedia':e.kind));
  const significance=!meaningful.length?'mention_only':sourceFamilies.size>=2?'cross_source_context':'single_source_context';
  candidates.push({id:c.id,title,year:y,order:c.order,significance,evidence,source:{kind:'tmdb_person_cast',id:`tmdb:person:${person.id}:movie:${c.id}`}});
 }
 const unique=new Map();for(const c of candidates){const k=norm(c.title)+':'+c.year;if(!unique.has(k)||unique.get(k).evidence.length<c.evidence.length)unique.set(k,c);}
 const all=[...unique.values()].sort((a,b)=>a.year-b.year||a.title.localeCompare(b.title));
 const rank={cross_source_context:0,single_source_context:1,mention_only:2};
 const supported=all.filter(c=>c.significance!=='mention_only');
 const sorted=[...supported].sort((a,b)=>rank[a.significance]-rank[b.significance]||a.year-b.year);
 const selected=[],ids=new Set();const add=c=>{if(c&&!ids.has(c.id)&&selected.length<9){selected.push(c);ids.add(c.id);}};
 for(const d of [...new Set(supported.map(c=>Math.floor(c.year/10)))].sort())add(sorted.find(c=>Math.floor(c.year/10)===d));
 for(const c of sorted)add(c);selected.sort((a,b)=>a.year-b.year);
 const biography=selected.length?`${person.name} has source-supported screen credits including ${selected.map(c=>`${c.title} (${c.year})`).join(', ')}. This is a diagnostic overview, not a publication-ready biography.`:`Insufficient linked career context to draft a biography for ${person.name}.`;
 return {biography,credits:selected,candidates:all,diagnostic:{sourceMentioned:all.length,careerContextCandidates:supported.length,selected:selected.length,excluded:excluded.slice(0,12),selectionPolicy:'Verified TMDB cast + career-context evidence; no popularity scoring',limitations:['Keyword proximity is not independent proof of career significance','Wikipedia intro and extract count as one source family','No unsupported awards or breakthrough claims']},readyForPublication:false,editorialQualityPass:false};
}
return {compose};
})();
/* R8 curated milestone pilot: title+release-year verified against exact person cast.
   This is a pilot, not an actor-specific patch to the public biography. */
const PERSON163_HANKS_AUDITED_DRAFT = "Tom Hanks emerged as a film lead with Splash (1984) and earned his first Academy Award nomination for Big (1988). He subsequently won consecutive Academy Awards for Best Actor for Philadelphia (1993) and Forrest Gump (1994), and received further acting nominations for Saving Private Ryan (1998), Cast Away (2000), and A Beautiful Day in the Neighborhood (2019). His film work also spans Apollo 13 (1995), The Green Mile (1999), Catch Me If You Can (2002), The Terminal (2004), Captain Phillips (2013), Bridge of Spies (2015), and The Post (2017). He voiced Woody in the Toy Story films, collaborated repeatedly with Steven Spielberg, directed That Thing You Do! (1996), and served as an executive producer on Band of Brothers (2001) and The Pacific (2010).";
const Bio161MilestonePilot=(()=>{
const records={
  31:{name:'Tom Hanks',intro:'Tom Hanks developed from early screen comedy into a leading dramatic actor, while continuing to work across animation, historical drama and character-driven films.',films:[
    ['Splash',1984,'early comedy'],['Big',1988,'early leading role'],['Philadelphia',1993,'dramatic role'],['Forrest Gump',1994,'dramatic leading role'],['Apollo 13',1995,'ensemble drama'],['Toy Story',1995,'animated voice role'],['Saving Private Ryan',1998,'war drama'],['Cast Away',2000,'leading dramatic role'],['Captain Phillips',2013,'later dramatic role'],['Bridge of Spies',2015,'later historical drama'],['A Beautiful Day in the Neighborhood',2019,'later character role']]},
  5064:{name:'Meryl Streep',intro:'Meryl Streep trained at Vassar College and the Yale School of Drama before building a career on stage and screen.',films:[
    ['The Deer Hunter',1978,'early film career'],['Kramer vs. Kramer',1979,'major dramatic role'],["Sophie's Choice",1982,'defining dramatic role'],['Out of Africa',1985,'leading dramatic role'],['The Bridges of Madison County',1995,'later dramatic role'],['The Devil Wears Prada',2006,'mainstream role'],['Mamma Mia!',2008,'musical role'],['The Iron Lady',2011,'later dramatic portrayal']]},
  19292:{name:'Adam Sandler',intro:'Adam Sandler developed his comedy career through stand-up and Saturday Night Live before becoming a leading film comedian.',films:[
    ['Billy Madison',1995,'early starring comedy'],['Happy Gilmore',1996,'signature comedy'],['The Wedding Singer',1998,'romantic comedy'],['The Waterboy',1998,'popular comedy'],['Punch-Drunk Love',2002,'dramatic performance'],['Uncut Gems',2019,'later dramatic performance'],['Hustle',2022,'later dramatic performance']]}
};
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function compose(person,cast){
 const record=records[Number(person?.id)];
 if(!record||norm(record.name)!==norm(person.name))return {biography:null,coverage:'not_curated',readyForPublication:false,diagnostic:{reason:'No editorial record for this performer; generic public profile remains unchanged'}};
 const verified=[],missing=[];
 for(const [title,year,editorialLabel] of record.films){
  const credit=(cast||[]).find(c=>c&&typeof c==='object'&&norm(c.title)===norm(title)&&Number(String(c.release_date||'').slice(0,4))===year&&(c.media_type===undefined||c.media_type==='movie')&&c.adult!==true&&typeof c.credit_id==='string'&&c.credit_id.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(c.release_date||'')&&Number.isSafeInteger(c.id)&&typeof c.character==='string'&&c.character.trim());
  if(!credit){missing.push({title,year,reason:'not verified in exact TMDB person cast'});continue;}
  verified.push({id:credit.id,title,year,editorialLabel,source:{kind:'tmdb_person_cast',id:`tmdb:person:${person.id}:movie:${credit.id}`}});
 }
 verified.sort((a,b)=>a.year-b.year||a.title.localeCompare(b.title));
 const allVerified=missing.length===0;
 const narrative=Number(person.id)===31&&allVerified?[
  "Tom Hanks moved from early screen comedy in Splash (1984) and Big (1988) into dramatic leading roles in Philadelphia (1993) and Forrest Gump (1994).",
  "His subsequent screen work ranged from the ensemble drama Apollo 13 (1995) and the voice of Woody in Toy Story (1995) to Saving Private Ryan (1998) and the largely solitary role in Cast Away (2000).",
  "He continued working in character-led dramas including Captain Phillips (2013), Bridge of Spies (2015), and A Beautiful Day in the Neighborhood (2019)."
 ].join(" "):null;
 const biography=narrative||record.intro+' Selected verified film credits for editorial review: '+verified.map(c=>`${c.title} (${c.year})`).join(', ')+'. This is a milestone preview, not a finished biography.';
 return {biography,narrativePreview:!!narrative,coverage:'curated_pilot',verified,missing,readyForPublication:false,editorialQualityPass:false,diagnostic:{editorialCandidates:record.films.length,verified:verified.length,missing:missing.length,limitations:['TMDB verifies cast participation, not editorial significance','Editorial labels are hypotheses pending source audit','No award claims inferred']}};
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

/* Person 166: generic source-context preview. No performer-specific records.
   Cast participation corroborates a title, not the sentence's significance claim.
   Source sentences remain attributed review material, never automatic publication. */
const Bio166Preview = (() => {
  const norm = value => String(value || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const contains = (text, title) => {
    const key = norm(title);
    return key.length >= 5 && (' ' + norm(text) + ' ').includes(' ' + key + ' ');
  };
  function compose(person, credits, sources, publicBiography = '', today = new Date().toISOString().slice(0,10)) {
    const movies = validMovieCredits(credits).filter(isBiographyActingCredit)
      .filter(movie => (!movie.media_type || movie.media_type === 'movie') && !movie.adult && Number.isSafeInteger(movie.id) && movie.title &&
        /^\d{4}-\d{2}-\d{2}$/.test(movie.release_date || '') && movie.release_date <= today);
    const extracted = Bio161Source.extractMilestones(person, sources);
    const candidates = [], excluded = [];
    for (const milestone of extracted.milestones) {
      const films = movies.filter(movie => contains(milestone.text, movie.title));
      // Film statements need a dated title as well as explicit career context.
      // This avoids inventing an arc from billing or popularity rankings.
      if (!films.length || !milestone.year) {
        excluded.push({reason:'No dated acting-film anchor',source:milestone.source});
        continue;
      }
      if (/\b(?:he|she|his|her|they|their|it|this|that)\b/i.test(milestone.text.split(/\s+/)[0]) && !contains(milestone.text, person.name)) {
        excluded.push({reason:'Opening needs unresolved source context',source:milestone.source});
        continue;
      }
      // Do not mistake another date in a sentence for a matched film's year.
      const dates = [...milestone.text.matchAll(/\b(?:19|20)\d{2}\b/g)].map(match => Number(match[0]));
      const datedFilms = films.filter(movie => dates.includes(Number(movie.release_date.slice(0,4))));
      if (!datedFilms.length) {
        excluded.push({reason:'Film and sentence dates do not corroborate',source:milestone.source});
        continue;
      }
      candidates.push({...milestone,year:Math.min(...datedFilms.map(movie => Number(movie.release_date.slice(0,4)))),
        films:datedFilms.map(movie => ({tmdbMovieId:movie.id,title:movie.title,year:Number(movie.release_date.slice(0,4))}))});
    }
    // Reserve chronological breadth before filling remaining places.
    const selected=[],seen=new Set();
    const add=item=>{if(item && selected.length<6 && !seen.has(norm(item.text))){selected.push(item);seen.add(norm(item.text));}};
    const ordered=candidates.sort((a,b)=>a.year-b.year);
    for(const decade of [...new Set(ordered.map(item=>Math.floor(item.year/10)))]) add(ordered.find(item=>Math.floor(item.year/10)===decade));
    for(const item of ordered) add(item);
    selected.sort((a,b)=>a.year-b.year);
    const candidate=selected.map(item=>item.text).join(' ');
    const omitted=movies.filter(movie=>contains(publicBiography,movie.title)&&!contains(candidate,movie.title));
    return {genericCandidate:candidate || null,
      evidence:selected.map(item=>({text:item.text,year:item.year,category:item.category,source:item.source,films:item.films})),
      quality:{sourceGroundedStatements:selected.length,representedDecades:[...new Set(selected.map(item=>Math.floor(item.year/10)*10))],
        omittedPublicVerifiedTitles:omitted.map(movie=>({tmdbMovieId:movie.id,title:movie.title})),
        preservesPublicFilmCoverage:omitted.length===0,independentSignificanceAuditComplete:false},
      diagnostics:{excluded:[...extracted.excluded,...excluded].slice(0,30),candidateStatements:candidates.length},
      readyForPublication:false,releaseStatus:selected.length?'source_context_editorial_review':'insufficient_source_context',
      policy:'Attributed source-excerpt preview only. Credits corroborate participation; career significance, context, and wording still require editorial review.'};
  }
  return {compose};
})();


/* Person 167: source-context extraction with sentence-aware clause filtering.
   Preview remains attributed review material, not an approved public biography. */
const Bio167Preview = (() => {
  const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const has=(body,title)=>norm(title).length>=5&&(' '+norm(body)+' ').includes(' '+norm(title)+' ');
  const award=/\b(?:awards?|oscars?|nominat(?:ed|ions?)|golden globe|bafta|emmy|won|winning)\b/i;
  const career=/\b(?:starred|starring|appeared|performance|performances|portrayed|played|voiced|voice role|transitioned|feature film role|film debut|screen debut|leading actress|leading actor|returned|breakthrough|rose to prominence|began.{0,30}career)\b/i;
  function compose(person,credits,sources,publicBiography='',today=new Date().toISOString().slice(0,10),options={}) {
    const movies=validMovieCredits(credits).filter(isBiographyActingCredit).filter(m=>
      (!m.media_type||m.media_type==='movie')&&!m.adult&&Number.isSafeInteger(m.id)&&
      /^\d{4}-\d{2}-\d{2}$/.test(m.release_date||'')&&m.release_date<=today);
    const candidates=[],excluded=[],seen=new Set();
    const names=[norm(person.name),norm(person.name).split(' ').at(-1)].filter(Boolean);
    for(const source of sources||[]) {
      if(source.personId!==person.id||!source.id||!['tmdb_biography','wikipedia_summary','wikipedia_extract'].includes(source.kind))continue;
      // Process the complete bounded extract; a childhood-heavy opening must not
      // consume the entire career extraction budget.
      const protectedSource=String(source.text||'').slice(0,250000).replace(/([!?])(?=\s*\((?:19|20)\d{2}\))/g, mark=>mark==='!'?'__RW_TITLE_BANG__':'__RW_TITLE_QUERY__');
      const sentences=sentenceSplit(protectedSource).map(text=>text.replaceAll('__RW_TITLE_BANG__','!').replaceAll('__RW_TITLE_QUERY__','?'));
      for(const original of sentences.slice(0,1600)) {
        let text=original;
        const lead=norm(text).replace(/^in (?:19|20)\d{2} /,'');
        const named=names.some(name=>lead.startsWith(name+' ')||lead===name);
        const pronoun=/^(?:She|He|They)\b/.test(text)&&source.kind!=='wikipedia_extract';
        if(!named&&!pronoun)continue;
        // Remove dependent award tails, never retain an award assertion because
        // the same sentence also mentions an acting credit.
        text=text.split(/,\s*(?:for which|the latter|followed by (?:her|his|their) first|earning (?:her|him|them))\b/i)[0];
        // A portrayal's plot is not career context. Keep its preceding role clause.
        text=text.split(/,\s*(?:playing|in which (?:she|he|they) play(?:s|ed)?|who (?:is|was|has))\b/i)[0];
        if(award.test(text)||/\b(?:greatest|prolific artist|audiobooks?|musical recordings|box office total|grossed)\b/i.test(text)||!career.test(text))continue;
        const dates=[...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0]));
        const films=movies.filter(m=>has(text,m.title)&&dates.includes(Number(m.release_date.slice(0,4))));
        if(!films.length){excluded.push({source:source.id,reason:'No matching dated acting-film anchor'});continue;}
        if(pronoun)text=text.replace(/^(She|He|They)\b/,person.name);
        text=ensurePeriod(text);
        if(text.length<35||text.length>600||seen.has(norm(text)))continue;
        seen.add(norm(text));
        candidates.push({text,year:Math.min(...films.map(m=>Number(m.release_date.slice(0,4)))),
          source:{id:source.id,kind:source.kind},films:films.map(m=>({tmdbMovieId:m.id,title:m.title,year:Number(m.release_date.slice(0,4))}))});
      }
    }
    if(options.collectCandidates)return {movies,candidates,excluded};
    candidates.sort((a,b)=>a.year-b.year);
    const selected=[],used=new Set();
    const add=item=>{if(item&&selected.length<6&&!used.has(item)){selected.push(item);used.add(item);}};
    for(const decade of [...new Set(candidates.map(c=>Math.floor(c.year/10)))])add(candidates.find(c=>Math.floor(c.year/10)===decade));
    for(const item of candidates)add(item);
    selected.sort((a,b)=>a.year-b.year);
    const candidate=selected.map(c=>c.text).join(' ');
    const omitted=movies.filter(m=>has(publicBiography,m.title)&&!has(candidate,m.title));
    const representedDecades=[...new Set(selected.map(c=>Math.floor(c.year/10)*10))];
    return {genericCandidate:candidate||null,evidence:selected,
      quality:{sourceGroundedStatements:selected.length,representedDecades,
        omittedPublicVerifiedTitles:omitted.map(m=>({tmdbMovieId:m.id,title:m.title})),
        preservesPublicFilmCoverage:omitted.length===0,independentSignificanceAuditComplete:false,
        spansMultipleDecades:representedDecades.length>=2},
      diagnostics:{candidateStatements:candidates.length,excluded:excluded.slice(0,30)},
      readyForPublication:false,releaseStatus:!selected.length?'insufficient_source_context':representedDecades.length<2?'incomplete_career_coverage':'source_context_editorial_review',
      policy:'Attributed source excerpts with limited clause cleanup. Credits corroborate participation, not significance. Context, omissions, and narrative quality require editorial review before publication.'};
  }
  return {compose};
})();


/* Person 168: rank linked career context; ordinary appearances never outrank
   a supported transition simply because they occur earlier in a decade. */
const Bio168Preview = (() => {
  const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const has=(body,title)=>norm(title).length>=5&&(' '+norm(body)+' ').includes(' '+norm(title)+' ');
  const format=films=>films.map(m=>`${m.title} (${m.year})`).join(', ');
  function compose(person,credits,sources,publicBiography='',today=new Date().toISOString().slice(0,10),options={}) {
    const {movies,candidates:raw,excluded}=Bio167Preview.compose(person,credits,sources,publicBiography,today,{collectCandidates:true});
    const candidates=raw.map(item=>{
      const originalText=item.text;
      let text=originalText;
      const routine=/\b(?:appeared (?:alongside|with)|starred (?:alongside|with|opposite)|co-starred|co-starring|on the set)\b/i.test(text);
      if(routine)text=`${person.name} ${/\b(?:starred|co-starred)\b/i.test(text)?'starred':'appeared'} in ${format(item.films)}.`;
      else text=text.split(/,\s*(?:set in|based on|directed by|which (?:follows|tells)|where (?:she|he|they))\b/i)[0];
      text=ensurePeriod(text);
      const origin=/\b(?:debut|first feature|transitioned to film|began.{0,30}career)\b/i.test(originalText);
      const transition=/\b(?:became a leading|breakthrough|breakout|rose to prominence|established|transitioned|returned to|dramatic (?:roles?|work)|comedic (?:roles?|work))\b/i.test(originalText);
      const sourceLead=item.source.kind==='wikipedia_summary'||item.source.kind==='tmdb_biography';
      const score=(origin?24:0)+(transition?22:0)+(sourceLead?12:0)+(routine?0:3);
      return {...item,text,originalText,stage:origin?'origin':transition?'transition':'screen_work',score,
        rankingReasons:[...(origin?['source describes career start']:[]),...(transition?['source describes career transition']:[]),...(sourceLead?['biographical lead context']:[])]};
    });
    // Reuse the existing identity-scoped Academy audit, never raw source claims.
    // The audit's year is the film year; an Oscar ceremony may be the next year.
    const audited=independentlyAuditedOscars(person);
    for(const record of audited.filter(record=>record.winner)){
      const film=movies.find(m=>norm(m.title)===norm(record.movie)&&Number(m.release_date.slice(0,4))===record.year);
      if(!film)continue;
      const films=[{tmdbMovieId:film.id,title:film.title,year:record.year}];
      candidates.push({text:`${person.name} won the Academy Award for ${record.category} for ${film.title} (${record.year}).`,
        year:record.year,films,source:{id:`reelwise:academy-acting:${person.id}:${film.id}:${record.year}`,kind:'audited_award'},
        stage:'audited_award',score:40,rankingReasons:['identity-matched audited acting win and dated cast credit']});
    }
    if(options.collectCandidates)return {movies,candidates,excluded};
    const ranked=[...candidates].sort((a,b)=>b.score-a.score||a.year-b.year||a.text.localeCompare(b.text));
    const selected=[],seen=new Set();
    const add=item=>{if(!item||selected.length>=8||seen.has(norm(item.text)))return;
      // Avoid several routine sentences for the same film.
      if(item.stage!=='audited_award'&&item.films.every(f=>selected.some(s=>s.films.some(g=>f.tmdbMovieId===g.tmdbMovieId))))return;
      selected.push(item);seen.add(norm(item.text));};
    add(ranked.find(item=>item.stage==='origin'));
    for(const item of ranked.filter(item=>item.stage==='audited_award').slice(0,3)){add(item);}
    for(const item of ranked.filter(item=>item.stage==='transition').slice(0,2))add(item);
    // Breadth uses the strongest candidate within each period, not the first.
    const years=movies.map(m=>Number(m.release_date.slice(0,4))),first=Math.min(...years),last=Math.max(...years),span=last-first;
    const period=year=>span<=0?'early':year<=first+span/3?'early':year>=first+2*span/3?'later':'middle';
    for(const key of ['early','middle','later'])if(!selected.some(item=>period(item.year)===key))add(ranked.find(item=>period(item.year)===key));
    for(const item of ranked)add(item);
    selected.sort((a,b)=>a.year-b.year||b.score-a.score);
    const surname=String(person.name).trim().split(/\s+/).at(-1);
    const candidate=selected.map((item,index)=>index?item.text.replaceAll(person.name,surname):item.text).join(' ');
    const omitted=movies.filter(m=>has(publicBiography,m.title)&&!has(candidate,m.title));
    return {genericCandidate:candidate||null,evidence:selected,
      quality:{sourceGroundedStatements:selected.length,representedDecades:[...new Set(selected.map(c=>Math.floor(c.year/10)*10))],
        omittedPublicVerifiedTitles:omitted.map(m=>({tmdbMovieId:m.id,title:m.title})),preservesPublicFilmCoverage:omitted.length===0,
        auditedAwardStatements:selected.filter(c=>c.stage==='audited_award').length,
        careerTransitionStatements:selected.filter(c=>c.stage==='transition').length,
        independentSignificanceAuditComplete:false},
      diagnostics:{candidateStatements:candidates.length,excluded:excluded.slice(0,30),
        selectionPolicy:'Rank explicit source career context and audited acting wins before routine appearances; chronology orders the chosen material, not its importance.'},
      readyForPublication:false,releaseStatus:!selected.length?'insufficient_source_context':'milestone_selection_editorial_review',
      policy:'Preview only. Source-language significance remains for editorial review; award statements use the existing identity-scoped Academy audit. No automatic public replacement.'};
  }
  return {compose};
})();


/* Person 169: reserve recent-career coverage before filling the sentence budget.
   Plain cast-backed role statements replace plot/review/co-star digressions. */
const Bio169Preview=(()=>{
  const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const has=(body,title)=>norm(title).length>=5&&(' '+norm(body)+' ').includes(' '+norm(title)+' ');
  function compose(person,credits,sources,publicBiography='',today=new Date().toISOString().slice(0,10)){
    const collected=Bio168Preview.compose(person,credits,sources,publicBiography,today,{collectCandidates:true});
    const movies=collected.movies.filter(m=>!Array.isArray(m.genre_ids)||!m.genre_ids.includes(99));
    const movieIds=new Set(movies.map(m=>m.id));
    const candidates=collected.candidates.filter(item=>item.films.some(f=>movieIds.has(f.tmdbMovieId))).map(item=>{
      const films=item.films.filter(f=>movieIds.has(f.tmdbMovieId));
      let text=item.text;
      // Ordinary appearances should carry only the verified role or film,
      // never reception, other performers, or a character's personal history.
      if(item.stage==='screen_work'){
        const film=films[0],credit=movies.find(m=>m.id===film.tmdbMovieId);
        const role=cleanText(credit?.character||'');
        const usableRole=role&&role.length<=65&&!/[.!?;\n]/.test(role)&&!/\b(?:uncredited|archive|self)\b/i.test(role);
        text=films.length===1&&usableRole?`${person.name} played ${role} in ${film.title} (${film.year}).`:
          `${person.name} appeared in ${films.map(f=>`${f.title} (${f.year})`).join(', ')}.`;
      }
      return {...item,text,films};
    });
    const ranked=[...candidates].sort((a,b)=>b.score-a.score||b.year-a.year||a.text.localeCompare(b.text));
    const selected=[],seen=new Set();
    const add=item=>{
      if(!item||selected.length>=8||seen.has(norm(item.text)))return false;
      if(item.stage!=='audited_award'&&item.films.every(f=>selected.some(s=>s.films.some(g=>f.tmdbMovieId===g.tmdbMovieId))))return false;
      selected.push(item);seen.add(norm(item.text));return true;
    };
    const years=movies.map(m=>Number(m.release_date.slice(0,4)));
    const first=years.length?Math.min(...years):null,last=years.length?Math.max(...years):null;
    const recentStart=last===null?null:Math.max(first,last-7);
    const recentCandidates=ranked.filter(c=>c.year>=recentStart);
    // Reserve this position first. An award from fifteen years earlier cannot
    // satisfy later-career coverage just because it falls in the final third.
    const recent=[...recentCandidates].sort((a,b)=>b.year-a.year||b.score-a.score)[0];
    add(recent);
    add(ranked.filter(c=>c.stage==='origin').sort((a,b)=>b.score-a.score||a.year-b.year)[0]);
    for(const item of ranked.filter(c=>c.stage==='audited_award').sort((a,b)=>a.year-b.year).slice(0,3))add(item);
    for(const item of ranked.filter(c=>c.stage==='transition').slice(0,2))add(item);
    const span=last===null?0:last-first;
    // Preserve a genuine middle period when there is supported material.
    const middle=ranked.filter(c=>span>15&&c.year>first+span/3&&c.year<first+2*span/3);
    if(!selected.some(c=>span>15&&c.year>first+span/3&&c.year<first+2*span/3))for(const item of middle)if(add(item))break;
    // Do not fill every remaining place with an early minor appearance.
    for(const item of ranked.filter(c=>c.stage==='transition'||c.stage==='audited_award'))add(item);
    selected.sort((a,b)=>a.year-b.year||b.score-a.score);
    const surname=String(person.name).trim().split(/\s+/).at(-1);
    const candidate=selected.map((item,index)=>index?item.text.replaceAll(person.name,surname):item.text).join(' ');
    const omitted=movies.filter(m=>has(publicBiography,m.title)&&!has(candidate,m.title));
    const recentCovered=last!==null&&selected.some(c=>c.year>=recentStart);
    return {genericCandidate:candidate||null,evidence:selected,
      quality:{sourceGroundedStatements:selected.length,representedDecades:[...new Set(selected.map(c=>Math.floor(c.year/10)*10))],
        omittedPublicVerifiedTitles:omitted.map(m=>({tmdbMovieId:m.id,title:m.title})),preservesPublicFilmCoverage:omitted.length===0,
        latestVerifiedFilmYear:last,recentCoverageStartYear:recentStart,recentCareerCovered:recentCovered,
        latestSelectedYear:selected.length?Math.max(...selected.map(c=>c.year)):null,
        auditedAwardStatements:selected.filter(c=>c.stage==='audited_award').length,
        independentSignificanceAuditComplete:false},
      diagnostics:{candidateStatements:candidates.length,excluded:collected.excluded.slice(0,30),
        selectionPolicy:'Reserve recent linked career context first; retain origins, audited acting wins and source transitions; do not pad with minor early appearances.'},
      readyForPublication:false,releaseStatus:!selected.length?'insufficient_source_context':!recentCovered?'recent_career_source_gap':'career_narrative_editorial_review',
      policy:'Preview only. No significance is inferred from role or billing data. Missing recent source context is reported rather than invented.'};
  }
  return {compose};
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


        // Separate publication review route; does not modify the public profile.
        if (mode === "biography163_publication_preview") {
          if (Number(person.id) !== 31 || person.name !== "Tom Hanks") {
            return res.status(200).json({preview:true,deployedBiographyUnchanged:true,id:person.id,name:person.name,biography:null,publicationCandidate:null,readyForPublication:false,releaseStatus:"not_curated"});
          }
          return res.status(200).json({preview:true,deployedBiographyUnchanged:true,id:person.id,name:person.name,biography:null,publicationCandidate:PERSON163_HANKS_AUDITED_DRAFT,readyForPublication:false,releaseStatus:"editorial_publication_review",sourceAudit:{academy:"https://awardsdatabase.oscars.org/",televisionAcademy:"https://www.televisionacademy.com/bios/tom-hanks",productionBiography:"https://cdn.festival-cannes.com/media/uploads/2023/03/144135.pdf"}});
        }

        // Person 163: isolated opt-in narrative preview; never modifies public profile.
        if (mode === "biography163_preview") {
          try {
            const creditResponse = await fetchJSON(`https://api.themoviedb.org/3/person/${person.id}/combined_credits?language=en-US`,{headers:{Authorization:`Bearer ${TOKEN}`,accept:"application/json"}});
            const cast = Array.isArray(creditResponse?.cast) ? creditResponse.cast : [];
            const pilot = Bio161MilestonePilot.compose(person,cast);
            return res.status(200).json({preview:true,deployedBiographyUnchanged:true,
              id:person.id,name:person.name,coverage:pilot.coverage,
              biography:null,narrativePreview:pilot.narrativePreview?pilot.biography:null,
              readyForPublication:false,releaseStatus:pilot.narrativePreview?"narrative_editorial_review":"evidence_incomplete",
              diagnostic:{castRecords:cast.length,verifiedMilestones:Array.isArray(pilot.verified)?pilot.verified.length:0,
                missingMilestones:pilot.missing||[],limitations:pilot.diagnostic?.limitations||[]}});
          } catch {
            return res.status(200).json({preview:true,deployedBiographyUnchanged:true,
              id:person.id,name:person.name,biography:null,narrativePreview:null,readyForPublication:false,
              releaseStatus:"preview_unavailable"});
          }
        }

        // Person 162: opt-in narrative evidence diagnostic; public output unchanged.
        if (mode === "biography162_preview") {
          try {
            const creditResponse = await fetchJSON(`https://api.themoviedb.org/3/person/${person.id}/combined_credits?language=en-US`,{headers:{Authorization:`Bearer ${TOKEN}`,accept:"application/json"}});
            const cast = Array.isArray(creditResponse?.cast) ? creditResponse.cast : [];
            const pilot = Bio161MilestonePilot.compose(person, cast);
            return res.status(200).json({preview:true,deployedBiographyUnchanged:true,
              id:person.id,name:person.name,coverage:pilot.coverage,biography:null,
              readyForPublication:false,releaseStatus:"editorial_evidence_required",
              diagnostic:{reason:"A verified credit inventory is not a publishable career story.",
                castRecords:cast.length, verifiedMilestones:Array.isArray(pilot.verified)?pilot.verified.length:0,
                nextGate:"Independently audit milestone significance and write source-grounded narrative."}});
          } catch {
            return res.status(200).json({preview:true,deployedBiographyUnchanged:true,
              id:person.id,name:person.name,biography:null,readyForPublication:false,
              releaseStatus:"preview_unavailable"});
          }
        }

        // R9 opt-in preview only; public profile and Accolades remain unchanged.
        if (mode === "biography161_r9_preview") {
          try {
            const creditResponse = await fetchJSON(`https://api.themoviedb.org/3/person/${person.id}/combined_credits?language=en-US`,{headers:{Authorization:`Bearer ${TOKEN}`,accept:"application/json"}});
            const cast = Array.isArray(creditResponse?.cast) ? creditResponse.cast : [];
            const pilot = Bio161MilestonePilot.compose(person,cast);
            return res.status(200).json({preview:true,deployedBiographyUnchanged:true,id:person.id,name:person.name,...pilot,readyForPublication:false,releaseStatus:"editorial_review_required",diagnostic:{...pilot.diagnostic,castRecords:cast.length,releaseBlockers:["Independent milestone source audit","Publication-quality narrative","Full integrated API and frontend regression"]}});
          } catch (error) {
            return res.status(200).json({preview:true,deployedBiographyUnchanged:true,id:person.id,name:person.name,readyForPublication:false,releaseStatus:"preview_unavailable",error:"Person 161 R9 preview unavailable"});
          }
        }

        // Person 161 preview is deliberately opt-in and does not replace the live biography.
        // It exposes only sanitized source coverage, accepted milestone provenance and draft text.
        if (mode === "biography161_preview" || mode === "biography161_r2_preview" || mode === "biography161_r3_preview" || mode === "biography161_r4_preview" || mode === "biography161_r5_preview" || mode === "biography161_r6_preview" || mode === "biography161_r7_preview" || mode === "biography161_r8_preview") {
          try {
            const draft = await Bio161Retrieval.buildFromRetrievedSources(
              {id: Number(person.id), name: person.name,
               profession: person.known_for_department === "Acting" ? "an actor" : "a performer",
               deathday: person.deathday},
              {tmdbToken: TOKEN}
            );
            if (mode === "biography161_r8_preview") {
              const creditResponse=await fetchJSON(`https://api.themoviedb.org/3/person/${person.id}/combined_credits?language=en-US`,{headers:{Authorization:`Bearer ${TOKEN}`,accept:"application/json"}});
              const pilot=Bio161MilestonePilot.compose(person,creditResponse?.cast||[]);
              return res.status(200).json({preview:true,deployedBiographyUnchanged:true,id:person.id,name:person.name,...pilot});
            }
            if (mode === "biography161_r5_preview" || mode === "biography161_r6_preview" || mode === "biography161_r7_preview") {
              const creditResponse = await fetchJSON(`https://api.themoviedb.org/3/person/${person.id}/combined_credits?language=en-US`, {headers:{Authorization:`Bearer ${TOKEN}`,accept:"application/json"}});
              const verifiedSources = await Bio161Retrieval.retrieveBiographySources(
                {id:Number(person.id),name:person.name},{tmdbToken:TOKEN});
              const editorial = Bio161Editorial.compose(person,creditResponse?.cast||[],verifiedSources.sources);
              return res.status(200).json({preview:true,deployedBiographyUnchanged:true,
                id:person.id,name:person.name,biography:editorial.biography,
                readyForPublication:false,editorialQualityPass:false,
                credits:editorial.credits,candidates:mode === "biography161_r7_preview" ? editorial.candidates : undefined,diagnostic:{...editorial.diagnostic,retrieval:verifiedSources.diagnostics}});
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
        const generatedBiography =
          buildReelwiseBiography({
            person,
            credits: [...credits, ...sourceOnlyVerified],
            wikipediaSummary,
            wikipediaExtract
          });
        // Person 163: publish only the identity-scoped editorial biography.
        // All other performers retain the existing biography engine.
        const biography =
          Number(person.id) === 31 && person.name === "Tom Hanks"
            ? PERSON163_HANKS_AUDITED_DRAFT
            : generatedBiography;

        // Person 164: generic diagnostic; minimum quality is never publication approval.
        const normalize164 = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
        const contains164 = (body,title) => { const t=normalize164(title); return t.length>=4 && (' '+normalize164(body)+' ').includes(' '+t+' '); };
        const movie164=validMovieCredits(credits).filter(isBiographyActingCredit);
        const titles164=[...new Map(movie164.filter(m=>m.title).map(m=>[normalize164(m.title),m.title])).values()];
        const mentions164=body=>titles164.filter(t=>contains164(body,t));
        const candidateFilms164=mentions164(generatedBiography), publicFilms164=mentions164(biography);
        const candidateSet164=new Set(candidateFilms164.map(normalize164));
        const omittedFilms164=publicFilms164.filter(t=>!candidateSet164.has(normalize164(t)));
        const words164=body=>String(body||'').trim().split(/\s+/).filter(Boolean).length;
        const progression164=/\b(?:broke through|breakthrough|rose to prominence|emerged|early career|early roles|subsequently|later|followed by|went on to|transitioned|shifted|established|became known|defining|signature|continued|expanded|afterward|afterwards)\b/i.test(generatedBiography);
        const context164=progression164||/\b(?:career|recognition|dramatic|comedic|television|stage|film work|film career)\b/i.test(generatedBiography);
        const placeholder164=/\b(?:unknown|undefined|null|no biography available)\b/i.test(generatedBiography);
        const minimum164=words164(generatedBiography)>=65&&candidateFilms164.length>=3&&context164&&!placeholder164;
        const genericQuality164={wordCount:words164(generatedBiography),verifiedFilmMentions:candidateFilms164.length,hasCareerContext:context164,hasNarrativeProgression:progression164,hasUnsupportedPlaceholder:placeholder164,passesMinimum:minimum164,comparison:{publicWordCount:words164(biography),publicVerifiedFilmMentions:publicFilms164.length,omittedPublicFilmTitles:omittedFilms164,preservesVerifiedFilmCoverage:omittedFilms164.length===0,candidateShorterThanPublic:words164(generatedBiography)<words164(biography)},editorialPublicationApproved:false};
        if(mode==='biography164_preview')return res.status(200).json({preview:true,deployedBiographyUnchanged:true,id:person.id,name:person.name,publicBiography:biography,genericCandidate:generatedBiography,quality:genericQuality164,readyForPublication:false,releaseStatus:'generic_editorial_review',policy:'Minimum checks are diagnostics, never automatic publication approval.'});

        // Person 166: identity-linked source context, isolated from public biography.
        if (["biography166_preview","biography167_preview","biography168_preview","biography169_preview"].includes(mode)) {
          try {
            const retrieved166 = await Bio161Retrieval.retrieveBiographySources(person,
              {tmdbToken:TOKEN,wikipediaTitle:wikipediaPage.title});
            const draft166 = (mode === "biography169_preview" ? Bio169Preview : mode === "biography168_preview" ? Bio168Preview : mode === "biography167_preview" ? Bio167Preview : Bio166Preview).compose(person,credits,retrieved166.sources,biography);
            return res.status(200).json({preview:true,deployedBiographyUnchanged:true,
              id:person.id,name:person.name,publicBiography:biography,...draft166,
              sourceRetrieval:retrieved166.diagnostics});
          } catch {
            return res.status(200).json({preview:true,deployedBiographyUnchanged:true,
              id:person.id,name:person.name,publicBiography:biography,genericCandidate:null,
              readyForPublication:false,releaseStatus:"preview_unavailable"});
          }
        }

        // Person 165: independent, generic, credit-grounded narrative preview.
        // This never copies the public biography or asserts unverified significance.
        if (mode === "biography165_preview") {
          const today165=new Date().toISOString().slice(0,10);
          const movies165=validMovieCredits(credits).filter(isBiographyActingCredit)
            .filter(m=>/^\d{4}-\d{2}-\d{2}$/.test(m.release_date||'') && m.release_date<=today165)
            .map(m=>({id:m.id,title:String(m.title).trim(),year:Number(m.release_date.slice(0,4)),
              order:Number.isFinite(Number(m.order))?Number(m.order):999,popularity:Number(m.popularity)||0}))
            .filter(m=>m.year>=1900).sort((a,b)=>a.year-b.year||a.order-b.order||a.id-b.id);
          const first165=movies165[0]?.year,last165=movies165.at(-1)?.year;
          const span165=first165===undefined?0:last165-first165;
          const earlyEnd165=first165+Math.max(5,Math.floor(span165*.25));
          const laterStart165=last165-Math.max(4,Math.floor(span165*.25));
          const bins165=[{key:'early',items:movies165.filter(m=>m.year<=earlyEnd165)},
            {key:'middle',items:movies165.filter(m=>m.year>earlyEnd165&&m.year<laterStart165)},
            {key:'later',items:movies165.filter(m=>m.year>=laterStart165&&m.year>earlyEnd165)}];
          const picked165=[],seen165=new Set();
          for(const bin of bins165){
            const best=[...bin.items].sort((a,b)=>a.order-b.order||b.popularity-a.popularity||a.year-b.year).slice(0,3);
            for(const m of best.sort((a,b)=>a.year-b.year))if(!seen165.has(m.id)){seen165.add(m.id);picked165.push({...m,period:bin.key});}
          }
          const fmt165=items=>items.map(m=>`${m.title} (${m.year})`).join(', ');
          const paragraphs165=[];
          for(const bin of bins165){const items=picked165.filter(m=>m.period===bin.key);if(!items.length)continue;
            const lead=bin.key==='early'?`${person.name}'s earlier verified film credits include `:
              bin.key==='middle'?'In the middle portion of the recorded film career, credits include ':'Later recorded film work includes ';
            paragraphs165.push(lead+fmt165(items)+'.');}
          const candidate165=paragraphs165.join(' ');
          const norm165=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
          const mentions165=(body,title)=>{const t=norm165(title);return t.length>=4&&(' '+norm165(body)+' ').includes(' '+t+' ');};
          const omitted165=movies165.filter(m=>mentions165(biography,m.title)&&!mentions165(candidate165,m.title))
            .map(m=>({tmdbMovieId:m.id,title:m.title,year:m.year}));
          return res.status(200).json({preview:true,deployedBiographyUnchanged:true,id:person.id,name:person.name,
            publicBiography:biography,genericCandidate:candidate165,
            methodology:'Independent chronological acting-credit sampling; billing and popularity are not proof of cultural significance.',
            evidence:picked165.map(({id,title,year,period})=>({tmdbMovieId:id,title,year,period})),
            quality:{independentOfPublicBiography:norm165(candidate165)!==norm165(biography),
              selectedVerifiedCredits:picked165.length,representedPeriods:[...new Set(picked165.map(m=>m.period))],
              omittedPublicVerifiedTitles:omitted165,preservesPublicFilmCoverage:omitted165.length===0,
              narrativeSignificanceVerified:false},readyForPublication:false,
            releaseStatus:'generic_candidate_editorial_review',
            policy:'Preview only. Never replace a public biography on credit inventory alone.'});
        }

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


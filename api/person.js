    const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

    /*
      ============================================================
      REELWISE PERSON API — PERSON 106
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
        throw new Error(`Request failed: ${response.status}`);
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

      return fetchJSON(url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          accept: "application/json"
        }
      });
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

    function buildReelwiseBiography({ person, credits, wikipediaSummary, wikipediaExtract }) {
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
      const curated = editorial77[norm(name)];
      if (curated) return curated;

      // PERSON 106 — SOURCE-LED CAREER NARRATIVE
      // Prefer factual career sentences to keyword-only filtering.
      // Do not invent milestones or elevate films solely to fill decades.
      const normalize = value => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const today = new Date().toISOString().slice(0,10);
      const films = validMovieCredits(credits).filter(isBiographyActingCredit)
        .filter(movie => movie.release_date <= today)
        .map(movie => ({...movie, year:yearFromDate(movie.release_date)}))
        .filter(movie => movie.year);
      const summary = cleanText(wikipediaSummary || person?.biography || "");
      const extract = cleanText(wikipediaExtract || "");
      const source = extract.length > summary.length ? extract : summary;
      const intro = sentenceSplit(summary).find(sentence =>
        sentence.toLowerCase().startsWith(name.toLowerCase()) &&
        /\b(actor|actress|comedian|filmmaker|director|producer|performer|screenwriter)\b/i.test(sentence)
      ) || `${name} ${person?.deathday ? "was" : "is"} a film and television performer.`;
      const mention = (sentence, movie) => {
        const title = cleanText(movie.title);
        if (!title) return false;
        const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Require a year for short/ambiguous titles.
        if (normalize(title).length < 6)
          return new RegExp(`\\b${escaped}\\s*\\(${movie.year}\\)`, "i").test(sentence);
        return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(sentence);
      };
      const sentences = sentenceSplit(source);
      const candidates = [];
      const seen = new Set();
      for (const sentence of sentences) {
        const text = cleanText(sentence);
        if (text.length < 35 || text.length > 450 || seen.has(normalize(text))) continue;
        if (/^(?:filmography|references|external links|awards and nominations|personal life)\b/i.test(text)) continue;
        const matches = films.filter(movie => mention(text,movie));
        if (!matches.length) continue;
        const unique = [...new Map(matches.map(m=>[normalize(m.title),m])).values()];
        const years = unique.map(m=>m.year);
        const milestone = /\b(breakthrough|breakout|critical acclaim|acclaimed|best known|prominence|fame|award|oscar|nomination|nominated|starred|portrayed|played|appeared|role|performance|success|directed)\b/i.test(text);
        const score = (milestone ? 3 : 1) + (unique.length <= 3 ? 1 : 0);
        candidates.push({text, year:Math.min(...years), score, titles:unique.map(m=>m.title)});
        seen.add(normalize(text));
      }
      // The source may contain extensive career prose; preserve chronology
      // and substantive source sentences rather than imposing a film quota.
      candidates.sort((a,b)=>a.year-b.year || b.score-a.score);
      const chosen = [];
      const covered = new Set();
      for (const item of candidates) {
        if (chosen.length >= 12) break; // prose readability, not a film quota
        const fresh = item.titles.some(title=>!covered.has(normalize(title)));
        if (!fresh) continue;
        if (item.score < 3 && chosen.length >= 7) continue;
        chosen.push(item.text);
        item.titles.forEach(title=>covered.add(normalize(title)));
      }
      if (chosen.length < 3) {
        // If source-to-credit matching is sparse, retain the substantial
        // Wikipedia/TMDB summary rather than publishing a two-sentence bio.
        if (summary.length >= 300) return ensurePeriod(summary);
        if (source.length >= 300) {
          const career = sentenceSplit(source).filter(t =>
            t.length >= 40 && t.length <= 400 &&
            !/^(?:filmography|references|external links|personal life)\b/i.test(t)
          ).slice(0,8);
          return uniqueStrings([ensurePeriod(intro),...career.map(ensurePeriod)]).join(" ");
        }
        return ensurePeriod(summary || intro);
      }
      const result = [ensurePeriod(intro), ...chosen.map(ensurePeriod)];
      return uniqueStrings(result).join(" ");

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

        const wikipediaPage =
          await getWikipediaPage(
            person.name
          );


        /* ========================================================
           ACCOLADES MODE

           IMPORTANT:
           This preserves the working response format expected by
           the current Reelwise index.html.
           ======================================================== */

        if (mode === "accolades") {

          const awardsData =
            await getAwardsAndAccolades(
              person.name,
              wikipediaPage.wikidataId
            );

          return res
            .status(200)
            .json({
              id: person.id,

              name:
                person.name || "",

              found:
                awardsData.found,

              wins:
                awardsData.wins,

              nominations:
                awardsData.nominations,

              history:
                awardsData.history,

              academy_awards:
                awardsData.academy_awards,

              academyAwards:
                awardsData.academyAwards,

              accolades:
                awardsData.accolades
            });
        }


        /* ========================================================
           NORMAL STAR PROFILE MODE
           ======================================================== */

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

        const biography =
          buildReelwiseBiography({
            person,
            credits,
            wikipediaSummary,
            wikipediaExtract
          });

        const knownFor =
          buildKnownFor(
            credits
          );

        /*
          Keep awards in the normal response for compatibility.
        */

        const awardsData =
          await getAwardsAndAccolades(
            person.name,
            wikipediaPage.wikidataId
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
              awardsData.academy_awards,

            academyAwards:
              awardsData.academyAwards,

            accolades:
              awardsData.accolades,

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

        return res
          .status(500)
          .json({
            error:
              "Unable to load star profile.",

            details:
              error.message
          });
      }
    }

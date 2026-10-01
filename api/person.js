    const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

    /*
      ============================================================
      REELWISE PERSON API — PERSON 60
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

      if (!cleaned) {
        return [];
      }

      /*
        PERSON 58: protect common abbreviations before sentence splitting.
        Person 57 could split a title such as "Mr. Deeds" into the broken
        fragment "Mr." and then attach the next sentence to it.
      */
      const protectedDots = [
        "Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.",
        "St.", "Mt.", "No.", "U.S.", "U.K.", "e.g.", "i.e."
      ];

      const token = "__RW_DOT__";
      for (const abbreviation of protectedDots) {
        const safe = abbreviation.replace(/\./g, token);
        cleaned = cleaned.replace(
          new RegExp(abbreviation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          safe
        );
      }

      return (
        cleaned.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || []
      )
        .map(sentence => cleanText(sentence.replace(new RegExp(token, "g"), ".")))
        .filter(Boolean);
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

    function buildReelwiseBiography({
      person,
      credits,
      wikipediaSummary,
      wikipediaExtract
    }) {
      const name = person?.name || "This performer";
      const timeline = buildCareerTimeline(credits);
      const source = cleanText(
        wikipediaExtract || wikipediaSummary || person?.biography || ""
      );
      const sourceSentences = sentenceSplit(source).filter(Boolean);
      const summarySentences = sentenceSplit(
        wikipediaSummary || person?.biography || ""
      ).filter(Boolean);

      /*
        PERSON 63 — REQUIRED DEFINING-CAREER CHAPTER ENGINE

        Person 58 could still choose individually strong sentences that
        produced a weak career story. Person 59 selects career chapters.

        Required arc:
          identity -> rise/breakthrough -> defining work -> major
          achievement/recognition -> later-career milestone

        Generic safeguards:
          - preserve source chronology instead of ranking every sentence
            against every other sentence
          - reject orphaned/context-dependent fragments (including "Or ...")
          - reject title/catalog dumps, including streaming-service lists
          - protect an early-career/rise sentence even when the source does
            not literally use the word "breakthrough"
          - protect one major recognition/award sentence when available
          - protect one meaningful late-career chapter
          - never invent a career fact from TMDB; credits only help measure
            title significance and career timing
      */

      const norm = value => cleanText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

      const words = value =>
        cleanText(value).split(/\s+/).filter(Boolean).length;

      const yearsIn = value =>
        [...String(value || "").matchAll(/\b(19\d{2}|20\d{2})\b/g)]
          .map(m => Number(m[1]));

      const allNotable = (timeline.notable || []).filter(m => m?.title);
      const titleHits = sentence => allNotable.filter(m =>
        sentenceMentionsTitle(sentence, m.title)
      );

      const careerWords = /\b(film|films|movie|movies|role|roles|performance|portrayed|played|starred|starring|career|breakthrough|fame|success|acclaim|acclaimed|recognition|franchise|comedy|comedies|drama|dramas|action|box.office|award|oscar|academy award|golden globe|bafta|emmy|nominated|nomination|won|directed|wrote|writer|producer|filmmaker|television|series|cast member|saturday night live)\b/i;
      const noiseWords = /\b(personal life|relationship|married|divorce|children|political|religion|controversy|lawsuit|net worth|salary)\b/i;
      const orphanStart = /^(or|and|but|that|this|these|those|the same|thereafter|subsequently|meanwhile|afterward|afterwards|however|also)\b/i;

      function isCatalogDump(text, hits) {
        const yearCount = yearsIn(text).length;
        const commaCount = (text.match(/,/g) || []).length;
        const serviceList = /\b(netflix|streaming)\b/i.test(text) &&
          (hits.length >= 3 || yearCount >= 4 || commaCount >= 4);
        const genericList = hits.length >= 4 ||
          (yearCount >= 5 && commaCount >= 4);
        return serviceList || genericList;
      }

      function usable(sentence) {
        const text = cleanText(sentence);
        const wc = words(text);
        const hits = titleHits(text);
        if (!text || wc < 7 || wc > 62) return false;
        if (noiseWords.test(text)) return false;
        if (orphanStart.test(text)) return false;
        if (isCatalogDump(text, hits)) return false;
        return careerWords.test(text) || hits.length > 0;
      }

      function identitySentence() {
        const pool = [...summarySentences, ...sourceSentences];
        const found = pool.find(sentence => {
          const text = cleanText(sentence);
          return text.length >= 25 && text.length <= 280 &&
            /\b(is an?|was an?)\b/i.test(text) &&
            /\b(actor|actress|comedian|filmmaker|director|producer|writer|performer)\b/i.test(text);
        });
        return found
          ? ensurePeriod(cleanText(found))
          : ensurePeriod(`${name} is a film actor and filmmaker`);
      }

      const intro = identitySentence();
      const birthYear = person?.birthday
        ? Number(String(person.birthday).slice(0, 4))
        : null;
      const firstCareerYear = timeline.firstYear || (birthYear ? birthYear + 18 : 1970);
      const latestCareerYear = timeline.latestYear || firstCareerYear + 30;
      const span = Math.max(12, latestCareerYear - firstCareerYear);
      const earlyEnd = firstCareerYear + Math.round(span * 0.40);
      const lateStart = firstCareerYear + Math.round(span * 0.68);

      const candidates = sourceSentences
        .map((sentence, index) => {
          const text = ensurePeriod(cleanText(sentence));
          const ys = yearsIn(text);
          const hits = titleHits(text);
          return {
            sentence: text,
            index,
            years: ys,
            year: ys.length ? Math.min(...ys) : null,
            hits
          };
        })
        .filter(x => usable(x.sentence))
        .filter(x => norm(x.sentence) !== norm(intro));

      function significance(item) {
        const text = item.sentence;
        let score = 0;
        if (item.hits.length === 1) score += 8;
        if (item.hits.length === 2) score += 7;
        if (item.hits.length === 3) score += 2;
        score += Math.min(9, item.hits.reduce((sum, movie) =>
          sum + Math.max(0, movieRecognitionScore(movie)) / 38, 0));
        if (/\b(breakthrough|breakout|rose to|fame|prominence|star status|established|defining|iconic|signature|major success|commercial success|critical acclaim|highest.paid)\b/i.test(text)) score += 8;
        if (/\b(academy award|oscar|golden globe|bafta|emmy|award|nominated|nomination|won)\b/i.test(text)) score += 6;
        /* Person 60: negative-award / reception trivia should never outrank
           the films that actually define a career. */
        if (/\b(golden raspberry|razzie|razzies|panned|worst actor|worst actress|worst picture)\b/i.test(text)) score -= 18;
        if (/\b(returned|return|reprise|reprised|revival|comeback|franchise)\b/i.test(text)) score += 4;
        if (words(text) > 48) score -= 2;
        return score;
      }

      function best(items) {
        return [...items].sort((a, b) =>
          significance(b) - significance(a) || a.index - b.index
        )[0] || null;
      }

      /* Chapter 1: how the career actually started/rise to prominence. */
      const explicitRise = candidates.find(x =>
        /\b(breakthrough|breakout|rose to (?:fame|prominence)|gained .*recognition|came to prominence|worldwide fame|star status|established (?:his|her|their) (?:film )?career|critical and commercial success)\b/i.test(x.sentence)
      );

      const earlyPool = candidates.filter(x =>
        (x.year && x.year <= earlyEnd) ||
        /\b(saturday night live|cast member|debut|began (?:his|her|their) career|early career|first gained|first major|first leading|first lead)\b/i.test(x.sentence)
      );

      const rise = explicitRise || best(earlyPool);

      /* Chapter 2: defining work after the initial rise. */
      const definingPool = candidates.filter(x => {
        if (rise && x.index === rise.index) return false;
        if (x.year && x.year <= earlyEnd + Math.round(span * 0.28)) return true;
        return /\b(defining|iconic|signature|starred|major success|commercial success|critical acclaim|franchise)\b/i.test(x.sentence);
      });
      const defining = best(definingPool);

      /* Chapter 3: recognition must not disappear behind lesser credits. */
      const recognitionPool = candidates.filter(x =>
        /\b(academy award|oscar|golden globe|bafta|emmy|critics.? choice|screen actors guild|independent spirit|mark twain prize|award|nominated|nomination|won)\b/i.test(x.sentence) &&
        !/\b(golden raspberry|razzie|razzies|panned|worst actor|worst actress|worst picture)\b/i.test(x.sentence)
      );
      const recognition = best(recognitionPool);

      /* Chapter 4: a meaningful later chapter, not simply the newest title. */
      const latePool = candidates.filter(x =>
        (x.year && x.year >= lateStart) &&
        (x.hits.length <= 3) &&
        (/\b(returned|return|reprise|reprised|revival|comeback|acclaim|acclaimed|award|nominated|won|franchise|major|success|starred|portrayed|played)\b/i.test(x.sentence) ||
          significance(x) >= 9)
      );
      let late = best(latePool);

      /*
        PERSON 60 — FILMOGRAPHY SAFETY NET

        Wikipedia sometimes skips the very movies that explain a star's
        rise (Sandler) or stops before a meaningful later chapter (Hathaway).
        TMDB credits may fill a missing chapter, but only with neutral factual
        wording — never an invented "breakthrough" or critical judgment.
      */
      let resolvedRise = rise;

      if (!resolvedRise) {
        const earlyMovies = allNotable
          .filter(movie =>
            isBiographyActingCredit(movie) &&
            movie.year &&
            movie.year <= earlyEnd
          )
          .sort((a, b) => movieRecognitionScore(b) - movieRecognitionScore(a))
          .slice(0, 4);

        if (earlyMovies.length >= 2) {
          const titles = earlyMovies.map(movie => `${movie.title} (${movie.year})`);
          const joined = titles.length === 2
            ? `${titles[0]} and ${titles[1]}`
            : `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;

          resolvedRise = {
            sentence: `Important early film work included ${joined}.`,
            index: -2,
            years: earlyMovies.map(movie => movie.year),
            year: Math.min(...earlyMovies.map(movie => movie.year)),
            hits: earlyMovies
          };
        }
      }

      /*
        PERSON 63 — ACTING-ONLY AUTO INSERTIONS

        Person 62 restored missing early career runs, but a related title
        could still enter an automatically generated sentence even when it
        was not a genuine acting role. Person 63 keeps the Person 62 chapter
        architecture intact and requires a real character-bearing cast
        credit for both automatic early-film safety nets.
      */

      /*
        PERSON 62 — REQUIRED GENERIC CAREER-DEFINING RUN

        Person 61 could preserve a technically valid source biography while
        still skipping the cluster of films that made an actor a movie star.
        Sandler is the clearest example: a later-career/awards sentence could
        survive while Billy Madison, Happy Gilmore, The Wedding Singer,
        The Waterboy and Big Daddy disappeared.

        This is deliberately generic — no actor names or title overrides.
        We only add the safety-net sentence when the source itself mentions
        fewer than two notable early films. The sentence uses neutral factual
        wording so TMDB credits are never turned into invented claims about a
        "breakthrough," acclaim or importance. Existing strong source arcs
        (such as Anne Hathaway and Sylvester Stallone) remain untouched.
      */
      let careerRun = null;

      /*
        PERSON 62 — REQUIRE THE DEFINING EARLY CHAPTER IN THE OUTPUT

        Person 61 inspected the entire source article before deciding whether
        the safety-net career run was needed. That was too early in the
        pipeline: a source could mention several defining early films, yet the
        chapter selector could discard those sentences later. The final card
        would then contain none of the films that established the performer.

        Person 62 measures the chapters that are actually headed for the
        biography. If resolvedRise + defining already contain at least two
        notable early films, nothing changes. Otherwise Reelwise creates one
        neutral, factual early-film chapter from the credit timeline.

        This remains completely generic: no performer names, no title
        overrides, and no invented claim that a film was a breakthrough.
      */
      const selectedEarlyTitleKeys = new Set();
      const plannedEarlyChapters = [resolvedRise, defining].filter(Boolean);

      for (const chapter of plannedEarlyChapters) {
        const text = chapter?.sentence || "";
        for (const movie of allNotable) {
          if (
            movie?.year &&
            movie.year <= earlyEnd &&
            sentenceMentionsTitle(text, movie.title)
          ) {
            selectedEarlyTitleKeys.add(norm(movie.title));
          }
        }
      }

      if (selectedEarlyTitleKeys.size < 2) {
        const earlyDecades = Object.entries(timeline.byDecade || {})
          .map(([decade, movies]) => ({
            decade,
            movies: (movies || [])
              .filter(movie =>
                isBiographyActingCredit(movie) &&
                movie?.year &&
                movie.year <= earlyEnd
              )
              .sort((a, b) => movieRecognitionScore(b) - movieRecognitionScore(a))
          }))
          .filter(group => group.movies.length >= 3)
          .sort((a, b) =>
            (a.movies[0]?.year || 9999) - (b.movies[0]?.year || 9999)
          );

        const runGroup = earlyDecades[0];

        if (runGroup) {
          /* Keep up to five films so a genuine concentrated star-making run
             can read as a run, rather than collapsing to two random credits. */
          const runMovies = runGroup.movies
            .slice(0, 5)
            .sort((a, b) => a.year - b.year || movieRecognitionScore(b) - movieRecognitionScore(a));
          const titles = runMovies.map(movie => `${movie.title} (${movie.year})`);
          let joined = "";

          if (titles.length === 1) {
            joined = titles[0];
          } else if (titles.length === 2) {
            joined = `${titles[0]} and ${titles[1]}`;
          } else {
            joined = `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;
          }

          careerRun = {
            sentence: `${name}'s early film work included ${joined}.`,
            index: -1,
            years: runMovies.map(movie => movie.year),
            year: Math.min(...runMovies.map(movie => movie.year)),
            hits: runMovies
          };
        }
      }

      if (!late) {
        const laterMovies = allNotable
          .filter(movie => movie.year && movie.year >= lateStart)
          .sort((a, b) => movieRecognitionScore(b) - movieRecognitionScore(a))
          .slice(0, 2);

        if (laterMovies.length) {
          const titles = laterMovies.map(movie => `${movie.title} (${movie.year})`);
          late = {
            sentence: `Later film work included ${titles.join(" and ")}.`,
            index: 9998,
            years: laterMovies.map(movie => movie.year),
            year: Math.min(...laterMovies.map(movie => movie.year)),
            hits: laterMovies
          };
        }
      }

      const chosen = [resolvedRise, careerRun, defining, recognition, late].filter(Boolean);
      const chosenKeys = new Set(chosen.map(x => norm(x.sentence)));

      /* If a chapter is missing, fill it with a strong source sentence,
         but retain source order and never use a catalog dump. */
      if (chosen.length < 4) {
        for (const item of [...candidates].sort((a, b) =>
          significance(b) - significance(a) || a.index - b.index
        )) {
          if (chosen.length >= 4) break;
          const key = norm(item.sentence);
          if (!chosenKeys.has(key)) {
            chosen.push(item);
            chosenKeys.add(key);
          }
        }
      }

      /* The biography reads in career/source chronology. Recognition is
         allowed to stay beside the career event it describes. */
      chosen.sort((a, b) => {
        const ay = a.year || 9999;
        const by = b.year || 9999;
        return ay - by || a.index - b.index;
      });

      const selected = [intro];
      const used = new Set([norm(intro)]);
      for (const item of chosen) {
        const key = norm(item.sentence);
        if (!key || used.has(key)) continue;
        selected.push(item.sentence);
        used.add(key);
      }

      /* Add one more high-value source sentence only when the story is too
         thin. This prevents the Sandler-style Netflix list from becoming
         filler simply because the biography needs more words. */
      if (words(selected.join(" ")) < 105) {
        const filler = candidates
          .filter(x => !used.has(norm(x.sentence)))
          .sort((a, b) => significance(b) - significance(a) || a.index - b.index)[0];
        if (filler) selected.push(filler.sentence);
      }

      /* Remove the weakest optional chapter until the card stays readable.
         Identity, rise, recognition and late milestone are favored. */
      while (words(selected.join(" ")) > 175 && selected.length > 4) {
        let weakestIndex = -1;
        let weakestScore = Infinity;
        for (let i = 1; i < selected.length; i++) {
          const sentence = selected[i];
          const protectedSentence =
            (resolvedRise && norm(sentence) === norm(resolvedRise.sentence)) ||
            (careerRun && norm(sentence) === norm(careerRun.sentence)) ||
            (recognition && norm(sentence) === norm(recognition.sentence)) ||
            (late && norm(sentence) === norm(late.sentence));
          if (protectedSentence) continue;
          const item = candidates.find(x => norm(x.sentence) === norm(sentence));
          const score = item ? significance(item) : 0;
          if (score < weakestScore) {
            weakestScore = score;
            weakestIndex = i;
          }
        }
        if (weakestIndex < 0) break;
        selected.splice(weakestIndex, 1);
      }

      let story = selected.filter(Boolean).join(" ");

      /* Absolute guard against encyclopedia dumps. */
      if (words(story) > 190) {
        story = selected.slice(0, 4).join(" ");
      }

      if (words(story) >= 70) return story;

      const fallback = summarySentences
        .filter(sentence => !orphanStart.test(cleanText(sentence)))
        .filter(sentence => !isCatalogDump(cleanText(sentence), titleHits(sentence)))
        .slice(0, 4)
        .map(sentence => ensurePeriod(cleanText(sentence)))
        .join(" ");

      return fallback || story || `${name} is a film actor and filmmaker.`;
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

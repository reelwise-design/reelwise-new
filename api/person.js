    const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

    /*
      ============================================================
      REELWISE PERSON API — PERSON 79
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
      return cleanText(text)
        /* PERSON 69: strip attribution/license boilerplate that can be
           embedded in third-party Wikipedia extracts before biography
           selection ever sees it. */
        .replace(/\s*Description above from the Wikipedia article[\s\S]*$/i, "")
        .replace(/\s*This article uses material from the Wikipedia article[\s\S]*$/i, "")
        .replace(/\s*Text is available under the Creative Commons[\s\S]*$/i, "")
        .replace(/\s*licensed under CC[-–]BY[-–]SA[\s\S]*$/i, "")
        .replace(/\s*full list of contributors on Wikipedia[\s\S]*$/i, "")
        .replace(/\s*(?:Description above from|This article uses material from)[\s\S]*?Wikipedia[\s\S]*$/i, "")
        .replace(/\s*(?:licensed|available) under\s+(?:the\s+)?(?:CC[-– ]?BY[-– ]?SA|Creative Commons)[\s\S]*$/i, "")
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
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      return credits.filter(movie => {
        if (
          !movie?.id ||
          !movie?.title ||
          !movie?.release_date
        ) {
          return false;
        }

        /* PERSON 78 — CAREER HISTORY MEANS RELEASED WORK.
           TMDB often lists announced/future credits in movie_credits.cast.
           Compare the complete release date, not merely the year, so a film
           opening later in the current year cannot be written as history. */
        const releaseDate = new Date(`${movie.release_date}T00:00:00`);
        if (Number.isNaN(releaseDate.getTime()) || releaseDate > today) {
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

      /* PERSON 71: keep the biography builder self-contained. Person 70's
         redundancy pass referenced an old `middle` chapter variable that no
         longer exists. That could abort the curated story path. */
      const source = removeWikipediaEnding(
        wikipediaExtract || wikipediaSummary || person?.biography || ""
      );
      const sourceSentences = sentenceSplit(source).filter(Boolean);
      const summarySentences = sentenceSplit(
        removeWikipediaEnding(wikipediaSummary || person?.biography || "")
      ).filter(Boolean);

      /*
        PERSON 71 — CLEAN SOURCE BIOGRAPHY + REELWISE CAREER STORY

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
        if (/\b(?:description above from|wikipedia article|licensed under|creative commons|full list of contributors)\b/i.test(text)) return false;
        if (orphanStart.test(text)) return false;
        if (isCatalogDump(text, hits)) return false;

        /* PERSON 66: reject visibly clipped source fragments such as
           "the Cecil B.". A biography card should never expose a sentence
           that ends on a lone initial or an unfinished connective phrase. */
        if (/\b(?:the|a|an|and|or|of|for|with|by|from|to|in|at)\s+[A-Z]\.$/.test(text)) return false;
        if (/\b[A-Z][a-z]+\s+[A-Z]\.$/.test(text)) return false;

        /* PERSON 67 — reject the second half of a sentence that Wikipedia
           split at an abbreviated proper name (for example "Cecil B." /
           "DeMille Award ..."). A sentence beginning with an award surname
           plus "Award" is context-dependent and should never stand alone. */
        if (/^[A-Z][A-Za-z'’.-]+\s+(?:Award|Awards|Prize|Honor|Honour)\b/.test(text)) return false;

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
        if (!found) {
          return ensurePeriod(`${name} is a film actor and filmmaker`);
        }

        /* PERSON 69: birthday/age already has a dedicated header line.
           Do not repeat a parenthetical birth date in the biography intro. */
        const cleanedIntro = cleanText(found)
          .replace(/\s*\(born\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\)/i, "")
          .replace(/\s*\(born\s+\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\)/i, "")
          .replace(/\s*\(born\s+\d{4}\)/i, "");

        return ensurePeriod(cleanedIntro);
      }

      const intro = identitySentence();
      const birthYear = person?.birthday
        ? Number(String(person.birthday).slice(0, 4))
        : null;
      const firstCareerYear = timeline.firstYear || (birthYear ? birthYear + 18 : 1970);
      const latestCareerYear = timeline.latestYear || firstCareerYear + 30;
      const span = Math.max(12, latestCareerYear - firstCareerYear);
      /* PERSON 72 — CAREER-STAGE BOUNDARIES

         "Early career" must be relative to when the performer actually began,
         not 40% of an unusually long career. For a performer with a 45+ year
         career, the old formula could classify films nearly twenty years after
         the debut as early work. Cap the early chapter at roughly the first
         12 years, while still allowing a shorter proportional window for
         shorter careers. */
      const earlyCareerYears = Math.min(12, Math.max(7, Math.round(span * 0.28)));
      const earlyEnd = firstCareerYear + earlyCareerYears;
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
      let defining = best(definingPool);

      /* PERSON 66 — CAREER-ANCHOR PASS

         A career-defining franchise or sustained star chapter can be more
         important than a single highly scored film sentence. Prefer a source
         sentence that explicitly describes a recurring role, franchise, or
         multi-film run when it contains notable credits. This is generic and
         is what allows careers such as a long-running superhero/franchise arc
         to survive without hard-coding a performer or title. */
      const anchorPool = candidates.filter(x => {
        if (rise && x.index === rise.index) return false;
        if (!x.hits.length) return false;
        return /\b(franchise|series of films|film series|recurring role|reprise|reprised|portrayed|played|starred as|superhero|cinematic universe|highest.grossing|leading role)\b/i.test(x.sentence);
      });
      const careerAnchor = best(anchorPool);
      if (careerAnchor && (!defining || significance(careerAnchor) >= significance(defining) - 6)) {
        defining = careerAnchor;
      }

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

      /* PERSON 67 — RELATIVE CAREER-SIGNIFICANCE FLOOR

         Do not manufacture an "early film work" paragraph merely because
         credits are chronologically early. Compare those credits with the
         performer's own filmography. This keeps genuinely star-making early
         runs while suppressing obscure first-decade credits for long careers. */
      const biographyCreditScores = allNotable
        .filter(isBiographyActingCredit)
        .map(movieRecognitionScore)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

      const significanceFloor = biographyCreditScores.length
        ? biographyCreditScores[Math.floor((biographyCreditScores.length - 1) * 0.55)]
        : 0;

      const isCareerSignificantCredit = movie =>
        isBiographyActingCredit(movie) &&
        movieRecognitionScore(movie) >= significanceFloor;

      if (!resolvedRise) {
        const earlyMovies = allNotable
          .filter(movie =>
            isCareerSignificantCredit(movie) &&
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
            sentence: `Early in ${name}'s film career, credits included ${joined}.`,
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

      /* PERSON 68 — count the introduction too.

         Person 67 only inspected resolvedRise + defining before deciding that
         an automatic early-film run was necessary. That could create a list
         even when the introduction already told the performer's early-career
         story (Tom Hanks is the clearest example). The actual biography card
         is the authority: if intro/rise/defining already name enough notable
         early films, do not manufacture another chapter. */
      const plannedEarlyChapters = [
        { sentence: intro, index: -2 },
        resolvedRise,
        defining
      ].filter(Boolean);

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
                isCareerSignificantCredit(movie) &&
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
            sentence: `During the ${runGroup.decade}, ${name}'s film work included ${joined}.`,
            index: -1,
            years: runMovies.map(movie => movie.year),
            year: Math.min(...runMovies.map(movie => movie.year)),
            hits: runMovies
          };
        }
      }

      /* PERSON 68 — FINAL SYNTHETIC-RUN REDUNDANCY FILTER

         A generated film list is only a safety net. Source prose always wins.
         Before allowing the run into the card, remove every title already
         named anywhere in the chapters we intend to use. Also treat an
         explicit franchise sentence as covering numbered/sequel titles whose
         normalized title begins with the named franchise title.

         If fewer than two genuinely new titles remain, discard the synthetic
         chapter completely. This prevents repeated Forrest Gump / Toy Story
         material without actor-specific title overrides. */
      if (careerRun) {
        const sourceTexts = [intro, resolvedRise, defining, recognition, late]
          .map(ch => typeof ch === "string" ? ch : (ch?.sentence || ""))
          .filter(Boolean);

        const coveredBySource = movie => sourceTexts.some(text => {
          if (sentenceMentionsTitle(text, movie.title)) return true;
          if (!/\bfranchise\b/i.test(text)) return false;

          return allNotable.some(baseMovie => {
            if (!baseMovie?.title || !sentenceMentionsTitle(text, baseMovie.title)) return false;
            const base = norm(baseMovie.title);
            const candidate = norm(movie.title);
            return base && candidate !== base && candidate.startsWith(`${base} `);
          });
        });

        const remaining = (careerRun.hits || []).filter(movie => !coveredBySource(movie));

        if (remaining.length < 2) {
          careerRun = null;
        } else {
          const titles = remaining.map(movie => `${movie.title} (${movie.year})`);
          const joined = titles.length === 2
            ? `${titles[0]} and ${titles[1]}`
            : `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;

          careerRun = {
            ...careerRun,
            sentence: `During the ${Math.floor(Math.min(...remaining.map(movie => movie.year)) / 10) * 10}s, ${name}'s film work included ${joined}.`,
            years: remaining.map(movie => movie.year),
            year: Math.min(...remaining.map(movie => movie.year)),
            hits: remaining
          };
        }
      }

      /* PERSON 76 — NO GENERIC "LATER FILM WORK" BUCKET

         Person 75 could jump straight to the newest/highest-scoring credits
         and produce a weak late-career sentence while skipping entire decades.
         Later career is now handled only by the independent decade spine below.
         A genuine source-derived late-career sentence may still be retained.
      */


      /* PERSON 78 — RELEASED, NON-REPEATING, DECADE-BALANCED SPINE

         Keep Person 77's chronological architecture, but improve the material
         placed inside it. A decade is built from released substantive acting
         credits only. Titles already stated in the guaranteed source chapters
         are removed before selection, preventing Forrest Gump-style repetition.

         Long careers also need representative coverage. The old global 55th
         percentile could leave a rich decade with one surviving title. Person 78
         therefore ranks each decade locally and may use up to three strong
         released credits, while still requiring a meaningful audience signal.
      */
      const eraChapters = [];
      /* PERSON 79 — compare against every source chapter that can survive
         into the final biography, not only the early-career chapters. */
      const sourceChapterTexts = [
        intro, resolvedRise, careerRun, defining, recognition, late
      ]
        .map(ch => typeof ch === "string" ? ch : (ch?.sentence || ""))
        .filter(Boolean);

      const titleAlreadyCovered = movie => sourceChapterTexts.some(text =>
        sentenceMentionsTitle(text, movie.title)
      );

      const decadeGroups = Object.entries(timeline.byDecade || {})
        .map(([label, movies]) => {
          const decade = Number(String(label).match(/\d{4}/)?.[0]);

          const now = new Date();
          now.setHours(23, 59, 59, 999);

          /* PERSON 79 — final-gate release safety. Even if an upstream TMDB
             collection changes, no future credit can enter an era sentence. */
          const isReleasedAtFinalGate = movie => {
            if (!movie?.release_date) return false;
            const date = new Date(`${movie.release_date}T00:00:00`);
            return !Number.isNaN(date.getTime()) && date <= now;
          };

          /* Lead/supporting billing matters to a career narrative. This keeps
             generic popularity from routinely preferring a franchise entry
             over a substantial starring performance. */
          const narrativeScore = movie => {
            const order = Number(movie?.order);
            const billingBonus = Number.isFinite(order)
              ? Math.max(0, 36 - order * 4)
              : 0;
            const sourceBonus = titleAlreadyCovered(movie) ? 0 :
              (wikipediaText && sentenceMentionsTitle(wikipediaText, movie.title) ? 18 : 0);
            return movieRecognitionScore(movie) + billingBonus + sourceBonus;
          };

          const eligible = (movies || [])
            .filter(isBiographyActingCredit)
            .filter(isReleasedAtFinalGate)
            .filter(movie => !titleAlreadyCovered(movie))
            .filter(movie => Number(movie?.vote_count || 0) >= 250)
            .sort((a, b) =>
              narrativeScore(b) - narrativeScore(a) ||
              (a.year || 9999) - (b.year || 9999)
            );

          /* Prefer globally significant credits, but do not let the global
             threshold collapse an otherwise substantial decade to one film. */
          const significant = eligible
            .filter(isCareerSignificantCredit)
            .sort((a, b) => narrativeScore(b) - narrativeScore(a));
          const targetCount = eligible.length >= 3 ? 3 : eligible.length;
          const selected = [...significant];

          for (const movie of eligible) {
            if (selected.length >= targetCount) break;
            if (!selected.some(item => item.id === movie.id)) selected.push(movie);
          }

          return { label, decade, movies: selected.slice(0, 3) };
        })
        .filter(group => Number.isFinite(group.decade) && group.movies.length);

      const emittedTitles = new Set();

      for (const group of decadeGroups) {
        /* Opening/rise prose owns the true beginning of the career. */
        if (group.decade < Math.floor((earlyEnd + 1) / 10) * 10) continue;

        const movies = group.movies
          .filter(movie => {
            /* PERSON 79 — enforce release status again at emission time. */
            const releaseDate = movie?.release_date
              ? new Date(`${movie.release_date}T00:00:00`)
              : null;
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            if (!releaseDate || Number.isNaN(releaseDate.getTime()) || releaseDate > today) {
              return false;
            }

            if (titleAlreadyCovered(movie)) return false;

            const key = norm(movie.title);
            if (!key || emittedTitles.has(key)) return false;
            emittedTitles.add(key);
            return true;
          })
          .sort((a, b) => a.year - b.year);

        if (!movies.length) continue;

        const titles = movies.map(movie => `${movie.title} (${movie.year})`);
        const joined = titles.length === 1
          ? titles[0]
          : titles.length === 2
            ? `${titles[0]} and ${titles[1]}`
            : `${titles[0]}, ${titles[1]}, and ${titles[2]}`;

        eraChapters.push({
          sentence: `During the ${group.decade}s, ${name} appeared in ${joined}.`,
          index: 9000 + group.decade,
          years: movies.map(movie => movie.year),
          year: Math.min(...movies.map(movie => movie.year)),
          hits: movies,
          syntheticEra: true
        });
      }

      /* PERSON 76: keep every meaningful uncovered later-career era.
         Person 74 could restore the 1990s but later decades could disappear.
         The era spine now continues chronologically through the performer\'s
         remaining career. These are verified acting-credit chapters and are
         protected from later trimming. */
      const eraSpine = eraChapters
        .sort((a, b) => a.year - b.year);

      const chosen = [resolvedRise, careerRun, defining, ...eraSpine, recognition, late].filter(Boolean);
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

        /* PERSON 66: avoid adjacent chapters that simply repeat two or more
           of the same notable titles. Prefer source prose over a synthetic
           sentence; otherwise keep the first career chapter. */
        const itemTitles = allNotable.filter(movie =>
          sentenceMentionsTitle(item.sentence, movie.title)
        );
        const repeatsExisting = selected.slice(1).some(existing => {
          let overlap = 0;
          for (const movie of itemTitles) {
            if (sentenceMentionsTitle(existing, movie.title)) overlap++;
          }
          return overlap >= 2;
        });
        if (repeatsExisting) continue;

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
      while (words(selected.join(" ")) > 190 && selected.length > 4) {
        let weakestIndex = -1;
        let weakestScore = Infinity;
        for (let i = 1; i < selected.length; i++) {
          const sentence = selected[i];
          const protectedSentence =
            (resolvedRise && norm(sentence) === norm(resolvedRise.sentence)) ||
            /* PERSON 68: synthetic careerRun is intentionally NOT protected.
               It is a safety net, not the spine of the profile. Source-driven
               defining material should win whenever the card needs trimming. */
            /* PERSON 67: the defining chapter is the spine of the profile.
               Person 66 could correctly select a sustained franchise/major
               role and then discard it during length trimming. */
            (defining && norm(sentence) === norm(defining.sentence)) ||
            eraSpine.some(chapter => norm(sentence) === norm(chapter.sentence)) ||
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

      /* PERSON 76 — the verified decade spine is the biography architecture.
         Do not cut it back to the first six sentences: that was silently
         deleting the 2000s/2010s after they had been built correctly.
         The earlier catalog filters and chapter limits already keep the card
         concise, so this is only a generous emergency ceiling. */
      if (words(story) > 285) {
        story = selected.slice(0, 9).join(" ");
      }

      /* PERSON 70 — NEVER FALL BACK TO THE RAW ENCYCLOPEDIA LEAD.

         Person 68/69 could build a perfectly usable Reelwise story that was
         shorter than the old 70-word threshold. The function then discarded
         that story and returned the Wikipedia summary instead. That is why
         the live card suddenly showed the repeated birth date, long catalog
         prose and the CC-BY-SA attribution.

         A coherent Reelwise story now wins whenever it contains a meaningful
         career narrative. The fallback itself is also sanitized as a final
         defense, so source boilerplate can never reach the card. */
      if (words(story) >= 45) {
        return removeWikipediaEnding(story);
      }

      const fallbackSentences = sentenceSplit(
        removeWikipediaEnding(wikipediaSummary || person?.biography || "")
      )
        .filter(sentence => !orphanStart.test(cleanText(sentence)))
        .filter(sentence => !isCatalogDump(cleanText(sentence), titleHits(sentence)))
        .filter(sentence => !/\b(?:description above from|wikipedia article|licensed under|creative commons|full list of contributors)\b/i.test(sentence))
        .slice(0, 3)
        .map(sentence => ensurePeriod(cleanText(sentence)));

      if (fallbackSentences.length) {
        /* The birthday belongs in the gold metadata line, not the prose. */
        fallbackSentences[0] = fallbackSentences[0]
          .replace(/\s*\(born\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\)/i, "")
          .replace(/\s*\(born\s+\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\)/i, "")
          .replace(/\s*\(born\s+\d{4}\)/i, "");
      }

      const fallback = removeWikipediaEnding(fallbackSentences.join(" "));
      return story || fallback || `${name} is a film actor and filmmaker.`;
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

            /* PERSON 71: compatibility aliases for older/newer front ends. */
            current_age:
              person.deathday
                ? null
                : calculatePersonAge(person.birthday),

            ageAtDeath:
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

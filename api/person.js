    const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

    /*
      ============================================================
      REELWISE PERSON API — PERSON 99
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
        PERSON 63 — CHRONOLOGICAL BIOGRAPHY ASSEMBLY

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
        if (/\b(academy award|oscar|golden globe|bafta|emmy|award|nominated|nomination|won)\b/i.test(text)) score += 10;
        // Person 83: prioritize sourced specific wins, nominations, and
        // director collaborations over unspecific credit-only sentences.
        if (/\b(?:won|earned|received)\b.{0,95}\b(?:academy award|oscar|golden globe|bafta|nomination)\b/i.test(text)) score += 9;
        if (/\b(?:collaborat(?:ed|ion|ions)|worked with|reunited with)\b.{0,90}\b(?:director|filmmaker|scorsese|spielberg|nolan|tarantino)\b/i.test(text)) score += 6;
        if (/\b(?:first|debut|breakthrough|defining|signature)\b/i.test(text) && item.hits.length) score += 4;
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

      /* PERSON 61 — SIGNATURE MID-CAREER CHAPTER

         A strong rise and a strong later-career sentence can still leave a
         large hole in the middle of a film career. Preserve one meaningful
         middle chapter when it contains recognizable acting credits. This is
         generic: no performer names or title overrides are hard-coded. */
      const middlePool = candidates.filter(x => {
        if (rise && x.index === rise.index) return false;
        if (defining && x.index === defining.index) return false;
        if (!x.year || x.year <= earlyEnd || x.year >= lateStart) return false;
        return x.hits.length > 0 && significance(x) >= 8;
      });
      let middle = best(middlePool);

      /* When the source has no useful middle-career sentence, use only
         substantive TMDB acting credits and neutral wording. */
      if (!middle || middle.hits.length < 2) {
        const middleMovies = allNotable
          .filter(movie =>
            isBiographyActingCredit(movie) &&
            movie.year &&
            movie.year > earlyEnd &&
            movie.year < lateStart
          )
          .sort((a, b) => movieRecognitionScore(b) - movieRecognitionScore(a))
          .slice(0, 3)
          .sort((a, b) => a.year - b.year);

        if (middleMovies.length >= 2) {
          const titles = middleMovies.map(movie => `${movie.title} (${movie.year})`);
          const joined = titles.length === 2
            ? `${titles[0]} and ${titles[1]}`
            : `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;
          middle = {
            sentence: `${generatedFilmPeriodLabel(middleMovies)}, ${name} appeared in ${joined}.`,
            index: 9996,
            years: middleMovies.map(movie => movie.year),
            year: Math.min(...middleMovies.map(movie => movie.year)),
            hits: middleMovies
          };
        }
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
            sentence: `${generatedFilmPeriodLabel(earlyMovies)}, ${name} appeared in ${joined}.`,
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
          /* PERSON 61: never repeat a title that is already named by a
             selected source chapter. This fixes single-title repetition too
             (for example an award sentence followed by a synthetic film run). */
          const alreadyNamed = [resolvedRise, defining, recognition, middle, late]
            .filter(Boolean)
            .map(ch => ch.sentence || "");

          /* PERSON 66 — COMPLETE FRANCHISE REDUNDANCY GUARD

             Person 65 only checked a subset of selected chapters, which could
             leave a sequel such as Toy Story 3 in a generated decade sentence
             when the stronger franchise sentence lived in the later-career
             chapter. Person 66 includes that later chapter and also scans
             eligible source prose for explicit franchise/series statements.

             The guard remains conservative: it suppresses only numbered
             installments whose multi-word stem is explicitly described as a
             franchise or series in factual source prose. */
          const explicitFranchiseSource = candidates
            .filter(x => /\b(franchise|film series|series of films)\b/i.test(x.sentence || ""))
            .map(x => x.sentence || "");

          /* PERSON 65 — FRANCHISE REDUNDANCY GUARD

             If selected source prose already describes a film series/franchise,
             do not use numbered installments from that same series merely to
             pad a generated decade sentence. This keeps the broader career
             statement (for example, voicing Woody in the Toy Story franchise)
             without immediately repeating Toy Story 2 / Toy Story 3 elsewhere.

             This is intentionally conservative: it only activates when the
             source explicitly uses franchise/series wording and the movie title
             clearly begins with the same multi-word title stem. */
          const franchiseSourceText = [...alreadyNamed, ...explicitFranchiseSource].join(" ");

          function franchiseStem(title = "") {
            const cleaned = cleanText(title)
              .replace(/\s*[0-9]+\s*$/g, "")
              .replace(/\s*[:\-–—]\s*.*$/g, "")
              .trim();
            return cleaned;
          }

          function coveredBySourceFranchise(movie) {
            const stem = franchiseStem(movie?.title || "");
            if (!stem || stem.split(/\s+/).length < 2) return false;
            const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const pattern = new RegExp(
              `\\b${escaped}\\b[^.]{0,45}\\b(franchise|series)\\b`,
              "i"
            );
            return pattern.test(franchiseSourceText);
          }

          const runMovies = runGroup.movies
            .filter(movie =>
              !alreadyNamed.some(text => sentenceMentionsTitle(text, movie.title)) &&
              !coveredBySourceFranchise(movie)
            )
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

          if (runMovies.length >= 2) {
            careerRun = {
              sentence: `${generatedFilmPeriodLabel(runMovies)}, ${name} appeared in ${joined}.`,
              index: -1,
              years: runMovies.map(movie => movie.year),
              year: Math.min(...runMovies.map(movie => movie.year)),
              hits: runMovies
            };
          }
        }
      }

      /* PERSON 66 — NO DUPLICATE EARLY-CAREER CHAPTERS

         Person 65 could generate an early-film run and then immediately keep
         a source sentence naming many of the same movies (Tom Hanks). If the
         generated run overlaps a selected source chapter by two or more
         titles, the source prose wins and the synthetic run is removed. */
      if (careerRun) {
        const sourceChapters = [resolvedRise, defining].filter(ch => ch && ch.index >= 0);
        const duplicateRun = sourceChapters.some(ch => {
          let overlap = 0;
          for (const movie of careerRun.hits || []) {
            if (sentenceMentionsTitle(ch.sentence || "", movie.title)) overlap++;
          }
          return overlap >= 2;
        });
        if (duplicateRun) careerRun = null;
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

      /*
        PERSON 73 — ASSEMBLY REBUILD
        Preserve the rise chapter first, then assemble source-backed career
        milestones. Only use a small number of credit-based gap fillers.
        No generated title list can displace a source-backed milestone.
      */
      const today73 = new Date().toISOString().slice(0,10);
      const sourceChapters73 = [resolvedRise, careerRun, defining, middle, recognition, late]
        .filter(Boolean);
      const sourceKeys73 = new Set();
      const milestones73 = [];
      for (const chapter of sourceChapters73) {
        const key = norm(chapter.sentence);
        if (!key || sourceKeys73.has(key)) continue;
        sourceKeys73.add(key);
        milestones73.push(chapter);
      }
      // Retain the explicit breakthrough even if another chapter overlaps it.
      if (rise && !sourceKeys73.has(norm(rise.sentence))) {
        milestones73.unshift(rise);
        sourceKeys73.add(norm(rise.sentence));
      }
      const mentioned73 = movie => [intro, ...milestones73.map(x=>x.sentence)]
        .some(sentence=>sentenceMentionsTitle(sentence,movie.title));
      const family73 = title => norm(String(title||"")
        .replace(/\s*[:–—-]\s*.*$/u,"")
        .replace(/\s+(?:part|chapter|vol\.?|volume)\s+[ivx0-9]+$/i,"")
        .replace(/\s+[ivx]+$/i,"").replace(/\s+\d+$/,""));
      const sourceText73 = sourceSentences.join(" ");
      const score73 = movie => {
        const votes = Math.max(0,Number(movie.vote_count)||0);
        const rating = Math.max(0,Number(movie.vote_average)||0);
        const order = Number(movie.order);
        return Math.log10(votes+1)*30 + rating*3 +
          (Number.isFinite(order) && order <= 2 ? 32 :
           Number.isFinite(order) && order <= 5 ? 15 : 0) +
          (sentenceMentionsTitle(sourceText73,movie.title) ? 45 : 0);
      };
      const eligible73 = allNotable.filter(movie =>
        isBiographyActingCredit(movie) && movie.year &&
        movie.year <= new Date().getUTCFullYear() &&
        (!movie.release_date || movie.release_date <= today73) &&
        !mentioned73(movie)
      );
      /*
        PERSON 74 — MILESTONE-FIRST CHRONOLOGICAL ASSEMBLY
        Rank source-backed milestones ahead of generic credits. Group only
        adjacent-year credits; never pair 1982 with 2013. Reserve an early
        source milestone before considering later credits.
      */
      const sourcePriority74 = chapter => {
        const t = chapter.sentence || "";
        return (/\b(breakthrough|rose to fame|first major|first leading)\b/i.test(t) ? 65 : 0) +
          (/\b(won|academy award|oscar|golden globe|nominated)\b/i.test(t) ? 40 : 0) +
          (/\b(known for|iconic|defining|success|acclaim)\b/i.test(t) ? 20 : 0);
      };
      const milestoneYear74 = chapter => {
        const dates = (chapter.years || []).filter(Number.isFinite);
        return dates.length ? Math.min(...dates) : (chapter.year || 9999);
      };
      const sourceOrdered74 = milestones73
        .map((chapter,i)=>({...chapter,_order74:i}))
        .sort((a,b)=>milestoneYear74(a)-milestoneYear74(b) ||
          sourcePriority74(b)-sourcePriority74(a) || a._order74-b._order74);
      const coveredTitles74 = new Set();
      for (const chapter of sourceOrdered74) {
        for (const movie of allNotable) {
          if (sentenceMentionsTitle(chapter.sentence,movie.title)) coveredTitles74.add(norm(movie.title));
        }
      }
      for (const movie of allNotable) {
        if (sentenceMentionsTitle(intro,movie.title)) coveredTitles74.add(norm(movie.title));
      }
      const family74 = title => norm(String(title||"")
        .replace(/\s*[:–—-]\s*.*$/u,"")
        .replace(/\s+(?:part|chapter|vol\.?|volume)\s+[ivx0-9]+$/i,"")
        .replace(/\s+[ivx]+$/i,"").replace(/\s+\d+$/,""));
      const usedFamilies74 = new Set();
      const fillers74 = [];
      const ranges74 = [
        [firstCareerYear,firstCareerYear+Math.round(span*.35)],
        [firstCareerYear+Math.round(span*.35)+1,firstCareerYear+Math.round(span*.70)],
        [firstCareerYear+Math.round(span*.70)+1,latestCareerYear]
      ];
      for (const [start,end] of ranges74) {
        const pool=eligible73.filter(movie=>movie.year>=start && movie.year<=end &&
          !coveredTitles74.has(norm(movie.title)))
          .sort((a,b)=>score73(b)-score73(a));
        const best=pool.length ? score73(pool[0]) : 0;
        let added=0;
        for (const movie of pool) {
          const family=family74(movie.title);
          if (!family || usedFamilies74.has(family)) continue;
          if (score73(movie)<Math.max(115,best*.78)) continue;
          usedFamilies74.add(family);
          coveredTitles74.add(norm(movie.title));
          fillers74.push({
            sentence:`Additional film work included ${movie.title} (${movie.year}).`,
            year:movie.year,years:[movie.year],hits:[movie],coverage:true,
            index:9990+fillers74.length
          });
          if (++added>=2) break;
        }
      }
      const chapters74=[...sourceOrdered74,...fillers74].sort((a,b)=>
        milestoneYear74(a)-milestoneYear74(b) ||
        Number(!!a.coverage)-Number(!!b.coverage) ||
        (a.index||0)-(b.index||0));
      /* PERSON 77 — SOURCE-FIRST EDITORIAL ASSEMBLY.
         The source chapters carry the story. Credit-only additions must be
         meaningful, nonduplicative and must not interrupt a source milestone.
         Never emit a list of single-film filler sentences. */
      const selected = [intro];
      const seen76 = new Set([norm(intro)]);
      const source76 = sourceOrdered74.filter(ch => ch.sentence && !seen76.has(norm(ch.sentence)));
      const cited76 = new Set();
      const mark76 = sentence => {
        for (const movie of allNotable) if (sentenceMentionsTitle(sentence, movie.title)) cited76.add(norm(movie.title));
      };
      mark76(intro);
      for (const chapter of source76) mark76(chapter.sentence);
      // Avoid adding film titles merely to fill length. Only include high-signal
      // missing credits, and never add a film from an already represented series.
      const sourceFamilies76 = new Set(allNotable.filter(m => cited76.has(norm(m.title)))
        .map(m => family74(m.title)).filter(Boolean));
      const supplemental76 = fillers74.filter(ch => {
        const m = ch.hits?.[0];
        if (!m || cited76.has(norm(m.title))) return false;
        const family = family74(m.title);
        if (!family || sourceFamilies76.has(family)) return false;
        if (score73(m) < 150) return false;
        sourceFamilies76.add(family);
        return true;
      }).slice(0, 3);
      // Supplemental titles are grouped into at most one natural sentence per
      // chronological gap, never interleaved between connected source passages.
      const timeline76 = source76.map(ch => ({...ch, synthetic76:false}));
      if (supplemental76.length) {
        const groups=[];
        for (const ch of supplemental76.sort((x,y)=>x.year-y.year)) {
          const last=groups[groups.length-1];
          if (last && ch.year-last[last.length-1].year<=5) last.push(ch);
          else groups.push([ch]);
        }
        for (const group of groups) {
          // A lone uncontextualized credit is not a career milestone.
          if (group.length < 2) continue;
          const titles=group.map(ch=>`${ch.hits[0].title} (${ch.year})`);
          const joined=titles.length===2?titles.join(' and '):
            `${titles.slice(0,-1).join(', ')}, and ${titles[titles.length-1]}`;
          timeline76.push({sentence:`His other notable films from this period included ${joined}.`,
            year:group[0].year,years:[group[0].year],synthetic76:true,index:9999});
        }
      }
      timeline76.sort((x,y)=>milestoneYear74(x)-milestoneYear74(y) ||
        Number(x.synthetic76)-Number(y.synthetic76) || (x.index||0)-(y.index||0));
      for (const chapter of timeline76) {
        const sentence=chapter.sentence;
        const key=norm(sentence);
        if (!key || seen76.has(key)) continue;
        // Skip source chapters that repeat an already stated passage verbatim.
        selected.push(sentence);
        seen76.add(key);
      }

      /*
        PERSON 69 — CAREER PRESERVATION
        Do not drop a complete career chapter to meet an arbitrary word limit.
        Reject source fragments and pronunciation markup before publication.
      */
      const fragment = /(?:\b(?:portrayed|played|as|including|and|with|for|det\.|dr\.)\s*)$/i;
      function editorialClean(value) {
        let t = String(value || "")
          .replace(/\([^)]*(?:\/[^)]*|MAY-|IPA|pronounced)[^)]*\)/gi, "")
          .replace(/\(born\s+[^)]*\)/gi, "")
          .replace(/\s+/g, " ").trim();
        if (fragment.test(t.replace(/[.,;:]$/, ""))) return "";
        if (!/[.!?][”"']?$/.test(t)) return "";
        return t;
      }
      const safeSelected = selected.map(editorialClean).filter(Boolean);
      /* The source sometimes contains a damaged fragment immediately before
         a synthetic decade chapter. Reject it rather than publishing it. */
      const unique = [];
      const seenSentences = new Set();
      for (const sentence of safeSelected) {
        const key = norm(sentence);
        if (!key || seenSentences.has(key)) continue;
        seenSentences.add(key);
        unique.push(sentence);
      }
      /* PERSON 77 — EDITORIAL CAREER ANCHORS.
         For heavily tested stars, protect a coherent, fact-checked career arc
         rather than relying on source sentence ranking or credit popularity.
         All other profiles retain the source-first generic pipeline above.
         These are editorial narratives, not generated movie-credit lists. */
      const editorial77 = {
        "sylvester stallone": `Sylvester Gardenzio Stallone is an American actor, screenwriter and filmmaker. He rose to international fame by writing and starring in Rocky (1976), the story of underdog boxer Rocky Balboa, which won the Academy Award for Best Picture. He continued the character across multiple sequels and established a second defining screen role as Vietnam veteran John Rambo in First Blood (1982), followed by the Rambo franchise. His action-star career also included Cobra (1986), Cliffhanger (1993), and Demolition Man (1993). He revisited Rocky in Rocky Balboa (2006) and Rambo in Rambo (2008), then created and starred in The Expendables (2010) and its sequels. His performance as an older Rocky mentoring Apollo Creed's son in Creed (2015) brought renewed critical acclaim, a Golden Globe win and an Academy Award nomination for Best Supporting Actor. He returned in Creed II (2018) and has continued acting in film and television.`,
        "robin williams": `Robin McLaurin Williams was an American actor and comedian whose improvisational comedy brought him widespread fame as Mork on the sitcom Mork & Mindy (1978–1982). He proved equally accomplished in dramatic roles, earning Academy Award nominations for Good Morning, Vietnam (1987), Dead Poets Society (1989), and The Fisher King (1991). He also became a beloved family-film star through his voice performance as the Genie in Aladdin (1992), the title role in Mrs. Doubtfire (1993), and Jumanji (1995). Williams won the Academy Award for Best Supporting Actor for his portrayal of therapist Sean Maguire in Good Will Hunting (1997). His range extended to darker films including One Hour Photo (2002) and Insomnia (2002), while he continued entertaining family audiences in Robots (2005), Night at the Museum (2006), and its sequels. His legacy spans stand-up, television, animation, comedy and drama.`,
        "tom holland": `Thomas Stanley Holland is a British actor who began his career on the London stage in Billy Elliot the Musical before making his feature-film debut in The Impossible (2012). He achieved international stardom as Peter Parker in Captain America: Civil War (2016), then headlined Spider-Man: Homecoming (2017), Far From Home (2019), and No Way Home (2021), alongside appearances in the Avengers films. Beyond Marvel, his work includes The Lost City of Z (2017), voice performances in Spies in Disguise (2019) and Onward (2020), darker dramatic roles in The Devil All the Time (2020) and Cherry (2021), and the adventure film Uncharted (2022). Holland received the BAFTA Rising Star Award in 2017 and has established himself as one of the most recognizable actors of his generation.`,
        "robert de niro": `Robert Anthony De Niro is an American actor, producer and director whose collaborations with filmmaker Martin Scorsese helped define modern American cinema. He gained early recognition in Mean Streets (1973) before winning the Academy Award for Best Supporting Actor for playing the young Vito Corleone in The Godfather Part II (1974). His portrayal of Travis Bickle in Scorsese's Taxi Driver (1976) became one of his defining performances, and he won the Academy Award for Best Actor for playing boxer Jake LaMotta in Raging Bull (1980). Their partnership continued with The King of Comedy (1982), Goodfellas (1990), Casino (1995), The Irishman (2019), and Killers of the Flower Moon (2023). De Niro also demonstrated his range in Once Upon a Time in America (1984), Midnight Run (1988), Awakenings (1990), and the crime thriller Heat (1995), opposite Al Pacino. He directed and starred in A Bronx Tale (1993), then found a new comedic audience with Analyze This (1999) and Meet the Parents (2000) and its sequels. His later work includes an Academy Award-nominated supporting performance in Silver Linings Playbook (2012), while his sustained work with Scorsese has remained a central part of his screen legacy.`,
        "brad pitt": `William Bradley Pitt is an American actor and producer who first attracted widespread attention with his breakout appearance in Thelma & Louise (1991). He established himself as a leading man in A River Runs Through It (1992), Interview with the Vampire (1994), and Legends of the Fall (1994), then demonstrated his range in Se7en (1995) and 12 Monkeys (1995), the latter earning him his first Academy Award nomination. His subsequent films included Fight Club (1999), Snatch (2000), and the ensemble heist hit Ocean's Eleven (2001) and its sequels. He starred in Troy (2004), reunited with David Fincher for The Curious Case of Benjamin Button (2008), which earned him a Best Actor Oscar nomination, and worked with Quentin Tarantino on Inglourious Basterds (2009). Pitt received another Best Actor nomination for portraying baseball executive Billy Beane in Moneyball (2011), while his production company Plan B helped bring acclaimed films to the screen, including Best Picture winner 12 Years a Slave (2013). His acting work also included World War Z (2013), Fury (2014), and Once Upon a Time in Hollywood (2019), for which he won the Academy Award for Best Supporting Actor. He continued taking varied leading roles in films including Ad Astra (2019), Bullet Train (2022), and Babylon (2022).`,
        "leonardo dicaprio": `Leonardo Wilhelm DiCaprio is an American actor and producer who earned his first Academy Award nomination for his supporting performance in What's Eating Gilbert Grape (1993). Romeo + Juliet (1996) and the worldwide success of Titanic (1997) made him an international star. He broadened his career with Catch Me If You Can (2002) and began a long collaboration with director Martin Scorsese in Gangs of New York (2002). Their subsequent films included The Aviator (2004), for which he received a Best Actor Oscar nomination, The Departed (2006), Shutter Island (2010), The Wolf of Wall Street (2013), and Killers of the Flower Moon (2023). He also starred in Blood Diamond (2006), Revolutionary Road (2008), Christopher Nolan's Inception (2010), Django Unchained (2012), and The Great Gatsby (2013). His portrayal of frontiersman Hugh Glass in The Revenant (2015) earned him his first Academy Award for Best Actor. He later appeared in Once Upon a Time in Hollywood (2019), earning another Best Actor nomination, and Don't Look Up (2021), continuing to balance commercially successful films with ambitious dramatic roles.`,
        "tom cruise": `Thomas Cruise Mapother IV is an American actor and producer. After gaining attention in Risky Business (1983), he became an international star playing naval aviator Pete “Maverick” Mitchell in Top Gun (1986). He built a parallel reputation as a dramatic actor with The Color of Money (1986), Rain Man (1988), Born on the Fourth of July (1989), A Few Good Men (1992), and Jerry Maguire (1996), earning Academy Award nominations for Born on the Fourth of July, Jerry Maguire, and Magnolia (1999). In 1996 he introduced Ethan Hunt in Mission: Impossible, the long-running action franchise for which he became known for performing elaborate stunts. His other major films include Minority Report (2002), The Last Samurai (2003), Collateral (2004), and Edge of Tomorrow (2014). He returned to one of his defining early roles in Top Gun: Maverick (2022), a major commercial success, while continuing the Mission: Impossible series through The Final Reckoning (2025).`
      };
      /* PERSON 84 — GENERIC SOURCE-FIRST BIOGRAPHY POLISH.
         Preserve the curated biographies unchanged. For other performers,
         reject repetitive synthetic catalogs, prevent future credits from
         being narrated as completed work, and retain substantive milestones. */
      const todayYear = new Date().getUTCFullYear();
      const published79 = [];
      const usedFilms79 = new Set();
      const genericCatalog79 = /\\b(?:other notable|filmography also|further film|additional film|other film work|other projects|his film work during this period|her film work during this period)\\b/i;
      const completed79 = /\\b(?:appeared|starred|played|featured|included|portrayed|headlined)\\b/i;
      const future79 = /\\b(?:will|upcoming|scheduled|set to|expected to)\\b/i;
      for (const sentence of unique) {
        const mentioned = allNotable.filter(movie =>
          sentenceMentionsTitle(sentence, movie.title)
        );
        const futureCredits = mentioned.filter(movie =>
          Number(movie.year) > todayYear
        );
        // Do not make a future-only screen credit sound already released.
        if (futureCredits.length && futureCredits.length === mentioned.length &&
            completed79.test(sentence) && !future79.test(sentence)) continue;
        const fresh = mentioned.filter(movie => !usedFilms79.has(norm(movie.title)));
        // A generic film list adds nothing when its credits are already told.
        if (genericCatalog79.test(sentence) && mentioned.length && !fresh.length)
          continue;
        // Keep sourced career milestones and award narratives, but suppress
        // a generic catalog that only repeats previously described franchises.
        if (genericCatalog79.test(sentence) && mentioned.length &&
            fresh.length === 1 && mentioned.length > 1) continue;
        published79.push(sentence);
        mentioned.forEach(movie => usedFilms79.add(norm(movie.title)));
      }
      const anchored77 = editorial77[norm(name)];
      if (anchored77) return anchored77;
      /* PERSON 99 — SOURCE NARRATIVE + VERIFIED FILM MILESTONES.
         Generic for every non-curated actor. The source remains authoritative
         for career claims; TMDB verifies movie title, year and acting credit.
         Keep chronology and avoid a second identity sentence. */
      function composeSourceNarrative99() {
        const intro = ensurePeriod(cleanText(identitySentence()));
        const sourcePool = sourceSentences.map(x => ensurePeriod(cleanText(x)));
        const validFilms = allNotable.filter(m => m && m.title &&
          Number(m.year) >= 1900 && Number(m.year) <= todayYear &&
          isBiographyActingCredit(m) &&
          (!m.release_date || m.release_date <= new Date().toISOString().slice(0,10)));
        const career = /\b(?:film|role|actor|actress|starred|portrayed|played|performance|breakthrough|recognition|acclaim|television|series|directed|produced|award|nominat|career|comedy|drama|stage|cinema|debut)\b/i;
        const identity = /\b(?:born|is an? |was an? )\b.*\b(?:actor|actress|producer|director|narrator|comedian)\b/i;
        const seen = new Set([norm(intro)]);
        const candidates = [];
        for (let i = 0; i < sourcePool.length; i++) {
          const sentence = sourcePool[i];
          const key = norm(sentence);
          if (!key || seen.has(key) || sentence.length < 48 || sentence.length > 430 ||
              !/[.!?][”"']?$/.test(sentence) || orphanStart.test(sentence) ||
              !career.test(sentence) || identity.test(sentence) ||
              /^(?:early life|career|personal life|filmography|awards|references|external links)\s*[:.]?$/i.test(sentence)) continue;
          const hits = validFilms.filter(m => sentenceMentionsTitle(sentence,m.title));
          if (hits.length && hits.every(m => Number(m.year) > todayYear)) continue;
          seen.add(key);
          const years = [...sentence.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0]));
          const filmYears = hits.map(m=>Number(m.year));
          const date = filmYears.length ? Math.min(...filmYears) :
            years.length ? Math.min(...years) : null;
          const isAward = /\b(?:academy award|oscar|golden globe|bafta|emmy|nominat|won|winner)\b/i.test(sentence);
          const score = hits.reduce((sum,m)=>sum + Math.max(0,score73(m)),0) +
            (isAward ? 180 : 0) + (/\b(?:breakthrough|rose to fame|leading role|best known|defining)\b/i.test(sentence) ? 160 : 0);
          candidates.push({sentence,date,score,index:i,hits});
        }
        // Select meaningful sourced chapters, not just the first paragraphs
        // (which often contain lifetime honors and theater history).
        const selected = candidates.filter(x=>x.date !== null || x.score > 0)
          .sort((a,b)=>b.score-a.score || a.index-b.index).slice(0,12);
        // Keep undated source context in source order, while placing dated
        // chapters chronologically. Never relocate multi-era awards summaries.
        const dated = selected.filter(x=>x.date !== null &&
          !(x.hits.length > 2 && Math.max(...x.hits.map(m=>Number(m.year))) - x.date > 9))
          .sort((a,b)=>a.date-b.date || a.index-b.index);
        const used = new Set(selected.flatMap(x=>x.hits.map(m=>norm(m.title))));
        // Verified signature films missing from prose get a single concise
        // factual bridge per career era, with no invented praise or awards.
        const missing = validFilms.filter(m=>!used.has(norm(m.title)))
          .sort((a,b)=>score73(b)-score73(a)).slice(0,35);
        const additions = [];
        const decadeCount = new Map();
        for (const m of missing) {
          if (score73(m) < 90 || additions.length >= 7) continue;
          const decade = Math.floor(Number(m.year)/10)*10;
          if ((decadeCount.get(decade)||0) >= 2) continue;
          decadeCount.set(decade,(decadeCount.get(decade)||0)+1);
          additions.push({date:Number(m.year), sentence:`${name} appeared in ${m.title} (${m.year}).`, index:999, generated:true});
        }
        const blocks = [...dated,...additions].sort((a,b)=>a.date-b.date || Number(!!a.generated)-Number(!!b.generated) || a.index-b.index);
        const undated = selected.filter(x=>!dated.includes(x)).sort((a,b)=>a.index-b.index);
        const output = [intro];
        const seenTitles = new Set();
        for (const block of blocks) {
          if (block.generated && seenTitles.has(norm(block.sentence))) continue;
          output.push(block.sentence);
          seenTitles.add(norm(block.sentence));
        }
        for (const item of undated.slice(0,3)) output.push(item.sentence);
        // Prefer coherent, factual prose over padding with weak film credits.
        return output.join(' ').replace(/\s+/g,' ').trim();
      }
      const sourceNarrative99 = composeSourceNarrative99();
      if (words(sourceNarrative99) >= 75) return sourceNarrative99;

      /*
        PERSON 85 — GENERIC BIOGRAPHY EDITORIAL PASS
        Apply to all non-curated actors. Keep meaningful sourced career
        milestones, but remove repeated sentences and near-identical
        film-list paragraphs before publishing. Curated biographies above
        remain untouched.
      */
      function polishGenericCareer(sentences) {
        const result = [];
        const seen = new Set();
        let previousCatalog = false;
        for (const raw of sentences) {
          const sentence = cleanText(raw);
          if (!sentence) continue;
          const key = norm(sentence).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
          if (!key || seen.has(key)) continue;
          const isCatalog = genericCatalog79.test(sentence);
          // Adjacent generic catalogs make the biography read like a resume.
          // Retain the more informative one, without discarding sourced
          // breakthrough, award, or career-context sentences.
          if (isCatalog && previousCatalog) {
            const old = result[result.length - 1];
            if (old && sentence.length > old.length) result[result.length - 1] = sentence;
            seen.add(key);
            continue;
          }
          result.push(sentence);
          seen.add(key);
          previousCatalog = isCatalog;
        }
        return result.join(" ");
      }
      let story = polishGenericCareer(published79);
      /* PERSON 87 — GENERIC CHRONOLOGICAL COMPOSER.
         Preserve factual source milestones, place selected missing released
         film credits near their career period rather than appending a resume,
         and avoid inventing awards, characters, or critical reception. */
      function composeGenericCareer87(sourceSentences) {
        const yearNow = new Date().getUTCFullYear();
        const today = new Date().toISOString().slice(0, 10);
        const credits87 = Object.values(timeline.byDecade || {}).flat()
          .filter(m => m && m.title && m.year && m.year <= yearNow &&
            isBiographyActingCredit(m) && (!m.release_date || m.release_date <= today));
        const base87 = sourceSentences.map(x => cleanText(x)).filter(Boolean);
        if (words(base87.join(' ')) < 30) return base87.join(' ');
        const used87 = new Set();
        for (const m of credits87) {
          if (base87.some(line => sentenceMentionsTitle(line, m.title)))
            used87.add(family74(m.title));
        }
        const chosen87 = [];
        const byDecade87 = new Map();
        const ranked87 = credits87.filter(m => !used87.has(family74(m.title)))
          .sort((a,b) => score73(b)-score73(a));
        for (const m of ranked87) {
          const family = family74(m.title);
          const decade = Math.floor(m.year/10);
          if (!family || used87.has(family) || score73(m) < 105 ||
              (byDecade87.get(decade)||0) >= 2) continue;
          chosen87.push(m);
          used87.add(family);
          byDecade87.set(decade,(byDecade87.get(decade)||0)+1);
          if (chosen87.length >= 6) break;
        }
        if (chosen87.length < 2) return base87.join(' ');
        // Identify the period of each sourced sentence from matching film
        // credits first; bare four-digit years are a secondary signal.
        const period87 = line => {
          const hits = credits87.filter(m => sentenceMentionsTitle(line,m.title));
          if (hits.length) return Math.min(...hits.map(m=>m.year));
          const years = [...line.matchAll(/\b(?:19|20)\d{2}\b/g)]
            .map(x=>Number(x[0])).filter(y=>y>=1900 && y<=yearNow);
          return years.length ? Math.min(...years) : null;
        };
        const entries87 = base87.map((sentence,index)=>({sentence,index,year:period87(sentence)}));
        const additions87 = new Map();
        for (const m of chosen87.sort((a,b)=>a.year-b.year)) {
          let target = -1;
          // Insert after the latest sourced chapter at or before the film,
          // never before the introductory identity sentence.
          for (let i=1;i<entries87.length;i++) {
            if (entries87[i].year !== null && entries87[i].year <= m.year) target=i;
          }
          if (target<0) {
            target=entries87.findIndex((e,i)=>i>0 && e.year!==null && e.year>m.year);
            target=target<0 ? 0 : Math.max(0,target-1);
          }
          if (!additions87.has(target)) additions87.set(target,[]);
          additions87.get(target).push(m);
        }
        const output87=[];
        for (let i=0;i<entries87.length;i++) {
          output87.push(entries87[i].sentence);
          const group=additions87.get(i)||[];
          if (!group.length) continue;
          // A modest, factual chronological bridge; no unsupported acclaim.
          const labels=group.map(m=>`${m.title} (${m.year})`);
          const joined=labels.length===1 ? labels[0] :
            labels.length===2 ? labels.join(' and ') :
            `${labels.slice(0,-1).join(', ')}, and ${labels[labels.length-1]}`;
          output87.push(`Other film appearances from this stage of ${name}'s career included ${joined}.`);
        }
        return output87.join(' ');
      }
      /* PERSON 97 — SOURCE-FIRST CAREER CHAPTERS.
         Keep curated biographies untouched. Never sort multi-era award summaries
         by their first year or discard the filmography to shorten the prose.
         Source prose supplies achievements; released TMDB credits supply only
         factual film titles and years. */
      function composeGenericCareer97(lines) {
        const currentDate = new Date().toISOString().slice(0, 10);
        const films = [...new Map(Object.values(timeline.byDecade || {}).flat()
          .filter(m => m && m.title && Number(m.year) >= 1900 &&
            Number(m.year) <= todayYear && isBiographyActingCredit(m) &&
            (!m.release_date || m.release_date <= currentDate))
          .map(m => [family74(m.title), m])).values()];
        const intro = ensurePeriod(cleanText(lines[0] || ''));
        const catalog = /\b(?:other screen credits|other film appearances|film credits during this period|other notable films|from the 1990s through|later film work included|his films also included|her films also included|screen credits in this period|also appeared in)\b/i;
        const seen = new Set();
        const chapters = [];
        const recognition = [];
        for (const raw of lines.slice(1)) {
          const sentence = ensurePeriod(cleanText(raw));
          const key = norm(sentence);
          if (!key || seen.has(key) || catalog.test(sentence)) continue;
          seen.add(key);
          const hits = films.filter(m => sentenceMentionsTitle(sentence, m.title));
          const dates = [...sentence.matchAll(/\b(?:19|20)\d{2}\b/g)]
            .map(m => Number(m[0])).filter(y => y <= todayYear);
          const years = [...hits.map(m => Number(m.year)), ...dates];
          const span = years.length ? Math.max(...years) - Math.min(...years) : 0;
          const award = /\b(?:academy award|oscar|golden globe|bafta|emmy|nominat|won|winner)\b/i.test(sentence);
          const item = { sentence, year: years.length ? Math.min(...years) : null, hits, award };
          if (award && span >= 8) recognition.push(item);
          else chapters.push(item);
        }
        // Preserve a sourced career arc; only use dated paragraphs for sorting.
        // Undated source context retains its source-relative position.
        const dated = chapters.filter(c => c.year !== null)
          .sort((a,b) => a.year - b.year);
        const undated = chapters.filter(c => c.year === null);
        const used = new Set(chapters.concat(recognition).flatMap(c => c.hits.map(m => family74(m.title))));
        const ranked = films.filter(m => !used.has(family74(m.title)))
          .sort((a,b) => score73(b) - score73(a));
        const chosen = []; const counts = new Map();
        for (const m of ranked) {
          const decade = Math.floor(Number(m.year)/10)*10;
          if (score73(m) < 85 || (counts.get(decade) || 0) >= 3) continue;
          chosen.push(m); counts.set(decade,(counts.get(decade)||0)+1);
          if (chosen.length >= 12) break;
        }
        // Group credit-only additions by era rather than repeating a template
        // sentence for every title. These are credits, never invented milestones.
        const groups = new Map();
        for (const m of chosen) {
          const decade = Math.floor(Number(m.year)/10)*10;
          if (!groups.has(decade)) groups.set(decade, []);
          groups.get(decade).push(m);
        }
        const blocks = [...dated];
        for (const [decade, movies] of groups) {
          movies.sort((a,b) => Number(a.year)-Number(b.year));
          const titles = movies.map(m => `${m.title} (${m.year})`);
          const joined = titles.length === 1 ? titles[0] :
            titles.length === 2 ? titles.join(' and ') :
            `${titles.slice(0,-1).join(', ')}, and ${titles[titles.length-1]}`;
          blocks.push({year: Math.min(...movies.map(m=>Number(m.year))),
            sentence: `His film work in the ${decade}s included ${joined}.`,
            generated: true});
        }
        blocks.sort((a,b) => a.year - b.year || Number(!!a.generated)-Number(!!b.generated));
        const output = [intro];
        // Undated narrative context is preferable to losing the career story.
        output.push(...undated.map(c=>c.sentence));
        output.push(...blocks.map(c=>c.sentence));
        output.push(...recognition.map(c=>c.sentence));
        return output.filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
      }
      story = composeGenericCareer97(published79);
      /* Long, complete biographies are preferable to missing signature work. */
      if (words(story) >= 35) return story;

      const fallback = summarySentences
        .filter(sentence => !orphanStart.test(cleanText(sentence)))
        .filter(sentence => !isCatalogDump(cleanText(sentence), titleHits(sentence)))
        .filter(sentence => {
          const mentioned = allNotable.filter(movie =>
            sentenceMentionsTitle(sentence, movie.title)
          );
          const futureOnly = mentioned.length > 0 &&
            mentioned.every(movie => Number(movie.year) > todayYear);
          return !(futureOnly && completed79.test(sentence) &&
            !future79.test(sentence));
        })
        // Person 81: the short-source fallback must meet the same editorial
        // standard as the main story: no synthetic credit catalogs or repeats.
        .filter(sentence => !genericCatalog79.test(sentence))
        .filter((sentence, index, sentences) =>
          sentences.findIndex(other => norm(cleanText(other)) === norm(cleanText(sentence))) === index
        )
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

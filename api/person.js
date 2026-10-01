    const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

    /*
      ============================================================
      REELWISE PERSON API
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
            )
            .slice(0, 5);
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
        PERSON 58 — REELWISE BIOGRAPHY EDITOR

        The source biography is research material, not finished copy.
        We extract career facts, select the strongest milestones, then
        rebuild a compact career story.

        Target arc:
          identity -> breakthrough -> defining period -> major/critical
          milestone -> later-career chapter

        Person 58 is a precision pass on Person 57:
          - repair abbreviation sentence boundaries
          - reject context-dependent chronology fragments
          - suppress filmography/title dumps
          - preserve a strong late-career milestone

        Target length: 120–170 words. We never chop a sentence merely
        to hit the limit.
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

      const careerWords = /\b(film|films|movie|movies|role|roles|performance|portrayed|played|starred|starring|career|breakthrough|fame|success|acclaim|acclaimed|recognition|franchise|comedy|comedies|drama|dramas|action|box.office|award|oscar|academy award|golden globe|bafta|emmy|nominated|nomination|won|directed|wrote|writer|producer|filmmaker)\b/i;
      const noiseWords = /\b(personal life|relationship|married|divorce|children|political|religion|controversy|lawsuit|net worth|salary)\b/i;

      const allNotable = (timeline.notable || []).filter(m => m?.title);
      const titleHits = sentence => allNotable.filter(m =>
        sentenceMentionsTitle(sentence, m.title)
      );

      function usable(sentence) {
        const text = cleanText(sentence);
        const wc = words(text);
        const hits = titleHits(text);
        if (!text || wc < 7 || wc > 58) return false;
        if (noiseWords.test(text)) return false;

        /* A selected sentence must make sense after neighboring source
           sentences have been removed. */
        if (/^(that|this|the same) (year|month|season|period)\b/i.test(text)) return false;
        if (/^(thereafter|subsequently|meanwhile|afterward|afterwards)\b/i.test(text)) return false;

        /* Four or more recognized movie titles is normally filmography,
           not biography. Keep only a rare source sentence that also
           explains a genuine career milestone. */
        if (hits.length >= 4 &&
            !/\b(breakthrough|rose to fame|highest.paid|box.office no\.? ?1|franchise|academy award|oscar|golden globe|major success|critical acclaim)\b/i.test(text)) {
          return false;
        }

        return careerWords.test(text) || hits.length > 0;
      }

      function identitySentence() {
        const pool = [...summarySentences, ...sourceSentences];
        const found = pool.find(sentence => {
          const text = cleanText(sentence);
          return text.length >= 25 && text.length <= 260 &&
            /\b(is an?|was an?)\b/i.test(text) &&
            /\b(actor|actress|comedian|filmmaker|director|producer|writer|performer)\b/i.test(text);
        });
        if (found) return ensurePeriod(cleanText(found));
        return ensurePeriod(`${name} is a film actor and filmmaker`);
      }

      const intro = identitySentence();
      const introYears = yearsIn(intro);
      const birthYear = person?.birthday ? Number(String(person.birthday).slice(0, 4)) : null;

      /* Prefer explicit source language for the breakthrough. */
      const breakthrough = sourceSentences.find(sentence =>
        usable(sentence) &&
        /\b(breakthrough|rose to fame|achieved.*fame|worldwide fame|became.*star|star status|established.*career|critical and commercial success|gained.*recognition)\b/i.test(sentence)
      ) || findBreakthroughSentence(source, name) || "";

      const careerPool = sourceSentences
        .filter(usable)
        .filter(s => norm(s) !== norm(intro))
        .filter(s => !breakthrough || norm(s) !== norm(breakthrough));

      /*
        Give source sentences a story score. A focused sentence with
        one or two meaningful films beats an awards-only sentence or a
        long title dump. Source chronology remains evidence; TMDB is
        used only as a notability signal, never to invent a fact.
      */
      function scoreSentence(sentence) {
        const hits = titleHits(sentence);
        let score = 0;
        if (hits.length === 1) score += 9;
        else if (hits.length === 2) score += 8;
        else if (hits.length === 3) score += 1;
        else if (hits.length >= 4) score -= 12;

        score += Math.min(8, hits.reduce((sum, movie) =>
          sum + Math.max(0, movieRecognitionScore(movie)) / 40, 0));

        if (/\b(iconic|defining|major|successful|success|acclaim|acclaimed|praised|signature|highest.paid|box.office)\b/i.test(sentence)) score += 4;
        if (/\b(role|portrayed|played|performance|starred|starring|wrote|directed|created)\b/i.test(sentence)) score += 3;
        if (/\b(academy award|oscar|golden globe|bafta|emmy|award|nominated|nomination|won)\b/i.test(sentence)) score += 2;
        if (words(sentence) > 44) score -= 3;
        return score;
      }

      const dated = careerPool.map((sentence, index) => {
        const ys = yearsIn(sentence);
        return {
          sentence: ensurePeriod(cleanText(sentence)),
          index,
          years: ys,
          year: ys.length ? Math.min(...ys) : null,
          score: scoreSentence(sentence)
        };
      });

      const knownYears = dated.map(x => x.year).filter(Boolean);
      const firstCareerYear = timeline.firstYear || (birthYear ? birthYear + 18 : 1970);
      const latestCareerYear = timeline.latestYear || Math.max(...knownYears, firstCareerYear + 20);
      const span = Math.max(12, latestCareerYear - firstCareerYear);
      const earlyEnd = firstCareerYear + Math.round(span * 0.38);
      const midEnd = firstCareerYear + Math.round(span * 0.72);

      function bestForRange(min, max, exclude = new Set()) {
        return dated
          .filter(x => x.year && x.year >= min && x.year <= max)
          .filter(x => !exclude.has(norm(x.sentence)))
          .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.sentence || "";
      }

      function bestUndated(exclude = new Set()) {
        return dated
          .filter(x => !x.year)
          .filter(x => !exclude.has(norm(x.sentence)))
          .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.sentence || "";
      }

      /*
        Protect one meaningful late-career chapter. This is generic: it
        rewards a focused later sentence tied to a highly recognized film,
        a return/revival, major acclaim, or a major franchise milestone.
      */
      function bestLateMilestone(exclude = new Set()) {
        const lateStart = firstCareerYear + Math.round(span * 0.68);

        return dated
          .filter(x => x.year && x.year >= lateStart)
          .filter(x => !exclude.has(norm(x.sentence)))
          .map(x => {
            const hits = titleHits(x.sentence);
            const recognition = hits.reduce((best, movie) =>
              Math.max(best, movieRecognitionScore(movie)), 0);
            let bonus = 0;
            if (/\b(returned|return|revival|reprise|reprised|comeback|acclaim|acclaimed|nominated|won|academy award|oscar|golden globe|franchise)\b/i.test(x.sentence)) bonus += 8;
            if (hits.length >= 1 && hits.length <= 2) bonus += 5;
            bonus += Math.max(0, recognition) / 18;
            return { ...x, lateScore: x.score + bonus };
          })
          .sort((a, b) => b.lateScore - a.lateScore || b.year - a.year || a.index - b.index)[0]?.sentence || "";
      }

      const selected = [];
      const used = new Set();
      function add(sentence) {
        const text = ensurePeriod(cleanText(sentence));
        const key = norm(text);
        if (!text || !key || used.has(key)) return;
        used.add(key);
        selected.push(text);
      }

      add(intro);
      add(breakthrough);

      const early = bestForRange(firstCareerYear, earlyEnd, used);
      add(early);

      const mid = bestForRange(earlyEnd + 1, midEnd, used);
      add(mid);

      const late = bestForRange(midEnd + 1, latestCareerYear + 2, used);
      add(late);

      const lateMilestone = bestLateMilestone(used);
      add(lateMilestone);

      /* Fill gaps with the best source-supported career facts. */
      const ranked = [...dated].sort((a, b) => b.score - a.score || a.index - b.index);
      for (const item of ranked) {
        if (words(selected.join(" ")) >= 120) break;
        add(item.sentence);
      }
      if (words(selected.join(" ")) < 120) add(bestUndated(used));

      /*
        Edit to the 120–170 word window by removing the weakest
        nonessential sentences, while preserving identity and the
        breakthrough whenever one was supported.
      */
      const protectedKeys = new Set([
        norm(intro),
        norm(breakthrough),
        norm(lateMilestone)
      ].filter(Boolean));
      while (words(selected.join(" ")) > 170 && selected.length > 3) {
        let weakestIndex = -1;
        let weakestScore = Infinity;
        for (let i = 1; i < selected.length; i++) {
          if (protectedKeys.has(norm(selected[i]))) continue;
          const score = scoreSentence(selected[i]);
          if (score < weakestScore) {
            weakestScore = score;
            weakestIndex = i;
          }
        }
        if (weakestIndex < 0) break;
        selected.splice(weakestIndex, 1);
      }

      /* Keep the narrative chronological after the opening. */
      const opening = selected[0];
      const rest = selected.slice(1).map((sentence, index) => ({
        sentence,
        index,
        years: yearsIn(sentence)
      }));
      rest.sort((a, b) => {
        const ay = a.years.length ? Math.min(...a.years) : 9999;
        const by = b.years.length ? Math.min(...b.years) : 9999;
        return ay - by || a.index - b.index;
      });

      let story = [opening, ...rest.map(x => x.sentence)].filter(Boolean).join(" ");

      /* Never return an unbounded encyclopedia dump. */
      if (words(story) > 185) {
        story = selected.slice(0, 4).join(" ");
      }

      if (words(story) >= 70) return story;

      const fallback = summarySentences
        .filter(Boolean)
        .slice(0, 4)
        .map(ensurePeriod)
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

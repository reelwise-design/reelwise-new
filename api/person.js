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
      const cleaned = cleanText(text);

      if (!cleaned) {
        return [];
      }

      return (
        cleaned.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || []
      )
        .map(sentence => cleanText(sentence))
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
      const name =
        person?.name || "This performer";

      const timeline =
        buildCareerTimeline(credits);

      const fullWikipedia =
        cleanText(
          wikipediaExtract ||
          wikipediaSummary ||
          ""
        );

      const breakthrough =
        findBreakthroughSentence(
          fullWikipedia,
          name
        );

      const careerSentences =
        usefulCareerSentences(
          fullWikipedia,
          name
        );

      const summarySentences =
        sentenceSplit(
          wikipediaSummary ||
          cleanText(
            person?.biography || ""
          )
        );

      /*
        REELWISE BIOGRAPHY V3
        ---------------------
        Wikipedia decides career importance.
        TMDB supplies credits/dates only.

        We intentionally do NOT use TMDB popularity, vote count,
        or current trending behavior to decide which films define
        a person's career. That caused later supporting appearances
        to outrank genuinely defining roles.
      */

      const selected = [];
      const seen = new Set();

      function keyOf(value = "") {
        return cleanText(value)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      }

      function add(sentence) {
        const value = cleanText(sentence);
        if (!value) return;

        const key = keyOf(value);
        if (!key || seen.has(key)) return;

        seen.add(key);
        selected.push(
          ensurePeriod(value)
        );
      }

      /*
        Count titles using the COMPLETE movie credit list rather
        than only TMDB's popularity-ranked "notable" subset.
        This lets Wikipedia references to older defining films such
        as Rocky, First Blood, etc. be recognized correctly.
      */

      const allMovies =
        validMovieCredits(credits);

      function titlesMentioned(sentence = "") {
        return allMovies.filter(movie =>
          sentenceMentionsTitle(
            sentence,
            movie.title
          )
        );
      }

      function titleCount(sentence = "") {
        return titlesMentioned(sentence)
          .length;
      }

      function isResumeList(sentence = "") {
        return titleCount(sentence) >= 4;
      }

      /*
        OPENING
        Keep this short and descriptive.
      */

      const intro =
        summarySentences.find(
          sentence =>
            sentence.length >= 35 &&
            sentence.length <= 240 &&
            !isResumeList(sentence)
        ) ||
        summarySentences[0] ||
        "";

      if (intro) {
        add(intro);
      }

      /*
        BREAKTHROUGH
        This remains source-supported only.
      */

      if (breakthrough) {
        add(breakthrough);
      }

      /*
        CAREER IMPORTANCE FROM WIKIPEDIA

        Score source sentences by career-significance LANGUAGE,
        not TMDB popularity. Earlier defining-role language gets
        priority, as do sentences about signature characters,
        breakthrough, acclaim, awards, writing/directing, franchises,
        and major career recognition.
      */

      const scored =
        careerSentences
          .filter(sentence => {
            const key = keyOf(sentence);

            if (
              intro &&
              key === keyOf(intro)
            ) {
              return false;
            }

            if (
              breakthrough &&
              key === keyOf(breakthrough)
            ) {
              return false;
            }

            return !isResumeList(sentence);
          })
          .map((sentence, index) => {
            let score = 0;

            const films =
              titlesMentioned(sentence);

            const yearMatch =
              sentence.match(
                /\b(19|20)\d{2}\b/
              );

            const year =
              yearMatch
                ? Number(yearMatch[0])
                : null;

            if (
              /\b(breakthrough|breakout|rose to prominence|came to prominence|gained (?:wider |wide |international )?(?:recognition|attention)|became widely known)\b/i
                .test(sentence)
            ) {
              score += 20;
            }

            if (
              /\b(signature|iconic|best known|known for|defining|most famous|most notable|star-making|career-defining)\b/i
                .test(sentence)
            ) {
              score += 15;
            }

            if (
              /\b(created|wrote|screenplay|writer|directed|director|produced|producer)\b/i
                .test(sentence)
            ) {
              score += 8;
            }

            if (
              /\b(academy award|oscar|golden globe|bafta|emmy|award|nominated|nomination|won|acclaim|acclaimed|critical acclaim)\b/i
                .test(sentence)
            ) {
              score += 8;
            }

            if (
              /\b(franchise|series|sequel|character|role|performance|portrayed|played|starred)\b/i
                .test(sentence)
            ) {
              score += 5;
            }

            /*
              One or two films usually makes a focused story
              sentence. Three is acceptable; four+ was filtered.
            */
            if (films.length === 1) {
              score += 6;
            } else if (films.length === 2) {
              score += 5;
            } else if (films.length === 3) {
              score += 2;
            }

            /*
              When significance language is otherwise comparable,
              give a modest advantage to earlier career-defining
              material. This prevents a recent cameo/supporting role
              from displacing the foundation of a long career.
            */
            if (year) {
              if (year < 1990) {
                score += 4;
              } else if (year < 2005) {
                score += 3;
              } else if (year < 2015) {
                score += 2;
              } else {
                score += 1;
              }
            }

            /*
              Wikipedia's own narrative order is meaningful.
              Earlier relevant sentences get a small tie-breaker.
            */
            score +=
              Math.max(
                0,
                4 - Math.floor(index / 5)
              );

            return {
              sentence,
              score,
              index
            };
          })
          .sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score;
            }

            return a.index - b.index;
          });

      /*
        Choose the strongest early/mid-career source material first.

        IMPORTANT:
        Stop at three total biography sentences here. Sentence #4
        is reserved for a meaningful later-career milestone.
      */

      for (const item of scored) {
        if (selected.length >= 3) {
          break;
        }

        if (item.score < 6) {
          continue;
        }

        add(item.sentence);
      }

      /*
        If we still have fewer than three sentences, use Wikipedia
        narrative order as the fallback — NOT TMDB popularity.
      */

      if (selected.length < 3) {
        for (
          const sentence of careerSentences
        ) {
          if (selected.length >= 3) {
            break;
          }

          if (isResumeList(sentence)) {
            continue;
          }

          add(sentence);
        }
      }

      /*
        LATER-CAREER MILESTONE — STRUCTURED, NOT COPIED

        Do not copy an entire Wikipedia sentence here. Source
        sentences often combine a meaningful milestone with several
        unrelated later credits. Instead:

        1. Find a later-career source sentence with strong milestone
           language.
        2. Identify the ONE movie in that sentence most directly tied
           to the milestone.
        3. Build a short factual sentence from the supported facts.
        4. Never append unrelated titles from the source sentence.
      */

      if (selected.length === 3) {
        const currentYear =
          new Date().getFullYear();

        function movieYear(movie) {
          return yearFromDate(
            movie?.release_date || ""
          );
        }

        function sourceHasAwardLanguage(
          sentence = ""
        ) {
          return /\b(academy award|oscar|golden globe|bafta|emmy|award|nominated|nomination|won|acclaim|acclaimed|critical acclaim)\b/i
            .test(sentence);
        }

        function sourceHasReturnLanguage(
          sentence = ""
        ) {
          return /\b(returned|return|reprised|reprise|revival|comeback|reunited|again)\b/i
            .test(sentence);
        }

        function sourceHasCreativeLanguage(
          sentence = ""
        ) {
          return /\b(created|wrote|screenplay|writer|directed|director|produced|producer)\b/i
            .test(sentence);
        }

        function sourceHasFranchiseLanguage(
          sentence = ""
        ) {
          return /\b(franchise|series|sequel|legacy)\b/i
            .test(sentence);
        }

        const laterMilestones =
          careerSentences
            .map((sentence, index) => {
              const movies =
                titlesMentioned(sentence)
                  .map(movie => ({
                    ...movie,
                    _year:
                      movieYear(movie)
                  }))
                  .filter(
                    movie =>
                      movie._year &&
                      movie._year <=
                        currentYear
                  );

              if (!movies.length) {
                return null;
              }

              /*
                The milestone film should be a later-career film.
                Prefer the earliest title in the source sentence
                that belongs to the later phase of the career,
                because source sentences often begin with the
                meaningful event and then list unrelated projects.
              */

              const careerStart =
                timeline.firstYear ||
                movies[0]._year;

              const careerSpan =
                Math.max(
                  1,
                  currentYear -
                    careerStart
                );

              const laterThreshold =
                Math.max(
                  careerStart + 15,
                  Math.floor(
                    careerStart +
                    careerSpan * 0.55
                  )
                );

              const laterMovies =
                movies
                  .filter(
                    movie =>
                      movie._year >=
                        laterThreshold
                  )
                  .sort(
                    (a, b) =>
                      a._year - b._year
                  );

              if (!laterMovies.length) {
                return null;
              }

              const milestoneMovie =
                laterMovies[0];

              let score = 0;

              const hasAwards =
                sourceHasAwardLanguage(
                  sentence
                );

              const hasReturn =
                sourceHasReturnLanguage(
                  sentence
                );

              const hasCreative =
                sourceHasCreativeLanguage(
                  sentence
                );

              const hasFranchise =
                sourceHasFranchiseLanguage(
                  sentence
                );

              if (hasReturn) {
                score += 14;
              }

              if (hasAwards) {
                score += 12;
              }

              if (hasFranchise) {
                score += 8;
              }

              if (hasCreative) {
                score += 6;
              }

              if (
                /\b(role|performance|portrayed|played|starred)\b/i
                  .test(sentence)
              ) {
                score += 4;
              }

              /*
                Later dates help, but cannot by themselves turn
                an incidental recent credit into a milestone.
              */
              if (
                milestoneMovie._year >=
                  currentYear - 15
              ) {
                score += 4;
              } else if (
                milestoneMovie._year >=
                  currentYear - 25
              ) {
                score += 3;
              } else {
                score += 1;
              }

              /*
                Require real milestone evidence. A sentence that
                merely says "starred in..." is not enough.
              */
              const meaningful =
                hasReturn ||
                hasAwards ||
                hasFranchise ||
                hasCreative;

              if (!meaningful) {
                return null;
              }

              return {
                sentence,
                index,
                score,
                movie:
                  milestoneMovie,
                hasAwards,
                hasReturn,
                hasCreative,
                hasFranchise
              };
            })
            .filter(Boolean)
            .sort((a, b) => {
              if (b.score !== a.score) {
                return b.score - a.score;
              }

              if (
                b.movie._year !==
                a.movie._year
              ) {
                return (
                  b.movie._year -
                  a.movie._year
                );
              }

              return b.index - a.index;
            });

        if (laterMilestones.length) {
          const milestone =
            laterMilestones[0];

          const title =
            milestone.movie.title;

          const year =
            milestone.movie._year;

          let sentence = "";

          /*
            Build ONE human-sounding, source-grounded sentence.

            Do not use vague phrases such as "an important new
            chapter" or "extending a major franchise." Explain the
            supported event itself: return, revival, recognition,
            or creative involvement.

            We can safely describe elapsed time when the source
            connects the later film to a previously established
            role/franchise and the dates are present in the credits.
          */

          const priorSelectedText =
            selected.join(" ");

          const priorMovies =
            allMovies
              .map(movie => ({
                ...movie,
                _year:
                  movieYear(movie)
              }))
              .filter(movie =>
                movie._year &&
                movie._year < year &&
                sentenceMentionsTitle(
                  priorSelectedText,
                  movie.title
                )
              )
              .sort(
                (a, b) =>
                  a._year - b._year
              );

          const earliestPrior =
            priorMovies[0] || null;

          const yearsSince =
            earliestPrior
              ? year - earliestPrior._year
              : null;

          const source =
            milestone.sentence;

          /*
            If the source explicitly describes a return/reprise,
            preserve that meaning and, when possible, give the
            reader useful time perspective.
          */

          if (milestone.hasReturn) {
            if (
              yearsSince &&
              yearsSince >= 10
            ) {
              const rounded =
                yearsSince >= 25
                  ? Math.round(
                      yearsSince / 5
                    ) * 5
                  : yearsSince;

              const spanText =
                rounded >= 25
                  ? `Nearly ${rounded} years after an earlier defining role`
                  : `${rounded} years after an earlier defining role`;

              sentence =
                `${spanText}, ${name} returned in ${title} (${year})`;

              if (milestone.hasAwards) {
                sentence +=
                  `, earning renewed critical and awards recognition`;
              } else if (
                milestone.hasFranchise
              ) {
                sentence +=
                  `, reviving a major screen franchise`;
              }
            } else {
              sentence =
                `${name} later returned in ${title} (${year})`;

              if (milestone.hasAwards) {
                sentence +=
                  `, earning renewed critical and awards recognition`;
              } else if (
                milestone.hasFranchise
              ) {
                sentence +=
                  `, reviving a major screen franchise`;
              }
            }
          } else if (
            milestone.hasAwards
          ) {
            sentence =
              `${title} (${year}) became a later-career milestone for ${name}, bringing renewed critical and awards recognition`;
          } else if (
            milestone.hasCreative &&
            milestone.hasFranchise
          ) {
            sentence =
              `${name} continued shaping a major screen franchise with ${title} (${year}), contributing both on screen and behind the scenes`;
          } else if (
            milestone.hasCreative
          ) {
            sentence =
              `${name}'s later work on ${title} (${year}) also reflected continued creative involvement behind the scenes`;
          } else if (
            milestone.hasFranchise
          ) {
            /*
              A franchise reference alone is not enough to justify
              a generic importance claim. Use a simple factual
              sentence rather than inventing significance.
            */
            sentence =
              `${name} later appeared in ${title} (${year}), continuing a long-running screen franchise`;
          }

          /*
            If the constructed sentence is still generic and the
            source contains explicit revival/comeback language,
            use that supported wording instead.
          */

          if (
            sentence &&
            /\b(revival|revived|comeback)\b/i
              .test(source) &&
            !/\b(revival|revived|comeback)\b/i
              .test(sentence)
          ) {
            sentence =
              `${name}'s later career included a revival with ${title} (${year})`;
          }

          if (sentence) {
            add(sentence);
          }
        }
      }

      /*
        Last resort:
        use the earliest actual film credits chronologically.
        This is intentionally chronology-based rather than
        popularity-based and is only used when Wikipedia is sparse.
      */

      if (
        selected.length < 3 &&
        allMovies.length
      ) {
        const chronological =
          [...allMovies]
            .map(movie => ({
              ...movie,
              year:
                yearFromDate(
                  movie.release_date
                )
            }))
            .filter(movie => movie.year)
            .sort(
              (a, b) =>
                a.year - b.year
            )
            .slice(0, 2);

        if (chronological.length) {
          const titleText =
            chronological
              .map(movie => movie.title)
              .join(" and ");

          add(
            `${name}'s early film work included ${titleText}`
          );
        }
      }

      /*
        Final mobile profile: four complete sentences maximum.
      */

      const story =
        selected
          .slice(0, 4)
          .join(" ");

      if (story.length >= 110) {
        return story;
      }

      const fallback =
        summarySentences
          .filter(Boolean)
          .slice(0, 3)
          .map(ensurePeriod)
          .join(" ");

      return (
        fallback ||
        story ||
        `${name} is a film actor and filmmaker.`
      );
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

    async function getWikidataAwardsAndAccolades(
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
       WIKIPEDIA ACADEMY AWARDS FALLBACK
       ============================================================

       Why this exists:
       Some serverless environments can fail to retrieve the Academy
       search endpoint even when the Academy site works in a browser.
       Wikipedia's awards tables provide a second dynamic source for
       Oscar history instead of incorrectly displaying zero nominations.
       ============================================================ */

    function decodeBasicHTML(value = "") {
      return cleanText(
        decodeAcademyHTML(
          String(value)
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<[^>]+>/g, " ")
        )
      );
    }

    async function findWikipediaAwardsPage(name = "") {
      try {
        const exactTitle =
          `List of awards and nominations received by ${cleanText(name)}`;

        const exactUrl =
          "https://en.wikipedia.org/w/api.php?" +
          new URLSearchParams({
            action: "query",
            titles: exactTitle,
            prop: "info",
            format: "json",
            origin: "*"
          });

        const exactData = await fetchJSON(exactUrl);
        const exactPages = Object.values(exactData?.query?.pages || {});
        const exactPage = exactPages.find(page => page && !page.missing);

        if (exactPage?.title) {
          return exactPage.title;
        }

        const searchUrl =
          "https://en.wikipedia.org/w/api.php?" +
          new URLSearchParams({
            action: "query",
            list: "search",
            srsearch: `"${cleanText(name)}" "Academy Awards" awards nominations`,
            srlimit: "8",
            format: "json",
            origin: "*"
          });

        const searchData = await fetchJSON(searchUrl);
        const results = searchData?.query?.search || [];

        const best = results.find(item =>
          /awards and nominations/i.test(item.title || "") &&
          String(item.title || "").toLowerCase().includes(
            cleanText(name).toLowerCase()
          )
        );

        return best?.title || "";
      } catch (error) {
        console.error("Wikipedia awards page lookup error:", error);
        return "";
      }
    }

    function parseWikipediaOscarTable(html = "") {
      const source = String(html);
      if (!source) return [];

      const academyHeading =
        /<h[2-4][^>]*>[\s\S]*?Academy Awards[\s\S]*?<\/h[2-4]>/i.exec(source);

      if (!academyHeading) return [];

      const start = academyHeading.index + academyHeading[0].length;
      const tail = source.slice(start);

      const nextHeading = /<h[2-4][^>]*>/i.exec(tail);
      const section = nextHeading ? tail.slice(0, nextHeading.index) : tail;

      const tableMatch = /<table\b[\s\S]*?<\/table>/i.exec(section);
      if (!tableMatch) return [];

      const table = tableMatch[0];
      const rowMatches = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
      if (!rowMatches.length) return [];

      let lastYear = "";
      let lastCategory = "";
      const history = [];

      for (const rowMatch of rowMatches) {
        const row = rowMatch[1];

        const cells = [...row.matchAll(
          /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi
        )].map(match => ({
          tag: match[1].toLowerCase(),
          attrs: match[2] || "",
          text: decodeBasicHTML(match[3] || "")
        })).filter(cell => cell.text);

        if (!cells.length) continue;

        const joined = cells.map(cell => cell.text).join(" | ");

        if (
          /year\s*\|\s*category/i.test(joined) ||
          /nominated work/i.test(joined) ||
          /^year$/i.test(joined)
        ) {
          continue;
        }

        let year = "";
        let category = "";
        let movie = "";
        let result = "";

        for (const cell of cells) {
          const text = cell.text;

          if (!year && /^(19|20)\d{2}$/.test(text)) {
            year = text;
            continue;
          }

          if (
            !category &&
            /^(best|academy honorary award|honorary award)/i.test(text)
          ) {
            category = text;
            continue;
          }

          if (!result && /^(won|winner|nominated|nominee)$/i.test(text)) {
            result = text;
            continue;
          }
        }

        if (year) lastYear = year;
        if (category) lastCategory = category;

        year = year || lastYear;
        category = category || lastCategory;

        const ignored = new Set(
          [year, category, result].filter(Boolean).map(v => v.toLowerCase())
        );

        const candidates = cells
          .map(cell => cell.text)
          .filter(text => {
            const lower = text.toLowerCase();
            return (
              text &&
              !ignored.has(lower) &&
              !/^(ref\.?|received by)$/i.test(text) &&
              !/^\[\d+\]$/.test(text)
            );
          });

        movie = candidates[0] || "";

        if (!year || !category || !movie) continue;

        const winner = /^(won|winner)$/i.test(result);

        history.push({
          year: String(year),
          movie,
          category: cleanText(category),
          winner
        });
      }

      return dedupeAwardHistory(history).sort(
        (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0)
      );
    }

    async function getWikipediaAcademyAwards(name = "") {
      try {
        const title = await findWikipediaAwardsPage(name);
        if (!title) return null;

        const url =
          "https://en.wikipedia.org/w/api.php?" +
          new URLSearchParams({
            action: "parse",
            page: title,
            prop: "text",
            format: "json",
            origin: "*"
          });

        const data = await fetchJSON(url);
        const html = data?.parse?.text?.["*"] || "";
        const history = parseWikipediaOscarTable(html);

        if (!history.length) return null;

        const wins = history.filter(item => item.winner).length;
        const nominations = history.length;

        const academyAwards = history.map(item => ({
          award: item.category,
          result: item.winner ? "Winner" : "Nominee",
          year: item.year,
          work: item.movie,
          ceremony: ""
        }));

        return {
          found: true,
          wins,
          nominations,
          history,
          academy_awards: academyAwards,
          academyAwards,
          accolades: academyAwards,
          source: "Wikipedia Academy Awards table"
        };
      } catch (error) {
        console.error("Wikipedia Academy Awards lookup error:", error);
        return null;
      }
    }


    /* ============================================================
       OFFICIAL ACADEMY AWARDS DATABASE
       ============================================================

       Primary Oscar source:
       Academy of Motion Picture Arts and Sciences official database.

       Wikidata remains available as a fallback if the Academy
       database is temporarily unavailable or its response format
       changes.
       ============================================================ */

    function decodeAcademyHTML(value = "") {
      return String(value)
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#(\d+);/g, (_, code) =>
          String.fromCharCode(
            Number(code)
          )
        );
    }

    function academyHTMLToLines(
      html = ""
    ) {
      let value = String(html);

      /*
        Preserve image ALT text because the Academy results use
        an Oscar statuette marker to identify winning entries.
      */

      value = value
        .replace(
          /<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi,
          "\n[$1]\n"
        )
        .replace(
          /<img\b[^>]*\btitle=["']([^"']*)["'][^>]*>/gi,
          "\n[$1]\n"
        );

      value = value
        .replace(
          /<(?:br|\/p|\/div|\/li|\/tr|\/td|\/th|\/a|\/h\d)>/gi,
          "\n"
        )
        .replace(
          /<script\b[\s\S]*?<\/script>/gi,
          ""
        )
        .replace(
          /<style\b[\s\S]*?<\/style>/gi,
          ""
        )
        .replace(
          /<[^>]+>/g,
          "\n"
        );

      value =
        decodeAcademyHTML(value);

      return value
        .split(/\n+/)
        .map(line =>
          cleanText(line)
        )
        .filter(Boolean);
    }

    function formatOfficialOscarCategory(
      category = ""
    ) {
      const raw =
        cleanText(category)
          .toUpperCase();

      const exact = {
        "ACTOR IN A LEADING ROLE":
          "Best Actor",
        "ACTRESS IN A LEADING ROLE":
          "Best Actress",
        "ACTOR IN A SUPPORTING ROLE":
          "Best Supporting Actor",
        "ACTRESS IN A SUPPORTING ROLE":
          "Best Supporting Actress",
        "DIRECTING":
          "Best Director",
        "BEST PICTURE":
          "Best Picture",
        "WRITING (ADAPTED SCREENPLAY)":
          "Best Adapted Screenplay",
        "WRITING (ORIGINAL SCREENPLAY)":
          "Best Original Screenplay",
        "WRITING (SCREENPLAY—ADAPTED)":
          "Best Adapted Screenplay",
        "WRITING (SCREENPLAY—ORIGINAL)":
          "Best Original Screenplay"
      };

      if (exact[raw]) {
        return exact[raw];
      }

      return raw
        .toLowerCase()
        .replace(
          /\b\w/g,
          char =>
            char.toUpperCase()
        );
    }

    function isOfficialOscarCategoryLine(
      value = ""
    ) {
      const line =
        cleanText(value)
          .toUpperCase();

      if (!line) {
        return false;
      }

      return (
        /^(ACTOR|ACTRESS)(?: IN A (LEADING|SUPPORTING) ROLE)?$/.test(
          line
        ) ||
        /^(DIRECTING|BEST PICTURE)$/.test(
          line
        ) ||
        /^WRITING\b/.test(
          line
        ) ||
        /^(MUSIC|CINEMATOGRAPHY|FILM EDITING|DOCUMENTARY|ANIMATED|SHORT FILM|SOUND|VISUAL EFFECTS|COSTUME DESIGN|MAKEUP|PRODUCTION DESIGN)\b/.test(
          line
        )
      );
    }

    function parseOfficialAcademyResults(
      html = "",
      requestedName = ""
    ) {
      const lines =
        academyHTMLToLines(html);

      if (!lines.length) {
        return [];
      }

      const history = [];

      const yearPattern =
        /^(\d{4})\s+\(\d+(?:st|nd|rd|th)\)$/i;

      for (
        let i = 0;
        i < lines.length;
        i++
      ) {
        const yearMatch =
          lines[i].match(
            yearPattern
          );

        if (!yearMatch) {
          continue;
        }

        const year =
          yearMatch[1];

        let nextYearIndex =
          lines.length;

        for (
          let j = i + 1;
          j < lines.length;
          j++
        ) {
          if (
            yearPattern.test(
              lines[j]
            )
          ) {
            nextYearIndex = j;
            break;
          }
        }

        const block =
          lines.slice(
            i,
            nextYearIndex
          );

        const categoryIndex =
          block.findIndex(
            line =>
              isOfficialOscarCategoryLine(
                line
              )
          );

        if (categoryIndex < 0) {
          continue;
        }

        const category =
          formatOfficialOscarCategory(
            block[categoryIndex]
          );

        /*
          Academy nominee display places "--" between category and
          film title. Use it when available. If markup changes,
          fall back to the first plausible title after the category.
        */

        let movie = "";

        const separatorIndex =
          block.findIndex(
            (line, index) =>
              index >
                categoryIndex &&
              line === "--"
          );

        if (
          separatorIndex >= 0 &&
          block[
            separatorIndex + 1
          ]
        ) {
          movie =
            block[
              separatorIndex + 1
            ];
        } else {
          for (
            let j =
              categoryIndex + 1;
            j < block.length;
            j++
          ) {
            const candidate =
              block[j];

            if (
              !candidate ||
              candidate === "--" ||
              candidate ===
                requestedName ||
              /^\{.*\}$/.test(
                candidate
              ) ||
              /^\[.*\]$/.test(
                candidate
              )
            ) {
              continue;
            }

            movie = candidate;
            break;
          }
        }

        if (!movie) {
          continue;
        }

        const winner =
          block.some(line =>
            /\b(statuette|winner|won)\b/i
              .test(line)
          );

        history.push({
          year,
          movie,
          category,
          winner
        });

        i =
          nextYearIndex - 1;
      }

      return dedupeAwardHistory(
        history
      ).sort(
        (a, b) =>
          (Number(b.year) || 0) -
          (Number(a.year) || 0)
      );
    }

    async function getOfficialAcademyAwards(
      name = ""
    ) {
      try {
        const cleanName =
          cleanText(name);

        if (!cleanName) {
          return null;
        }

        const query = {
          Nominee:
            cleanName.toLowerCase(),
          Sort:
            "1-Nominee-Alpha",
          AwardShowNumberFrom: 0,
          AwardShowNumberTo: 0,
          Search: 30
        };

        const url =
          "https://awardsdatabase.oscars.org/search/getresults?query=" +
          encodeURIComponent(
            JSON.stringify(query)
          );

        const response =
          await fetch(url, {
            headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language":
                "en-US,en;q=0.9",
              "Cache-Control":
                "no-cache",
              "User-Agent":
                "Mozilla/5.0 (compatible; Reelwise/1.0)"
            }
          });

        if (!response.ok) {
          return null;
        }

        const html =
          await response.text();

        /*
          Do not require a specific Academy page heading here.
          The Academy can change surrounding HTML while the actual
          nomination records remain valid. The parser itself determines
          whether usable Oscar records were returned.
        */

        if (!html) {
          return null;
        }

        const history =
          parseOfficialAcademyResults(
            html,
            cleanName
          );

        if (!history.length) {
          return null;
        }

        const wins =
          history.filter(
            item => item.winner
          ).length;

        const nominations =
          history.length;

        const academyAwards =
          history.map(item => ({
            award:
              item.category,
            result:
              item.winner
                ? "Winner"
                : "Nominee",
            year:
              item.year,
            work:
              item.movie,
            ceremony: ""
          }));

        return {
          found: true,
          wins,
          nominations,
          history,
          academy_awards:
            academyAwards,
          academyAwards,
          accolades:
            academyAwards,
          source:
            "Academy of Motion Picture Arts and Sciences"
        };

      } catch (error) {
        console.error(
          "Official Academy Awards lookup error:",
          error
        );

        return null;
      }
    }


    /* ============================================================
       ACADEMY AWARDS / ACCOLADES — PRIMARY + FALLBACK
       ============================================================ */

    async function getAwardsAndAccolades(
      name,
      knownWikidataId = ""
    ) {
      /*
        1. Official Academy database first.
        2. Existing Wikidata engine only if official lookup fails.

        IMPORTANT:
        A failed network request is not treated as proof that the
        performer has zero nominations.
      */

      const official =
        await getOfficialAcademyAwards(
          name
        );

      if (
        official &&
        official.found &&
        official.history.length
      ) {
        return official;
      }

      /*
        If the Academy endpoint is unavailable from Vercel, use the
        performer's Wikipedia Academy Awards table. This is especially
        important for highly nominated performers whose Wikidata records
        can be large or incomplete when resolved through many claims.
      */

      const wikipediaAwards =
        await getWikipediaAcademyAwards(
          name
        );

      if (
        wikipediaAwards &&
        wikipediaAwards.found &&
        wikipediaAwards.history.length
      ) {
        return wikipediaAwards;
      }

      return (
        await getWikidataAwardsAndAccolades(
          name,
          knownWikidataId
        )
      );
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
                awardsData.accolades,

              source:
                awardsData.source || "Wikidata"
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

        let biography =
          buildReelwiseBiography({
            person,
            credits,
            wikipediaSummary,
            wikipediaExtract
          });

        /*
          REELWISE BIO QUALITY GUARD:
          never publish the weak random-credit fallback.
        */
        if (/\bearly film work included\b/i.test(String(biography || ""))) {
          biography =
            cleanText(wikipediaSummary || "") ||
            cleanText(wikipediaExtract || "") ||
            cleanText(person.biography || "") ||
            `${person.name} is a film actor and filmmaker.`;
        }

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

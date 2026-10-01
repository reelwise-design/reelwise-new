            const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

                    const TMDB_BASE = "https://api.themoviedb.org/3";
                    const OSCARBASE_BASE = "https://api.oscarbase.com/api";

                    /*
                      ============================================================
                      REELWISE PERSON API
                      ============================================================

                      NORMAL MODE:
                        /api/person?id=31

                        - Loads the TMDB person profile
                        - Loads combined credits
                        - Uses Wikipedia biography when it is a stronger usable biography
                        - Preserves the response shape expected by the current Reelwise index

                      ACCOLADES MODE:
                        /api/person?id=31&mode=accolades

                        - Resolves the TMDB person first so the awards search uses the
                          correct person's name
                        - Loads Academy Award nomination history from OscarBase
                        - Returns the exact three-state contract expected by index.html:
                            confirmed: true  = the awards lookup completed successfully
                            found: true      = one or more Academy nominations were found
                            history: []      = legitimate zero-nomination result when confirmed
                        - Also exposes academy_awards / academyAwards / accolades aliases
                          for backward compatibility with the current Reelwise renderer

                      ============================================================
                    */


                    /* ============================================================
                       RESPONSE HELPERS
                       ============================================================ */

                    function setHeaders(res) {
                      res.setHeader("Content-Type", "application/json; charset=utf-8");
                      res.setHeader("Cache-Control", "no-store, max-age=0");
                    }

                    function sendJSON(res, status, payload) {
                      setHeaders(res);
                      return res.status(status).json(payload);
                    }


                    /* ============================================================
                       TEXT HELPERS
                       ============================================================ */

                    function cleanText(value) {
                      return String(value || "")
                        .replace(/<[^>]*>/g, " ")
                        .replace(/&nbsp;/gi, " ")
                        .replace(/&amp;/gi, "&")
                        .replace(/&quot;/gi, '"')
                        .replace(/&#39;/gi, "'")
                        .replace(/&apos;/gi, "'")
                        // Decode decimal and hexadecimal numeric HTML entities such as &#32; or &#x20;.
                        .replace(/&#(\d+);/g, (_, n) => {
                          const code = Number(n);
                          return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
                        })
                        .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
                          const code = parseInt(n, 16);
                          return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
                        })
                        .replace(/\s+/g, " ")
                        .trim();
                    }

                    function removeWikipediaEnding(value) {
                      let text = cleanText(value);

                      /*
                        Wikipedia summaries occasionally end with short meta-style
                        sentences that do not help the Reelwise profile. Keep this
                        deliberately conservative so we do not cut real biography text.
                      */
                      text = text
                        .replace(/\s+For other people with (?:the same|a similar) name.*$/i, "")
                        .replace(/\s+For other uses, see .*$/i, "")
                        .trim();

                      return text;
                    }

                    function normalizeName(value) {
                      return String(value || "")
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/[’‘`]/g, "'")
                        .replace(/[^a-z0-9' -]/g, " ")
                        .replace(/\s+/g, " ")
                        .trim();
                    }


                    /* ============================================================
                       FETCH HELPERS
                       ============================================================ */

                    async function fetchJSON(url, options = {}, timeoutMs = 9000) {
                      const controller = new AbortController();
                      const timer = setTimeout(() => controller.abort(), timeoutMs);

                      try {
                        const response = await fetch(url, {
                          ...options,
                          signal: controller.signal,
                          headers: {
                            Accept: "application/json",
                            "User-Agent": "Reelwise/1.0",
                            ...(options.headers || {})
                          }
                        });

                        const raw = await response.text();

                        let data = {};
                        if (raw) {
                          try {
                            data = JSON.parse(raw);
                          } catch (error) {
                            throw new Error("The external service returned an unreadable response.");
                          }
                        }

                        if (!response.ok) {
                          const message =
                            data?.status_message ||
                            data?.error ||
                            data?.message ||
                            `Request failed with status ${response.status}.`;

                          const error = new Error(message);
                          error.status = response.status;
                          throw error;
                        }

                        return data;
                      } finally {
                        clearTimeout(timer);
                      }
                    }

                    function tmdbHeaders() {
                      if (!TOKEN) {
                        throw new Error("TMDB_READ_ACCESS_TOKEN is not configured.");
                      }

                      return {
                        Authorization: `Bearer ${TOKEN}`
                      };
                    }

                    async function fetchTMDB(path, params = {}) {
                      const url = new URL(TMDB_BASE + path);

                      for (const [key, value] of Object.entries(params)) {
                        if (value !== undefined && value !== null && value !== "") {
                          url.searchParams.set(key, String(value));
                        }
                      }

                      return fetchJSON(url.toString(), {
                        headers: tmdbHeaders()
                      });
                    }


                    /* ============================================================
                       WIKIPEDIA BIOGRAPHY
                       ============================================================ */

                    async function getWikipediaBiography(name) {
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
                          return "";
                        }

                        const exactMatch = results.find(
                          item =>
                            item.title &&
                            item.title.toLowerCase() === String(name).toLowerCase()
                        );

                        const pageTitle =
                          exactMatch?.title ||
                          results[0]?.title;

                        if (!pageTitle) {
                          return "";
                        }

                        const summaryUrl =
                          "https://en.wikipedia.org/api/rest_v1/page/summary/" +
                          encodeURIComponent(pageTitle);

                        const summaryData = await fetchJSON(summaryUrl);

                        let bio = cleanText(summaryData?.extract || "");

                        bio = removeWikipediaEnding(bio);

                        if (
                          summaryData?.type === "disambiguation" ||
                          bio.length < 80
                        ) {
                          return "";
                        }

                        return bio;

                      } catch (error) {
                        console.error(
                          "Wikipedia biography error:",
                          error
                        );

                        return "";
                      }
                    }


                    /* ============================================================
                       NORMAL PERSON PROFILE
                       ============================================================ */

                    function splitBioSentences(value) {
                      return cleanText(value)
                        .match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) || [];
                    }

                    function cleanBiographySource(value, personName = "") {
                      let text = cleanText(value);

                      /*
                        Remove Wikipedia navigation / hatnote language that can leak into
                        parsed article text. Keep this separate from awards logic.
                      */
                      text = text
                        .replace(/^.*?For other people named\s+[^.]+(?:disambiguation)?\.?\s*/i, "")
                        .replace(/^.*?For other people with (?:the same|a similar) name[^.]*\.\s*/i, "")
                        .replace(/^.*?For other uses, see[^.]*\.\s*/i, "")
                        .replace(/\bFor other people named\s+[^.]+(?:disambiguation)?\.?\s*/gi, "")
                        .replace(/\bFor other people with (?:the same|a similar) name[^.]*\.\s*/gi, "")
                        .replace(/\bFor other uses, see[^.]*\.\s*/gi, "")
                        // Remove Wikipedia navigation text such as:
                        // "edit Main article: Tobey Maguire filmography"
                        .replace(/\b(?:edit\s*)?Main article:\s*[^.!?]+(?:filmography|career|works|roles)\b[.!?]?/gi, " ")
                        .replace(/\bedit\s+(?=(?:Main article|Filmography|Career)\b)/gi, " ")
                        .replace(/\bedit\s+(?=[A-Z][a-z])/g, " ")
                        .replace(/\s+/g, " ")
                        .trim();

                      /*
                        Wikipedia sometimes leaves a fragment such as
                        "American actor (born 1969)" before the real biography.
                      */
                      text = text.replace(
                        /^(?:American|British|Canadian|Australian|Irish|French|Italian|German|Spanish)?\s*(?:actor|actress|filmmaker|director|comedian|performer)\s*\(born\s+\d{4}\)\s*/i,
                        ""
                      );

                      return text.trim();
                    }

                    function stripWikiMarkup(value) {
                      return String(value || "")
                        .replace(/<!--[\s\S]*?-->/g, " ")
                        .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, " ")
                        .replace(/<ref\b[^>]*\/>/gi, " ")
                        .replace(/\{\{[\s\S]*?\}\}/g, " ")
                        .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
                        .replace(/''+/g, "")
                        .replace(/={2,}[^=]+={2,}/g, " ")
                        .replace(/\s+/g, " ")
                        .trim();
                    }

                    async function getWikipediaCareerText(name) {
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

                        if (!results.length) return "";

                        const exactMatch = results.find(
                          item =>
                            item.title &&
                            item.title.toLowerCase() === String(name).toLowerCase()
                        );

                        const pageTitle = exactMatch?.title || results[0]?.title;
                        if (!pageTitle) return "";

                        /*
                          Pull the article's parsed plain-text sections instead of relying
                          only on Wikipedia's short REST summary. The summary often omits
                          the breakthrough film that Reelwise needs for a career biography.
                        */
                        const parseUrl =
                          "https://en.wikipedia.org/w/api.php?" +
                          new URLSearchParams({
                            action: "parse",
                            page: pageTitle,
                            prop: "text|sections",
                            format: "json",
                            origin: "*"
                          });

                        const parsed = await fetchJSON(parseUrl, {}, 10000);
                        const html = parsed?.parse?.text?.["*"] || "";

                        if (!html) return "";

                        let text = html
                          .replace(/<style[\s\S]*?<\/style>/gi, " ")
                          .replace(/<script[\s\S]*?<\/script>/gi, " ")
                          .replace(/<table[\s\S]*?<\/table>/gi, " ")
                          .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
                          .replace(/<h[1-6]\b[\s\S]*?<\/h[1-6]>/gi, " ")
                          .replace(/<span\b[^>]*class=["\'][^"\']*mw-editsection[^"\']*["\'][^>]*>[\s\S]*?<\/span>/gi, " ")
                          .replace(/<sup[\s\S]*?<\/sup>/gi, " ")
                          .replace(/<li\b[^>]*>/gi, " ")
                          .replace(/<\/li>/gi, ". ")
                          .replace(/<\/p>/gi, ". ")
                          .replace(/<br\s*\/?>/gi, " ")
                          .replace(/<[^>]+>/g, " ");

                        text = cleanText(text)
                          .replace(/\[\d+\]/g, "")
                          .replace(/\[\s*edit\s*\]/gi, " ")
                          .replace(/\b(?:film and stage career|career|early roles to breakthrough|breakthrough|filmography)\b\s*(?=\d{4}|$)/gi, " ")
                          .replace(/\s+\./g, ".")
                          .replace(/\.{2,}/g, ".")
                          .trim();

                        /*
                          Keep enough article text to capture early career, breakthrough,
                          defining work and later career without sending enormous pages
                          through the biography selector.
                        */
                        return text.slice(0, 65000);

                      } catch (error) {
                        console.error("Wikipedia career text error:", error);
                        return "";
                      }
                    }

                    function getMovieCredits(person) {
                      const cast = Array.isArray(person?.combined_credits?.cast)
                        ? person.combined_credits.cast
                        : [];

                      const seen = new Set();

                      return cast
                        .filter(item =>
                          item &&
                          item.media_type === "movie" &&
                          item.title &&
                          item.release_date
                        )
                        .filter(item => {
                          const role = String(item.character || "").toLowerCase();
                          return !(
                            role.includes("self") ||
                            role.includes("himself") ||
                            role.includes("herself") ||
                            role.includes("archive footage")
                          );
                        })
                        .filter(item => {
                          if (seen.has(item.id)) return false;
                          seen.add(item.id);
                          return true;
                        });
                    }

                    function normalizeFilmTitle(value) {
                      return String(value || "")
                        .toLowerCase()
                        .replace(/[’‘`]/g, "'")
                        .replace(/[^a-z0-9]+/g, " ")
                        .replace(/\s+/g, " ")
                        .trim();
                    }

                    function sentenceMovieMatches(sentence, movies) {
                      const lower = String(sentence || "").toLowerCase();
                      const normalizedSentence = normalizeFilmTitle(sentence);

                      return movies.filter(movie => {
                        const title = String(movie.title || "").toLowerCase().trim();
                        const normalizedTitle = normalizeFilmTitle(movie.title);

                        return Boolean(
                          title &&
                          (
                            lower.includes(title) ||
                            (normalizedTitle && normalizedSentence.includes(normalizedTitle))
                          )
                        );
                      });
                    }

                    function movieYear(movie) {
                      return parseInt(String(movie?.release_date || "").slice(0, 4), 10) || 0;
                    }

                    function sentenceYear(sentence) {
                      const years = String(sentence || "")
                        .match(/\b(?:18|19|20)\d{2}\b/g)
                        ?.map(Number)
                        .filter(year => Number.isFinite(year)) || [];

                      return years.length ? Math.max(...years) : 0;
                    }

                    function formatFilm(movie) {
                      const year = movieYear(movie);
                      return year ? `${movie.title} (${year})` : movie.title;
                    }

                    function formatFilmList(movies) {
                      const items = movies.map(formatFilm).filter(Boolean);

                      if (!items.length) return "";
                      if (items.length === 1) return items[0];
                      if (items.length === 2) return `${items[0]} and ${items[1]}`;

                      return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
                    }

                    function chooseCareerSentences(articleText, person) {
                      /*
                        PERSON 55 — ESTABLISHED CAREER SIGNIFICANCE ENGINE

                        Goals:
                        1. Every actor goes through the same biography builder.
                        2. Source text is evidence, never the finished biography.
                        3. Career significance outranks simple chronology.
                        4. Breakthrough, signature roles/franchises, acclaimed work,
                           major starring vehicles and later-career landmarks receive
                           independent signals.
                        5. Avoid weak cameos, producer/director-only credits, repeated
                           sequels and incidental title mentions.

                        No actor or movie title is hard-coded.
                      */

                      const cleanedArticleText = cleanBiographySource(
                        articleText,
                        person?.name || ""
                      );

                      const sentences = splitBioSentences(cleanedArticleText)
                        .map(cleanText)
                        .filter(Boolean)
                        .filter(sentence =>
                          !/\bFor other people named\b/i.test(sentence) &&
                          !/\bdisambiguation\b/i.test(sentence) &&
                          !/\bFor other uses, see\b/i.test(sentence) &&
                          !/\[\s*edit\s*\]/i.test(sentence) &&
                          !/\b(?:edit\s*)?Main article:/i.test(sentence) &&
                          !/^(?:film and stage career|career|early roles to breakthrough|breakthrough|filmography)\b/i.test(sentence)
                        );

                      const movies = getMovieCredits(person);
                      const name = cleanText(person?.name || "This performer");
                      const lastName = name.split(/\s+/).slice(-1)[0] || name;

                      if (!sentences.length) return "";

                      const normalize = value =>
                        cleanText(value)
                          .toLowerCase()
                          .replace(/&/g, " and ")
                          .replace(/[^a-z0-9 ]+/g, " ")
                          .replace(/\s+/g, " ")
                          .trim();

                      const yearOf = movie => {
                        const year = Number(String(movie?.release_date || "").slice(0, 4));
                        return Number.isFinite(year) ? year : 0;
                      };

                      const titlePattern = title => {
                        const escaped = String(title || "")
                          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                          .replace(/\s+/g, "\\s+");
                        return new RegExp(`\\b${escaped}\\b`, "i");
                      };

                      const evidenceFor = movie => {
                        if (!movie?.title) return [];
                        const pattern = titlePattern(movie.title);
                        return sentences.filter(sentence => pattern.test(sentence));
                      };

                      const personalTerms =
                        /\b(married|marriage|wife|husband|spouse|children|daughter|son|personal life|resides|politic|religion|charity|philanthrop)\b/i;

                      const plotTerms =
                        /\b(plot|story follows|centers on|centres on|character who|film follows|portrays a .* who)\b/i;

                      const publicityTerms =
                        /\b(trailer|premiere|festival premiere|announced|upcoming|set to star|attached to|casting was announced|will star|will appear)\b/i;

                      const breakthroughTerms =
                        /\b(breakthrough|breakout|rose to prominence|rose to fame|gained prominence|achieved fame|worldwide fame|star-making|made .* famous|became a star|launched .* career|first major role)\b/i;

                      const signatureTerms =
                        /\b(best known|known for|iconic|signature|defining|career-defining|most famous|famous role|identified with|closely associated|successful franchise|franchise)\b/i;

                      const successTerms =
                        /\b(box office|box-office|commercial success|commercially successful|major success|hit film|blockbuster|highest-grossing|grossed|successful film)\b/i;

                      const acclaimTerms =
                        /\b(critical acclaim|critically acclaimed|acclaimed|praised|career-best|dramatic range|breakthrough performance)\b/i;

                      const awardTerms =
                        /\b(academy award|oscar|golden globe|bafta|screen actors guild|sag award|emmy|cannes|venice|independent spirit|award|awards|nominated|nomination|won|winner)\b/i;

                      const leadTerms =
                        /\b(starred|starring|lead role|leading role|protagonist|portrayed|played the role|title role)\b/i;

                      const weakCreditTerms =
                        /\b(cameo|uncredited|voice cameo|archive footage|special appearance|producer only|executive producer)\b/i;

                      /*
                        Identity sentence: derive nationality and primary professions from
                        the source opening, but rewrite it in Reelwise voice.
                      */
                      const identitySource = sentences.slice(0, 6).find(sentence =>
                        new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sentence) &&
                        /\b(actor|actress|filmmaker|comedian|producer|writer|director|screenwriter|singer)\b/i.test(sentence)
                      ) || sentences.slice(0, 6).find(sentence =>
                        /\b(actor|actress|filmmaker|comedian|producer|writer|director|screenwriter|singer)\b/i.test(sentence)
                      ) || "";

                      const nationalityMatch = identitySource.match(
                        /\b(?:is|was)\s+(?:an?\s+)?([A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+)?)\s+(?:actor|actress|filmmaker|comedian|producer|writer|director|screenwriter|singer)\b/
                      );

                      const nationality = nationalityMatch
                        ? cleanText(nationalityMatch[1])
                        : "";

                      const professionPriority = [
                        "comedian",
                        "actor",
                        "actress",
                        "filmmaker",
                        "director",
                        "producer",
                        "writer",
                        "screenwriter",
                        "singer"
                      ];

                      let professions = professionPriority.filter(word =>
                        new RegExp(`\\b${word}\\b`, "i").test(identitySource)
                      );

                      /*
                        Actor/actress should remain visible when present.
                        Preserve up to three primary roles when the source explicitly
                        identifies them.
                      */
                      const acting = professions.includes("actress")
                        ? "actress"
                        : professions.includes("actor")
                          ? "actor"
                          : "";

                      if (acting) {
                        professions = [
                          acting,
                          ...professions.filter(word =>
                            word !== "actor" && word !== "actress"
                          )
                        ];
                      }

                      professions = [...new Set(professions)].slice(0, 3);
                      if (!professions.length) professions = ["performer"];

                      const professionPhrase =
                        professions.length === 1
                          ? professions[0]
                          : professions.length === 2
                            ? `${professions[0]} and ${professions[1]}`
                            : `${professions[0]}, ${professions[1]} and ${professions[2]}`;

                      const article = /^[aeiou]/i.test(nationality || professionPhrase)
                        ? "an"
                        : "a";

                      const opening = nationality
                        ? `${name} is ${article} ${nationality} ${professionPhrase}.`
                        : `${name} is ${article} ${professionPhrase}.`;

                      /*
                        A film must have real career evidence. We distinguish incidental
                        mentions from evidence about the performer's role/career.
                      */
                      const meaningfulEvidence = movie =>
                        evidenceFor(movie).filter(sentence =>
                          !personalTerms.test(sentence) &&
                          !plotTerms.test(sentence) &&
                          !publicityTerms.test(sentence) &&
                          !weakCreditTerms.test(sentence)
                        );

                      const NOW = new Date();
                      const CURRENT_YEAR = NOW.getFullYear();
                      const TODAY_ISO = NOW.toISOString().slice(0, 10);
                      const maxVotes = Math.max(
                        1,
                        ...movies.map(movie => Number(movie?.vote_count || 0))
                      );

                      const recognitionRatioOf = movie =>
                        Number(movie?.vote_count || 0) / maxVotes;

                      const isReleased = movie => {
                        const date = String(movie?.release_date || "").slice(0, 10);
                        return Boolean(date && date <= TODAY_ISO);
                      };

                      const landmarkEvidenceCount = movie =>
                        meaningfulEvidence(movie).filter(sentence =>
                          breakthroughTerms.test(sentence) ||
                          signatureTerms.test(sentence) ||
                          awardTerms.test(sentence) ||
                          acclaimTerms.test(sentence) ||
                          successTerms.test(sentence)
                        ).length;

                      const hasStrongCareerEvidence = movie => {
                        const evidence = meaningfulEvidence(movie);
                        const recognition = recognitionRatioOf(movie);
                        const order = Number.isFinite(Number(movie?.order))
                          ? Number(movie.order)
                          : 99;

                        return (
                          landmarkEvidenceCount(movie) >= 1 ||
                          evidence.length >= 2 ||
                          (recognition >= 0.40 && order <= 3) ||
                          (recognition >= 0.22 && order <= 1)
                        );
                      };

                      const significance = movie => {
                        const evidence = meaningfulEvidence(movie);
                        const order = Number.isFinite(Number(movie?.order))
                          ? Number(movie.order)
                          : 99;
                        const votes = Number(movie?.vote_count || 0);
                        const rating = Number(movie?.vote_average || 0);

                        let score = 0;

                        /* Audience recognition — useful, but never dominant. */
                        score += Math.min(Math.log10(Math.max(votes, 1)) * 10, 52);
                        score += Math.max(rating - 5.5, 0) * 2;

                        /*
                          Career-landmark recognition. A title that is one of this
                          performer's most broadly recognized films gets a modest boost.
                          This is relative to the performer's own filmography, not a
                          universal popularity contest.
                        */
                        const recognitionRatio = recognitionRatioOf(movie);
                        if (recognitionRatio >= 0.70) score += 38;
                        else if (recognitionRatio >= 0.40) score += 26;
                        else if (recognitionRatio >= 0.18) score += 14;

                        /*
                          Do not let a brand-new or future title become a career landmark
                          merely because it appears prominently in a current source. It
                          can still qualify when the source supplies strong award, acclaim,
                          breakthrough or signature-role evidence.
                        */
                        const movieYear = yearOf(movie);
                        const hasLandmarkEvidence = landmarkEvidenceCount(movie) >= 1;

                        /*
                          Recency is not significance. Even when a current title has press,
                          acclaim or nominations, it should not automatically outrank an
                          established signature film. Unreleased work is never a completed
                          career highlight.
                        */
                        if (!isReleased(movie)) score -= 220;
                        else if (movieYear === CURRENT_YEAR) score -= hasLandmarkEvidence ? 48 : 82;
                        else if (movieYear === CURRENT_YEAR - 1) score -= hasLandmarkEvidence ? 22 : 45;
                        else if (movieYear === CURRENT_YEAR - 2 && !hasLandmarkEvidence) score -= 18;

                        /* Billing / prominence in the film. */
                        if (order === 0) score += 52;
                        else if (order === 1) score += 44;
                        else if (order === 2) score += 35;
                        else if (order === 3) score += 25;
                        else if (order <= 5) score += 12;

                        /* Repeated career-source attention. */
                        score += Math.min(evidence.length, 4) * 18;

                        for (const sentence of evidence) {
                          if (breakthroughTerms.test(sentence)) score += 170;
                          if (signatureTerms.test(sentence)) score += 120;
                          if (awardTerms.test(sentence)) score += 105;
                          if (acclaimTerms.test(sentence)) score += 80;
                          if (successTerms.test(sentence)) score += 68;
                          if (leadTerms.test(sentence)) score += 32;
                        }

                        return score;
                      };

                      const validMovies = movies
                        .filter(movie =>
                          movie?.id &&
                          movie?.title &&
                          yearOf(movie) &&
                          meaningfulEvidence(movie).length
                        );

                      /*
                        Breakthrough: explicit source evidence first. If unavailable,
                        choose an early, high-significance starring film rather than the
                        globally highest-scoring title.
                      */
                      const explicitBreakthrough = validMovies
                        .filter(movie =>
                          meaningfulEvidence(movie).some(sentence =>
                            breakthroughTerms.test(sentence)
                          )
                        )
                        .sort((a, b) =>
                          yearOf(a) - yearOf(b) ||
                          significance(b) - significance(a)
                        )[0] || null;

                      const careerYears = validMovies.map(yearOf).filter(Boolean);
                      const firstYear = careerYears.length ? Math.min(...careerYears) : 0;
                      const lastYear = careerYears.length ? Math.max(...careerYears) : 0;

                      const earlyFallback = [...validMovies]
                        .filter(movie =>
                          !firstYear || yearOf(movie) <= firstYear + 12
                        )
                        .sort((a, b) =>
                          significance(b) - significance(a) ||
                          yearOf(a) - yearOf(b)
                        )[0] || null;

                      const breakthroughMovie = explicitBreakthrough || earlyFallback;
                      const breakthroughYear = breakthroughMovie
                        ? yearOf(breakthroughMovie)
                        : firstYear;

                      /*
                        Group obvious franchise relatives. This prevents a biography from
                        spending multiple slots on sequels while omitting another defining
                        part of the career.
                      */
                      const titleTokens = title =>
                        normalize(title)
                          .split(" ")
                          .filter(word =>
                            word.length >= 4 &&
                            !/^(part|chapter|movie|film|returns|return|forever|again)$/.test(word) &&
                            !/^\d+$/.test(word)
                          );

                      const sameFamily = (a, b) => {
                        const aa = titleTokens(a?.title || "");
                        const bb = titleTokens(b?.title || "");
                        if (!aa.length || !bb.length) return false;

                        const overlap = aa.filter(word => bb.includes(word));
                        return overlap.length >= Math.min(2, aa.length, bb.length) ||
                          (overlap.length >= 1 &&
                           Math.min(aa.length, bb.length) === 1);
                      };

                      const selected = [];
                      const addMovie = movie => {
                        if (!movie) return false;
                        if (selected.some(item => item.id === movie.id)) return false;
                        if (selected.some(item => sameFamily(item, movie))) return false;
                        selected.push(movie);
                        return true;
                      };

                      if (breakthroughMovie) addMovie(breakthroughMovie);

                      /*
                        Career chapters. A title must clear a significance floor.
                        Person 55 tightens the quality gate again: established career significance
                        decides WHETHER a film belongs; chronology only decides WHERE it belongs.
                        Unreleased titles are excluded from career-highlight slots, and very recent
                        work must clear a higher evidence bar than established landmark films.
                      */
                      const span = breakthroughYear && lastYear
                        ? Math.max(lastYear - breakthroughYear, 1)
                        : 1;

                      const earlyEnd = breakthroughYear + Math.max(9, Math.round(span * 0.30));
                      const middleEnd = breakthroughYear + Math.max(18, Math.round(span * 0.68));

                      const strongMovies = validMovies
                        .filter(movie =>
                          isReleased(movie) &&
                          significance(movie) >= 145 &&
                          hasStrongCareerEvidence(movie)
                        )
                        .sort((a, b) =>
                          significance(b) - significance(a) ||
                          yearOf(a) - yearOf(b)
                        );

                      const pickChapter = (minYear, maxYear, limit) => {
                        const picks = [];

                        for (const movie of strongMovies) {
                          const year = yearOf(movie);
                          if (minYear && year < minYear) continue;
                          if (maxYear && year > maxYear) continue;
                          if (selected.some(item => item.id === movie.id)) continue;
                          if ([...selected, ...picks].some(item => sameFamily(item, movie))) continue;

                          picks.push(movie);
                          if (picks.length >= limit) break;
                        }

                        picks.forEach(addMovie);
                        return picks;
                      };

                      const earlyPicks = pickChapter(
                        breakthroughYear || firstYear,
                        earlyEnd,
                        2
                      );

                      const midPicks = pickChapter(
                        earlyEnd + 1,
                        middleEnd,
                        2
                      );

                      const latePicks = pickChapter(
                        middleEnd + 1,
                        lastYear || 9999,
                        2
                      );

                      /*
                        If a chapter is sparse, fill only with truly high-significance
                        titles from the whole career. Never lower the quality bar just to
                        fill a sentence.
                      */
                      const fillPicks = [];
                      for (const movie of strongMovies) {
                        if (selected.some(item => item.id === movie.id)) continue;
                        if ([...selected, ...fillPicks].some(item => sameFamily(item, movie))) continue;
                        if (significance(movie) < 145) continue;

                        fillPicks.push(movie);
                        if (fillPicks.length >= 2) break;
                      }

                      fillPicks.forEach(addMovie);

                      const fmt = movie => `${movie.title} (${yearOf(movie)})`;

                      const list = items => {
                        const values = items.map(fmt);
                        if (!values.length) return "";
                        if (values.length === 1) return values[0];
                        if (values.length === 2) return `${values[0]} and ${values[1]}`;
                        return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
                      };

                      /*
                        Awards: prefer a sentence tied to a selected/significant movie,
                        and prefer actual wins/nominations over box-office trivia.
                      */
                      const awardCandidates = sentences
                        .filter(sentence =>
                          awardTerms.test(sentence) &&
                          !personalTerms.test(sentence) &&
                          !plotTerms.test(sentence) &&
                          !publicityTerms.test(sentence)
                        )
                        .map(sentence => {
                          const linked = validMovies.filter(movie =>
                            titlePattern(movie.title).test(sentence)
                          );

                          let score = linked.reduce(
                            (best, movie) => Math.max(best, significance(movie)),
                            0
                          );

                          if (/\b(won|winner|academy award|oscar)\b/i.test(sentence)) score += 90;
                          if (/\b(nominated|nomination)\b/i.test(sentence)) score += 45;
                          if (/\b(grossed|box office|box-office)\b/i.test(sentence)) score -= 35;

                          const newestLinkedYear = linked.reduce(
                            (best, movie) => Math.max(best, yearOf(movie)),
                            0
                          );
                          if (newestLinkedYear === CURRENT_YEAR) score -= 55;
                          else if (newestLinkedYear === CURRENT_YEAR - 1) score -= 28;

                          return { sentence, linked, score };
                        })
                        .sort((a, b) =>
                          b.score - a.score ||
                          a.sentence.length - b.sentence.length
                        );

                      const bestAward = awardCandidates[0] || null;

                      const output = [opening];

                      if (breakthroughMovie) {
                        output.push(
                          `${lastName} broke through with ${fmt(breakthroughMovie)}.`
                        );
                      }

                      if (earlyPicks.length) {
                        output.push(
                          `Other defining early work included ${list(earlyPicks)}.`
                        );
                      }

                      if (midPicks.length) {
                        output.push(
                          `Major work in the next phase of ${acting === "actress" ? "her" : "his"} career included ${list(midPicks)}.`
                        );
                      }

                      if (bestAward && bestAward.score >= 100) {
                        const awardIsEstablished = bestAward.linked.some(movie =>
                          isReleased(movie) && yearOf(movie) <= CURRENT_YEAR - 2
                        );

                        if (bestAward.sentence.length <= 190 && awardIsEstablished) {
                          output.push(bestAward.sentence);
                        } else if (bestAward.linked.length) {
                          const awardMovie = [...bestAward.linked]
                            .sort((a, b) => significance(b) - significance(a))[0];

                          output.push(
                            `${fmt(awardMovie)} brought major awards recognition.`
                          );
                        }
                      }

                      const later = [...latePicks, ...fillPicks]
                        .filter((movie, index, arr) =>
                          arr.findIndex(item => item.id === movie.id) === index
                        )
                        .filter(movie =>
                          isReleased(movie) &&
                          hasStrongCareerEvidence(movie) &&
                          !earlyPicks.some(item => item.id === movie.id) &&
                          !midPicks.some(item => item.id === movie.id) &&
                          movie?.id !== breakthroughMovie?.id
                        )
                        .sort((a, b) => significance(b) - significance(a))
                        .slice(0, 2);

                      if (later.length) {
                        output.push(
                          `Later career highlights included ${list(later)}.`
                        );
                      }

                      /*
                        Final cleanup: no repeated sentences, no duplicate title clauses,
                        and no bloated card.
                      */
                      const final = [];
                      const seen = new Set();

                      for (const sentence of output) {
                        const clean = cleanText(sentence)
                          .replace(/\s+([,.;:!?])/g, "$1")
                          .replace(/\(\s+/g, "(")
                          .replace(/\s+\)/g, ")");

                        const key = normalize(clean);
                        if (!clean || !key || seen.has(key)) continue;

                        final.push(clean);
                        seen.add(key);

                        if (final.length >= 6) break;
                      }

                      while (final.length > 3 && final.join(" ").length > 900) {
                        final.splice(final.length - 2, 1);
                      }

                      return final.join(" ");
                    }

                    function calculatePersonAge(birthday, deathday = null) {
                      if (!birthday) return null;

                      const born = new Date(`${birthday}T00:00:00Z`);
                      const end = deathday
                        ? new Date(`${deathday}T00:00:00Z`)
                        : new Date();

                      if (Number.isNaN(born.getTime()) || Number.isNaN(end.getTime())) {
                        return null;
                      }

                      let age = end.getUTCFullYear() - born.getUTCFullYear();
                      const beforeBirthday =
                        end.getUTCMonth() < born.getUTCMonth() ||
                        (end.getUTCMonth() === born.getUTCMonth() &&
                         end.getUTCDate() < born.getUTCDate());

                      if (beforeBirthday) age -= 1;
                      return age >= 0 ? age : null;
                    }


                    async function getPersonProfile(personId) {
                      const person = await fetchTMDB(
                        `/person/${encodeURIComponent(personId)}`,
                        {
                          language: "en-US",
                          append_to_response: "combined_credits"
                        }
                      );

                      const tmdbBio = cleanText(person?.biography || "");

                      /*
                        Primary biography source: richer Wikipedia article text.
                        Fallback: Wikipedia summary, then TMDB biography.
                      */
                      let wikipediaCareerText = "";
                      let wikipediaSummary = "";

                      try {
                        wikipediaCareerText = await getWikipediaCareerText(person?.name || "");
                      } catch (error) {
                        wikipediaCareerText = "";
                      }

                      try {
                        wikipediaSummary = await getWikipediaBiography(person?.name || "");
                      } catch (error) {
                        wikipediaSummary = "";
                      }

                      let biography = "";

                      if (wikipediaCareerText) {
                        try {
                          biography = chooseCareerSentences(wikipediaCareerText, person);
                        } catch (error) {
                          console.error("Reelwise career biography error:", error);
                          biography = "";
                        }
                      }

                      if (!biography && wikipediaSummary) {
                        try {
                          biography = chooseCareerSentences(wikipediaSummary, person);
                        } catch (error) {
                          console.error("Reelwise summary biography error:", error);
                          biography = "";
                        }
                      }

                      if (!biography && tmdbBio) {
                        try {
                          biography = chooseCareerSentences(tmdbBio, person);
                        } catch (error) {
                          console.error("Reelwise TMDB biography error:", error);
                          biography = "";
                        }
                      }

                      biography =
                        biography ||
                        wikipediaSummary ||
                        tmdbBio ||
                        "";

                      if (biography.length > 1150) {
                        const fallbackSentences = splitBioSentences(biography);
                        const compactFallback = [];
                        let fallbackLength = 0;

                        for (const sentence of fallbackSentences) {
                          const cleanSentence = cleanText(sentence);
                          if (!cleanSentence) continue;

                          const addition =
                            cleanSentence.length + (compactFallback.length ? 1 : 0);

                          if (fallbackLength + addition > 760) break;

                          compactFallback.push(cleanSentence);
                          fallbackLength += addition;

                          if (compactFallback.length >= 4) break;
                        }

                        biography = compactFallback.join(" ");

                        /*
                          Absolute last-resort guard: never let a malformed source paragraph
                          fill the entire Reelwise star card.
                        */
                        if (biography.length > 820) {
                          biography = biography.slice(0, 817).replace(/\s+\S*$/, "") + "...";
                        }
                      }

                      return {
                        ...person,
                        biography,
                        age: calculatePersonAge(person?.birthday, person?.deathday),
                        deathday: person?.deathday || null,
                        deceased: Boolean(person?.deathday),
                        combined_credits:
                          person?.combined_credits &&
                          typeof person.combined_credits === "object"
                            ? person.combined_credits
                            : { cast: [], crew: [] }
                      };
                    }


                    /* ============================================================
                       ACADEMY AWARDS / ACCOLADES
                       ============================================================ */

                    function academyCategoryLooksPersonal(category) {
                      const text = String(category || "").toLowerCase();

                      /*
                        A person search can theoretically match names in non-person contexts.
                        Reelwise's Star Accolades section should show awards credited to the
                        performer/filmmaker as nominee. OscarBase's nominee field is the main
                        identity check; this helper only rejects obviously empty categories.
                      */
                      return text.length > 0;
                    }

                    function mapAcademyNomination(item) {
                      return {
                        year: String(
                          item?.ceremony_year ||
                          item?.year ||
                          ""
                        ),
                        movie: cleanText(
                          typeof item?.movie === "string"
                            ? item.movie
                            : item?.movie?.title || item?.film || item?.work || ""
                        ) || "Film",
                        category: cleanText(
                          typeof item?.category === "string"
                            ? item.category
                            : item?.category?.category_name ||
                              item?.category?.name ||
                              item?.award ||
                              ""
                        ) || "Academy Award",
                        winner:
                          item?.winner === true ||
                          item?.won === true ||
                          String(item?.result || "").toLowerCase() === "winner"
                      };
                    }

                    async function getOscarBasePage(name, page = 1) {
                      const url = new URL(OSCARBASE_BASE + "/nominations");

                      url.searchParams.set("nominee", name);
                      url.searchParams.set("page", String(page));
                      url.searchParams.set("limit", "100");

                      return fetchJSON(url.toString(), {}, 9000);
                    }

                    async function getAcademyAwards(person) {
                      const name = cleanText(person?.name || "");

                      if (!name) {
                        throw new Error("The star's name could not be resolved.");
                      }

                      const expectedName = normalizeName(name);

                      let firstPage = await getOscarBasePage(name, 1);

                      let rows = Array.isArray(firstPage?.data)
                        ? [...firstPage.data]
                        : Array.isArray(firstPage?.nominations)
                          ? [...firstPage.nominations]
                          : [];

                      const totalPages = Math.min(
                        Math.max(
                          Number(firstPage?.pagination?.totalPages) || 1,
                          1
                        ),
                        10
                      );

                      /*
                        A single performer is extremely unlikely to exceed 100 nominations,
                        but paging makes the contract correct if the API ever returns more.
                      */
                      for (let page = 2; page <= totalPages; page++) {
                        const next = await getOscarBasePage(name, page);

                        const more = Array.isArray(next?.data)
                          ? next.data
                          : Array.isArray(next?.nominations)
                            ? next.nominations
                            : [];

                        rows.push(...more);
                      }

                      /*
                        OscarBase supports partial nominee-name matching. Require the returned
                        nominee to equal the TMDB person's name after normalization so a search
                        for one performer cannot silently show another person's awards.
                      */
                      rows = rows.filter(item => {
                        const nominee =
                          typeof item?.nominee === "string"
                            ? item.nominee
                            : item?.nominee?.name || "";

                        return (
                          normalizeName(nominee) === expectedName &&
                          academyCategoryLooksPersonal(
                            typeof item?.category === "string"
                              ? item.category
                              : item?.category?.category_name || item?.category?.name || ""
                          )
                        );
                      });

                      /*
                        Deduplicate defensively in case pagination or upstream data repeats
                        the same nomination.
                      */
                      const seen = new Set();

                      const history = rows
                        .map(mapAcademyNomination)
                        .filter(item => {
                          const key = [
                            item.year,
                            item.movie.toLowerCase(),
                            item.category.toLowerCase()
                          ].join("|");

                          if (seen.has(key)) {
                            return false;
                          }

                          seen.add(key);
                          return true;
                        })
                        .sort((a, b) => {
                          const yearDifference =
                            (parseInt(b.year, 10) || 0) -
                            (parseInt(a.year, 10) || 0);

                          if (yearDifference) {
                            return yearDifference;
                          }

                          return a.category.localeCompare(b.category);
                        });

                      const wins = history.filter(item => item.winner).length;
                      const nominations = history.length;

                      /*
                        IMPORTANT:
                        confirmed:true means OscarBase completed the lookup successfully.
                        found:false + history:[] is therefore a real zero-nomination result,
                        exactly as the current Reelwise index expects.
                      */
                      return {
                        confirmed: true,
                        found: history.length > 0,
                        person_id: person?.id || null,
                        name,
                        wins,
                        nominations,
                        history,

                        /*
                          Compatibility aliases already supported by index.html.
                        */
                        academy_awards: history,
                        academyAwards: history,
                        accolades: history
                      };
                    }


                    /* ============================================================
                       VERCEL HANDLER
                       ============================================================ */

                    export default async function handler(req, res) {
                      if (req.method !== "GET") {
                        res.setHeader("Allow", "GET");

                        return sendJSON(
                          res,
                          405,
                          { error: "Method not allowed." }
                        );
                      }

                      const rawId = Array.isArray(req.query?.id)
                        ? req.query.id[0]
                        : req.query?.id;

                      const id = String(rawId || "").trim();

                      if (!id || !/^\d+$/.test(id)) {
                        return sendJSON(
                          res,
                          400,
                          { error: "A valid TMDB person id is required." }
                        );
                      }

                      const rawMode = Array.isArray(req.query?.mode)
                        ? req.query.mode[0]
                        : req.query?.mode;

                      const mode = String(rawMode || "")
                        .trim()
                        .toLowerCase();

                      try {
                        /*
                          ACCOLADES MODE
                          Resolve TMDB first. This prevents the awards service from being
                          queried with an untrusted or unrelated name supplied by the client.
                        */
                        if (mode === "accolades") {
                          const person = await fetchTMDB(
                            `/person/${encodeURIComponent(id)}`,
                            { language: "en-US" }
                          );

                          try {
                            const awards = await getAcademyAwards(person);
                            return sendJSON(res, 200, awards);

                          } catch (error) {
                            console.error(
                              "Academy Awards lookup error:",
                              error
                            );

                            /*
                              Do NOT return confirmed:true here. The current index correctly
                              treats this as temporary unavailability and retries rather than
                              falsely telling the user the performer has zero nominations.
                            */
                            return sendJSON(
                              res,
                              503,
                              {
                                confirmed: false,
                                unavailable: true,
                                found: false,
                                person_id: person?.id || Number(id),
                                name: person?.name || "",
                                history: [],
                                academy_awards: [],
                                academyAwards: [],
                                accolades: [],
                                error: "Academy Awards data is temporarily unavailable."
                              }
                            );
                          }
                        }

                        /*
                          NORMAL STAR PROFILE MODE
                        */
                        const profile = await getPersonProfile(id);

                        return sendJSON(
                          res,
                          200,
                          profile
                        );

                      } catch (error) {
                        console.error(
                          "Reelwise person API error:",
                          error
                        );

                        const status =
                          Number(error?.status) === 404
                            ? 404
                            : 500;

                        return sendJSON(
                          res,
                          status,
                          {
                            error:
                              status === 404
                                ? "Movie star not found."
                                : "The star profile could not be loaded."
                          }
                        );
                      }
                    }

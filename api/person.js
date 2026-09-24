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
                        return text.slice(0, 18000);

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

                    function sentenceMovieMatches(sentence, movies) {
                      const lower = String(sentence || "").toLowerCase();

                      return movies.filter(movie => {
                        const title = String(movie.title || "").toLowerCase().trim();
                        return title && lower.includes(title);
                      });
                    }

                    function movieYear(movie) {
                      return parseInt(String(movie?.release_date || "").slice(0, 4), 10) || 0;
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
                      const cleanedArticleText = cleanBiographySource(
                        articleText,
                        person?.name || ""
                      );

                      const sentences = splitBioSentences(cleanedArticleText)
                        .filter(sentence =>
                          !/\bFor other people named\b/i.test(sentence) &&
                          !/\bdisambiguation\b/i.test(sentence) &&
                          !/\bFor other uses, see\b/i.test(sentence) &&
                          !/\[\s*edit\s*\]/i.test(sentence) &&
                          !/\b(?:edit\s*)?Main article:/i.test(sentence) &&
                          !/^(?:film and stage career|career|early roles to breakthrough|breakthrough|filmography)\b/i.test(sentence) &&
                          !/(?:\/[^/]{2,80}\/|\[[^\]]{0,80}(?:IPA|pronunciation)[^\]]*\])/i.test(sentence) &&
                          !new RegExp(`^${String(person?.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\([^)]*born\\s+[^)]*\\)`, "i").test(sentence)
                        );

                      const movies = getMovieCredits(person);
                      const name = cleanText(person?.name || "This performer");

                      const personalTerms =
                        /\b(married|marriage|wife|husband|spouse|children|daughter|son|activist|political|politics|religion|charity|philanthrop|personal life|resides|lives in|born on|date of birth)\b/i;

                      const breakthroughTerms =
                        /\b(film debut|debut|breakthrough|breakout|rose to prominence|gained recognition|gained critical acclaim|first major role|first film role|career-making|critical and commercial success|major success|became a star|established him|established her)\b/i;

                      const careerTerms =
                        /\b(film|films|movie|movies|role|roles|starred|starring|performance|performances|acting|actor|actress|filmmaker|director|directed|portrayed|appeared in|voiced|voice role)\b/i;

                      const awardTerms =
                        /\b(academy award|oscar|golden globe|bafta|emmy|award|awards|accolade|accolades|nomination|nominations|won|nominated)\b/i;

                      const strongCareerTerms =
                        /\b(acclaim|acclaimed|recognition|success|successful|blockbuster|franchise|leading role|lead role|title role|portrayed|starred|starring|won|nominated|award|awards)\b/i;

                      const signatureCareerTerms =
                        /\b(gained (?:global |international |widespread )?recognition|rose to (?:global |international )?prominence|became (?:widely |internationally )?known|best known|iconic|signature role|defining role|career-defining|franchise|series of films|reprising|reprise|title character|leading role|lead role)\b/i;

                      const weakCareerTerms =
                        /\b(box[- ]office failure|critical failure|commercial failure|flop|panned|poorly received|mixed reviews|only role|only film|only movie)\b/i;

                      const publicityTerms =
                        /\b(promoting|promoted|promotion|promotional|publicity|press tour|press junket|interview|interviewed|magazine|cover of|photo shoot|photoshoot|talk show|late[- ]night|appeared on the cover|spoke to the press)\b/i;

                      const incompleteFragmentTerms =
                        /^(?:[\d.,$£€¥%]+(?:\s|$)|[,;:)\]])/;

                      const dependentTransitionTerms =
                        /^(?:later that year|earlier that year|the same year|that same year|the following year|the next year|the previous year|the year before|the year after|later that month|earlier that month|the following month|the next month|soon afterward|soon afterwards|afterward|afterwards|subsequently|thereafter|that year)\b[,:]?\s*/i;

                      const contextlessTerms =
                        /^(?:the film|the movie|the role|the performance|the project|the sequel|the series|the production|the picture)\b/i;

                      const plotSummaryTerms =
                        /\b(?:plot|story follows|centers on|revolves around|who cannot stand each other|unknowingly|falls in love|tries to|attempts to|sets out to|must save|must stop|in search of his estranged|in search of her estranged|featured .{0,70} as lovers|features .{0,70} as lovers|caught in turmoil)\b/i;

                      /*
                        Reject sentences that begin with a different named person and never
                        mention the Reelwise profile star. This prevents neighboring Wikipedia
                        material from becoming part of the wrong actor's biography.
                      */
                      const isOtherPersonSentence = sentence => {
                        const value = cleanText(sentence);
                        const profileName = cleanText(name).toLowerCase();

                        if (!value || !profileName) return false;
                        if (value.toLowerCase().includes(profileName)) return false;

                        const firstWords = value.match(/^([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,2})\b/);
                        if (!firstWords) return false;

                        const subject = firstWords[1].toLowerCase();

                        // Do not mistake ordinary sentence starters for a person's name.
                        const ordinaryStarters = new Set([
                          "In", "The", "His", "Her", "Their", "He", "She", "They",
                          "After", "Before", "During", "Following", "Later", "That",
                          "This", "For", "With", "As", "At", "By", "From"
                        ]);

                        const first = firstWords[1].split(/\s+/)[0];
                        if (ordinaryStarters.has(first)) return false;

                        return subject !== profileName;
                      };

                      /*
                        Identity must describe the person, not words that happen to appear
                        elsewhere in the article. TMDB's known_for_department is the safest
                        primary signal. Only the opening biography sentences may add a genuine
                        filmmaker/director credit.
                      */
                      const introText = sentences.slice(0, 2).join(" ");
                      const department = String(person?.known_for_department || "").toLowerCase();
                      const introSaysFilmmaker =
                        /\b(?:is|was)\s+(?:an?\s+)?(?:actor|actress)[^.!?]{0,90}\b(?:filmmaker|director|producer|screenwriter)\b/i.test(introText) ||
                        /\b(?:actor|actress),?\s+(?:and\s+)?(?:filmmaker|director)\b/i.test(introText);

                      const introSaysActress = /\bactress\b/i.test(introText);
                      const isActingProfile =
                        department === "acting" ||
                        /\bactor\b|\bactress\b/i.test(introText);

                      const isFilmmaker =
                        introSaysFilmmaker ||
                        (!isActingProfile && /directing|production|writing/.test(department));

                      const identityVerb = person?.deathday ? "was" : "is";

                      const identity = isFilmmaker && isActingProfile
                        ? `${name} ${identityVerb} an actor and filmmaker.`
                        : introSaysActress
                          ? `${name} ${identityVerb} an actress.`
                          : isActingProfile
                            ? `${name} ${identityVerb} an actor.`
                            : `${name} ${identityVerb} a film professional.`;

                      /*
                        Score a movie by how useful it is for a short Reelwise career arc.
                        Popularity and vote count help identify culturally prominent work,
                        while chronology is handled separately below.
                      */
                      const movieImportance = movie => {
                        const popularity = Number(movie?.popularity || 0);
                        const votes = Number(movie?.vote_count || 0);
                        const rating = Number(movie?.vote_average || 0);
                        const order = Number.isFinite(Number(movie?.order))
                          ? Number(movie.order)
                          : 99;

                        return (
                          Math.log10(Math.max(votes, 1)) * 18 +
                          Math.min(popularity, 100) * 0.35 +
                          Math.max(rating - 5, 0) * 3 +
                          Math.max(0, 12 - Math.min(order, 12))
                        );
                      };

                      const sentenceImportance = item => {
                        const bestMovie = item.matches.length
                          ? Math.max(...item.matches.map(movieImportance))
                          : 0;

                        let score = bestMovie;

                        /*
                          A short Reelwise bio should prioritize the work that defined the
                          performer's screen identity. Awards still matter, but an award-only
                          sentence should not automatically outrank a signature role/franchise.
                        */
                        if (signatureCareerTerms.test(item.sentence)) score += 34;
                        if (strongCareerTerms.test(item.sentence)) score += 16;
                        if (awardTerms.test(item.sentence)) score += 10;
                        if (item.matches.length >= 2) score += 6;
                        if (breakthroughTerms.test(item.sentence)) score += 10;

                        return score;
                      };

                      /*
                        1. BREAKTHROUGH / EARLY RECOGNITION
                        Prefer explicit breakthrough language tied to real TMDB films.
                      */
                      let breakthrough = "";
                      let breakthroughMovies = [];

                      for (const sentence of sentences) {
                        if (!breakthroughTerms.test(sentence)) continue;
                        if (personalTerms.test(sentence)) continue;
                        if (publicityTerms.test(sentence)) continue;
                        if (weakCareerTerms.test(sentence)) continue;
                        if (incompleteFragmentTerms.test(sentence)) continue;
                        if (dependentTransitionTerms.test(sentence)) continue;
                        if (contextlessTerms.test(sentence)) continue;
                        if (plotSummaryTerms.test(sentence)) continue;
                        if (/^edit\b/i.test(sentence)) continue;
                        if (isOtherPersonSentence(sentence)) continue;

                        const matches = sentenceMovieMatches(sentence, movies);
                        if (!matches.length) continue;

                        breakthrough = sentence;
                        breakthroughMovies = matches;
                        break;
                      }

                      if (!breakthrough) {
                        for (let i = 0; i < sentences.length - 1; i++) {
                          if (!breakthroughTerms.test(sentences[i])) continue;

                          const combined = `${sentences[i]} ${sentences[i + 1]}`;

                          if (
                            personalTerms.test(combined) ||
                            publicityTerms.test(combined) ||
                            weakCareerTerms.test(combined) ||
                            dependentTransitionTerms.test(sentences[i]) ||
                            dependentTransitionTerms.test(sentences[i + 1]) ||
                            contextlessTerms.test(sentences[i]) ||
                            contextlessTerms.test(sentences[i + 1]) ||
                            plotSummaryTerms.test(combined) ||
                            /^edit\b/i.test(sentences[i]) ||
                            /^edit\b/i.test(sentences[i + 1])
                          ) {
                            continue;
                          }

                          const matches = sentenceMovieMatches(combined, movies);

                          if (matches.length) {
                            breakthrough = combined;
                            breakthroughMovies = matches;
                            break;
                          }
                        }
                      }

                      const usedMovieIds = new Set(
                        breakthroughMovies.map(movie => movie.id)
                      );

                      const breakthroughYear = breakthroughMovies.length
                        ? Math.min(...breakthroughMovies.map(movieYear).filter(Boolean))
                        : 0;

                      /*
                        Build clean career candidates. These are scored for significance,
                        not simply selected because they appear next in Wikipedia.
                      */
                      const careerCandidates = sentences
                        .map((sentence, index) => ({
                          sentence,
                          index,
                          matches: sentenceMovieMatches(sentence, movies)
                        }))
                        .filter(item =>
                          item.matches.length &&
                          careerTerms.test(item.sentence) &&
                          !personalTerms.test(item.sentence) &&
                          !publicityTerms.test(item.sentence) &&
                          !weakCareerTerms.test(item.sentence) &&
                          !incompleteFragmentTerms.test(item.sentence) &&
                          !dependentTransitionTerms.test(item.sentence) &&
                          !contextlessTerms.test(item.sentence) &&
                          !plotSummaryTerms.test(item.sentence) &&
                          !/^edit\b/i.test(item.sentence) &&
                          !isOtherPersonSentence(item.sentence) &&
                          item.sentence !== breakthrough
                        )
                        .map(item => ({
                          ...item,
                          earliestYear: Math.min(
                            ...item.matches.map(movieYear).filter(Boolean)
                          ) || 0,
                          latestYear: Math.max(
                            ...item.matches.map(movieYear).filter(Boolean)
                          ) || 0,
                          importance: sentenceImportance(item)
                        }));

                      /*
                        2. DEFINING WORK
                        Choose the strongest meaningful sentence after the breakthrough.
                        This replaces the old "first sentence after breakthrough" behavior.
                      */
                      let defining = "";

                      const definingPool = careerCandidates
                        .filter(item => {
                          const fresh = item.matches.filter(
                            movie => !usedMovieIds.has(movie.id)
                          );

                          if (!fresh.length) return false;

                          return (
                            !breakthroughYear ||
                            !item.latestYear ||
                            item.latestYear >= breakthroughYear
                          );
                        })
                        .sort((a, b) =>
                          b.importance - a.importance ||
                          a.index - b.index
                        );

                      if (definingPool.length) {
                        const selected = definingPool[0];
                        defining = selected.sentence;
                        selected.matches.forEach(movie => usedMovieIds.add(movie.id));
                      }

                      /*
                        3. MAJOR LATER WORK
                        Prefer a strong sentence from a meaningfully later stage of the
                        career, rather than the last or next chronological sentence.
                      */
                      let later = "";

                      const definingMatches = defining
                        ? sentenceMovieMatches(defining, movies)
                        : [];

                      const definingYear = definingMatches.length
                        ? Math.max(...definingMatches.map(movieYear).filter(Boolean))
                        : breakthroughYear;

                      const careerYears = movies.map(movieYear).filter(Boolean);
                      const latestCareerYear = careerYears.length
                        ? Math.max(...careerYears)
                        : 0;

                      const laterThreshold = definingYear
                        ? definingYear + 4
                        : breakthroughYear
                          ? breakthroughYear + 5
                          : latestCareerYear
                            ? latestCareerYear - 8
                            : 0;

                      const laterPool = careerCandidates
                        .filter(item => {
                          if (item.sentence === defining) return false;

                          const fresh = item.matches.filter(
                            movie => !usedMovieIds.has(movie.id)
                          );
                          if (!fresh.length) return false;

                          if (laterThreshold && item.latestYear < laterThreshold) {
                            return false;
                          }

                          return true;
                        })
                        .sort((a, b) =>
                          b.importance - a.importance ||
                          b.latestYear - a.latestYear ||
                          a.index - b.index
                        );

                      if (laterPool.length) {
                        later = laterPool[0].sentence;
                      }

                      /*
                        TMDB fallbacks are used only when Wikipedia cannot supply a useful
                        stage of the career arc.
                      */
                      if (!breakthrough) {
                        const chronological = [...movies]
                          .filter(movie => movieYear(movie) > 0)
                          .sort((a, b) => movieYear(a) - movieYear(b));

                        /*
                          Do not manufacture weak early-career filler. A fallback film must
                          already have meaningful audience recognition.
                        */
                        const firstMeaningful = chronological.find(movie => {
                          const votes = Number(movie.vote_count || 0);
                          const popularity = Number(movie.popularity || 0);
                          return votes >= 750 || popularity >= 18;
                        });

                        if (firstMeaningful) {
                          breakthrough =
                            `${name}'s early notable film work included ${formatFilm(firstMeaningful)}.`;
                          usedMovieIds.add(firstMeaningful.id);
                        }
                      }

                      if (!defining) {
                        const sourceLower = String(cleanedArticleText || "").toLowerCase();

                        const mentioned = movies
                          .filter(movie =>
                            !usedMovieIds.has(movie.id) &&
                            sourceLower.includes(String(movie.title || "").toLowerCase())
                          )
                          .sort((a, b) => movieImportance(b) - movieImportance(a))
                          .slice(0, 3);

                        if (mentioned.length) {
                          defining = `Defining films include ${formatFilmList(mentioned)}.`;
                          mentioned.forEach(movie => usedMovieIds.add(movie.id));
                        }
                      }

                      if (!later) {
                        const laterMovies = movies
                          .filter(movie =>
                            !usedMovieIds.has(movie.id) &&
                            movieYear(movie) >= laterThreshold &&
                            Number(movie.vote_count || 0) >= 250
                          )
                          .sort((a, b) => movieImportance(b) - movieImportance(a))
                          .slice(0, 2);

                        if (laterMovies.length) {
                          later = `${name}'s later film work includes ${formatFilmList(laterMovies)}.`;
                        }
                      }

                      /*
                        DEFINING-ROLE SAFETY NET

                        The biggest movie in a filmography is not always the movie that
                        defines the star. Favor credits where the performer is top-billed,
                        then combine that with durable audience recognition. This keeps giant
                        ensemble films from automatically crowding out a central starring role.

                        Wikipedia still gets first chance to provide a clean signature-career
                        sentence. TMDB is the safety net when that prose misses obvious work.
                      */
                      const centralRoleImportance = movie => {
                        const votes = Number(movie?.vote_count || 0);
                        const popularity = Number(movie?.popularity || 0);
                        const rating = Number(movie?.vote_average || 0);
                        const order = Number.isFinite(Number(movie?.order))
                          ? Number(movie.order)
                          : 99;
                        const year = movieYear(movie);

                        const billingBonus =
                          order === 0 ? 34 :
                          order === 1 ? 27 :
                          order === 2 ? 20 :
                          order <= 4 ? 10 :
                          0;

                        /*
                          Vote count is useful, but logarithmic scoring prevents a massive
                          ensemble blockbuster from winning only because it has more votes.
                        */
                        const audienceScore = Math.log10(Math.max(votes, 1)) * 20;
                        const popularityScore = Math.min(popularity, 80) * 0.18;
                        const ratingScore = Math.max(rating - 5, 0) * 2.5;

                        /*
                          For otherwise comparable major credits, give a small advantage to
                          an earlier central role. This helps surface the film that established
                          a screen persona before later sequels/ensemble appearances.
                        */
                        const foundationBonus =
                          year && breakthroughYear && year >= breakthroughYear
                            ? Math.max(0, 10 - Math.min((year - breakthroughYear) * 0.35, 10))
                            : 0;

                        return audienceScore + popularityScore + ratingScore +
                          billingBonus + foundationBonus;
                      };

                      const selectedText = [breakthrough, defining, later]
                        .join(" ")
                        .toLowerCase();

                      const sourceLower = String(cleanedArticleText || "").toLowerCase();

                      const signatureCandidates = [...movies]
                        .filter(movie => {
                          const title = String(movie.title || "").trim();
                          if (!title) return false;

                          const votes = Number(movie.vote_count || 0);
                          const order = Number.isFinite(Number(movie.order))
                            ? Number(movie.order)
                            : 99;

                          /*
                            Require real audience recognition and meaningful billing.
                            Article mention is an extra confidence signal for older films.
                          */
                          return (
                            order <= 4 &&
                            (votes >= 900 || sourceLower.includes(title.toLowerCase()))
                          );
                        })
                        .sort((a, b) =>
                          centralRoleImportance(b) - centralRoleImportance(a) ||
                          movieYear(a) - movieYear(b)
                        );

                      const alreadyNamed = movie =>
                        selectedText.includes(String(movie.title || "").toLowerCase());

                      const missingSignature = signatureCandidates
                        .filter(movie => !alreadyNamed(movie))
                        .slice(0, 3);

                      /*
                        Only synthesize a defining-films line when Wikipedia has not already
                        supplied a strong signature-career sentence. This avoids replacing
                        good prose such as a clean franchise/defining-role explanation.
                      */
                      const definingIsSignature =
                        defining && signatureCareerTerms.test(defining);

                      if (!definingIsSignature && missingSignature.length) {
                        const definingLine =
                          `${name}'s defining films include ${formatFilmList(missingSignature)}.`;

                        defining = definingLine;
                      }

                      /*
                        Later work should represent a genuinely later achievement, not merely
                        another enormous ensemble title from the same franchise. Keep a strong
                        award/acclaim sentence when Wikipedia supplies one.
                      */
                      if (later && !awardTerms.test(later) && !signatureCareerTerms.test(later)) {
                        const laterMatches = sentenceMovieMatches(later, movies);
                        const laterBest = laterMatches.length
                          ? Math.max(...laterMatches.map(centralRoleImportance))
                          : 0;

                        if (laterBest < 85) {
                          later = "";
                        }
                      }

                      const polishCareerSentence = value => {
                        let sentence = cleanText(value);

                        sentence = sentence
                          .replace(/^His other lead role was in\s+/i, "He later starred in ")
                          .replace(/^Her other lead role was in\s+/i, "She later starred in ")
                          .replace(/^Their other lead role was in\s+/i, "They later starred in ")
                          .replace(/\s+,/g, ",")
                          .replace(/\s+/g, " ")
                          .trim();

                        return sentence;
                      };

                      const parts = [identity, breakthrough, defining, later]
                        .map(polishCareerSentence)
                        .filter(Boolean)
                        .filter(sentence =>
                          !incompleteFragmentTerms.test(sentence) &&
                          !publicityTerms.test(sentence) &&
                          !weakCareerTerms.test(sentence) &&
                          !contextlessTerms.test(sentence) &&
                          !plotSummaryTerms.test(sentence) &&
                          !/^edit\b/i.test(sentence) &&
                          !/\b(?:edit\s*)?Main article:/i.test(sentence) &&
                          !isOtherPersonSentence(sentence)
                        );

                      const unique = [];
                      const seen = new Set();

                      for (const sentence of parts) {
                        const key = sentence.toLowerCase();
                        if (seen.has(key)) continue;
                        seen.add(key);
                        unique.push(sentence);
                        if (unique.length >= 4) break;
                      }

                      let bio = unique.join(" ");

                      /*
                        Keep it mobile-friendly without cutting a sentence.
                      */
                      const MAX_CHARS = 1150;

                      if (bio.length > MAX_CHARS) {
                        const compact = [];
                        let length = 0;

                        for (const sentence of unique) {
                          const addition = sentence.length + (compact.length ? 1 : 0);
                          if (length + addition > MAX_CHARS) break;
                          compact.push(sentence);
                          length += addition;
                        }

                        if (compact.length >= 2) bio = compact.join(" ");
                      }

                      return bio;
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
                        biography = chooseCareerSentences(wikipediaCareerText, person);
                      }

                      if (!biography && wikipediaSummary) {
                        biography = chooseCareerSentences(wikipediaSummary, person);
                      }

                      if (!biography && tmdbBio) {
                        biography = chooseCareerSentences(tmdbBio, person);
                      }

                      biography =
                        biography ||
                        tmdbBio ||
                        wikipediaSummary ||
                        "";

                      return {
                        ...person,
                        biography,
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

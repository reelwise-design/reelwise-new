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

                      /*
                        Contract/business mechanics are rarely useful star-biography prose.
                        Reject them so a cleaner signature-role sentence can win instead.
                      */
                      const contractDetailTerms =
                        /\b(signed on|signed a deal|signed a contract|contracted to|optioned for|multi[- ]picture deal|multi[- ]film deal|negotiated|salary|paycheck|insurance bond|reprise (?:his|her|their) role in (?:two|three|multiple) sequels)\b/i;

                      const headlineArtifactTerms =
                        /(?:^|["'])[^.]{0,90}\b(?:final film|shelved for|festival debut|exclusive:|interview:|review:|obituary:)\b[^.]{0,140}["']?(?:\.|$)/i;

                      const releaseHistoryTerms =
                        /\b(?:in (?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4},?\s+)?(?:the )?(?:screen adaptation|film adaptation|motion-picture adaptation|film version)\b.{0,90}\b(?:was released|opened|premiered|debuted)\b|\b(?:was released|opened|premiered|debuted)\b.{0,90}\b(?:directed by|distributed by|produced by)\b/i;

                      const minorEarlyWorkTerms =
                        /\b(?:made-for-tv movie|made-for-television movie|television movie|tv movie|guest appearance|guest-starred|guest starred)\b/i;

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

                      const introSaysMusician = /\bmusician\b/i.test(introText);

                      const identity = isFilmmaker && isActingProfile
                        ? `${name} ${identityVerb} an actor and filmmaker.`
                        : introSaysActress
                          ? `${name} ${identityVerb} an actress${introSaysMusician ? " and musician" : ""}.`
                          : isActingProfile
                            ? `${name} ${identityVerb} an actor${introSaysMusician ? " and musician" : ""}.`
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
                        if (contractDetailTerms.test(sentence)) continue;
                        if (headlineArtifactTerms.test(sentence)) continue;
                        if (releaseHistoryTerms.test(sentence)) continue;
                        if (minorEarlyWorkTerms.test(sentence)) continue;
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
                            contractDetailTerms.test(combined) ||
                            headlineArtifactTerms.test(combined) ||
                            releaseHistoryTerms.test(combined) ||
                            minorEarlyWorkTerms.test(combined) ||
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
                          !contractDetailTerms.test(item.sentence) &&
                          !headlineArtifactTerms.test(item.sentence) &&
                          !releaseHistoryTerms.test(item.sentence) &&
                          !minorEarlyWorkTerms.test(item.sentence) &&
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
                        /*
                          Before manufacturing an early-film fallback, look for a clean
                          recognition/acclaim/award milestone tied to a real movie. This is
                          much more useful for a career story than merely selecting the
                          earliest reasonably popular credit.
                        */
                        const earlyMilestone = careerCandidates
                          .filter(item =>
                            item.matches.length &&
                            (breakthroughTerms.test(item.sentence) ||
                             awardTerms.test(item.sentence) ||
                             /\b(acclaim|acclaimed|recognition|prominence)\b/i.test(item.sentence))
                          )
                          .sort((a, b) =>
                            (a.earliestYear || 9999) - (b.earliestYear || 9999) ||
                            b.importance - a.importance
                          )[0];

                        if (earlyMilestone) {
                          breakthrough = earlyMilestone.sentence;
                          earlyMilestone.matches.forEach(movie => usedMovieIds.add(movie.id));
                        } else {
                          const chronological = [...movies]
                            .filter(movie => movieYear(movie) > 0)
                            .sort((a, b) => movieYear(a) - movieYear(b));

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
                      }

                      /*
                        Lifetime-aware credit filter. This MUST live outside the
                        `if (!defining)` branch because the career-arc engine below
                        uses it whether or not Wikipedia already supplied a defining
                        sentence. Keeping it branch-scoped caused the career builder
                        to throw and fall back to the generic source biography.
                      */
                      const deathYear =
                        parseInt(String(person?.deathday || "").slice(0, 4), 10) || 0;

                      const releasedDuringLifetime = movie => {
                        const year = movieYear(movie);
                        return !deathYear || !year || year <= deathYear;
                      };

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

                      /*
                        Do not manufacture a generic "later film work" list here.
                        The career-story engine below first looks for a distinct
                        award/acclaim milestone. A movie-only fallback is used only
                        after that search fails.
                      */

                      /*
                        REELWISE CAREER-ARC ENGINE

                        Build distinct career beats instead of simply listing the
                        three biggest movies:
                          1. breakthrough / early recognition
                          2. signature or defining role
                          3. other major work
                          4. later-career achievement / award

                        No actor or movie is hard-coded.
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
                          order === 0 ? 42 :
                          order === 1 ? 32 :
                          order === 2 ? 22 :
                          order <= 4 ? 10 : 0;

                        const audienceScore = Math.log10(Math.max(votes, 1)) * 18;
                        const popularityScore = Math.min(popularity, 70) * 0.12;
                        const ratingScore = Math.max(rating - 5, 0) * 2;

                        const foundationBonus =
                          year && breakthroughYear && year >= breakthroughYear
                            ? Math.max(0, 14 - Math.min((year - breakthroughYear) * 0.45, 14))
                            : 0;

                        return audienceScore + popularityScore + ratingScore +
                          billingBonus + foundationBonus;
                      };

                      const selectedText = [breakthrough, defining, later]
                        .join(" ")
                        .toLowerCase();

                      const sourceLower = String(cleanedArticleText || "").toLowerCase();

                      const majorCentralCredits = [...movies]
                        .filter(movie => {
                          const title = String(movie.title || "").trim();
                          if (!title) return false;

                          const votes = Number(movie.vote_count || 0);
                          const order = Number.isFinite(Number(movie.order))
                            ? Number(movie.order)
                            : 99;

                          return releasedDuringLifetime(movie) &&
                            order <= 4 &&
                            (votes >= 700 || sourceLower.includes(title.toLowerCase()));
                        })
                        .sort((a, b) =>
                          centralRoleImportance(b) - centralRoleImportance(a) ||
                          movieYear(a) - movieYear(b)
                        );

                      const normalizedCharacter = value =>
                        String(value || "")
                          .toLowerCase()
                          .replace(/\([^)]*\)/g, " ")
                          .replace(/\b(?:voice|uncredited|archive footage|cameo)\b/g, " ")
                          .replace(/[^a-z0-9]+/g, " ")
                          .replace(/\s+/g, " ")
                          .trim();

                      /*
                        Repeated major characters are a strong generic signal of a
                        signature screen role. Prefer the earliest substantial appearance
                        instead of automatically selecting a later ensemble sequel.
                      */
                      const recurringCharacterCounts = new Map();

                      const characterKey = movie => {
                        const character = normalizedCharacter(movie?.character);
                        if (!character || character.length < 3) return "";

                        return character
                          .split(" ")
                          .filter(word => word.length > 2)
                          .slice(0, 3)
                          .join(" ");
                      };

                      for (const movie of majorCentralCredits) {
                        const key = characterKey(movie);
                        if (!key) continue;
                        recurringCharacterCounts.set(
                          key,
                          (recurringCharacterCounts.get(key) || 0) + 1
                        );
                      }

                      const recurringRoleCredits = majorCentralCredits
                        .filter(movie => {
                          const key = characterKey(movie);
                          return key && (recurringCharacterCounts.get(key) || 0) >= 2;
                        })
                        .sort((a, b) =>
                          movieYear(a) - movieYear(b) ||
                          centralRoleImportance(b) - centralRoleImportance(a)
                        );

                      const alreadyNamed = movie =>
                        selectedText.includes(String(movie.title || "").toLowerCase());

                      /*
                        GENERIC FRANCHISE / SEQUEL AWARENESS

                        Treat obvious numbered/part sequels as the same career franchise
                        as their base film. This prevents a biography from using, for
                        example, an original film for one career beat and then immediately
                        selecting its sequel as a separate defining achievement.

                        No actor or franchise titles are hard-coded.
                      */
                      const franchiseRoot = value => {
                        let title = String(value || "")
                          .toLowerCase()
                          .replace(/[’']/g, "'")
                          .replace(/\([^)]*\)/g, " ")
                          .replace(/[^a-z0-9' ]+/g, " ")
                          .replace(/\s+/g, " ")
                          .trim();

                        // Remove common sequel markers from the end of a title.
                        title = title
                          .replace(/\s+(?:part|chapter|episode)\s+(?:[ivxlcdm]+|\d+)$/i, "")
                          .replace(/\s+(?:[ivxlcdm]{1,6}|\d+)$/i, "")
                          .replace(/\s+/g, " ")
                          .trim();

                        return title;
                      };

                      const representedFranchiseRoots = new Set(
                        movies
                          .filter(movie => alreadyNamed(movie))
                          .map(movie => franchiseRoot(movie.title))
                          .filter(Boolean)
                      );

                      const repeatsRepresentedFranchise = movie => {
                        const root = franchiseRoot(movie?.title);
                        return Boolean(root && representedFranchiseRoots.has(root));
                      };

                      /*
                        RELATED-FRANCHISE DETECTION

                        Some franchises change title shape between installments
                        (for example, an original title can later gain a character name
                        or subtitle). Exact franchise roots alone cannot catch those.
                        Use recurring character data plus meaningful title-token overlap
                        as generic signals. No franchise names are hard-coded.
                      */
                      const franchiseTitleTokens = value => {
                        const stop = new Set([
                          "the", "a", "an", "and", "of", "in", "on", "to", "for",
                          "part", "chapter", "episode", "movie", "film"
                        ]);

                        return franchiseRoot(value)
                          .split(/[^a-z0-9]+/)
                          .filter(word =>
                            word.length >= 3 &&
                            !stop.has(word) &&
                            !/^(?:[ivxlcdm]+|\d+)$/.test(word)
                          );
                      };

                      const sameCareerFranchise = (a, b) => {
                        if (!a || !b) return false;

                        const aRoot = franchiseRoot(a.title);
                        const bRoot = franchiseRoot(b.title);
                        if (aRoot && bRoot && aRoot === bRoot) return true;

                        const aCharacter = characterKey(a);
                        const bCharacter = characterKey(b);
                        if (aCharacter && bCharacter && aCharacter === bCharacter) {
                          return true;
                        }

                        const aTokens = franchiseTitleTokens(a.title);
                        const bTokens = franchiseTitleTokens(b.title);
                        const shared = aTokens.filter(token => bTokens.includes(token));

                        if (shared.length >= 2) return true;

                        // A distinctive long token plus a sequel marker is also useful.
                        const sequelish = /\b(?:part|chapter|episode|[ivxlcdm]{1,6}|\d+)\b/i;
                        if (
                          shared.some(token => token.length >= 6) &&
                          (sequelish.test(String(a.title || "")) ||
                           sequelish.test(String(b.title || "")))
                        ) {
                          return true;
                        }

                        return false;
                      };

                      const nonFranchiseSignatureScore = movie => {
                        const votes = Number(movie?.vote_count || 0);
                        const rating = Number(movie?.vote_average || 0);
                        const popularity = Number(movie?.popularity || 0);
                        const order = Number.isFinite(Number(movie?.order))
                          ? Number(movie.order)
                          : 99;

                        /*
                          The defining-film slot is independent of Wikipedia prose.
                          Top billing and durable audience recognition carry the most
                          weight. Current popularity is deliberately capped and minor.

                          Keep this scorer self-contained: it runs before some later
                          biography helpers are initialized.
                        */
                        const billing =
                          order === 0 ? 78 :
                          order === 1 ? 62 :
                          order === 2 ? 46 :
                          order === 3 ? 28 :
                          order <= 5 ? 12 : 0;

                        const recognition = Math.log10(Math.max(votes, 1)) * 30;
                        const quality = Math.max(rating - 5, 0) * 5;
                        const popularityScore = Math.min(popularity, 60) * 0.08;

                        return billing + recognition + quality + popularityScore;
                      };

                      /*
                        Reserve a defining-film candidate directly from TMDB filmography.
                        Wikipedia does not have to mention the movie for it to qualify.
                      */
                      const definingFilmPool = [...movies]
                        .filter(movie => {
                          const title = String(movie?.title || "").trim();
                          const votes = Number(movie?.vote_count || 0);
                          const order = Number.isFinite(Number(movie?.order))
                            ? Number(movie.order)
                            : 99;

                          return releasedDuringLifetime(movie) &&
                            title &&
                            order <= 5 &&
                            votes >= 500;
                        })
                        .sort((a, b) =>
                          nonFranchiseSignatureScore(b) - nonFranchiseSignatureScore(a) ||
                          movieYear(a) - movieYear(b)
                        );

                      const nonFranchiseSignature =
                        definingFilmPool.find(movie => !alreadyNamed(movie)) ||
                        majorCentralCredits.find(movie => !alreadyNamed(movie)) ||
                        null;

                      const signatureFilm =
                        recurringRoleCredits.find(movie =>
                          !alreadyNamed(movie) &&
                          !repeatsRepresentedFranchise(movie)
                        ) ||
                        definingFilmPool.find(movie =>
                          !alreadyNamed(movie) &&
                          !repeatsRepresentedFranchise(movie)
                        ) ||
                        nonFranchiseSignature ||
                        null;

                      const definingMatchesSignature =
                        defining &&
                        signatureFilm &&
                        sentenceMovieMatches(defining, [signatureFilm]).length > 0 &&
                        signatureCareerTerms.test(defining);

                      /*
                        The defining-film beat is reserved independently from Wikipedia.
                        A clean Wikipedia sentence may keep the slot only when it actually
                        describes the same defining film; otherwise TMDB supplies the film.
                      */
                      if (signatureFilm && !definingMatchesSignature) {
                        defining =
                          `${name} became especially identified with ${formatFilmList([signatureFilm])}.`;
                      }

                      /*
                        Preserve a separate award/acclaim milestone. Selecting a defining
                        role should never erase a later Oscar, nomination, or equivalent
                        career achievement already present in the source material.
                      */
                      const normalizeForComparison = value =>
                        cleanText(value)
                          .toLowerCase()
                          .replace(/[^a-z0-9 ]+/g, " ")
                          .replace(/\s+/g, " ")
                          .trim();

                      const isDuplicateMeaning = (a, b) => {
                        const left = normalizeForComparison(a);
                        const right = normalizeForComparison(b);

                        if (!left || !right) return false;
                        if (left === right) return true;
                        if (left.length >= 45 && right.includes(left)) return true;
                        if (right.length >= 45 && left.includes(right)) return true;

                        return false;
                      };

                      const awardMilestones = careerCandidates
                        .filter(item =>
                          awardTerms.test(item.sentence) &&
                          item.matches.length &&
                          !personalTerms.test(item.sentence) &&
                          !publicityTerms.test(item.sentence) &&
                          !contractDetailTerms.test(item.sentence) &&
                          !headlineArtifactTerms.test(item.sentence) &&
                          !releaseHistoryTerms.test(item.sentence) &&
                          !weakCareerTerms.test(item.sentence) &&
                          !plotSummaryTerms.test(item.sentence) &&
                          !isDuplicateMeaning(item.sentence, breakthrough) &&
                          !isDuplicateMeaning(item.sentence, defining)
                        )
                        .sort((a, b) => {
                          const aYear = Math.max(
                            sentenceYear(a.sentence) || 0,
                            a.latestYear || 0
                          );
                          const bYear = Math.max(
                            sentenceYear(b.sentence) || 0,
                            b.latestYear || 0
                          );

                          return bYear - aYear ||
                            sentenceImportance(b) - sentenceImportance(a);
                        });

                      const strongestAwardMilestone =
                        awardMilestones.length ? awardMilestones[0].sentence : "";

                      if (strongestAwardMilestone) {
                        later = strongestAwardMilestone;
                      } else if (!later) {
                        /*
                          If there is no distinct later award milestone, prefer the
                          strongest remaining career-defining credit rather than simply
                          the latest acceptable movie. This prevents a minor late title
                          from displacing a much more important mid-career film.
                        */
                        const laterMovies = majorCentralCredits
                          .filter(movie =>
                            movie !== signatureFilm &&
                            !alreadyNamed(movie) &&
                            releasedDuringLifetime(movie)
                          )
                          .sort((a, b) =>
                            nonFranchiseSignatureScore(b) - nonFranchiseSignatureScore(a) ||
                            movieYear(a) - movieYear(b)
                          )
                          .slice(0, 2);

                        if (laterMovies.length) {
                          later = `Other major work includes ${formatFilmList(laterMovies)}.`;
                        }
                      }

                      /*
                        Add one different major central credit when it supplies another
                        career beat. Avoid immediately repeating the same recurring role.
                      */
                      const signatureCharacterKey =
                        signatureFilm ? characterKey(signatureFilm) : "";

                      const otherMajor = majorCentralCredits.find(movie => {
                        if (!movie || movie === signatureFilm || alreadyNamed(movie)) return false;

                        const key = characterKey(movie);

                        if (
                          signatureCharacterKey &&
                          key &&
                          key === signatureCharacterKey
                        ) {
                          return false;
                        }

                        /*
                          If a signature recurring role has been found, avoid another
                          movie whose title is part of the same obvious series run.
                          Character matching is the primary signal; this title check is
                          only a secondary guard for inconsistent TMDB character strings.
                        */
                        if (signatureFilm) {
                          const signatureTitleWords = String(signatureFilm.title || "")
                            .toLowerCase()
                            .split(/[^a-z0-9]+/)
                            .filter(word => word.length >= 4);

                          const candidateTitle = String(movie.title || "").toLowerCase();

                          if (
                            signatureTitleWords.length &&
                            signatureTitleWords.some(word => candidateTitle.includes(word))
                          ) {
                            return false;
                          }
                        }

                        return true;
                      });

                      let otherMajorLine = "";

                      /*
                        Preserve one additional distinct high-significance film whenever
                        the filmography supports it. An award/acclaim milestone must not
                        suppress this slot: the milestone describes recognition, while
                        this line broadens the actual screen-career story.
                      */
                      if (
                        otherMajor &&
                        releasedDuringLifetime(otherMajor)
                      ) {
                        otherMajorLine =
                          `Other major work includes ${formatFilmList([otherMajor])}.`;
                      }

                      /*
                        CAREER-ERA COVERAGE

                        Long careers should not read as though they ended after the first
                        successful decade. When the filmography spans multiple eras, reserve
                        a later-career beat from substantially newer, centrally billed,
                        well-recognized work. Prefer distinct franchises/roles rather than
                        another installment of a franchise already represented.

                        This is generic and data-driven: no actor, franchise, or movie is
                        hard-coded.
                      */
                      const lifetimeYears = movies
                        .filter(releasedDuringLifetime)
                        .map(movieYear)
                        .filter(Boolean);

                      const careerStartYear = lifetimeYears.length
                        ? Math.min(...lifetimeYears)
                        : 0;
                      const careerEndYear = lifetimeYears.length
                        ? Math.max(...lifetimeYears)
                        : 0;
                      const careerSpanYears =
                        careerStartYear && careerEndYear
                          ? careerEndYear - careerStartYear
                          : 0;

                      const earlyAnchorYear = Math.max(
                        breakthroughYear || 0,
                        signatureFilm ? movieYear(signatureFilm) : 0,
                        careerStartYear || 0
                      );

                      const laterEraFloor = earlyAnchorYear
                        ? earlyAnchorYear + (careerSpanYears >= 30 ? 15 : 10)
                        : 0;

                      const representedBeforeEra = [
                        signatureFilm,
                        otherMajor
                      ].filter(Boolean);

                      /*
                        Later-career milestone weighting.

                        A later film gets an additional significance boost when the source
                        biography connects it to awards, nominations, acclaim, a comeback,
                        revival, or a return to a well-known role. This keeps a merely
                        popular later title from outranking a documented late-career
                        milestone. The rule is generic and uses source text + TMDB credits.
                      */
                      const laterMilestoneTerms = /\b(?:academy award|oscar|golden globe|bafta|sag award|screen actors guild|emmy|cannes|venice|volpi|award|awards|nominee|nominated|nomination|won|winning|acclaim|acclaimed|comeback|revival|returned|returning|reprise|reprised|reprising)\b/i;

                      const sourceSentencesForMovie = movie =>
                        careerCandidates.filter(item =>
                          item.matches.some(match => match.id === movie.id)
                        );

                      const laterMilestoneScore = movie => {
                        const sourceItems = sourceSentencesForMovie(movie);
                        const milestoneEvidence = sourceItems.reduce((score, item) => {
                          let boost = 0;
                          if (awardTerms.test(item.sentence)) boost += 90;
                          if (laterMilestoneTerms.test(item.sentence)) boost += 55;
                          if (signatureCareerTerms.test(item.sentence)) boost += 30;
                          return Math.max(score, boost);
                        }, 0);

                        return nonFranchiseSignatureScore(movie) + milestoneEvidence;
                      };

                      const laterEraPool = majorCentralCredits
                        .filter(movie => {
                          const year = movieYear(movie);
                          const votes = Number(movie?.vote_count || 0);
                          const order = Number.isFinite(Number(movie?.order))
                            ? Number(movie.order)
                            : 99;

                          if (!releasedDuringLifetime(movie)) return false;
                          if (!year || !laterEraFloor || year < laterEraFloor) return false;
                          if (order > 5 || votes < 750) return false;
                          if (alreadyNamed(movie)) return false;

                          return !representedBeforeEra.some(existing =>
                            sameCareerFranchise(movie, existing)
                          );
                        })
                        .sort((a, b) =>
                          laterMilestoneScore(b) - laterMilestoneScore(a) ||
                          movieYear(b) - movieYear(a)
                        );

                      const laterEraPicks = [];
                      for (const movie of laterEraPool) {
                        if (
                          laterEraPicks.some(existing =>
                            sameCareerFranchise(movie, existing)
                          )
                        ) {
                          continue;
                        }

                        laterEraPicks.push(movie);
                        if (laterEraPicks.length >= (careerSpanYears >= 30 ? 2 : 1)) break;
                      }

                      let laterEraLine = "";
                      if (laterEraPicks.length) {
                        laterEraLine =
                          `Later career work includes ${formatFilmList(laterEraPicks)}.`;
                      }

                      const polishCareerSentence = value => {
                        let sentence = cleanText(value);

                        /*
                          Wikipedia sometimes frames a major performance as an ordinal
                          filmography fact ("His sixth feature film was ..."). Preserve
                          the useful award/acclaim information while removing the trivia-
                          like setup so the result reads as a Reelwise career biography.
                        */
                        sentence = sentence.replace(
                          /^(?:His|Her|Their)\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+feature film was\s+(?:[^,]{1,80}['’]s\s+)?(.+?),\s+for which\s+(?:the\s+\d+-year-old\s+)?[^,]+\s+(received|earned|won)\s+/i,
                          (_, film, verb) => `In ${film}, ${name} ${verb.toLowerCase()} `
                        );

                        sentence = sentence
                          .replace(/^His other lead role was in\s+/i, "He later starred in ")
                          .replace(/^Her other lead role was in\s+/i, "She later starred in ")
                          .replace(/^Their other lead role was in\s+/i, "They later starred in ")
                          .replace(/\s+,/g, ",")
                          .replace(/\s+/g, " ")
                          .trim();

                        return sentence
                          .replace(`${name}'s defining films include `, "Defining work includes ")
                          .replace(`${name}'s later film work includes `, "Later work includes ")
                          .replace(`${name}'s early notable film work included `, "Early notable work included ");
                      };

                      /*
                        Assemble career beats chronologically. Identity stays first; every
                        other beat is dated from the films it mentions (falling back to an
                        explicit year in the sentence). This prevents a later-career film
                        from appearing before an earlier awards milestone.
                      */
                      const rawCareerParts = [breakthrough, defining, otherMajorLine, laterEraLine, later]
                        .map(polishCareerSentence)
                        .filter(Boolean);

                      const careerBeatYear = sentence => {
                        const matches = sentenceMovieMatches(sentence, movies);
                        const years = matches.map(movieYear).filter(Boolean);
                        if (years.length) return Math.min(...years);
                        return sentenceYear(sentence) || 9999;
                      };

                      const parts = [
                        ...([polishCareerSentence(identity)].filter(Boolean)),
                        ...rawCareerParts.sort((a, b) =>
                          careerBeatYear(a) - careerBeatYear(b)
                        )
                      ]
                        .filter(Boolean)
                        .filter(sentence =>
                          !incompleteFragmentTerms.test(sentence) &&
                          !publicityTerms.test(sentence) &&
                          !contractDetailTerms.test(sentence) &&
                          !headlineArtifactTerms.test(sentence) &&
                          !releaseHistoryTerms.test(sentence) &&
                          !minorEarlyWorkTerms.test(sentence) &&
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
                        if (unique.length >= 6) break;
                      }

                      /*
                        FINAL CAREER-COVERAGE GATE

                        The earlier selectors can legitimately use an awards sentence and
                        a defining-film sentence while still leaving another major central
                        credit unrepresented. Do one final coverage pass against the text
                        that will actually be returned, rather than against intermediate
                        selector state.

                        This is intentionally generic: no actor or movie titles are
                        hard-coded. A candidate must be a substantial, lifetime-released,
                        centrally billed credit with strong audience recognition, and it
                        must not already appear anywhere in the assembled biography.
                      */
                      const representedCareerText = unique.join(" ").toLowerCase();

                      const finalCoverageCandidate = majorCentralCredits.find(movie => {
                        const title = String(movie?.title || "").trim();
                        if (!title) return false;
                        if (representedCareerText.includes(title.toLowerCase())) return false;
                        if (!releasedDuringLifetime(movie)) return false;

                        const candidateRoot = franchiseRoot(title);
                        const representedMovieRoots = new Set(
                          movies
                            .filter(item =>
                              representedCareerText.includes(
                                String(item?.title || "").toLowerCase()
                              )
                            )
                            .map(item => franchiseRoot(item.title))
                            .filter(Boolean)
                        );

                        if (candidateRoot && representedMovieRoots.has(candidateRoot)) {
                          return false;
                        }

                        const representedMovies = movies.filter(item =>
                          representedCareerText.includes(
                            String(item?.title || "").toLowerCase()
                          )
                        );

                        if (
                          representedMovies.some(item =>
                            sameCareerFranchise(movie, item)
                          )
                        ) {
                          return false;
                        }

                        const votes = Number(movie?.vote_count || 0);
                        const order = Number.isFinite(Number(movie?.order))
                          ? Number(movie.order)
                          : 99;

                        // Keep this final gate selective so it broadens strong careers
                        // without manufacturing filler for thin filmographies.
                        return order <= 4 && votes >= 1000;
                      });

                      if (finalCoverageCandidate && unique.length < 6) {
                        const coverageLine =
                          `Other major work includes ${formatFilmList([finalCoverageCandidate])}.`;

                        // Put the extra career beat before a generic later-work closer.
                        const laterIndex = unique.findIndex(sentence =>
                          /^(?:Later work|Later film work|In later work)\b/i.test(sentence)
                        );

                        if (laterIndex >= 0) unique.splice(laterIndex, 0, coverageLine);
                        else unique.push(coverageLine);
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

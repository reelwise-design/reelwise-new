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

                      /*
                        IDENTITY QUALITY GUARD

                        A bare "X is an actor/actress" sentence adds no useful Reelwise
                        information, so omit it. Keep the identity beat only when the
                        source opening supplies a meaningful descriptor (for example a
                        nationality) or a second genuine profession such as filmmaker or
                        musician. This is source-driven; no nationality is inferred.
                      */
                      const introIdentityMatch = introText.match(
                        new RegExp(
                          `(?:^|\\b)${escapeRegExp(name)}\\s+(?:is|was)\\s+(?:an?\\s+)?([^.!?]{0,80}?\\b(?:actor|actress)\\b(?:[^.!?]{0,45})?)`,
                          "i"
                        )
                      );

                      const introIdentityPhrase = cleanText(introIdentityMatch?.[1] || "")
                        .replace(/\s+/g, " ")
                        .trim();

                      const bareOccupationOnly = /^(?:actor|actress)$/i.test(introIdentityPhrase);
                      const hasMeaningfulIdentityDescriptor = Boolean(
                        introIdentityPhrase &&
                        !bareOccupationOnly &&
                        introIdentityPhrase.length <= 95
                      );

                      let identity = "";

                      if (hasMeaningfulIdentityDescriptor) {
                        identity = `${name} ${identityVerb} ${/^[aeiou]/i.test(introIdentityPhrase) ? "an" : "a"} ${introIdentityPhrase}.`;
                      } else if (isFilmmaker && isActingProfile) {
                        identity = `${name} ${identityVerb} an actor and filmmaker.`;
                      } else if (introSaysMusician && isActingProfile) {
                        identity = `${name} ${identityVerb} ${introSaysActress ? "an actress" : "an actor"} and musician.`;
                      }


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

                      /*
                        SETUP-ONLY BREAKTHROUGH REPAIR

                        A literal screen/feature debut is useful context, but for performers
                        who worked for years before becoming widely recognized it should not
                        consume the breakthrough slot. When the first selected sentence is only
                        a debut/setup fact, search the source for the earliest film-specific
                        recognition, acclaim, prominence, award, or true breakout milestone.

                        This is intentionally generic: no performer or movie is hard-coded.
                      */
                      const breakthroughIsOnlyDebut = Boolean(
                        breakthrough &&
                        /\b(?:film debut|feature film debut|screen debut|made (?:his|her|their) (?:film|feature|screen) debut|debuted)\b/i.test(breakthrough) &&
                        !/\b(?:breakthrough|breakout|rose to prominence|gained recognition|gained critical acclaim|critical acclaim|widely recognized|became a star|stardom|career-defining|academy award|oscar|golden globe|bafta|award|nomination|nominated|won)\b/i.test(breakthrough)
                      );

                      if (breakthroughIsOnlyDebut) {
                        const recognitionTerms =
                          /\b(?:breakthrough|breakout|rose to prominence|gained recognition|gained critical acclaim|critical acclaim|widely recognized|became a star|stardom|career-defining|academy award|oscar|golden globe|bafta|award|nomination|nominated|won|cannes|best supporting actor|best actor|best actress)\b/i;

                        const recognitionCandidates = sentences
                          .map((sentence, index) => ({
                            sentence,
                            index,
                            matches: sentenceMovieMatches(sentence, movies)
                          }))
                          .filter(item =>
                            item.matches.length &&
                            recognitionTerms.test(item.sentence) &&
                            !personalTerms.test(item.sentence) &&
                            !publicityTerms.test(item.sentence) &&
                            !contractDetailTerms.test(item.sentence) &&
                            !headlineArtifactTerms.test(item.sentence) &&
                            !releaseHistoryTerms.test(item.sentence) &&
                            !minorEarlyWorkTerms.test(item.sentence) &&
                            !weakCareerTerms.test(item.sentence) &&
                            !plotSummaryTerms.test(item.sentence) &&
                            !isOtherPersonSentence(item.sentence)
                          )
                          .map(item => ({
                            ...item,
                            year: Math.min(...item.matches.map(movieYear).filter(Boolean)) || 9999
                          }))
                          .sort((a, b) => a.year - b.year || a.index - b.index);

                        if (recognitionCandidates.length) {
                          breakthrough = recognitionCandidates[0].sentence;
                          breakthroughMovies = recognitionCandidates[0].matches;
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

                      /*
                        A film counts as already represented only when its own title is
                        present in the selected biography text. Do not treat a shorter
                        title as represented merely because it is the prefix of a
                        different, longer credit (for example, "X" inside "X: Y").
                      */
                      const alreadyNamed = movie => {
                        const target = normalizeFilmTitle(movie?.title);
                        if (!target) return false;

                        const text = normalizeFilmTitle(selectedText);
                        if (!text) return false;

                        const longerKnownTitles = movies
                          .map(item => normalizeFilmTitle(item?.title))
                          .filter(title =>
                            title &&
                            title !== target &&
                            title.startsWith(`${target} `)
                          );

                        let start = 0;

                        while (true) {
                          const index = text.indexOf(target, start);
                          if (index < 0) return false;

                          const before = index === 0 ? " " : text[index - 1];
                          const afterIndex = index + target.length;
                          const after = afterIndex >= text.length ? " " : text[afterIndex];

                          const hasWordBoundaries =
                            !/[a-z0-9]/.test(before) &&
                            !/[a-z0-9]/.test(after);

                          if (hasWordBoundaries) {
                            const tail = text.slice(index);

                            const swallowedByLongerCredit = longerKnownTitles.some(
                              longerTitle => tail.startsWith(longerTitle)
                            );

                            if (!swallowedByLongerCredit) return true;
                          }

                          start = index + target.length;
                        }
                      };

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

                      /*
                        A recurring character is useful only when it represents a new
                        career chapter. Reject generic one-word character collisions,
                        and reject another appearance of a character already represented
                        by an earlier selected film. This prevents incidental credits or
                        same-role repeats from taking the defining-film slot.
                      */
                      const representedCharacterKeys = new Set(
                        movies
                          .filter(movie => alreadyNamed(movie))
                          .map(movie => characterKey(movie))
                          .filter(Boolean)
                      );

                      const strongRecurringRoleCredits = recurringRoleCredits.filter(movie => {
                        const key = characterKey(movie);
                        if (!key) return false;

                        const meaningfulTokens = key
                          .split(" ")
                          .filter(token => token.length >= 3);

                        if (meaningfulTokens.length < 2) return false;
                        if (representedCharacterKeys.has(key)) return false;

                        return !alreadyNamed(movie) &&
                          !repeatsRepresentedFranchise(movie);
                      });

                      /*
                        STAGE-BASED DEFINING ROLE SELECTION

                        The defining slot must come from the performer's breakthrough/prime
                        career window. A much later popular film or recurring franchise role
                        cannot leap backward and replace the work that defined the star.

                        Source evidence matters: films tied by the article to awards, acclaim,
                        recognition, prominence, iconic/signature language or major success
                        receive a large boost. Recurring-role evidence is only a bonus inside
                        the proper career stage; it is never first priority by itself.
                      */
                      const definingEvidenceTerms =
                        /\b(?:academy award|oscar|golden globe|bafta|cannes|award|awards|nominee|nominated|nomination|won|winning|acclaim|acclaimed|recognition|prominence|breakthrough|breakout|iconic|signature|defining|career-defining|major success|critical and commercial success|became a star|stardom)\b/i;

                      /*
                        PERSON 20 — SOURCE-FIRST DEFINING EVIDENCE

                        A defining film should win because the biography actually connects
                        that performance to career-level recognition, not because a later
                        title happens to have stronger TMDB popularity or billing. Evidence
                        must be attached directly to the film sentence (or a tightly bridged
                        following sentence), preventing neighboring awards from leaking onto
                        the wrong title. Major film-award recognition receives the strongest
                        generic weight. No performer or movie is hard-coded.
                      */
                      const definingSourceEvidence = movie => {
                        const title = String(movie?.title || "").trim().toLowerCase();
                        if (!title) return 0;

                        const prestigeAwardTerms =
                          /\b(?:academy award|oscar|palme d'or|cannes film festival award|golden globe|bafta)\b/i;
                        const directCareerTerms =
                          /\b(?:breakthrough|breakout|career-defining|defining|iconic|signature|rose to prominence|gained recognition|gained critical acclaim|critical acclaim|major success|became a star|stardom)\b/i;
                        const bridgeTerms =
                          /^(?:for (?:his|her|their|the) (?:performance|role|portrayal)|for this (?:performance|role|portrayal)|the (?:performance|role|portrayal)|his (?:performance|role|portrayal)|her (?:performance|role|portrayal)|their (?:performance|role|portrayal)|this (?:performance|role|portrayal)|for which (?:he|she|they)|it earned (?:him|her|them)|the film earned (?:him|her|them))\b/i;

                        let best = 0;
                        let mentions = 0;

                        for (let i = 0; i < sentences.length; i += 1) {
                          const current = cleanText(sentences[i] || "");
                          if (!current.toLowerCase().includes(title)) continue;
                          mentions += 1;

                          let score = 0;
                          if (prestigeAwardTerms.test(current)) score = Math.max(score, 260);
                          if (awardTerms.test(current)) score = Math.max(score, 180);
                          if (directCareerTerms.test(current)) score = Math.max(score, 170);
                          if (signatureCareerTerms.test(current)) score = Math.max(score, 120);
                          if (breakthroughTerms.test(current)) score = Math.max(score, 110);

                          if (i + 1 < sentences.length) {
                            const next = cleanText(sentences[i + 1] || "");
                            if (bridgeTerms.test(next)) {
                              if (prestigeAwardTerms.test(next)) score = Math.max(score, 245);
                              if (awardTerms.test(next)) score = Math.max(score, 170);
                              if (directCareerTerms.test(next)) score = Math.max(score, 150);
                            }
                          }

                          best = Math.max(best, score);
                        }

                        // Repeated source prominence is useful, but can never overpower
                        // explicit award/acclaim evidence by itself.
                        return best + Math.min(mentions * 10, 40);
                      };

                      const firstSubstantialYear = [...movies]
                        .filter(releasedDuringLifetime)
                        .filter(movie => Number(movie?.vote_count || 0) >= 500)
                        .map(movieYear)
                        .filter(Boolean)
                        .sort((a, b) => a - b)[0] || 0;

                      const definingAnchorYear = breakthroughYear || firstSubstantialYear || 0;
                      const definingWindowEnd = definingAnchorYear
                        ? definingAnchorYear + 10
                        : 0;

                      const recurringKeys = new Set(
                        strongRecurringRoleCredits.map(movie => characterKey(movie)).filter(Boolean)
                      );

                      const definingStageScore = movie => {
                        const recurringBonus = recurringKeys.has(characterKey(movie)) ? 10 : 0;
                        const sourceScore = definingSourceEvidence(movie);

                        // Source-backed career significance is the primary signal. TMDB
                        // recognition breaks ties rather than choosing the career story.
                        return (sourceScore * 3) +
                          nonFranchiseSignatureScore(movie) + recurringBonus;
                      };

                      const definingStagePool = definingFilmPool
                        .filter(movie => {
                          const year = movieYear(movie);
                          if (!year || alreadyNamed(movie) || repeatsRepresentedFranchise(movie)) return false;
                          if (definingAnchorYear && year < definingAnchorYear - 2) return false;
                          if (definingWindowEnd && year > definingWindowEnd) return false;
                          return true;
                        })
                        .sort((a, b) =>
                          definingStageScore(b) - definingStageScore(a) ||
                          movieYear(a) - movieYear(b)
                        );

                      let signatureFilm =
                        definingStagePool[0] ||
                        definingFilmPool.find(movie =>
                          !alreadyNamed(movie) &&
                          !repeatsRepresentedFranchise(movie)
                        ) ||
                        nonFranchiseSignature ||
                        null;

                      /*
                        EARLY-STARDOM STAGE GUARD

                        Some source biographies begin with a literal debut/supporting-role
                        sentence but never explicitly label the film that actually moved the
                        performer into major stardom. In that narrow situation, reserve the
                        defining-film slot for the strongest centrally billed, widely seen
                        film from the performer's first major career window.

                        This does NOT run when the existing breakthrough already contains
                        strong success/stardom/recognition/award language. That preserves
                        established career arcs while preventing a later franchise installment
                        from jumping over an otherwise missing early star-making milestone.
                        No performer, movie or franchise is hard-coded.
                      */
                      const breakthroughLooksLikeSetupOnly = Boolean(
                        breakthrough &&
                        /\b(?:film debut|screen debut|debut|bit part|supporting role|early role|early roles)\b/i.test(breakthrough) &&
                        !/\b(?:breakthrough|breakout|critical and commercial success|major success|box[- ]office success|became a star|stardom|global stardom|superstar|rose to prominence|gained recognition|gained critical acclaim|academy award|oscar|golden globe|bafta|award|nomination|nominated|won)\b/i.test(breakthrough)
                      );

                      if (breakthroughLooksLikeSetupOnly) {
                        /*
                          A literal debut is setup, not a Reelwise breakthrough. Before using
                          a synthetic film fallback, replace it with the earliest source-backed
                          recognition/acclaim/award milestone tied to a real movie.
                        */
                        const sourceBackedEarlyMilestone = careerCandidates
                          .filter(item =>
                            item.matches.length &&
                            !minorEarlyWorkTerms.test(item.sentence) &&
                            (awardTerms.test(item.sentence) ||
                             breakthroughTerms.test(item.sentence) ||
                             /\b(?:acclaim|acclaimed|recognition|prominence|breakout|breakthrough)\b/i.test(item.sentence))
                          )
                          .sort((a, b) =>
                            (a.earliestYear || 9999) - (b.earliestYear || 9999) ||
                            b.importance - a.importance
                          )[0];

                        if (sourceBackedEarlyMilestone) {
                          breakthrough = sourceBackedEarlyMilestone.sentence;
                          breakthroughMovies = sourceBackedEarlyMilestone.matches;
                        }

                        const firstCareerYear = [...movies]
                          .filter(releasedDuringLifetime)
                          .map(movieYear)
                          .filter(Boolean)
                          .sort((a, b) => a - b)[0] || 0;

                        const earlyWindowEnd = firstCareerYear ? firstCareerYear + 9 : 0;

                        const earlyStardomPool = definingFilmPool
                          .filter(movie => {
                            const year = movieYear(movie);
                            const order = Number.isFinite(Number(movie?.order))
                              ? Number(movie.order)
                              : 99;
                            const votes = Number(movie?.vote_count || 0);

                            return year &&
                              (!earlyWindowEnd || year <= earlyWindowEnd) &&
                              order <= 2 &&
                              votes >= 1500 &&
                              !alreadyNamed(movie) &&
                              !repeatsRepresentedFranchise(movie);
                          })
                          .sort((a, b) =>
                            nonFranchiseSignatureScore(b) - nonFranchiseSignatureScore(a) ||
                            movieYear(a) - movieYear(b)
                          );

                        const earlyStardomCandidate = earlyStardomPool[0] || null;

                        if (earlyStardomCandidate &&
                            /\b(?:film debut|screen debut|debut|bit part|supporting role|early role|early roles)\b/i.test(breakthrough)) {
                          signatureFilm = earlyStardomCandidate;
                        }
                      }

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
                        MID-CAREER / SIGNATURE-WORK STAGE

                        A single defining film is not enough for long, film-rich careers.
                        Reserve up to two additional high-significance credits from the same
                        broad prime-career era, before the later-career selector takes over.
                        This keeps major post-breakthrough work visible instead of jumping
                        directly from one signature title to work decades later.

                        Selection remains generic and data-driven. Distinct roles/franchises
                        are preferred, and films already named in breakthrough/defining prose
                        are excluded.
                      */
                      const signatureYear = signatureFilm ? movieYear(signatureFilm) : 0;
                      const midCareerStart = breakthroughYear || signatureYear || 0;
                      const midCareerLifetimeYears = movies
                        .filter(releasedDuringLifetime)
                        .map(movieYear)
                        .filter(Boolean);
                      const midCareerSpan = midCareerLifetimeYears.length
                        ? Math.max(...midCareerLifetimeYears) - Math.min(...midCareerLifetimeYears)
                        : 0;

                      const midCareerEnd = signatureYear
                        ? signatureYear + (midCareerSpan >= 30 ? 12 : 9)
                        : midCareerStart
                          ? midCareerStart + 15
                          : 0;

                      const preMidText = [breakthrough, defining]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();

                      const preMidMovies = movies.filter(movie => {
                        const title = String(movie?.title || "").trim().toLowerCase();
                        return Boolean(title && preMidText.includes(title));
                      });

                      const midCareerPool = majorCentralCredits
                        .filter(movie => {
                          const year = movieYear(movie);
                          const votes = Number(movie?.vote_count || 0);
                          const order = Number.isFinite(Number(movie?.order))
                            ? Number(movie.order)
                            : 99;

                          if (!year || !releasedDuringLifetime(movie)) return false;
                          if (midCareerStart && year < midCareerStart) return false;
                          if (midCareerEnd && year > midCareerEnd) return false;
                          if (alreadyNamed(movie)) return false;
                          if (order > 5 || votes < 900) return false;
                          if (preMidMovies.some(existing => sameCareerFranchise(movie, existing))) {
                            return false;
                          }
                          return true;
                        })
                        .sort((a, b) =>
                          nonFranchiseSignatureScore(b) - nonFranchiseSignatureScore(a) ||
                          movieYear(a) - movieYear(b)
                        );

                      const midCareerPicks = [];
                      const midCareerLimit = midCareerSpan >= 25 ? 2 : 1;

                      for (const movie of midCareerPool) {
                        if (midCareerPicks.some(existing => sameCareerFranchise(movie, existing))) {
                          continue;
                        }

                        midCareerPicks.push(movie);
                        if (midCareerPicks.length >= midCareerLimit) break;
                      }

                      const midCareerLine = midCareerPicks.length
                        ? `Other major work includes ${formatFilmList(
                            [...midCareerPicks].sort((a, b) => movieYear(a) - movieYear(b))
                          )}.`
                        : "";

                      /*
                        MAJOR RECURRING / FRANCHISE STAGE

                        A long-running role is its own career beat; it must not compete with
                        breakthrough or defining-performance selection. Choose at most one
                        recurring role after the prime-career stage, and require substantial
                        audience recognition plus a genuinely repeated character identity.
                      */
                      const preFranchiseText = [breakthrough, defining, midCareerLine]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();

                      const franchiseStagePool = strongRecurringRoleCredits
                        .filter(movie => {
                          const title = String(movie?.title || "").trim();
                          const votes = Number(movie?.vote_count || 0);
                          const year = movieYear(movie);
                          if (!title || !year || !releasedDuringLifetime(movie)) return false;
                          if (preFranchiseText.includes(title.toLowerCase())) return false;
                          if (votes < 1500) return false;
                          if (signatureYear && year <= signatureYear) return false;
                          return true;
                        })
                        .sort((a, b) =>
                          nonFranchiseSignatureScore(b) - nonFranchiseSignatureScore(a) ||
                          movieYear(a) - movieYear(b)
                        );

                      const franchiseStageFilm = franchiseStagePool[0] || null;
                      const franchiseStageLine = franchiseStageFilm
                        ? `Major franchise work includes ${formatFilm(franchiseStageFilm)}.`
                        : "";

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

                      /*
                        Represent every franchise already established before the later-era
                        slot, not just the synthetic signature/other-major picks. This is
                        important because breakthrough and defining prose can already name
                        a franchise. Ordinary late sequels from those represented franchises
                        should not consume another career beat.

                        A later installment with independently verified award/acclaim,
                        comeback or revival significance is still allowed below. This keeps
                        franchise deduplication from suppressing a genuine later-career
                        milestone while filtering routine sequel recency.
                      */
                      const preLaterEraText = [
                        breakthrough,
                        defining,
                        midCareerLine,
                        otherMajorLine
                      ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();

                      const representedBeforeEra = movies.filter(movie => {
                        const title = String(movie?.title || "").trim().toLowerCase();
                        return Boolean(title && preLaterEraText.includes(title));
                      });

                      /*
                        Later-career milestone weighting.

                        A later film gets an additional significance boost when the source
                        biography connects it to awards, nominations, acclaim, a comeback,
                        revival, or a return to a well-known role. This keeps a merely
                        popular later title from outranking a documented late-career
                        milestone. The rule is generic and uses source text + TMDB credits.
                      */
                      const laterMilestoneTerms = /\b(?:academy award|oscar|golden globe|bafta|sag award|screen actors guild|emmy|cannes|venice|volpi|award|awards|nominee|nominated|nomination|won|winning|acclaim|acclaimed|comeback|revival|returned|returning|reprise|reprised|reprising)\b/i;

                      /*
                        AWARD / ACCLAIM ASSOCIATION LAYER

                        Do not depend on careerCandidates here. Award sentences are often
                        filtered out of the prose candidate pool because they contain no
                        generic words such as "film", "role" or "starred". A milestone
                        can also be split across adjacent source sentences: one names the
                        movie and the next describes the nomination or win.

                        Build evidence directly from the cleaned source sentences, attach
                        the neighboring context to each exact movie-title occurrence, and
                        only then let the later-career scorer rank the movie. This is
                        generic: no performer, movie, franchise or award result is coded.
                      */
                      const sourceEvidenceForMovie = movie => {
                        const title = String(movie?.title || "").trim();
                        if (!title) return [];

                        const titleLower = title.toLowerCase();
                        const evidence = [];

                        for (let i = 0; i < sentences.length; i += 1) {
                          const current = String(sentences[i] || "");
                          if (!current.toLowerCase().includes(titleLower)) continue;

                          const contextParts = [];
                          if (i > 0) contextParts.push(sentences[i - 1]);
                          contextParts.push(current);
                          if (i + 1 < sentences.length) contextParts.push(sentences[i + 1]);

                          evidence.push({
                            sentence: current,
                            context: contextParts.join(" ")
                          });
                        }

                        return evidence;
                      };

                      const sourceSentencesForMovie = movie =>
                        sourceEvidenceForMovie(movie).map(item => ({
                          sentence: item.sentence,
                          context: item.context
                        }));

                      const laterMilestoneEvidence = movie => {
                        const sourceItems = sourceSentencesForMovie(movie);

                        /*
                          STRICT FILM-TO-RECOGNITION ASSOCIATION

                          A large award/acclaim boost is earned only when the SAME source
                          sentence names the film and contains the recognition language.
                          We intentionally do not scan broad character windows around the
                          title: those windows can leak an award belonging to a neighboring
                          film onto an unrelated credit.

                          A tightly adjacent sentence may contribute only when it explicitly
                          refers back to the named performance/role with a grammatical bridge.
                          This preserves split-sentence biography writing without treating
                          unrelated nearby career material as evidence for the film.
                        */
                        const adjacentBridgeTerms = /^(?:for (?:his|her|their|the) (?:performance|role|portrayal)|for this (?:performance|role|portrayal)|the (?:performance|role|portrayal)|his (?:performance|role|portrayal)|her (?:performance|role|portrayal)|their (?:performance|role|portrayal)|this (?:performance|role|portrayal)|for which (?:he|she|they)|it earned (?:him|her|them)|the film earned (?:him|her|them))\b/i;

                        return sourceItems.reduce((score, item) => {
                          const direct = cleanText(item.sentence || "");
                          let boost = 0;

                          // Exact film title + recognition in the same sentence.
                          if (awardTerms.test(direct)) boost = Math.max(boost, 180);
                          if (laterMilestoneTerms.test(direct)) boost = Math.max(boost, 90);
                          if (signatureCareerTerms.test(direct)) boost = Math.max(boost, 45);

                          /*
                            Inspect only the immediately following sentence, and only when
                            it explicitly refers back to the performance/role just named.
                            Do not use the previous sentence or a multi-hundred-character
                            window, because those were the source of false award leakage.
                          */
                          const index = sentences.indexOf(item.sentence);
                          if (index >= 0 && index + 1 < sentences.length) {
                            const next = cleanText(sentences[index + 1] || "");
                            if (adjacentBridgeTerms.test(next)) {
                              if (awardTerms.test(next)) boost = Math.max(boost, 165);
                              if (laterMilestoneTerms.test(next)) boost = Math.max(boost, 100);
                              if (signatureCareerTerms.test(next)) boost = Math.max(boost, 60);
                            }
                          }

                          return Math.max(score, boost);
                        }, 0);
                      };

                      const hasIndependentLaterMilestone = movie =>
                        laterMilestoneEvidence(movie) >= 90;

                      const laterMilestoneScore = movie =>
                        nonFranchiseSignatureScore(movie) + laterMilestoneEvidence(movie);

                      /*
                        PRODUCTION LATER-CAREER CANDIDATE GATE

                        Central billing + durable audience recognition establish eligibility.
                        Exact title matching in the biography is NOT a requirement. Source
                        award/acclaim evidence is a significance boost, not an admission gate.
                        This keeps important filmography milestones eligible even when the
                        biography source phrases or omits a title differently.
                      */
                      const laterEraPool = movies
                        .filter(movie => {
                          const title = String(movie?.title || "").trim();
                          const year = movieYear(movie);
                          const votes = Number(movie?.vote_count || 0);
                          const order = Number.isFinite(Number(movie?.order))
                            ? Number(movie.order)
                            : 99;

                          if (!title || !releasedDuringLifetime(movie)) return false;
                          if (!year || !laterEraFloor || year < laterEraFloor) return false;
                          if (order > 5 || votes < 750) return false;
                          if (alreadyNamed(movie)) return false;

                          /*
                            PERSON 20 — LATER-CAREER SIGNIFICANCE GATE

                            A later credit now needs evidence that it represents a genuine
                            career chapter. Admission comes from at least one of three generic
                            signals: a source-backed milestone, a recurring/franchise role, or
                            meaningful source-biography coverage plus substantial audience
                            recognition. Popularity and billing alone are no longer enough.
                          */
                          const titleLower = title.toLowerCase();
                          const sourceMentioned = sentences.some(sentence =>
                            String(sentence || "").toLowerCase().includes(titleLower)
                          );
                          const recurringCareerRole = recurringRoleCredits.some(existing =>
                            existing?.id === movie?.id
                          );
                          const sourceBackedMajorCredit =
                            sourceMentioned &&
                            votes >= 4000 &&
                            order <= 3 &&
                            laterMilestoneEvidence(movie) >= 45;

                          const distinctRecurringCareerRole =
                            recurringCareerRole &&
                            movie?.id !== franchiseStageFilm?.id &&
                            votes >= 3000 &&
                            laterMilestoneEvidence(movie) >= 30;

                          /*
                            Later-career slots are scarce. Popularity/billing alone is not
                            enough: require independent milestone evidence, or unusually
                            strong source-backed significance. This blocks incidental popular
                            credits from becoming career-summary highlights.
                          */
                          return hasIndependentLaterMilestone(movie) ||
                            distinctRecurringCareerRole ||
                            sourceBackedMajorCredit;
                        })
                        .sort((a, b) => {
                          /*
                            Independently verified later-career milestones outrank ordinary
                            later credits before general popularity/significance scoring.
                            This prevents a routine sequel or newer commercial title from
                            displacing a documented award/acclaim/comeback milestone.
                          */
                          const milestoneDelta =
                            Number(hasIndependentLaterMilestone(b)) -
                            Number(hasIndependentLaterMilestone(a));

                          return milestoneDelta ||
                            laterMilestoneEvidence(b) - laterMilestoneEvidence(a) ||
                            laterMilestoneScore(b) - laterMilestoneScore(a) ||
                            nonFranchiseSignatureScore(b) - nonFranchiseSignatureScore(a) ||
                            movieYear(b) - movieYear(a);
                        });

                      const laterEraPicks = [];
                      const laterEraLimit = careerSpanYears >= 30 ? 2 : 1;

                      /*
                        Final later-career assembly:
                        independently verified milestones survive even when an earlier film
                        from the same franchise is already represented. Routine franchise
                        repeats remain deduplicated.
                      */
                      for (const movie of laterEraPool) {
                        const independentMilestone = hasIndependentLaterMilestone(movie);
                        const repeatsEarlierFranchise = representedBeforeEra.some(existing =>
                          sameCareerFranchise(movie, existing)
                        );
                        const repeatsPickedFranchise = laterEraPicks.some(existing =>
                          sameCareerFranchise(movie, existing)
                        );

                        if (!independentMilestone && repeatsEarlierFranchise) continue;
                        if (!independentMilestone && repeatsPickedFranchise) continue;

                        laterEraPicks.push(movie);
                        if (laterEraPicks.length >= laterEraLimit) break;
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
                      /*
                        CONSOLIDATED FINAL CAREER ASSEMBLY

                        Earlier biography beats (breakthrough / defining / award prose)
                        remain intact. All synthetic "other major" and "later career" movie
                        lines now compete in ONE final selector instead of three overlapping
                        paths.

                        Ranking priority:
                          1. independently verified film-specific milestone evidence
                          2. strength of that evidence
                          3. central-role / audience significance
                          4. recency only as a final tiebreaker

                        Routine repeats of an already represented franchise are skipped.
                        Independently verified milestones may represent a franchise again
                        because they describe a genuinely distinct career achievement.
                      */
                      const establishedCareerText = [breakthrough, defining, midCareerLine, franchiseStageLine, later]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();

                      const establishedMovies = movies.filter(movie => {
                        const title = String(movie?.title || "").trim().toLowerCase();
                        return Boolean(title && establishedCareerText.includes(title));
                      });

                      const consolidatedPool = movies
                        .filter(movie => {
                          const title = String(movie?.title || "").trim();
                          const year = movieYear(movie);
                          const votes = Number(movie?.vote_count || 0);
                          const order = Number.isFinite(Number(movie?.order))
                            ? Number(movie.order)
                            : 99;

                          if (!title || !releasedDuringLifetime(movie)) return false;
                          if (!year || !laterEraFloor || year < laterEraFloor) return false;
                          if (order > 5 || votes < 750) return false;
                          if (establishedCareerText.includes(title.toLowerCase())) return false;

                          const titleLower = title.toLowerCase();
                          const sourceMentioned = sentences.some(sentence =>
                            String(sentence || "").toLowerCase().includes(titleLower)
                          );
                          const recurringCareerRole = recurringRoleCredits.some(existing =>
                            existing?.id === movie?.id
                          );
                          const sourceBackedMajorCredit =
                            sourceMentioned &&
                            votes >= 2000 &&
                            order <= 4;

                          return hasIndependentLaterMilestone(movie) ||
                            recurringCareerRole ||
                            sourceBackedMajorCredit;
                        })
                        .sort((a, b) => {
                          const milestoneDelta =
                            Number(hasIndependentLaterMilestone(b)) -
                            Number(hasIndependentLaterMilestone(a));

                          return milestoneDelta ||
                            laterMilestoneEvidence(b) - laterMilestoneEvidence(a) ||
                            laterMilestoneScore(b) - laterMilestoneScore(a) ||
                            nonFranchiseSignatureScore(b) - nonFranchiseSignatureScore(a) ||
                            movieYear(b) - movieYear(a);
                        });

                      const consolidatedPicks = [];
                      const consolidatedLimit = careerSpanYears >= 30 ? 2 : 1;

                      for (const movie of consolidatedPool) {
                        const independentMilestone = hasIndependentLaterMilestone(movie);

                        const repeatsEstablishedFranchise = establishedMovies.some(existing =>
                          sameCareerFranchise(movie, existing)
                        );

                        const repeatsSelectedFranchise = consolidatedPicks.some(existing =>
                          sameCareerFranchise(movie, existing)
                        );

                        /*
                          A repeated franchise needs stronger evidence than an ordinary
                          independent milestone before it can consume another biography
                          slot. This preserves genuinely major later achievements while
                          filtering weaker same-franchise returns.
                        */
                        const repeatFranchiseMilestoneThreshold = 150;
                        const strongRepeatMilestone =
                          independentMilestone &&
                          laterMilestoneEvidence(movie) >= repeatFranchiseMilestoneThreshold;

                        if (repeatsEstablishedFranchise && !strongRepeatMilestone) continue;
                        if (repeatsSelectedFranchise && !strongRepeatMilestone) continue;

                        consolidatedPicks.push(movie);
                        if (consolidatedPicks.length >= consolidatedLimit) break;
                      }

                      const consolidatedLaterLine = consolidatedPicks.length
                        ? `Later career work includes ${formatFilmList(consolidatedPicks)}.`
                        : "";

                      const rawCareerParts = [
                        breakthrough,
                        defining,
                        midCareerLine,
                        franchiseStageLine,
                        consolidatedLaterLine,
                        later
                      ]
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

                      /*
                        PERSON 22 — OVERVIEW + CAREER STORY

                        Person 21 proved that Wikipedia's opening summary often gives Reelwise
                        a much stronger introduction than a generated "X is an actor" line.
                        The problem was that the overview could consume the entire card and
                        leave no room for the movies that actually explain the career.

                        Person 22 deliberately treats those as two different jobs:
                          1. OVERVIEW: who the person is and why they matter.
                          2. CAREER: the film milestones selected by the existing career engine.

                        The overview is capped aggressively. The career section is then given
                        protected space, and movie-bearing career sentences are preferred.
                        No performer, nationality, movie, award, or franchise is hard-coded.
                      */
                      const sourceOverview = wikipediaSummary || tmdbBio || "";
                      const overviewSentences = splitBioSentences(sourceOverview)
                        .map(cleanText)
                        .filter(Boolean)
                        .filter(sentence =>
                          !/\b(?:alumna|alumnus|college|university|school of drama|bachelor|master of fine arts|education|advocate|activist|gender parity|labor protections|male gaze|personal life|married|spouse|children)\b/i.test(sentence)
                        );

                      const overviewParts = [];
                      let overviewLength = 0;
                      const OVERVIEW_MAX = 500;

                      for (const sentence of overviewSentences) {
                        const addition = sentence.length + (overviewParts.length ? 1 : 0);
                        if (overviewLength + addition > OVERVIEW_MAX) continue;
                        overviewParts.push(sentence);
                        overviewLength += addition;
                        if (overviewParts.length >= 2) break;
                      }

                      let careerBiography = "";

                      if (wikipediaCareerText) {
                        try {
                          careerBiography = chooseCareerSentences(wikipediaCareerText, person);
                        } catch (error) {
                          console.error("Reelwise career biography error:", error);
                          careerBiography = "";
                        }
                      }

                      if (!careerBiography && tmdbBio) {
                        try {
                          careerBiography = chooseCareerSentences(tmdbBio, person);
                        } catch (error) {
                          console.error("Reelwise TMDB career biography error:", error);
                          careerBiography = "";
                        }
                      }

                      const profileMovies = getMovieCredits(person);
                      const overviewText = overviewParts.join(" ");
                      const overviewKeys = new Set(
                        overviewParts.map(sentence => sentence.toLowerCase())
                      );

                      let careerParts = splitBioSentences(careerBiography)
                        .map(cleanText)
                        .filter(Boolean)
                        .filter(sentence => !overviewKeys.has(sentence.toLowerCase()));

                      // Protect Reelwise's movie-story purpose: movie-bearing career beats first.
                      const movieCareerParts = careerParts.filter(sentence =>
                        sentenceMovieMatches(sentence, profileMovies).length > 0
                      );

                      if (movieCareerParts.length) {
                        const nonMovieMilestone = careerParts.find(sentence =>
                          !sentenceMovieMatches(sentence, profileMovies).length &&
                          /\b(?:academy award|oscar|golden globe|bafta|emmy|tony|honorary|lifetime achievement|award|awards|nomination|nominated|won)\b/i.test(sentence)
                        );

                        careerParts = [
                          ...movieCareerParts,
                          ...([nonMovieMilestone].filter(Boolean))
                        ];
                      }

                      /*
                        If a source page still fails to yield a usable movie sentence, do not
                        surrender the whole card to general Wikipedia prose. Use the strongest
                        screen credits already returned by TMDB as a compact last-resort career
                        bridge. This is deliberately a fallback, not the primary selector.
                      */
                      if (!careerParts.some(sentence =>
                        sentenceMovieMatches(sentence, profileMovies).length > 0
                      )) {
                        /*
                          PERSON 24 — REPRESENTATIVE FOUR-STAGE FILM ARC

                          Person 23 successfully spread the fallback films across a career,
                          but a few weak credits could still win a stage. Person 24 keeps the
                          Person 22 biography format and Person 23 chronology while tightening
                          ONLY the film-selection quality controls.

                          Quality rules:
                            1. Early slot favors genuine breakthrough / early-recognition evidence.
                            2. Central acting roles receive substantially more weight than minor parts.
                            3. Voice, narration, cameo and uncredited work are strongly penalized.
                            4. Later-career credits need real significance, not merely recency.
                            5. Repeated character/franchise families do not consume multiple slots
                               unless no stronger representative alternative exists.

                          No performer, movie, role, award or franchise is hard-coded.
                        */
                        const rawFilms = [...profileMovies]
                          .filter(movie => movie?.title && movieYear(movie));

                        const sourceSentences = splitBioSentences(wikipediaCareerText || tmdbBio || "")
                          .map(cleanText)
                          .filter(Boolean);

                        const roleText = movie => String(movie?.character || "").toLowerCase();
                        const billingOrder = movie => Number.isFinite(Number(movie?.order))
                          ? Number(movie.order)
                          : 99;

                        const isPeripheralCredit = movie => {
                          const role = roleText(movie);
                          return /\b(?:narrator|narration|voice|cameo|uncredited|archive footage|additional voices?|announcer|documentary voice)\b/i.test(role) ||
                            billingOrder(movie) >= 8;
                        };

                        const centralRoleScore = movie => {
                          const order = billingOrder(movie);
                          const role = roleText(movie);

                          let score =
                            order === 0 ? 74 :
                            order === 1 ? 62 :
                            order === 2 ? 48 :
                            order === 3 ? 34 :
                            order <= 5 ? 19 :
                            order <= 7 ? 6 : -18;

                          if (/\b(?:narrator|narration|cameo|uncredited|archive footage|additional voices?|announcer)\b/i.test(role)) {
                            score -= 70;
                          } else if (/\bvoice\b/i.test(role)) {
                            score -= 28;
                          }

                          return score;
                        };

                        const sourceEvidenceForFilm = movie => {
                          let evidence = 0;
                          let mentions = 0;
                          let breakthrough = 0;
                          let defining = 0;

                          for (const sentence of sourceSentences) {
                            if (!sentenceMovieMatches(sentence, [movie]).length) continue;
                            mentions += 1;

                            if (/\b(?:academy award|oscar|cannes|golden globe|bafta|screen actors guild|critics? choice)\b/i.test(sentence)) evidence += 58;
                            if (/\b(?:won|winner|winning|nominated|nomination|award|awards)\b/i.test(sentence)) evidence += 38;
                            if (/\b(?:acclaim|acclaimed|praised|recognition|prominence)\b/i.test(sentence)) evidence += 34;
                            if (/\b(?:best actor|best actress|best supporting actor|best supporting actress)\b/i.test(sentence)) evidence += 22;

                            if (/\b(?:breakthrough|breakout|breakthrough role|breakout role|first major|rose to prominence|gained recognition|wider recognition)\b/i.test(sentence)) {
                              breakthrough += 82;
                            }

                            if (/\b(?:defining|career-defining|signature|iconic|widely regarded|most acclaimed)\b/i.test(sentence)) {
                              defining += 62;
                            }
                          }

                          return {
                            general: Math.min(evidence, 150) + Math.min(mentions, 3) * 9,
                            breakthrough: Math.min(breakthrough, 120),
                            defining: Math.min(defining, 100),
                            mentions
                          };
                        };

                        const eligibleFilms = rawFilms
                          .filter(movie => {
                            const votes = Number(movie?.vote_count || 0);
                            const ev = sourceEvidenceForFilm(movie);
                            // Peripheral credits survive only when the biography itself gives
                            // them unusually strong career significance.
                            if (isPeripheralCredit(movie)) {
                              return ev.general >= 95 || ev.breakthrough >= 80 || ev.defining >= 70;
                            }
                            return votes >= 300 || ev.general >= 35 || ev.breakthrough >= 80;
                          })
                          .sort((a, b) => movieYear(a) - movieYear(b));

                        const baseFilmScore = movie => {
                          const votes = Number(movie?.vote_count || 0);
                          const rating = Number(movie?.vote_average || 0);
                          const popularity = Number(movie?.popularity || 0);
                          const ev = sourceEvidenceForFilm(movie);

                          return ev.general * 1.55 +
                            ev.defining * 0.75 +
                            centralRoleScore(movie) +
                            Math.log10(Math.max(votes, 1)) * 19 +
                            Math.max(0, rating - 5) * 4.5 +
                            Math.min(popularity, 80) * 0.05;
                        };

                        const careerAnchors = eligibleFilms
                          .filter(movie => {
                            const ev = sourceEvidenceForFilm(movie);
                            return !isPeripheralCredit(movie) &&
                              (billingOrder(movie) <= 5 || ev.general >= 55 || ev.breakthrough >= 80) &&
                              (Number(movie?.vote_count || 0) >= 500 || ev.general >= 45 || ev.breakthrough >= 80);
                          });

                        const firstYear = careerAnchors.length
                          ? Math.min(...careerAnchors.map(movieYear))
                          : (eligibleFilms[0] ? movieYear(eligibleFilms[0]) : 0);
                        const lastYear = careerAnchors.length
                          ? Math.max(...careerAnchors.map(movieYear))
                          : (eligibleFilms.length ? movieYear(eligibleFilms[eligibleFilms.length - 1]) : firstYear);
                        const span = Math.max(1, lastYear - firstYear);

                        // Give the breakthrough era enough room to capture a genuine early rise,
                        // then divide the remaining career into defining, prime and later eras.
                        const earlyWidth = Math.max(8, Math.min(13, Math.round(span * 0.24)));
                        const earlyEnd = firstYear + earlyWidth;
                        const remainingSpan = Math.max(1, lastYear - earlyEnd);
                        const definingEnd = earlyEnd + Math.max(7, Math.round(remainingSpan * 0.34));
                        const primeEnd = definingEnd + Math.max(7, Math.round(remainingSpan * 0.36));

                        const chosen = [];
                        const chosenIds = new Set();
                        const chosenCharacters = new Set();

                        const characterFamily = movie => roleText(movie)
                          .replace(/\([^)]*\)/g, " ")
                          .replace(/\b(?:voice|uncredited|archive footage|cameo|narrator|narration)\b/g, " ")
                          .replace(/[^a-z0-9]+/g, " ")
                          .replace(/\s+/g, " ")
                          .trim()
                          .split(" ")
                          .filter(word => word.length > 2)
                          .slice(0, 3)
                          .join(" ");

                        const chooseFromStage = (predicate, stageScore, options = {}) => {
                          let pool = eligibleFilms
                            .filter(movie => !chosenIds.has(movie.id))
                            .filter(predicate)
                            .filter(movie => {
                              if (options.allowRecurring) return true;
                              const key = characterFamily(movie);
                              return !key || !chosenCharacters.has(key);
                            });

                          if (options.requireSubstantial) {
                            const substantial = pool.filter(movie => {
                              const ev = sourceEvidenceForFilm(movie);
                              return !isPeripheralCredit(movie) &&
                                (billingOrder(movie) <= 5 || ev.general >= 80 || ev.defining >= 65);
                            });
                            if (substantial.length) pool = substantial;
                          }

                          pool.sort((a, b) =>
                            stageScore(b) - stageScore(a) ||
                            baseFilmScore(b) - baseFilmScore(a) ||
                            movieYear(a) - movieYear(b)
                          );

                          const pick = pool[0];
                          if (!pick) return null;
                          chosen.push(pick);
                          chosenIds.add(pick.id);
                          const key = characterFamily(pick);
                          if (key) chosenCharacters.add(key);
                          return pick;
                        };

                        // 1. EARLY / BREAKTHROUGH — explicit breakthrough and recognition evidence
                        // outranks popularity. Earlier meaningful work receives a modest bonus.
                        chooseFromStage(
                          movie => movieYear(movie) <= earlyEnd,
                          movie => {
                            const ev = sourceEvidenceForFilm(movie);
                            const yearBonus = Math.max(0, earlyEnd - movieYear(movie)) * 1.2;
                            return baseFilmScore(movie) + ev.breakthrough * 2.0 + ev.general * 0.35 + yearBonus;
                          },
                          { requireSubstantial: true }
                        );

                        // 2. DEFINING / SIGNATURE — award/acclaim/source evidence and a central role
                        // dominate. This slot is not simply the next most popular title.
                        chooseFromStage(
                          movie => movieYear(movie) > earlyEnd && movieYear(movie) <= definingEnd,
                          movie => {
                            const ev = sourceEvidenceForFilm(movie);
                            return baseFilmScore(movie) + ev.defining * 1.5 + ev.general * 0.55 + centralRoleScore(movie) * 0.45;
                          },
                          { requireSubstantial: true }
                        );

                        // 3. PRIME / MID-CAREER — representative substantial performance.
                        chooseFromStage(
                          movie => movieYear(movie) > definingEnd && movieYear(movie) <= primeEnd,
                          movie => baseFilmScore(movie) + centralRoleScore(movie) * 0.55,
                          { requireSubstantial: true }
                        );

                        // 4. LATER CAREER — impose the toughest quality floor. A late credit must
                        // be a substantial role or have strong independent source significance.
                        chooseFromStage(
                          movie => movieYear(movie) > primeEnd && (() => {
                            const ev = sourceEvidenceForFilm(movie);
                            const votes = Number(movie?.vote_count || 0);
                            const rating = Number(movie?.vote_average || 0);
                            return !isPeripheralCredit(movie) && (
                              ev.general >= 55 ||
                              ev.defining >= 55 ||
                              (billingOrder(movie) <= 3 && votes >= 1200 && rating >= 6.0) ||
                              (billingOrder(movie) <= 5 && votes >= 3500 && rating >= 6.5)
                            );
                          })(),
                          movie => {
                            const ev = sourceEvidenceForFilm(movie);
                            return baseFilmScore(movie) + ev.general * 0.45 + centralRoleScore(movie) * 0.65;
                          },
                          { requireSubstantial: true }
                        );

                        // Unusual or short careers can leave a stage empty. Fill only with strong,
                        // substantial remaining credits. Peripheral work is never used merely to
                        // reach four titles.
                        while (chosen.length < 4) {
                          const extra = chooseFromStage(
                            movie => {
                              const ev = sourceEvidenceForFilm(movie);
                              return !isPeripheralCredit(movie) &&
                                (billingOrder(movie) <= 5 || ev.general >= 70 || ev.defining >= 60);
                            },
                            movie => baseFilmScore(movie),
                            { requireSubstantial: true }
                          );
                          if (!extra) break;
                        }

                        const fallbackFilms = chosen
                          .slice(0, 4)
                          .sort((a, b) => movieYear(a) - movieYear(b));

                        if (fallbackFilms.length) {
                          careerParts = [
                            `Notable film work includes ${formatFilmList(fallbackFilms)}.`
                          ];
                        }
                      }

                      const CAREER_MAX = 590;
                      const selectedCareerParts = [];
                      let careerLength = 0;

                      for (const sentence of careerParts) {
                        const addition = sentence.length + (selectedCareerParts.length ? 1 : 0);
                        if (careerLength + addition > CAREER_MAX) continue;
                        selectedCareerParts.push(sentence);
                        careerLength += addition;
                        if (selectedCareerParts.length >= 4) break;
                      }

                      let biography = [overviewText, selectedCareerParts.join(" ")]
                        .filter(Boolean)
                        .join(" ")
                        .trim();

                      biography = biography || wikipediaSummary || tmdbBio || careerBiography || "";

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

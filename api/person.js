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

        function movieScore(movie) {
          const votes = Number(movie?.vote_count || 0);
          const popularity = Number(movie?.popularity || 0);
          const rating = Number(movie?.vote_average || 0);
          const order = Number.isFinite(Number(movie?.order)) ? Number(movie.order) : 30;

          let billing = 0;
          if (order <= 2) billing = 55;
          else if (order <= 5) billing = 42;
          else if (order <= 10) billing = 28;
          else if (order <= 20) billing = 12;

          return billing +
            Math.log10(votes + 1) * 18 +
            Math.min(popularity, 100) * 0.16 +
            rating * 1.5;
        }

        function sourceMentionsMovie(sentence, movie) {
          const s = String(sentence || "").toLowerCase();
          const title = String(movie?.title || "").toLowerCase();
          return title && s.includes(title);
        }

        function findBreakthroughSentence(sentences, movies) {
          const breakthroughTerms =
            /\b(debut|film debut|breakthrough|breakthrough role|breakout|rose to prominence|gained recognition|gained acclaim|first major role|first film role|career-making)\b/i;

          return sentences.find(sentence =>
            breakthroughTerms.test(sentence) &&
            movies.some(movie => sourceMentionsMovie(sentence, movie))
          ) || "";
        }

        function moviesMentionedInSentence(sentence, movies) {
          return movies
            .filter(movie => sourceMentionsMovie(sentence, movie))
            .sort((a, b) =>
              String(a.release_date || "").localeCompare(String(b.release_date || ""))
            );
        }

        function formatFilm(movie) {
          if (!movie) return "";
          const year = String(movie.release_date || "").slice(0, 4);
          return year ? `${movie.title} (${year})` : movie.title;
        }

        function formatFilmList(movies) {
          const items = movies.map(formatFilm).filter(Boolean);

          if (!items.length) return "";
          if (items.length === 1) return items[0];
          if (items.length === 2) return `${items[0]} and ${items[1]}`;

          return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
        }

        function pickDefiningMovies(person, sourceBio, excludedIds = new Set(), limit = 3) {
          const movies = getMovieCredits(person);
          const source = String(sourceBio || "").toLowerCase();

          /*
            Movies actually named by the biography get priority over raw
            popularity. This prevents commercially large but less defining
            credits from displacing films central to the actor's career story.
          */
          const mentioned = movies
            .filter(movie =>
              !excludedIds.has(movie.id) &&
              source.includes(String(movie.title || "").toLowerCase())
            )
            .sort((a, b) => {
              const scoreDiff = movieScore(b) - movieScore(a);
              if (Math.abs(scoreDiff) > 12) return scoreDiff;
              return String(a.release_date || "").localeCompare(String(b.release_date || ""));
            });

          const selected = [];
          const used = new Set(excludedIds);

          for (const movie of mentioned) {
            if (selected.length >= limit) break;
            selected.push(movie);
            used.add(movie.id);
          }

          const ranked = movies
            .filter(movie => !used.has(movie.id))
            .sort((a, b) => movieScore(b) - movieScore(a));

          for (const movie of ranked) {
            if (selected.length >= limit) break;
            selected.push(movie);
            used.add(movie.id);
          }

          return selected;
        }

        function pickLaterMovies(person, sourceBio, excludedIds = new Set(), limit = 3) {
          const movies = getMovieCredits(person);
          const source = String(sourceBio || "").toLowerCase();

          const available = movies.filter(movie => !excludedIds.has(movie.id));
          if (!available.length) return [];

          const years = available
            .map(movie => parseInt(String(movie.release_date || "").slice(0, 4), 10))
            .filter(Number.isFinite);

          const latestYear = years.length ? Math.max(...years) : 0;
          const laterFloor = latestYear ? latestYear - 14 : 0;

          const later = available
            .filter(movie => {
              const year = parseInt(String(movie.release_date || "").slice(0, 4), 10);
              return !laterFloor || year >= laterFloor;
            })
            .sort((a, b) => {
              const aMentioned = source.includes(String(a.title || "").toLowerCase()) ? 1 : 0;
              const bMentioned = source.includes(String(b.title || "").toLowerCase()) ? 1 : 0;
              if (aMentioned !== bMentioned) return bMentioned - aMentioned;
              return movieScore(b) - movieScore(a);
            });

          return later.slice(0, limit).sort((a, b) =>
            String(a.release_date || "").localeCompare(String(b.release_date || ""))
          );
        }

        function careerFocusedBiography(sourceBio, person) {
          const sentences = splitBioSentences(sourceBio);
          const movies = getMovieCredits(person);
          const name = cleanText(person?.name || "This performer");

          if (!sentences.length) return "";

          const personalTerms =
            /\b(married|marriage|wife|husband|spouse|children|daughter|son|activist|political|politics|religion|charity|philanthrop|personal life|resides|lives in)\b/i;

          const awardTerms =
            /\b(academy award|oscar|golden globe|bafta|emmy|award|awards|accolade|accolades|nomination|nominations)\b/i;

          const identity =
            sentences.find(sentence =>
              /\b(actor|actress|filmmaker|director|comedian|performer)\b/i.test(sentence)
            ) || `${name} is a film performer.`;

          const breakthroughSentence = findBreakthroughSentence(sentences, movies);
          const breakthroughMovies = moviesMentionedInSentence(breakthroughSentence, movies);
          const excluded = new Set(breakthroughMovies.map(movie => movie.id));

          const defining = pickDefiningMovies(person, sourceBio, excluded, 3);
          defining.forEach(movie => excluded.add(movie.id));

          const later = pickLaterMovies(person, sourceBio, excluded, 3);

          const parts = [];

          /*
            1. Identity: keep it short. Awards belong in Accolades unless they
               directly explain the breakthrough or a defining performance.
          */
          if (awardTerms.test(identity) && identity.length > 190) {
            const actorType =
              /\bfilmmaker\b/i.test(identity)
                ? "actor and filmmaker"
                : /\bactress\b/i.test(identity)
                  ? "actress"
                  : "actor";

            parts.push(`${name} is an ${actorType}.`);
          } else {
            parts.push(identity);
          }

          /*
            2. Breakthrough/debut ALWAYS comes before popularity-ranked credits.
               Preserve the source wording because it often contains the useful
               context: debut, acclaim, and the award nomination tied to the role.
          */
          if (breakthroughSentence) {
            parts.push(breakthroughSentence);
          } else if (defining.length) {
            parts.push(
              `${name}'s defining films include ${formatFilmList(defining)}.`
            );
            defining.length = 0;
          }

          /*
            3. Defining work after the breakthrough.
          */
          if (defining.length) {
            parts.push(
              `Other defining films include ${formatFilmList(defining)}.`
            );
          }

          /*
            4. Later career.
          */
          if (later.length) {
            parts.push(
              `Later notable work includes ${formatFilmList(later)}.`
            );
          }

          const unique = [];
          const seen = new Set();

          for (const sentence of parts) {
            const clean = String(sentence || "").replace(/\s+/g, " ").trim();
            const key = clean.toLowerCase();
            if (!clean || seen.has(key) || personalTerms.test(clean)) continue;
            seen.add(key);
            unique.push(clean);
            if (unique.length >= 4) break;
          }

          let bio = unique.join(" ");

          /*
            Mobile-friendly limit, but never cut a sentence in half.
          */
          const MAX_CHARS = 1100;

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

          let wikipediaBio = "";
          try {
            wikipediaBio = await getWikipediaBiography(person?.name || "");
          } catch (error) {
            wikipediaBio = "";
          }

          const sourceBio =
            wikipediaBio && wikipediaBio.length >= 120
              ? wikipediaBio
              : tmdbBio;

          const biography =
            careerFocusedBiography(sourceBio, person) ||
            careerFocusedBiography(tmdbBio, person) ||
            tmdbBio ||
            wikipediaBio ||
            "";

          return {
            ...person,
            biography,
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

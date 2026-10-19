const token = process.env.TMDB_READ_ACCESS_TOKEN;

const OSCARBASE = "https://api.oscarbase.com/api";

/*
  ============================================================
  TMDB
  ============================================================
*/

async function tmdb(path) {
  if (!token) {
    throw new Error("TMDB token is not configured");
  }

  const response = await fetch(
    `https://api.themoviedb.org/3${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.status_message ||
      "Movie lookup failed"
    );
  }

  return data;
}

/*
  ============================================================
  OSCARBASE
  ============================================================
*/

async function oscarbase(path) {
  const response = await fetch(
    `${OSCARBASE}${path}`,
    {
      headers: {
        accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `OscarBase request failed: ${response.status}`
    );
  }

  return response.json();
}

function cleanCategory(category = "") {
  return String(category || "").trim();
}

function isBestPicture(category = "") {
  const value = String(category || "")
    .toLowerCase()
    .trim();

  return (
    value.includes("best picture") ||
    value.includes("outstanding picture") ||
    value.includes("outstanding production")
  );
}

/*
  ============================================================
  ACADEMY AWARD NOMINATION CLEANUP
  ============================================================

  Keep the complete nomination history available to the Reelwise
  movie page. OscarBase records can vary slightly in field naming,
  so Reelwise normalizes the useful fields while retaining the raw
  record as a fallback for future display improvements.
*/

function isWinner(item = {}) {
  return (
    item?.winner === true ||
    item?.winner === 1 ||
    String(item?.winner).toLowerCase() === "true"
  );
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function nomineeName(item = {}) {
  return firstText(
    item?.nominee,
    item?.nominee_name,
    item?.person_name,
    item?.name,
    item?.recipient,
    item?.recipient_name,
    item?.credited_name,
    item?.credit
  );
}

function nominationYear(item = {}) {
  const value =
    item?.ceremony_year ??
    item?.year ??
    item?.award_year ??
    item?.ceremony?.year ??
    "";

  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : "";
}

function cleanNomination(item = {}) {
  return {
    category: cleanCategory(
      item?.category ||
      item?.category_name
    ),

    nominee: nomineeName(item),

    winner: isWinner(item),

    ceremonyYear: nominationYear(item),

    ceremony:
      firstText(
        item?.ceremony_name,
        item?.ceremony?.name
      ),

    film:
      firstText(
        item?.film,
        item?.film_title,
        item?.movie_title,
        item?.title
      ),

    raw: item
  };
}


// Count an award entry once, not once per credited collaborator.
const awardKey=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const actingCategory=category=>/\b(?:actor|actress)\b/i.test(category);
const songCategory=category=>/\bsong\b/i.test(category);
function nominatedWork(row) {
  return firstText(row?.song_title,row?.song?.title,row?.song_name,row?.work_title,row?.nominated_work,row?.song);
}
function groupAwardEntries(rows) {
  const groups=new Map();let incomplete=false;
  const uncertain=[];
  for(const raw of rows){
    const item=cleanNomination(raw);
    if(!item.category)continue;
    const work=nominatedWork(raw);
    // A row id identifies a credited person in OscarBase, not an award entry.
    // Acting nominations are individual; shared crew categories are teams.
    // Losing songs cannot be grouped safely without their song/work identity.
    if(songCategory(item.category) && !work && !item.winner){uncertain.push(item);continue;}
    if(actingCategory(item.category) && !item.nominee){incomplete=true;continue;}
    const entry=[item.ceremonyYear,awardKey(item.category),item.winner?'win':'nom',
      actingCategory(item.category)?awardKey(item.nominee):songCategory(item.category)?awardKey(work)||'winning-song':awardKey(work)].join('|');
    let group=groups.get(entry);
    if(!group){group={...item,nominationKey:entry,work,nominees:[],rawRecords:[]};delete group.raw;groups.set(entry,group);}
    if(item.nominee && !group.nominees.some(n=>awardKey(n)===awardKey(item.nominee)))group.nominees.push(item.nominee);
    group.rawRecords.push(raw);
  }
  const history=[...groups.values()].map(g=>({...g,nominee:g.nominees.join(' · ')}));
  return {history,uncertain,incomplete};
}
function plainAcademyText(value) {
  return String(value||'').replace(/<[^>]*>/g,' ').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,dec)=>{
    const n=parseInt(hex||dec,hex?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
  }).replace(/&quot;/gi,'"').replace(/&apos;|&#039;/gi,"'").replace(/&amp;/gi,'&')
    .replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();
}
function academyFilmEntries(html,title,year,rawRows) {
  // Read the individual honoree cards in each category. Film summaries can
  // combine several songs or acting nominations under a single category line.
  const history=[],seen=new Set();
  const categories=String(html).split(/<div[^>]*class="paragraph paragraph--type--award-category[^\"]*"[^>]*>/).slice(1);
  for(const block of categories){
    const category=plainAcademyText(block.match(/class="[^"]*field--name-field-award-category-oscars[^"]*">([\s\S]*?)<\/div>/)?.[1]);
    if(!category)continue;
    const honorees=block.split(/<div[^>]*class="paragraph paragraph--type--award-honoree[^\"]*"[^>]*>/).slice(1);
    for(const card of honorees){
      const film=plainAcademyText(card.match(/class="[^"]*field--name-field-award-film[^"]*">([\s\S]*?)<\/div>/)?.[1]);
      if(awardKey(film)!==awardKey(title))continue;
      const nominee=plainAcademyText(card.match(/class="[^"]*field--name-field-award-entities[^"]*">([\s\S]*?)<\/div>\s*<\/div>/)?.[1]);
      const type=card.match(/class="[^"]*field--name-field-honoree-type ([^"]+)"/)?.[1];
      if(!nominee || !/^(?:winner|nominee)$/.test(type||''))return null;
      const winner=type==='winner';
      const key=[year,awardKey(category),winner,awardKey(nominee)].join('|');
      if(seen.has(key))continue;seen.add(key);
      history.push({category,nominee,nominees:[nominee],winner,ceremonyYear:year,
        ceremony:'',film,work:songCategory(category)?nominee.split(/\s+in\s+["“]/i)[0]:'',nominationKey:'academy:'+key});
    }
  }
  if(!history.length)return null;
  // Require every independently supplied category/result to be represented;
  // changed/partial HTML must not establish an apparently complete history.
  const baseline=groupAwardEntries(rawRows).history;
  if(baseline.some(r=>!history.some(h=>awardKey(h.category)===awardKey(r.category)&&h.winner===r.winner)))return null;
  return {history,nominations:history.length,wins:history.filter(x=>x.winner).length};
}
async function summarizeAwardEntries(rows,title) {
  const base=groupAwardEntries(rows);
  let history=base.history,incomplete=base.incomplete||base.uncertain.length>0;
  if(base.uncertain.length){
    // Only fetch official pages when the person-row source lacks work identity.
    // Never guess that several song credits represent one or several songs.
    const years=[...new Set(rows.map(nominationYear).filter(Boolean))];
    const official=[];
    for(const year of years){
      if(year<1929||year>new Date().getUTCFullYear())break;
      try{
        const response=await fetch(`https://www.oscars.org/oscars/ceremonies/${year}`,
          {headers:{accept:'text/html'},signal:AbortSignal.timeout(8000)});
        const parsed=response.ok?academyFilmEntries(await response.text(),title,year,rows):null;
        if(!parsed){official.length=0;break;}
        official.push(...parsed.history);
      }catch{official.length=0;break;}
    }
    if(official.length){history=official;incomplete=false;}
  }
  history.sort((a,b)=>Number(a.ceremonyYear)-Number(b.ceremonyYear)||a.category.localeCompare(b.category));
  return {history,wins:history.filter(x=>x.winner).length,nominations:incomplete?null:history.length,
    nominationCountComplete:!incomplete,incomplete,
    countBasis:'award_entries_not_recipient_rows'};
}

/*
  ============================================================
  AUTOMATIC ACADEMY AWARDS LOOKUP
  ============================================================
*/

async function getAwards(tmdbId) {
  /*
    Step 1:
    Find the OscarBase movie using Reelwise's TMDB ID.
  */

  const search = await oscarbase(
    `/movies?tmdb_id=${encodeURIComponent(tmdbId)}&limit=5`
  );

  /*
    OscarBase list endpoints normally return:
    {
      data: [...]
    }

    This also tolerates an array response in case
    the API format changes.
  */

  const movies = Array.isArray(search)
    ? search
    : Array.isArray(search?.data)
      ? search.data
      : [];

  const movie =
    movies.find(
      item =>
        Number(item?.tmdb_id) === Number(tmdbId)
    ) || null;

  if (!movie || !movie.id) {
    return {
      found: false,
      tmdb_id: Number(tmdbId),
      nominations: 0,
      wins: 0,
      bestPictureWinner: false,
      winningCategories: [],
      nominatedCategories: [],
      ceremonyYears: [],
      history: []
    };
  }

  /*
    Step 2:
    Fetch the full OscarBase movie record.

    /movies/{id} includes the film's nominations.
  */

  const detailResponse = await oscarbase(
    `/movies/${encodeURIComponent(movie.id)}`
  );

  /*
    Accept either:
      { ...movie }
    or:
      { data: { ...movie } }

    This prevents the response wrapper from causing
    Reelwise to incorrectly report zero nominations.
  */

  const detail =
    detailResponse?.data &&
    !Array.isArray(detailResponse.data)
      ? detailResponse.data
      : detailResponse;

  const nominations =
    Array.isArray(detail?.nominations)
      ? detail.nominations
      : [];

  if (detail?.tmdb_id != null && Number(detail.tmdb_id) !== Number(tmdbId)) {
    throw new Error("Award movie identity did not match");
  }
  const result = await summarizeAwardEntries(nominations, detail?.title || movie.title);
  return {
    found: result.history.length > 0 || result.incomplete,
    movie: {title: detail?.title || movie.title || "", release_date: detail?.release_date || movie.release_date || "", tmdb_id: Number(tmdbId)},
    ...result,
    bestPictureWinner: result.history.some(x=>x.winner && isBestPicture(x.category)),
    winningCategories: [...new Set(result.history.filter(x=>x.winner).map(x=>x.category))],
    nominatedCategories: [...new Set(result.history.map(x=>x.category))],
    ceremonyYears: [...new Set(result.history.map(x=>x.ceremonyYear).filter(Boolean))].sort((a,b)=>a-b)
  };
}

/*
  ============================================================
  MOVIE CLEANUP
  ============================================================
*/

function cleanMovies(movies) {
  return (movies || [])
    .filter(movie =>
      movie &&
      movie.id &&
      movie.title &&
      movie.poster_path
    )
    .map(movie => ({
      id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      release_date: movie.release_date || "",
      overview: movie.overview || "",
      popularity: movie.popularity || 0
    }));
}

/*
  ============================================================
  MAIN REELWISE MOVIES API
  ============================================================
*/

export default async function handler(req, res) {
  try {
    const category =
      String(
        req.query?.category ||
        "trending"
      ).toLowerCase();

    /*
      ========================================================
      ACADEMY AWARDS

      Example:
      /api/movies?category=awards&id=238
      ========================================================
    */

    if (category === "awards") {
      const tmdbId =
        Number(req.query?.id);

      if (!tmdbId) {
        return res.status(400).json({
          error: "Missing TMDB movie ID"
        });
      }

      try {
        const awards =
          await getAwards(tmdbId);

        res.setHeader(
          "Cache-Control",
          "s-maxage=86400, stale-while-revalidate=604800"
        );

        return res
          .status(200)
          .json(awards);

      } catch (awardError) {
        /*
          OscarBase should never prevent the movie
          page itself from loading.
        */

        console.error(
          "Reelwise awards lookup error:",
          awardError
        );

        return res.status(200).json({
          found: false,
          tmdb_id: tmdbId,
          nominations: 0,
          wins: 0,
          bestPictureWinner: false,
          winningCategories: [],
          nominatedCategories: [],
          ceremonyYears: [],
          history: [],
          unavailable: true
        });
      }
    }

    let data;

    /*
      ========================================================
      TRENDING MOVIES
      ========================================================
    */

    if (category === "trending") {
      data = await tmdb(
        "/trending/movie/week?language=en-US"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      ACTION
      TMDB genre 28
      ========================================================
    */

    if (category === "action") {
      data = await tmdb(
        "/discover/movie" +
        "?with_genres=28" +
        "&include_adult=false" +
        "&include_video=false" +
        "&language=en-US" +
        "&sort_by=popularity.desc" +
        "&vote_count.gte=1000"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      COMEDY
      TMDB genre 35
      ========================================================
    */

    if (category === "comedy") {
      data = await tmdb(
        "/discover/movie" +
        "?with_genres=35" +
        "&include_adult=false" +
        "&include_video=false" +
        "&language=en-US" +
        "&sort_by=popularity.desc" +
        "&vote_count.gte=1000"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      MOVIE CLASSICS
      ========================================================
    */

    if (category === "classics") {
      data = await tmdb(
        "/discover/movie" +
        "?include_adult=false" +
        "&include_video=false" +
        "&language=en-US" +
        "&primary_release_date.lte=1979-12-31" +
        "&sort_by=vote_average.desc" +
        "&vote_count.gte=1500"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      80s & 90s
      ========================================================
    */

    if (category === "retro") {
      data = await tmdb(
        "/discover/movie" +
        "?include_adult=false" +
        "&include_video=false" +
        "&language=en-US" +
        "&primary_release_date.gte=1980-01-01" +
        "&primary_release_date.lte=1999-12-31" +
        "&sort_by=popularity.desc" +
        "&vote_count.gte=1000"
      );

      return res
        .status(200)
        .json(
          cleanMovies(data.results)
        );
    }

    /*
      ========================================================
      GREAT FRANCHISES
      ========================================================
    */

    if (category === "franchises") {
      const franchiseMovieIds = [
        862,
        11,
        85,
        603,
        671,
        120,
        27205,
        1771,
        155,
        98,
        78,
        329,
        238,
        424,
        105,
        597,
        89,
        1891
      ];

      const movies =
        await Promise.all(
          franchiseMovieIds.map(
            async id => {
              try {
                return await tmdb(
                  `/movie/${id}?language=en-US`
                );
              } catch {
                return null;
              }
            }
          )
        );

      return res
        .status(200)
        .json(
          cleanMovies(movies)
        );
    }

    /*
      ========================================================
      FALLBACK
      ========================================================
    */

    data = await tmdb(
      "/movie/popular?language=en-US&page=1"
    );

    return res
      .status(200)
      .json(
        cleanMovies(data.results)
      );

  } catch (error) {
    console.error(
      "Reelwise movies API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Movie lookup failed"
    });
  }
}


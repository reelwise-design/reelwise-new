const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
const youtubeKey = process.env.YOUTUBE_API_KEY;

async function tmdb(path) {
  if (!tmdbToken) {
    throw new Error("TMDB token is not configured");
  }

  const response = await fetch(
    `https://api.themoviedb.org/3${path}`,
    {
      headers: {
        Authorization: `Bearer ${tmdbToken}`,
        accept: "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.status_message ||
      "Movie information could not be loaded"
    );
  }

  return data;
}

async function searchYouTube(query) {
  if (!youtubeKey) {
    throw new Error("YouTube API key is not configured");
  }

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "25",
    q: query,
    key: youtubeKey,
    safeSearch: "moderate"
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "YouTube videos could not be loaded"
    );
  }

  return Array.isArray(data.items)
    ? data.items
        .filter(item =>
          item?.id?.videoId &&
          item?.snippet?.title
        )
        .map(item => ({
          key: item.id.videoId,
          name: decodeText(item.snippet.title),
          description: decodeText(
            item.snippet.description || ""
          ),
          channel: decodeText(
            item.snippet.channelTitle || ""
          ),
          published_at:
            item.snippet.publishedAt || ""
        }))
    : [];
}

function decodeText(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, terms) {
  return terms.some(term =>
    text.includes(term)
  );
}

/*
  Creates useful title variants.

  Example:
  Rocky III becomes:
  - rocky iii
  - rocky 3

  This lets YouTube results using either
  spelling count as an exact movie match.
*/
function titleVariants(title) {
  const normalized = normalize(title);

  const romanToNumber = {
    " i": " 1",
    " ii": " 2",
    " iii": " 3",
    " iv": " 4",
    " v": " 5",
    " vi": " 6",
    " vii": " 7",
    " viii": " 8",
    " ix": " 9",
    " x": " 10"
  };

  const numberToRoman = {
    " 1": " i",
    " 2": " ii",
    " 3": " iii",
    " 4": " iv",
    " 5": " v",
    " 6": " vi",
    " 7": " vii",
    " 8": " viii",
    " 9": " ix",
    " 10": " x"
  };

  const variants = new Set([normalized]);

  for (const [roman, number] of Object.entries(romanToNumber)) {
    if (normalized.endsWith(roman)) {
      variants.add(
        normalized.slice(0, -roman.length) + number
      );
    }
  }

  for (const [number, roman] of Object.entries(numberToRoman)) {
    if (normalized.endsWith(number)) {
      variants.add(
        normalized.slice(0, -number.length) + roman
      );
    }
  }

  return [...variants];
}

// Exact tokens, not title substrings. Metadata screening is not a claim
// that a person watched or independently verified the video contents.
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function containsTitle(text, title) {
  const haystack = ` ${normalize(text)} `;
  return titleVariants(title).some(t => haystack.includes(` ${t} `));
}
function sequelConflict(name, title) {
  const text = normalize(name);
  const normalized = normalize(title);
  const suffix = /\s+(?:(?:part|chapter|episode)\s+)?(\d+|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
  const target = normalized.match(suffix);
  const base = normalized.replace(suffix, '');
  const numerals = {i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10};
  const number = v => numerals[v] || Number(v);
  const pattern = new RegExp(`(?:^| )${escapeRegExp(base)} (?:(?:part|chapter|episode) )?(\\d+|viii|vii|iii|vi|iv|ii|ix|x|v|i)(?= |$)`, 'g');
  return [...text.matchAll(pattern)].some(m => {
    // A release year directly after the movie title is not a sequel number.
    if (/^(?:18|19|20)\d{2}$/.test(m[1])) return false;
    return !target || number(m[1]) !== number(target[1]);
  });
}
const BLOOPERS = /\b(?:bloopers?|outtakes?|gag reels?)\b/i;
const EXTRAS = /\b(?:behind the scenes|behind the movie|making of|making the (?:movie|film)|featurettes?|on (?:the )?set|(?:cast|crew|director) interviews?|interviews?|production documentary|screen tests?|auditions?|oral history|retrospective|reunion|documentary)\b/i;
const MISLEADING = /\b(?:parody|spoof|fan made|fanmade|fan edit|concept trailer|reaction|reacts|review|explained|ending explained|video game|gameplay|ai generated|deepfake|trilogy|quadrilogy|saga|franchise|all movies|all films|compilation|movie mistakes?|goofs?|continuity errors?|made the final cut)\b/i;
function evaluateVideo(video, movie, feature, siblings = []) {
  const name = normalize(video.name);
  const year = String(movie.release_date || '').slice(0,4);
  const aliases = [...new Set([movie.title, movie.original_title].filter(Boolean))];
  const reject = reason => ({accepted:false,reason,score:-1000});
  if (!/^[A-Za-z0-9_-]{11}$/.test(video.key || '')) return reject('invalid_video_id');
  if (MISLEADING.test(name)) return reject('mixed_or_unrelated_content');
  if (aliases.some(t => sequelConflict(name,t))) return reject('different_sequel');
  for (const sibling of siblings) {
    if (Number(sibling.id) === Number(movie.id)) continue;
    if ([sibling.title,sibling.original_title].filter(Boolean).some(t=>
        !aliases.some(alias=>normalize(alias).startsWith(normalize(t)+' ')) && containsTitle(name,t)))
      return reject('different_franchise_film');
  }
  const titleMatch = aliases.some(t => containsTitle(name,t));
  // A description can contain franchise keywords, other titles and SEO tags;
  // it must never rescue an unrelated or undated search-result title.
  const datedMatch = year && aliases.some(t=>titleVariants(t).some(v=>
    new RegExp(`(?:^| )(?:${escapeRegExp(v)} ${year}|${year} ${escapeRegExp(v)})(?= |$)`).test(name)));
  if (!video.movieBound && !datedMatch)
    return reject('missing_title_and_release_year');
  // Explicitly dated remakes still lose even if TMDB supplied the candidate.
  const datedTitle = aliases.some(t=>titleVariants(t).some(v=>
    [...name.matchAll(new RegExp(`(?:^| )${escapeRegExp(v)} ((?:18|19|20)\\d{2})(?= |$)`,'g'))]
      .some(m=>m[1]!==year)));
  if (datedTitle) return reject('different_release_year');
  if (feature === 'bloopers') {
    if (!BLOOPERS.test(name)) return reject('not_bloopers');
    if (/\b(?:deleted scenes?|trailers?|teasers?|movie clips?|film clips?)\b/.test(name))
      return reject('mixed_blooper_and_other_material');
  } else {
    if (BLOOPERS.test(name)) return reject('belongs_in_bloopers');
    if (/\b(?:trailers?|teasers?|tv spots?|movie clips?|film clips?|full scenes?|deleted scenes?)\b/.test(name))
      return reject('not_a_production_extra');
    if (!EXTRAS.test(name) && !(video.movieBound && ['Featurette','Behind the Scenes'].includes(video.sourceType)))
      return reject('missing_extra_evidence');
  }
  return {accepted:true,reason:video.movieBound?'movie_linked_metadata':'title_year_category_match',
    score:(video.movieBound?100:0)+(titleMatch?40:0)+(year&&name.includes(year)?20:0)};
}
async function publicVideos(videos) {
  if (!videos.length) return [];
  const params = new URLSearchParams({part:'snippet,status,contentDetails',id:videos.map(v=>v.key).join(','),key:youtubeKey});
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  const data = await response.json();
  if (!response.ok) throw new Error('Video availability could not be checked. Please try again.');
  const byId = new Map((Array.isArray(data.items)?data.items:[]).map(v=>[v.id,v]));
  return videos.flatMap(v=>{
    const item=byId.get(v.key);
    if (!item || item.status?.privacyStatus!=='public' || item.status?.uploadStatus!=='processed' ||
        item.contentDetails?.regionRestriction?.allowed?.length || item.contentDetails?.regionRestriction?.blocked?.length ||
        (item.snippet?.liveBroadcastContent && item.snippet.liveBroadcastContent!=='none')) return [];
    return [{...v,name:decodeText(item.snippet?.title||v.name),channel:decodeText(item.snippet?.channelTitle||v.channel),
      channel_id:item.snippet?.channelId||'',availability_checked_at:new Date().toISOString()}];
  });
}

function removeDuplicates(videos) {
  const seen = new Set();

  return videos.filter(video => {
    if (!video.key || seen.has(video.key)) {
      return false;
    }

    seen.add(video.key);
    return true;
  });
}

export default async function handler(req, res) {
  try {
    const id =
      String(req.query?.id || "").trim();

    const feature =
      String(req.query?.feature || "behind")
        .trim()
        .toLowerCase();

    if (!/^[1-9]\d*$/.test(id)) {
      return res.status(400).json({
        error: "Missing movie id"
      });
    }

    if (
      feature !== "behind" &&
      feature !== "bloopers"
    ) {
      return res.status(400).json({
        error: "Invalid extras category"
      });
    }

    const movie = await tmdb(
      `/movie/${encodeURIComponent(id)}?language=en-US&append_to_response=videos`
    );

    const title =
      String(movie.title || "").trim();

    const year =
      movie.release_date
        ? movie.release_date.slice(0, 4)
        : "";

    if (!title) {
      throw new Error(
        "Movie title could not be determined"
      );
    }

    if (!youtubeKey) throw new Error("YouTube API key is not configured");
    let siblings = [];
    if (movie.belongs_to_collection?.id) {
      // A collection supplies named sequels such as Top Gun: Maverick.
      // Do not silently weaken franchise checks if that lookup fails.
      const collection = await tmdb(`/collection/${encodeURIComponent(movie.belongs_to_collection.id)}?language=en-US`);
      siblings = Array.isArray(collection.parts) ? collection.parts : [];
    }
    const terms = feature === 'bloopers' ? 'bloopers|outtakes|"gag reel"' : '"behind the scenes"|"making of"|featurette|interview';
    const youtubeVideos = await searchYouTube(`"${title}" ${year} ${terms}`);
    const linked = (Array.isArray(movie.videos?.results)?movie.videos.results:[])
      .filter(v=>v.site==='YouTube').map(v=>({key:v.key,name:decodeText(v.name),movieBound:true,sourceType:v.type,channel:''}));
    const candidates = removeDuplicates([...linked,...youtubeVideos])
      .map(v=>({...v,...evaluateVideo(v,movie,feature,siblings)})).filter(v=>v.accepted);
    // Recheck the current title/category after the availability lookup, rather
    // than trusting a stale search snippet if the uploader renamed the video.
    const available = await publicVideos(candidates.sort((a,b)=>b.score-a.score).slice(0,50));
    const selected = available.map(v=>({...v,...evaluateVideo(v,movie,feature,siblings)}))
      .filter(v=>v.accepted).sort((a,b)=>b.score-a.score).slice(0,6);

    return res.status(200).json({
      feature,
      movie: title,
      year,

      videos: selected.map(video => ({
        key: video.key,
        name: video.name,
        type:
          feature === "behind"
            ? "Movie Extra"
            : "Blooper",
        official: false,
        channel: video.channel,
        channel_id: video.channel_id,
        match_basis: video.reason,
        content_verified: false,
        availability_checked_at: video.availability_checked_at
      })),
      selection_policy: "strict_metadata_v1",
      verification: "Metadata screened; video contents have not been independently reviewed."
    });

  } catch (error) {
    console.error(
      "Reelwise extras API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Movie extras could not be loaded"
    });
  }
}

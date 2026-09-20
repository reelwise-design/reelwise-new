/*
  Build Reelwise's local Oscar acting-nominations database from the
  official Academy Awards Database.

  Output: data/oscar-acting.js

  This script is intended to run in GitHub Actions, not in the user's
  browser and not on every Vercel request.
*/

import fs from "node:fs/promises";
import path from "node:path";

const QUERY = {
  AwardCategory: ["9998"], // Academy index: Acting (...all)
  Sort: "3-Award Category-Chron",
  AwardShowNumberFrom: 0,
  AwardShowNumberTo: 0,
  Search: 30
};

const URL =
  "https://awardsdatabase.oscars.org/search/getresults?query=" +
  encodeURIComponent(JSON.stringify(QUERY));

const ACTING_CATEGORY = /^(ACTOR|ACTRESS)(?: IN A (LEADING|SUPPORTING) ROLE)?$/i;
const YEAR = /^(\d{4}(?:\/\d{2,4})?)\s+\((\d+)(?:st|nd|rd|th)\)$/i;

function clean(value=""){
  return String(value)
    .replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"')
    .replace(/&#39;|&#x27;/g,"'")
    .replace(/&nbsp;/g," ")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/\s+/g," ")
    .trim();
}

function htmlToLines(html=""){
  return String(html)
    .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi,"\n$1\n")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/(?:div|p|li|tr|td|th|h\d)>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .split(/\n+/)
    .map(clean)
    .filter(Boolean);
}

function normalizeCategory(raw=""){
  const value=clean(raw).toUpperCase();
  if(value==="ACTOR") return "Best Actor";
  if(value==="ACTRESS") return "Best Actress";
  if(value.includes("ACTOR") && value.includes("SUPPORTING")) return "Best Supporting Actor";
  if(value.includes("ACTRESS") && value.includes("SUPPORTING")) return "Best Supporting Actress";
  if(value.includes("ACTOR")) return "Best Actor";
  if(value.includes("ACTRESS")) return "Best Actress";
  return "";
}

function normalizeName(value=""){
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[’‘]/g,"'")
    .replace(/\s+/g," ")
    .trim();
}

function parse(lines){
  const rows=[];
  let awardYear="";
  let ceremony=0;
  let category="";

  for(let i=0;i<lines.length;i++){
    const line=lines[i];

    const ym=line.match(YEAR);
    if(ym){
      awardYear=ym[1];
      ceremony=Number(ym[2]);
      continue;
    }

    if(ACTING_CATEGORY.test(line)){
      category=normalizeCategory(line);
      continue;
    }

    if(!awardYear || !category) continue;

    // Academy category display: nominee, "--", film, optional character,
    // then optional statuette marker.
    if(lines[i+1]==="--" && lines[i+2]){
      const nominee=clean(line);
      const film=clean(lines[i+2]);

      if(!nominee || !film) continue;

      let winner=false;
      for(let j=i+3;j<=Math.min(i+6,lines.length-1);j++){
        if(YEAR.test(lines[j]) || ACTING_CATEGORY.test(lines[j])) break;
        if(/statuette|winner|won/i.test(lines[j])){
          winner=true;
          break;
        }
      }

      rows.push({
        awardYear,
        ceremony,
        category,
        nominee,
        film,
        winner
      });

      i+=2;
    }
  }

  // Exact duplicate protection.
  const seen=new Set();
  return rows.filter(row=>{
    const key=[
      row.awardYear,row.category,normalizeName(row.nominee),
      row.film,row.winner
    ].join("|");
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const response=await fetch(URL,{
  headers:{
    "User-Agent":"Reelwise Oscar Data Builder/1.0",
    "Accept":"text/html,application/xhtml+xml"
  }
});

if(!response.ok){
  throw new Error(`Academy request failed: ${response.status}`);
}

const html=await response.text();
const rows=parse(htmlToLines(html));

if(rows.length<400){
  throw new Error(
    `Safety check failed: only ${rows.length} acting nominations parsed. `+
    "Existing local data was NOT replaced."
  );
}

const byPerson={};

for(const row of rows){
  const key=normalizeName(row.nominee);
  if(!byPerson[key]) byPerson[key]=[];
  byPerson[key].push({
    year:row.awardYear,
    ceremony:row.ceremony,
    movie:row.film,
    category:row.category,
    winner:row.winner
  });
}

for(const history of Object.values(byPerson)){
  history.sort((a,b)=>
    (Number(b.ceremony)||0)-(Number(a.ceremony)||0)
  );
}

const latestCeremony=Math.max(...rows.map(r=>r.ceremony||0));
const latestYear=rows
  .filter(r=>r.ceremony===latestCeremony)
  .map(r=>r.awardYear)[0] || "";

const output=`/*
  AUTO-GENERATED REELWISE OSCAR ACTING DATABASE
  Source: Official Academy Awards Database
  Do not edit manually.
*/
export const OSCAR_ACTING_COMPLETE = true;
export const OSCAR_ACTING_LATEST_CEREMONY = ${latestCeremony};
export const OSCAR_ACTING_LATEST_AWARD_YEAR = ${JSON.stringify(latestYear)};

export const OSCAR_ACTING_BY_PERSON = ${JSON.stringify(byPerson,null,2)};

export function normalizeOscarActorName(value=""){
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g,"")
    .replace(/[’‘]/g,"'")
    .replace(/\\s+/g," ")
    .trim();
}

export function getLocalOscarActingRecord(name=""){
  const history=
    OSCAR_ACTING_BY_PERSON[
      normalizeOscarActorName(name)
    ] || [];

  const wins=history.filter(item=>item.winner).length;

  return {
    confirmed:true,
    found:history.length>0,
    wins,
    nominations:history.length,
    history,
    academy_awards:history,
    academyAwards:history,
    accolades:history,
    source:"Reelwise local Oscar acting database"
  };
}
`;

const outputPath=path.join(process.cwd(),"data","oscar-acting.js");
await fs.mkdir(path.dirname(outputPath),{recursive:true});
await fs.writeFile(outputPath,output,"utf8");

console.log(
  `Built ${rows.length} acting nominations for `+
  `${Object.keys(byPerson).length} performers through ceremony ${latestCeremony}.`
);

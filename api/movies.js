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


// Academy Original Song category honoree records, ceremonies 1935–2026.
// Generated from official ceremony pages; no runtime page scraping.
const ACADEMY_SONG_RECORDS = [{"ceremonyYear":1935,"film":"Flying Down to Rio","category":"Music (Song)","nominee":"Carioca in \"Flying Down to Rio\" Music by Vincent Youmans; Lyrics by Edward Eliscu and Gus Kahn","winner":false},{"ceremonyYear":1935,"film":"She Loves Me Not","category":"Music (Song)","nominee":"Love In Bloom in \"She Loves Me Not\" Music by Ralph Rainger; Lyrics by Leo Robin","winner":false},{"ceremonyYear":1935,"film":"The Gay Divorcee","category":"Music (Song)","nominee":"The Continental in \"The Gay Divorcee\" Music by Con Conrad; Lyrics by Herb Magidson","winner":true},{"ceremonyYear":1936,"film":"Gold Diggers of 1935","category":"Music (Song)","nominee":"Lullaby Of Broadway in \"Gold Diggers of 1935\" Music by Harry Warren; Lyrics by Al Dubin","winner":true},{"ceremonyYear":1936,"film":"Roberta","category":"Music (Song)","nominee":"Lovely To Look At in \"Roberta\" Music by Jerome Kern; Lyrics by Dorothy Fields and Jimmy McHugh","winner":false},{"ceremonyYear":1936,"film":"Top Hat","category":"Music (Song)","nominee":"Cheek To Cheek in \"Top Hat\" Music and Lyrics by Irving Berlin","winner":false},{"ceremonyYear":1937,"film":"Born to Dance","category":"Music (Song)","nominee":"I've Got You Under My Skin in \"Born to Dance\" Music and Lyrics by Cole Porter","winner":false},{"ceremonyYear":1937,"film":"Pennies from Heaven","category":"Music (Song)","nominee":"Pennies From Heaven in \"Pennies from Heaven\" Music by Arthur Johnston; Lyrics by Johnny Burke","winner":false},{"ceremonyYear":1937,"film":"Sing, Baby, Sing","category":"Music (Song)","nominee":"When Did You Leave Heaven in \"Sing, Baby, Sing\" Music by Richard A. Whiting; Lyrics by Walter Bullock","winner":false},{"ceremonyYear":1937,"film":"Suzy","category":"Music (Song)","nominee":"Did I Remember in \"Suzy\" Music by Walter Donaldson; Lyrics by Harold Adamson","winner":false},{"ceremonyYear":1937,"film":"Swing Time","category":"Music (Song)","nominee":"The Way You Look Tonight in \"Swing Time\" Music by Jerome Kern; Lyrics by Dorothy Fields","winner":true},{"ceremonyYear":1937,"film":"Trail of the Lonesome Pine","category":"Music (Song)","nominee":"A Melody From The Sky in \"Trail of the Lonesome Pine\" Music by Louis Alter; Lyrics by Sidney Mitchell","winner":false},{"ceremonyYear":1938,"film":"Artists and Models","category":"Music (Song)","nominee":"Whispers In The Dark in \"Artists and Models\" Music by Frederick Hollander; Lyrics by Leo Robin","winner":false},{"ceremonyYear":1938,"film":"Mr. Dodd Takes the Air","category":"Music (Song)","nominee":"Remember Me in \"Mr. Dodd Takes the Air\" Music by Harry Warren; Lyrics by Al Dubin","winner":false},{"ceremonyYear":1938,"film":"Shall We Dance","category":"Music (Song)","nominee":"They Can't Take That Away From Me in \"Shall We Dance\" Music by George Gershwin; Lyrics by Ira Gershwin","winner":false},{"ceremonyYear":1938,"film":"Waikiki Wedding","category":"Music (Song)","nominee":"Sweet Leilani in \"Waikiki Wedding\" Music and Lyrics by Harry Owens","winner":true},{"ceremonyYear":1938,"film":"Walter Wanger's Vogues of 1938","category":"Music (Song)","nominee":"That Old Feeling in \"Walter Wanger's Vogues of 1938\" Music by Sammy Fain; Lyrics by Lew Brown","winner":false},{"ceremonyYear":1939,"film":"Alexander's Ragtime Band","category":"Music (Song)","nominee":"Now It Can Be Told in \"Alexander's Ragtime Band\" Music and Lyrics by Irving Berlin","winner":false},{"ceremonyYear":1939,"film":"Carefree","category":"Music (Song)","nominee":"Change Partners in \"Carefree\" Music and Lyrics by Irving Berlin","winner":false},{"ceremonyYear":1939,"film":"Going Places","category":"Music (Song)","nominee":"Jeepers Creepers in \"Going Places\" Music by Harry Warren; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1939,"film":"Mannequin","category":"Music (Song)","nominee":"Always And Always in \"Mannequin\" Music by Edward Ward; Lyrics by Chet Forrest and Bob Wright","winner":false},{"ceremonyYear":1939,"film":"Merrily We Live","category":"Music (Song)","nominee":"Merrily We Live in \"Merrily We Live\" Music by Phil Charig; Lyrics by Arthur Quenzer","winner":false},{"ceremonyYear":1939,"film":"That Certain Age","category":"Music (Song)","nominee":"My Own in \"That Certain Age\" Music by Jimmy McHugh; Lyrics by Harold Adamson","winner":false},{"ceremonyYear":1939,"film":"The Big Broadcast of 1938","category":"Music (Song)","nominee":"Thanks For The Memory in \"The Big Broadcast of 1938\" Music by Ralph Rainger; Lyrics by Leo Robin","winner":true},{"ceremonyYear":1939,"film":"The Cowboy and the Lady","category":"Music (Song)","nominee":"The Cowboy And The Lady in \"The Cowboy and the Lady\" Music by Lionel Newman; Lyrics by Arthur Quenzer","winner":false},{"ceremonyYear":1939,"film":"The Lady Objects","category":"Music (Song)","nominee":"A Mist Over The Moon in \"The Lady Objects\" Music by Ben Oakland; Lyrics by Oscar Hammerstein II","winner":false},{"ceremonyYear":1939,"film":"Under Western Stars","category":"Music (Song)","nominee":"Dust in \"Under Western Stars\" Music and Lyrics by Johnny Marvin","winner":false},{"ceremonyYear":1940,"film":"Gulliver's Travels","category":"Music (Song)","nominee":"Faithful Forever in \"Gulliver's Travels\" Music by Ralph Rainger; Lyrics by Leo Robin","winner":false},{"ceremonyYear":1940,"film":"Love Affair","category":"Music (Song)","nominee":"Wishing in \"Love Affair\" Music and Lyrics by Buddy de Sylva","winner":false},{"ceremonyYear":1940,"film":"Second Fiddle","category":"Music (Song)","nominee":"I Poured My Heart Into A Song in \"Second Fiddle\" Music and Lyrics by Irving Berlin","winner":false},{"ceremonyYear":1940,"film":"The Wizard of Oz","category":"Music (Song)","nominee":"Over The Rainbow in \"The Wizard of Oz\" Music by Harold Arlen; Lyrics by E. Y. Harburg","winner":true},{"ceremonyYear":1941,"film":"Down Argentine Way","category":"Music (Song)","nominee":"Down Argentina Way in \"Down Argentine Way\" Music by Harry Warren; Lyrics by Mack Gordon","winner":false},{"ceremonyYear":1941,"film":"Hit Parade of 1941","category":"Music (Song)","nominee":"Who Am I? in \"Hit Parade of 1941\" Music by Jule Styne; Lyrics by Walter Bullock","winner":false},{"ceremonyYear":1941,"film":"Music in My Heart","category":"Music (Song)","nominee":"It's A Blue World in \"Music in My Heart\" Music and Lyrics by Chet Forrest and Bob Wright","winner":false},{"ceremonyYear":1941,"film":"Pinocchio","category":"Music (Song)","nominee":"When You Wish Upon A Star in \"Pinocchio\" Music by Leigh Harline; Lyrics by Ned Washington","winner":true},{"ceremonyYear":1941,"film":"Rhythm on the River","category":"Music (Song)","nominee":"Only Forever in \"Rhythm on the River\" Music by James Monaco; Lyrics by John Burke","winner":false},{"ceremonyYear":1941,"film":"Second Chorus","category":"Music (Song)","nominee":"Love Of My Life in \"Second Chorus\" Music by Artie Shaw; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1941,"film":"Spring Parade","category":"Music (Song)","nominee":"Waltzing In The Clouds in \"Spring Parade\" Music by Robert Stolz; Lyrics by Gus Kahn","winner":false},{"ceremonyYear":1941,"film":"Strike Up the Band","category":"Music (Song)","nominee":"Our Love Affair in \"Strike Up the Band\" Music and Lyrics by Roger Edens and Arthur Freed","winner":false},{"ceremonyYear":1941,"film":"You'll Find Out","category":"Music (Song)","nominee":"I'd Know You Anywhere in \"You'll Find Out\" Music by Jimmy McHugh; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1942,"film":"All-American Co-Ed","category":"Music (Song)","nominee":"Out Of The Silence in \"All-American Co-Ed\" Music and Lyrics by Lloyd B. Norlind","winner":false},{"ceremonyYear":1942,"film":"Blues in the Night","category":"Music (Song)","nominee":"Blues In The Night in \"Blues in the Night\" Music by Harold Arlen; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1942,"film":"Buck Privates","category":"Music (Song)","nominee":"Boogie Woogie Bugle Boy Of Company B in \"Buck Privates\" Music by Hugh Prince; Lyrics by Don Raye","winner":false},{"ceremonyYear":1942,"film":"Dumbo","category":"Music (Song)","nominee":"Baby Mine in \"Dumbo\" Music by Frank Churchill; Lyrics by Ned Washington","winner":false},{"ceremonyYear":1942,"film":"Lady Be Good","category":"Music (Song)","nominee":"The Last Time I Saw Paris in \"Lady Be Good\" Music by Jerome Kern; Lyrics by Oscar Hammerstein II","winner":true},{"ceremonyYear":1942,"film":"Las Vegas Nights","category":"Music (Song)","nominee":"Dolores in \"Las Vegas Nights\" Music by Lou Alter; Lyrics by Frank Loesser","winner":false},{"ceremonyYear":1942,"film":"Ridin' on a Rainbow","category":"Music (Song)","nominee":"Be Honest With Me in \"Ridin' on a Rainbow\" Music and Lyrics by Gene Autry and Fred Rose","winner":false},{"ceremonyYear":1942,"film":"Sun Valley Serenade","category":"Music (Song)","nominee":"Chattanooga Choo Choo in \"Sun Valley Serenade\" Music by Harry Warren; Lyrics by Mack Gordon","winner":false},{"ceremonyYear":1942,"film":"You'll Never Get Rich","category":"Music (Song)","nominee":"Since I Kissed My Baby Goodbye in \"You'll Never Get Rich\" Music and Lyrics by Cole Porter","winner":false},{"ceremonyYear":1943,"film":"Always in My Heart","category":"Music (Song)","nominee":"Always In My Heart in \"Always in My Heart\" Music by Ernesto Lecuona; Lyrics by Kim Gannon","winner":false},{"ceremonyYear":1943,"film":"Babes on Broadway","category":"Music (Song)","nominee":"How About You? in \"Babes on Broadway\" Music by Burton Lane; Lyrics by Ralph Freed","winner":false},{"ceremonyYear":1943,"film":"Bambi","category":"Music (Song)","nominee":"Love Is A Song in \"Bambi\" Music by Frank Churchill; Lyrics by Larry Morey","winner":false},{"ceremonyYear":1943,"film":"Flying with Music","category":"Music (Song)","nominee":"Pennies For Peppino in \"Flying with Music\" Music by Edward Ward; Lyrics by Chet Forrest and Bob Wright","winner":false},{"ceremonyYear":1943,"film":"Hellzapoppin'","category":"Music (Song)","nominee":"Pig Foot Pete in \"Hellzapoppin'\" Music by Gene de Paul; Lyrics by Don Raye","winner":false},{"ceremonyYear":1943,"film":"Holiday Inn","category":"Music (Song)","nominee":"White Christmas in \"Holiday Inn\" Music and Lyrics by Irving Berlin","winner":true},{"ceremonyYear":1943,"film":"Orchestra Wives","category":"Music (Song)","nominee":"I've Got A Gal In Kalamazoo in \"Orchestra Wives\" Music by Harry Warren; Lyrics by Mack Gordon","winner":false},{"ceremonyYear":1943,"film":"The Mayor of 44th Street","category":"Music (Song)","nominee":"There's A Breeze On Lake Louise in \"The Mayor of 44th Street\" Music by Harry Revel; Lyrics by Mort Greene","winner":false},{"ceremonyYear":1943,"film":"You Were Never Lovelier","category":"Music (Song)","nominee":"Dearly Beloved in \"You Were Never Lovelier\" Music by Jerome Kern; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1943,"film":"Youth on Parade","category":"Music (Song)","nominee":"It Seems I Heard That Song Before in \"Youth on Parade\" Music by Jule Styne; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1944,"film":"Cabin in the Sky","category":"Music (Song)","nominee":"Happiness Is A Thing Called Joe in \"Cabin in the Sky\" Music by Harold Arlen; Lyrics by E. Y. Harburg","winner":false},{"ceremonyYear":1944,"film":"Hello, Frisco, Hello","category":"Music (Song)","nominee":"You'll Never Know in \"Hello, Frisco, Hello\" Music by Harry Warren; Lyrics by Mack Gordon","winner":true},{"ceremonyYear":1944,"film":"Hers to Hold","category":"Music (Song)","nominee":"Say A Pray'r For The Boys Over There in \"Hers to Hold\" Music by Jimmy McHugh; Lyrics by Herb Magidson","winner":false},{"ceremonyYear":1944,"film":"Hit Parade of 1943","category":"Music (Song)","nominee":"A Change Of Heart in \"Hit Parade of 1943\" Music by Jule Styne; Lyrics by Harold Adamson","winner":false},{"ceremonyYear":1944,"film":"Saludos Amigos","category":"Music (Song)","nominee":"Saludos Amigos in \"Saludos Amigos\" Music by Charles Wolcott; Lyrics by Ned Washington","winner":false},{"ceremonyYear":1944,"film":"Something to Shout About","category":"Music (Song)","nominee":"You'd Be So Nice To Come Home To in \"Something to Shout About\" Music and Lyrics by Cole Porter","winner":false},{"ceremonyYear":1944,"film":"Stage Door Canteen","category":"Music (Song)","nominee":"We Mustn't Say Goodbye in \"Stage Door Canteen\" Music by James Monaco; Lyrics by Al Dubin","winner":false},{"ceremonyYear":1944,"film":"Star Spangled Rhythm","category":"Music (Song)","nominee":"That Old Black Magic in \"Star Spangled Rhythm\" Music by Harold Arlen; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1944,"film":"Thank Your Lucky Stars","category":"Music (Song)","nominee":"They're Either Too Young Or Too Old in \"Thank Your Lucky Stars\" Music by Arthur Schwartz; Lyrics by Frank Loesser","winner":false},{"ceremonyYear":1944,"film":"The Sky's the Limit","category":"Music (Song)","nominee":"My Shining Hour in \"The Sky's the Limit\" Music by Harold Arlen; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1945,"film":"Brazil","category":"Music (Song)","nominee":"Rio De Janeiro in \"Brazil\" Music by Ary Barroso; Lyrics by Ned Washington","winner":false},{"ceremonyYear":1945,"film":"Cover Girl","category":"Music (Song)","nominee":"Long Ago And Far Away in \"Cover Girl\" Music by Jerome Kern; Lyrics by Ira Gershwin","winner":false},{"ceremonyYear":1945,"film":"Follow the Boys","category":"Music (Song)","nominee":"I'll Walk Alone in \"Follow the Boys\" Music by Jule Styne; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1945,"film":"Going My Way","category":"Music (Song)","nominee":"Swinging On A Star in \"Going My Way\" Music by James Van Heusen; Lyrics by Johnny Burke","winner":true},{"ceremonyYear":1945,"film":"Higher and Higher","category":"Music (Song)","nominee":"I Couldn't Sleep A Wink Last Night in \"Higher and Higher\" Music by Jimmy McHugh; Lyrics by Harold Adamson","winner":false},{"ceremonyYear":1945,"film":"Hollywood Canteen","category":"Music (Song)","nominee":"Sweet Dreams Sweetheart in \"Hollywood Canteen\" Music by M. K. Jerome; Lyrics by Ted Koehler","winner":false},{"ceremonyYear":1945,"film":"Lady, Let's Dance","category":"Music (Song)","nominee":"Silver Shadows And Golden Dreams in \"Lady, Let's Dance\" Music by Lew Pollack; Lyrics by Charles Newman","winner":false},{"ceremonyYear":1945,"film":"Meet Me in St. Louis","category":"Music (Song)","nominee":"The Trolley Song in \"Meet Me in St. Louis\" Music and Lyrics by Ralph Blane and Hugh Martin","winner":false},{"ceremonyYear":1945,"film":"Minstrel Man","category":"Music (Song)","nominee":"Remember Me To Carolina in \"Minstrel Man\" Music by Harry Revel; Lyrics by Paul Webster","winner":false},{"ceremonyYear":1945,"film":"Song of the Open Road","category":"Music (Song)","nominee":"Too Much In Love in \"Song of the Open Road\" Music by Walter Kent; Lyrics by Kim Gannon","winner":false},{"ceremonyYear":1945,"film":"Sweet and Lowdown","category":"Music (Song)","nominee":"I'm Making Believe in \"Sweet and Lowdown\" Music by James V. Monaco; Lyrics by Mack Gordon","winner":false},{"ceremonyYear":1945,"film":"Up in Arms","category":"Music (Song)","nominee":"Now I Know in \"Up in Arms\" Music by Harold Arlen; Lyrics by Ted Koehler","winner":false},{"ceremonyYear":1946,"film":"Anchors Aweigh","category":"Music (Song)","nominee":"I Fall In Love Too Easily in \"Anchors Aweigh\" Music by Jule Styne; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1946,"film":"Belle of the Yukon","category":"Music (Song)","nominee":"Sleighride In July in \"Belle of the Yukon\" Music by James Van Heusen; Lyrics by Johnny Burke","winner":false},{"ceremonyYear":1946,"film":"Can't Help Singing","category":"Music (Song)","nominee":"More And More in \"Can't Help Singing\" Music by Jerome Kern; Lyrics by E. Y. Harburg","winner":false},{"ceremonyYear":1946,"film":"Earl Carroll Vanities","category":"Music (Song)","nominee":"Endlessly in \"Earl Carroll Vanities\" Music by Walter Kent; Lyrics by Kim Gannon","winner":false},{"ceremonyYear":1946,"film":"G. I. Joe","category":"Music (Song)","nominee":"Linda in \"G. I. Joe\" Music and Lyrics by Ann Ronell","winner":false},{"ceremonyYear":1946,"film":"Here Come the Waves","category":"Music (Song)","nominee":"Accentuate The Positive in \"Here Come the Waves\" Music by Harold Arlen; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1946,"film":"Love Letters","category":"Music (Song)","nominee":"Love Letters in \"Love Letters\" Music by Victor Young; Lyrics by Eddie Heyman","winner":false},{"ceremonyYear":1946,"film":"San Antonio","category":"Music (Song)","nominee":"Some Sunday Morning in \"San Antonio\" Music by Ray Heindorf and M. K. Jerome; Lyrics by Ted Koehler","winner":false},{"ceremonyYear":1946,"film":"Sing Your Way Home","category":"Music (Song)","nominee":"I'll Buy That Dream in \"Sing Your Way Home\" Music by Allie Wrubel; Lyrics by Herb Magidson","winner":false},{"ceremonyYear":1946,"film":"State Fair","category":"Music (Song)","nominee":"It Might As Well Be Spring in \"State Fair\" Music by Richard Rodgers; Lyrics by Oscar Hammerstein II","winner":true},{"ceremonyYear":1946,"film":"The Bells of St. Mary's","category":"Music (Song)","nominee":"Aren't You Glad You're You? in \"The Bells of St. Mary's\" Music by James Van Heusen; Lyrics by Johnny Burke","winner":false},{"ceremonyYear":1946,"film":"Tonight and Every Night","category":"Music (Song)","nominee":"Anywhere in \"Tonight and Every Night\" Music by Jule Styne; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1946,"film":"Why Girls Leave Home","category":"Music (Song)","nominee":"The Cat And The Canary in \"Why Girls Leave Home\" Music by Jay Livingston; Lyrics by Ray Evans","winner":false},{"ceremonyYear":1946,"film":"Wonder Man","category":"Music (Song)","nominee":"So In Love in \"Wonder Man\" Music by David Rose; Lyrics by Leo Robin","winner":false},{"ceremonyYear":1947,"film":"Blue Skies","category":"Music (Song)","nominee":"You Keep Coming Back Like A Song in \"Blue Skies\" Music and Lyrics by Irving Berlin","winner":false},{"ceremonyYear":1947,"film":"Canyon Passage","category":"Music (Song)","nominee":"Ole Buttermilk Sky in \"Canyon Passage\" Music by Hoagy Carmichael; Lyrics by Jack Brooks","winner":false},{"ceremonyYear":1947,"film":"Centennial Summer","category":"Music (Song)","nominee":"All Through The Day in \"Centennial Summer\" Music by Jerome Kern; Lyrics by Oscar Hammerstein II","winner":false},{"ceremonyYear":1947,"film":"The Dolly Sisters","category":"Music (Song)","nominee":"I Can't Begin To Tell You in \"The Dolly Sisters\" Music by James Monaco; Lyrics by Mack Gordon","winner":false},{"ceremonyYear":1947,"film":"The Harvey Girls","category":"Music (Song)","nominee":"On The Atchison, Topeka And The Santa Fe in \"The Harvey Girls\" Music by Harry Warren; Lyrics by Johnny Mercer","winner":true},{"ceremonyYear":1948,"film":"Good News","category":"Music (Song)","nominee":"Pass That Peace Pipe in \"Good News\" Music and Lyrics by Ralph Blane, Roger Edens and Hugh Martin","winner":false},{"ceremonyYear":1948,"film":"Mother Wore Tights","category":"Music (Song)","nominee":"You Do in \"Mother Wore Tights\" Music by Josef Myrow; Lyrics by Mack Gordon","winner":false},{"ceremonyYear":1948,"film":"Song of the South","category":"Music (Song)","nominee":"Zip-A-Dee-Doo-Dah in \"Song of the South\" Music by Allie Wrubel; Lyrics by Ray Gilbert","winner":true},{"ceremonyYear":1948,"film":"The Perils of Pauline","category":"Music (Song)","nominee":"I Wish I Didn't Love You So in \"The Perils of Pauline\" Music and Lyrics by Frank Loesser","winner":false},{"ceremonyYear":1948,"film":"The Time, the Place and the Girl","category":"Music (Song)","nominee":"A Gal In Calico in \"The Time, the Place and the Girl\" Music by Arthur Schwartz; Lyrics by Leo Robin","winner":false},{"ceremonyYear":1949,"film":"Casbah","category":"Music (Song)","nominee":"For Every Man There's A Woman in \"Casbah\" Music by Harold Arlen; Lyrics by Leo Robin","winner":false},{"ceremonyYear":1949,"film":"Romance on the High Seas","category":"Music (Song)","nominee":"It's Magic in \"Romance on the High Seas\" Music by Jule Styne; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1949,"film":"That Lady in Ermine","category":"Music (Song)","nominee":"This Is The Moment in \"That Lady in Ermine\" Music by Frederick Hollander; Lyrics by Leo Robin","winner":false},{"ceremonyYear":1949,"film":"The Paleface","category":"Music (Song)","nominee":"Buttons And Bows in \"The Paleface\" Music and Lyrics by Jay Livingston and Ray Evans","winner":true},{"ceremonyYear":1949,"film":"Wet Blanket Policy","category":"Music (Song)","nominee":"The Woody Woodpecker Song in \"Wet Blanket Policy\" Music and Lyrics by Ramey Idriss and George Tibbles","winner":false},{"ceremonyYear":1950,"film":"Come to the Stable","category":"Music (Song)","nominee":"Through A Long And Sleepless Night in \"Come to the Stable\" Music by Alfred Newman; Lyrics by Mack Gordon","winner":false},{"ceremonyYear":1950,"film":"It's a Great Feeling","category":"Music (Song)","nominee":"It's A Great Feeling in \"It's a Great Feeling\" Music by Jule Styne; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1950,"film":"My Foolish Heart","category":"Music (Song)","nominee":"My Foolish Heart in \"My Foolish Heart\" Music by Victor Young; Lyrics by Ned Washington","winner":false},{"ceremonyYear":1950,"film":"Neptune's Daughter","category":"Music (Song)","nominee":"Baby, It's Cold Outside in \"Neptune's Daughter\" Music and Lyrics by Frank Loesser","winner":true},{"ceremonyYear":1950,"film":"So Dear to My Heart","category":"Music (Song)","nominee":"Lavender Blue in \"So Dear to My Heart\" Music by Eliot Daniel; Lyrics by Larry Morey","winner":false},{"ceremonyYear":1951,"film":"Captain Carey, U.S.A.","category":"Music (Song)","nominee":"Mona Lisa in \"Captain Carey, U.S.A.\" Music and Lyrics by Ray Evans and Jay Livingston","winner":true},{"ceremonyYear":1951,"film":"Cinderella","category":"Music (Song)","nominee":"Bibbidi-Bobbidi-Boo in \"Cinderella\" Music and Lyrics by Mack David, Al Hoffman and Jerry Livingston","winner":false},{"ceremonyYear":1951,"film":"Singing Guns","category":"Music (Song)","nominee":"Mule Train in \"Singing Guns\" Music and Lyrics by Fred Glickman, Hy Heath and Johnny Lange","winner":false},{"ceremonyYear":1951,"film":"The Toast of New Orleans","category":"Music (Song)","nominee":"Be My Love in \"The Toast of New Orleans\" Music by Nicholas Brodszky; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1951,"film":"Wabash Avenue","category":"Music (Song)","nominee":"Wilhelmina in \"Wabash Avenue\" Music by Josef Myrow; Lyrics by Mack Gordon","winner":false},{"ceremonyYear":1952,"film":"Golden Girl","category":"Music (Song)","nominee":"Never in \"Golden Girl\" Music by Lionel Newman; Lyrics by Eliot Daniel","winner":false},{"ceremonyYear":1952,"film":"Here Comes the Groom","category":"Music (Song)","nominee":"In The Cool, Cool, Cool Of The Evening in \"Here Comes the Groom\" Music by Hoagy Carmichael; Lyrics by Johnny Mercer","winner":true},{"ceremonyYear":1952,"film":"Rich, Young and Pretty","category":"Music (Song)","nominee":"Wonder Why in \"Rich, Young and Pretty\" Music by Nicholas Brodszky; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1952,"film":"Royal Wedding","category":"Music (Song)","nominee":"Too Late Now in \"Royal Wedding\" Music by Burton Lane; Lyrics by Alan Jay Lerner","winner":false},{"ceremonyYear":1952,"film":"The Strip","category":"Music (Song)","nominee":"A Kiss To Build A Dream On in \"The Strip\" Music and Lyrics by Bert Kalmar, Harry Ruby and Oscar Hammerstein II","winner":false},{"ceremonyYear":1953,"film":"Because You're Mine","category":"Music (Song)","nominee":"Because You're Mine in \"Because You're Mine\" Music by Nicholas Brodszky; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1953,"film":"Hans Christian Andersen","category":"Music (Song)","nominee":"Thumbelina in \"Hans Christian Andersen\" Music and Lyrics by Frank Loesser","winner":false},{"ceremonyYear":1953,"film":"High Noon","category":"Music (Song)","nominee":"High Noon (Do Not Forsake Me, Oh My Darlin') in \"High Noon\" Music by Dimitri Tiomkin; Lyrics by Ned Washington","winner":true},{"ceremonyYear":1953,"film":"Just for You","category":"Music (Song)","nominee":"Zing A Little Zong in \"Just for You\" Music by Harry Warren; Lyrics by Leo Robin","winner":false},{"ceremonyYear":1953,"film":"Son of Paleface","category":"Music (Song)","nominee":"Am I In Love in \"Son of Paleface\" Music and Lyrics by Jack Brooks","winner":false},{"ceremonyYear":1954,"film":"Calamity Jane","category":"Music (Song)","nominee":"Secret Love in \"Calamity Jane\" Music by Sammy Fain; Lyrics by Paul Francis Webster","winner":true},{"ceremonyYear":1954,"film":"Miss Sadie Thompson","category":"Music (Song)","nominee":"Sadie Thompson's Song (Blue Pacific Blues) in \"Miss Sadie Thompson\" Music by Lester Lee; Lyrics by Ned Washington","winner":false},{"ceremonyYear":1954,"film":"Small Town Girl","category":"Music (Song)","nominee":"My Flaming Heart in \"Small Town Girl\" Music by Nicholas Brodszky; Lyrics by Leo Robin","winner":false},{"ceremonyYear":1954,"film":"The Caddy","category":"Music (Song)","nominee":"That's Amore in \"The Caddy\" Music by Harry Warren; Lyrics by Jack Brooks","winner":false},{"ceremonyYear":1954,"film":"The Moon Is Blue","category":"Music (Song)","nominee":"The Moon Is Blue in \"The Moon Is Blue\" Music by Herschel Burke Gilbert; Lyrics by Sylvia Fine","winner":false},{"ceremonyYear":1955,"film":"A Star Is Born","category":"Music (Song)","nominee":"The Man That Got Away in \"A Star Is Born\" Music by Harold Arlen; Lyrics by Ira Gershwin","winner":false},{"ceremonyYear":1955,"film":"Susan Slept Here","category":"Music (Song)","nominee":"Hold My Hand in \"Susan Slept Here\" Music and Lyrics by Jack Lawrence and Richard Myers","winner":false},{"ceremonyYear":1955,"film":"The High and the Mighty","category":"Music (Song)","nominee":"The High And The Mighty in \"The High and the Mighty\" Music by Dimitri Tiomkin; Lyrics by Ned Washington","winner":false},{"ceremonyYear":1955,"film":"Three Coins in the Fountain","category":"Music (Song)","nominee":"Three Coins In The Fountain in \"Three Coins in the Fountain\" Music by Jule Styne; Lyrics by Sammy Cahn","winner":true},{"ceremonyYear":1955,"film":"White Christmas","category":"Music (Song)","nominee":"Count Your Blessings Instead Of Sheep in \"White Christmas\" Music and Lyrics by Irving Berlin","winner":false},{"ceremonyYear":1956,"film":"Daddy Long Legs","category":"Music (Song)","nominee":"Something's Gotta Give in \"Daddy Long Legs\" Music and Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1956,"film":"Love Is a Many-Splendored Thing","category":"Music (Song)","nominee":"Love Is A Many-Splendored Thing in \"Love Is a Many-Splendored Thing\" Music by Sammy Fain; Lyrics by Paul Francis Webster","winner":true},{"ceremonyYear":1956,"film":"Love Me or Leave Me","category":"Music (Song)","nominee":"I'll Never Stop Loving You in \"Love Me or Leave Me\" Music by Nicholas Brodszky; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1956,"film":"The Tender Trap","category":"Music (Song)","nominee":"(Love Is) The Tender Trap in \"The Tender Trap\" Music by James Van Heusen; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1956,"film":"Unchained","category":"Music (Song)","nominee":"Unchained Melody in \"Unchained\" Music by Alex North; Lyrics by Hy Zaret","winner":false},{"ceremonyYear":1957,"film":"Friendly Persuasion","category":"Music (Song)","nominee":"Friendly Persuasion (Thee I Love) in \"Friendly Persuasion\" Music by Dimitri Tiomkin; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1957,"film":"High Society","category":"Music (Song)","nominee":"True Love in \"High Society\" Music and Lyrics by Cole Porter","winner":false},{"ceremonyYear":1957,"film":"Julie","category":"Music (Song)","nominee":"Julie in \"Julie\" Music by Leith Stevens; Lyrics by Tom Adair","winner":false},{"ceremonyYear":1957,"film":"The Man Who Knew Too Much","category":"Music (Song)","nominee":"Whatever Will Be, Will Be (Que Sera, Sera) in \"The Man Who Knew Too Much\" Music and Lyrics by Jay Livingston and Ray Evans","winner":true},{"ceremonyYear":1957,"film":"Written on the Wind","category":"Music (Song)","nominee":"Written On The Wind in \"Written on the Wind\" Music by Victor Young; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1958,"film":"An Affair to Remember","category":"Music (Song)","nominee":"An Affair To Remember in \"An Affair to Remember\" Music by Harry Warren; Lyrics by Harold Adamson and Leo McCarey","winner":false},{"ceremonyYear":1958,"film":"April Love","category":"Music (Song)","nominee":"April Love in \"April Love\" Music by Sammy Fain; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1958,"film":"Tammy and the Bachelor","category":"Music (Song)","nominee":"Tammy in \"Tammy and the Bachelor\" Music and Lyrics by Ray Evans and Jay Livingston","winner":false},{"ceremonyYear":1958,"film":"The Joker Is Wild","category":"Music (Song)","nominee":"All The Way in \"The Joker Is Wild\" Music by James Van Heusen; Lyrics by Sammy Cahn","winner":true},{"ceremonyYear":1958,"film":"Wild Is the Wind","category":"Music (Song)","nominee":"Wild Is The Wind in \"Wild Is the Wind\" Music by Dimitri Tiomkin; Lyrics by Ned Washington","winner":false},{"ceremonyYear":1959,"film":"A Certain Smile","category":"Music (Song)","nominee":"A Certain Smile in \"A Certain Smile\" Music by Sammy Fain; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1959,"film":"Gigi","category":"Music (Song)","nominee":"Gigi in \"Gigi\" Music by Frederick Loewe; Lyrics by Alan Jay Lerner","winner":true},{"ceremonyYear":1959,"film":"Houseboat","category":"Music (Song)","nominee":"Almost In Your Arms (Love Song From 'Houseboat') in \"Houseboat\" Music and Lyrics by Jay Livingston and Ray Evans","winner":false},{"ceremonyYear":1959,"film":"Marjorie Morningstar","category":"Music (Song)","nominee":"A Very Precious Love in \"Marjorie Morningstar\" Music by Sammy Fain; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1959,"film":"Some Came Running","category":"Music (Song)","nominee":"To Love And Be Loved in \"Some Came Running\" Music by James Van Heusen; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1960,"film":"A Hole in the Head","category":"Music (Song)","nominee":"High Hopes in \"A Hole in the Head\" Music by James Van Heusen; Lyrics by Sammy Cahn","winner":true},{"ceremonyYear":1960,"film":"The Best of Everything","category":"Music (Song)","nominee":"The Best Of Everything in \"The Best of Everything\" Music by Alfred Newman; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1960,"film":"The Five Pennies","category":"Music (Song)","nominee":"The Five Pennies in \"The Five Pennies\" Music and Lyrics by Sylvia Fine","winner":false},{"ceremonyYear":1960,"film":"The Hanging Tree","category":"Music (Song)","nominee":"The Hanging Tree in \"The Hanging Tree\" Music by Jerry Livingston; Lyrics by Mack David","winner":false},{"ceremonyYear":1960,"film":"The Young Land","category":"Music (Song)","nominee":"Strange Are The Ways Of Love in \"The Young Land\" Music by Dimitri Tiomkin; Lyrics by Ned Washington","winner":false},{"ceremonyYear":1961,"film":"High Time","category":"Music (Song)","nominee":"The Second Time Around in \"High Time\" Music by James Van Heusen; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1961,"film":"Never on Sunday","category":"Music (Song)","nominee":"Never On Sunday in \"Never on Sunday\" Music and Lyrics by Manos Hadjidakis","winner":true},{"ceremonyYear":1961,"film":"Pepe","category":"Music (Song)","nominee":"Faraway Part Of Town in \"Pepe\" Music by Andre Previn; Lyrics by Dory Langdon","winner":false},{"ceremonyYear":1961,"film":"The Alamo","category":"Music (Song)","nominee":"The Green Leaves Of Summer in \"The Alamo\" Music by Dimitri Tiomkin; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1961,"film":"The Facts of Life","category":"Music (Song)","nominee":"The Facts Of Life in \"The Facts of Life\" Music and Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1962,"film":"Bachelor in Paradise","category":"Music (Song)","nominee":"Bachelor In Paradise in \"Bachelor in Paradise\" Music by Henry Mancini; Lyrics by Mack David","winner":false},{"ceremonyYear":1962,"film":"Breakfast at Tiffany's","category":"Music (Song)","nominee":"Moon River in \"Breakfast at Tiffany's\" Music by Henry Mancini; Lyrics by Johnny Mercer","winner":true},{"ceremonyYear":1962,"film":"El Cid","category":"Music (Song)","nominee":"Love Theme From El Cid (The Falcon And The Dove) in \"El Cid\" Music by Miklos Rozsa; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1962,"film":"Pocketful of Miracles","category":"Music (Song)","nominee":"Pocketful Of Miracles in \"Pocketful of Miracles\" Music by James Van Heusen; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1962,"film":"Town without Pity","category":"Music (Song)","nominee":"Town Without Pity in \"Town without Pity\" Music by Dimitri Tiomkin; Lyrics by Ned Washington","winner":false},{"ceremonyYear":1963,"film":"Days of Wine and Roses","category":"Music (Song)","nominee":"Days Of Wine And Roses in \"Days of Wine and Roses\" Music by Henry Mancini; Lyrics by Johnny Mercer","winner":true},{"ceremonyYear":1963,"film":"Mutiny on the Bounty","category":"Music (Song)","nominee":"Love Song From Mutiny On The Bounty (Follow Me) in \"Mutiny on the Bounty\" Music by Bronislau Kaper; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1963,"film":"Tender Is the Night","category":"Music (Song)","nominee":"Tender Is The Night in \"Tender Is the Night\" Music by Sammy Fain; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1963,"film":"Two for the Seesaw","category":"Music (Song)","nominee":"Song From Two For The Seesaw (Second Chance) in \"Two for the Seesaw\" Music by Andre Previn; Lyrics by Dory Langdon","winner":false},{"ceremonyYear":1963,"film":"Walk on the Wild Side","category":"Music (Song)","nominee":"Walk On The Wild Side in \"Walk on the Wild Side\" Music by Elmer Bernstein; Lyrics by Mack David","winner":false},{"ceremonyYear":1964,"film":"55 Days at Peking","category":"Music (Song)","nominee":"So Little Time in \"55 Days at Peking\" Music by Dimitri Tiomkin; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1964,"film":"Charade","category":"Music (Song)","nominee":"Charade in \"Charade\" Music by Henry Mancini; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1964,"film":"It's a Mad, Mad, Mad, Mad World","category":"Music (Song)","nominee":"It's A Mad, Mad, Mad, Mad World in \"It's a Mad, Mad, Mad, Mad World\" Music by Ernest Gold; Lyrics by Mack David","winner":false},{"ceremonyYear":1964,"film":"Mondo Cane","category":"Music (Song)","nominee":"More in \"Mondo Cane\" Music by Riz Ortolani and Nino Oliviero; Lyrics by Norman Newell","winner":false},{"ceremonyYear":1964,"film":"Papa's Delicate Condition","category":"Music (Song)","nominee":"Call Me Irresponsible in \"Papa's Delicate Condition\" Music by James Van Heusen; Lyrics by Sammy Cahn","winner":true},{"ceremonyYear":1965,"film":"Dear Heart","category":"Music (Song)","nominee":"Dear Heart in \"Dear Heart\" Music by Henry Mancini; Lyrics by Jay Livingston and Ray Evans","winner":false},{"ceremonyYear":1965,"film":"Hush...Hush, Sweet Charlotte","category":"Music (Song)","nominee":"Hush...Hush, Sweet Charlotte in \"Hush...Hush, Sweet Charlotte\" Music by Frank DeVol; Lyrics by Mack David","winner":false},{"ceremonyYear":1965,"film":"Mary Poppins","category":"Music (Song)","nominee":"Chim Chim Cher-ee in \"Mary Poppins\" Music and Lyrics by Richard M. Sherman and Robert B. Sherman","winner":true},{"ceremonyYear":1965,"film":"Robin and the 7 Hoods","category":"Music (Song)","nominee":"My Kind Of Town in \"Robin and the 7 Hoods\" Music by James Van Heusen; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1965,"film":"Where Love Has Gone","category":"Music (Song)","nominee":"Where Love Has Gone in \"Where Love Has Gone\" Music by James Van Heusen; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1966,"film":"Cat Ballou","category":"Music (Song)","nominee":"The Ballad Of Cat Ballou in \"Cat Ballou\" Music by Jerry Livingston; Lyrics by Mack David","winner":false},{"ceremonyYear":1966,"film":"The Great Race","category":"Music (Song)","nominee":"The Sweetheart Tree in \"The Great Race\" Music by Henry Mancini; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1966,"film":"The Sandpiper","category":"Music (Song)","nominee":"The Shadow Of Your Smile in \"The Sandpiper\" Music by Johnny Mandel; Lyrics by Paul Francis Webster","winner":true},{"ceremonyYear":1966,"film":"The Umbrellas of Cherbourg","category":"Music (Song)","nominee":"I Will Wait For You in \"The Umbrellas of Cherbourg\" Music by Michel Legrand; Lyrics by Jacques Demy; English Lyrics by Norman Gimbel","winner":false},{"ceremonyYear":1966,"film":"What's New Pussycat?","category":"Music (Song)","nominee":"What's New Pussycat? in \"What's New Pussycat?\" Music by Burt Bacharach; Lyrics by Hal David","winner":false},{"ceremonyYear":1967,"film":"Alfie","category":"Music (Song)","nominee":"Alfie in \"Alfie\" Music by Burt Bacharach; Lyrics by Hal David","winner":false},{"ceremonyYear":1967,"film":"An American Dream","category":"Music (Song)","nominee":"A Time For Love in \"An American Dream\" Music by Johnny Mandel; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1967,"film":"Born Free","category":"Music (Song)","nominee":"Born Free in \"Born Free\" Music by John Barry; Lyrics by Don Black","winner":true},{"ceremonyYear":1967,"film":"Georgy Girl","category":"Music (Song)","nominee":"Georgy Girl in \"Georgy Girl\" Music by Tom Springfield; Lyrics by Jim Dale","winner":false},{"ceremonyYear":1967,"film":"Hawaii","category":"Music (Song)","nominee":"My Wishing Doll in \"Hawaii\" Music by Elmer Bernstein; Lyrics by Mack David","winner":false},{"ceremonyYear":1968,"film":"Banning","category":"Music (Song)","nominee":"The Eyes Of Love in \"Banning\" Music by Quincy Jones; Lyrics by Bob Russell","winner":false},{"ceremonyYear":1968,"film":"Casino Royale","category":"Music (Song)","nominee":"The Look Of Love in \"Casino Royale\" Music by Burt Bacharach; Lyrics by Hal David","winner":false},{"ceremonyYear":1968,"film":"Doctor Dolittle","category":"Music (Song)","nominee":"Talk To The Animals in \"Doctor Dolittle\" Music and Lyrics by Leslie Bricusse","winner":true},{"ceremonyYear":1968,"film":"The Jungle Book","category":"Music (Song)","nominee":"The Bare Necessities in \"The Jungle Book\" Music and Lyrics by Terry Gilkyson","winner":false},{"ceremonyYear":1968,"film":"Thoroughly Modern Millie","category":"Music (Song)","nominee":"Thoroughly Modern Millie in \"Thoroughly Modern Millie\" Music and Lyrics by James Van Heusen and Sammy Cahn","winner":false},{"ceremonyYear":1969,"film":"Chitty Chitty Bang Bang","category":"Music (Song—Original for the Picture)","nominee":"Chitty Chitty Bang Bang in \"Chitty Chitty Bang Bang\" Music and Lyrics by Richard M. Sherman and Robert B. Sherman","winner":false},{"ceremonyYear":1969,"film":"For Love of Ivy","category":"Music (Song—Original for the Picture)","nominee":"For Love Of Ivy in \"For Love of Ivy\" Music by Quincy Jones; Lyrics by Bob Russell","winner":false},{"ceremonyYear":1969,"film":"Funny Girl","category":"Music (Song—Original for the Picture)","nominee":"Funny Girl in \"Funny Girl\" Music by Jule Styne; Lyrics by Bob Merrill","winner":false},{"ceremonyYear":1969,"film":"Star!","category":"Music (Song—Original for the Picture)","nominee":"Star! in \"Star!\" Music by Jimmy Van Heusen; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1969,"film":"The Thomas Crown Affair","category":"Music (Song—Original for the Picture)","nominee":"The Windmills Of Your Mind in \"The Thomas Crown Affair\" Music by Michel Legrand; Lyrics by Alan Bergman and Marilyn Bergman","winner":true},{"ceremonyYear":1970,"film":"Butch Cassidy and the Sundance Kid","category":"Music (Song—Original for the Picture)","nominee":"Raindrops Keep Fallin' On My Head in \"Butch Cassidy and the Sundance Kid\" Music by Burt Bacharach; Lyrics by Hal David","winner":true},{"ceremonyYear":1970,"film":"The Happy Ending","category":"Music (Song—Original for the Picture)","nominee":"What Are You Doing The Rest Of Your Life? in \"The Happy Ending\" Music by Michel Legrand; Lyrics by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1970,"film":"The Prime of Miss Jean Brodie","category":"Music (Song—Original for the Picture)","nominee":"Jean in \"The Prime of Miss Jean Brodie\" Music and Lyrics by Rod McKuen","winner":false},{"ceremonyYear":1970,"film":"The Sterile Cuckoo","category":"Music (Song—Original for the Picture)","nominee":"Come Saturday Morning in \"The Sterile Cuckoo\" Music by Fred Karlin; Lyrics by Dory Previn","winner":false},{"ceremonyYear":1970,"film":"True Grit","category":"Music (Song—Original for the Picture)","nominee":"True Grit in \"True Grit\" Music by Elmer Bernstein; Lyrics by Don Black","winner":false},{"ceremonyYear":1971,"film":"Darling Lili","category":"Music (Song—Original for the Picture)","nominee":"Whistling Away The Dark in \"Darling Lili\" Music by Henry Mancini; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1971,"film":"Lovers and Other Strangers","category":"Music (Song—Original for the Picture)","nominee":"For All We Know in \"Lovers and Other Strangers\" Music by Fred Karlin; Lyrics by Robb Royer (aka Robb Wilson) and James Griffin (aka Arthur James)","winner":true},{"ceremonyYear":1971,"film":"Madron","category":"Music (Song—Original for the Picture)","nominee":"Till Love Touches Your Life in \"Madron\" Music by Riz Ortolani; Lyrics by Arthur Hamilton","winner":false},{"ceremonyYear":1971,"film":"Pieces of Dreams","category":"Music (Song—Original for the Picture)","nominee":"Pieces Of Dreams in \"Pieces of Dreams\" Music by Michel Legrand; Lyrics by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1971,"film":"Scrooge","category":"Music (Song—Original for the Picture)","nominee":"Thank You Very Much in \"Scrooge\" Music and Lyrics by Leslie Bricusse","winner":false},{"ceremonyYear":1972,"film":"Bedknobs and Broomsticks","category":"Music (Song—Original for the Picture)","nominee":"The Age Of Not Believing in \"Bedknobs and Broomsticks\" Music and Lyrics by Richard M. Sherman and Robert B. Sherman","winner":false},{"ceremonyYear":1972,"film":"Bless the Beasts & Children","category":"Music (Song—Original for the Picture)","nominee":"Bless The Beasts & Children in \"Bless the Beasts & Children\" Music and Lyrics by Barry DeVorzon and Perry Botkin, Jr.","winner":false},{"ceremonyYear":1972,"film":"Kotch","category":"Music (Song—Original for the Picture)","nominee":"Life Is What You Make It in \"Kotch\" Music by Marvin Hamlisch; Lyrics by Johnny Mercer","winner":false},{"ceremonyYear":1972,"film":"Shaft","category":"Music (Song—Original for the Picture)","nominee":"Theme From Shaft in \"Shaft\" Music and Lyrics by Isaac Hayes","winner":true},{"ceremonyYear":1972,"film":"Sometimes a Great Notion","category":"Music (Song—Original for the Picture)","nominee":"All His Children in \"Sometimes a Great Notion\" Music by Henry Mancini; Lyrics by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1973,"film":"Ben","category":"Music (Song—Original for the Picture)","nominee":"Ben in \"Ben\" Music by Walter Scharf; Lyrics by Don Black","winner":false},{"ceremonyYear":1973,"film":"The Life and Times of Judge Roy Bean","category":"Music (Song—Original for the Picture)","nominee":"Marmalade, Molasses & Honey in \"The Life and Times of Judge Roy Bean\" Music by Maurice Jarre; Lyrics by Marilyn Bergman and Alan Bergman","winner":false},{"ceremonyYear":1973,"film":"The Little Ark","category":"Music (Song—Original for the Picture)","nominee":"Come Follow, Follow Me in \"The Little Ark\" Music by Fred Karlin; Lyrics by Marsha Karlin","winner":false},{"ceremonyYear":1973,"film":"The Poseidon Adventure","category":"Music (Song—Original for the Picture)","nominee":"The Morning After in \"The Poseidon Adventure\" Music and Lyrics by Al Kasha and Joel Hirschhorn","winner":true},{"ceremonyYear":1973,"film":"The Stepmother","category":"Music (Song—Original for the Picture)","nominee":"Strange Are The Ways Of Love in \"The Stepmother\" Music by Sammy Fain; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1974,"film":"A Touch of Class","category":"Music (Song)","nominee":"All That Love Went To Waste in \"A Touch of Class\" Music by George Barrie; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1974,"film":"Cinderella Liberty","category":"Music (Song)","nominee":"Nice To Be Around in \"Cinderella Liberty\" Music by John Williams; Lyrics by Paul Williams","winner":false},{"ceremonyYear":1974,"film":"Live and Let Die","category":"Music (Song)","nominee":"Live And Let Die in \"Live and Let Die\" Music and Lyrics by Paul McCartney and Linda McCartney","winner":false},{"ceremonyYear":1974,"film":"Robin Hood","category":"Music (Song)","nominee":"Love in \"Robin Hood\" Music by George Bruns; Lyrics by Floyd Huddleston","winner":false},{"ceremonyYear":1974,"film":"The Way We Were","category":"Music (Song)","nominee":"The Way We Were in \"The Way We Were\" Music by Marvin Hamlisch; Lyrics by Alan Bergman and Marilyn Bergman","winner":true},{"ceremonyYear":1975,"film":"Benji","category":"Music (Song)","nominee":"Benji's Theme (I Feel Love) in \"Benji\" Music by Euel Box; Lyrics by Betty Box","winner":false},{"ceremonyYear":1975,"film":"Blazing Saddles","category":"Music (Song)","nominee":"Blazing Saddles in \"Blazing Saddles\" Music by John Morris; Lyrics by Mel Brooks","winner":false},{"ceremonyYear":1975,"film":"Gold","category":"Music (Song)","nominee":"Wherever Love Takes Me in \"Gold\" Music by Elmer Bernstein; Lyrics by Don Black","winner":false},{"ceremonyYear":1975,"film":"The Little Prince","category":"Music (Song)","nominee":"Little Prince in \"The Little Prince\" Music by Frederick Loewe; Lyrics by Alan Jay Lerner","winner":false},{"ceremonyYear":1975,"film":"The Towering Inferno","category":"Music (Song)","nominee":"We May Never Love Like This Again in \"The Towering Inferno\" Music and Lyrics by Al Kasha and Joel Hirschhorn","winner":true},{"ceremonyYear":1976,"film":"Funny Lady","category":"Music (Original Song)","nominee":"How Lucky Can You Get in \"Funny Lady\" Music and Lyrics by Fred Ebb and John Kander","winner":false},{"ceremonyYear":1976,"film":"Mahogany","category":"Music (Original Song)","nominee":"Theme From Mahogany (Do You Know Where You're Going To) in \"Mahogany\" Music by Michael Masser; Lyrics by Gerry Goffin","winner":false},{"ceremonyYear":1976,"film":"Nashville","category":"Music (Original Song)","nominee":"I'm Easy in \"Nashville\" Music and Lyrics by Keith Carradine","winner":true},{"ceremonyYear":1976,"film":"The Other Side of the Mountain","category":"Music (Original Song)","nominee":"Richard's Window in \"The Other Side of the Mountain\" Music by Charles Fox; Lyrics by Norman Gimbel","winner":false},{"ceremonyYear":1976,"film":"Whiffs","category":"Music (Original Song)","nominee":"Now That We're In Love in \"Whiffs\" Music by George Barrie; Lyrics by Sammy Cahn","winner":false},{"ceremonyYear":1977,"film":"A Star Is Born","category":"Music (Original Song)","nominee":"Evergreen (Love Theme From A Star Is Born) in \"A Star Is Born\" Music by Barbra Streisand; Lyrics by Paul Williams","winner":true},{"ceremonyYear":1977,"film":"Half a House","category":"Music (Original Song)","nominee":"A World That Never Was in \"Half a House\" Music by Sammy Fain; Lyrics by Paul Francis Webster","winner":false},{"ceremonyYear":1977,"film":"Rocky","category":"Music (Original Song)","nominee":"Gonna Fly Now in \"Rocky\" Music by Bill Conti; Lyrics by Carol Connors and Ayn Robbins","winner":false},{"ceremonyYear":1977,"film":"The Omen","category":"Music (Original Song)","nominee":"Ave Satani in \"The Omen\" Music and Lyrics by Jerry Goldsmith","winner":false},{"ceremonyYear":1977,"film":"The Pink Panther Strikes Again","category":"Music (Original Song)","nominee":"Come To Me in \"The Pink Panther Strikes Again\" Music by Henry Mancini; Lyrics by Don Black","winner":false},{"ceremonyYear":1978,"film":"Pete's Dragon","category":"Music (Original Song)","nominee":"Candle On The Water in \"Pete's Dragon\" Music and Lyrics by Al Kasha and Joel Hirschhorn","winner":false},{"ceremonyYear":1978,"film":"The Rescuers","category":"Music (Original Song)","nominee":"Someone's Waiting For You in \"The Rescuers\" Music by Sammy Fain; Lyrics by Carol Connors and Ayn Robbins","winner":false},{"ceremonyYear":1978,"film":"The Slipper and the Rose--The Story of Cinderella","category":"Music (Original Song)","nominee":"The Slipper And The Rose Waltz (He Danced With Me/She Danced With Me) in \"The Slipper and the Rose--The Story of Cinderella\" Music and Lyrics by Richard M. Sherman and Robert B. Sherman","winner":false},{"ceremonyYear":1978,"film":"The Spy Who Loved Me","category":"Music (Original Song)","nominee":"Nobody Does It Better in \"The Spy Who Loved Me\" Music by Marvin Hamlisch; Lyrics by Carole Bayer Sager","winner":false},{"ceremonyYear":1978,"film":"You Light Up My Life","category":"Music (Original Song)","nominee":"You Light Up My Life in \"You Light Up My Life\" Music and Lyrics by Joseph Brooks","winner":true},{"ceremonyYear":1979,"film":"Foul Play","category":"Music (Original Song)","nominee":"Ready To Take A Chance Again in \"Foul Play\" Music by Charles Fox; Lyrics by Norman Gimbel","winner":false},{"ceremonyYear":1979,"film":"Grease","category":"Music (Original Song)","nominee":"Hopelessly Devoted To You in \"Grease\" Music and Lyrics by John Farrar","winner":false},{"ceremonyYear":1979,"film":"Same Time, Next Year","category":"Music (Original Song)","nominee":"The Last Time I Felt Like This in \"Same Time, Next Year\" Music by Marvin Hamlisch; Lyrics by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1979,"film":"Thank God It's Friday","category":"Music (Original Song)","nominee":"Last Dance in \"Thank God It's Friday\" Music and Lyrics by Paul Jabara","winner":true},{"ceremonyYear":1979,"film":"The Magic of Lassie","category":"Music (Original Song)","nominee":"When You're Loved in \"The Magic of Lassie\" Music and Lyrics by Richard M. Sherman and Robert B. Sherman","winner":false},{"ceremonyYear":1980,"film":"10","category":"Music (Original Song)","nominee":"It's Easy To Say in \"10\" Music by Henry Mancini; Lyric by Robert Wells","winner":false},{"ceremonyYear":1980,"film":"Ice Castles","category":"Music (Original Song)","nominee":"Through The Eyes Of Love in \"Ice Castles\" Music by Marvin Hamlisch; Lyric by Carole Bayer Sager","winner":false},{"ceremonyYear":1980,"film":"Norma Rae","category":"Music (Original Song)","nominee":"It Goes Like It Goes in \"Norma Rae\" Music by David Shire; Lyric by Norman Gimbel","winner":true},{"ceremonyYear":1980,"film":"The Muppet Movie","category":"Music (Original Song)","nominee":"The Rainbow Connection in \"The Muppet Movie\" Music and Lyric by Paul Williams and Kenny Ascher","winner":false},{"ceremonyYear":1980,"film":"The Promise","category":"Music (Original Song)","nominee":"I'll Never Say 'Goodbye' in \"The Promise\" Music by David Shire; Lyric by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1981,"film":"Fame","category":"Music (Original Song)","nominee":"Fame in \"Fame\" Music by Michael Gore; Lyric by Dean Pitchford","winner":true},{"ceremonyYear":1981,"film":"Fame","category":"Music (Original Song)","nominee":"Out Here On My Own in \"Fame\" Music by Michael Gore; Lyric by Lesley Gore","winner":false},{"ceremonyYear":1981,"film":"Honeysuckle Rose","category":"Music (Original Song)","nominee":"On The Road Again in \"Honeysuckle Rose\" Music and Lyric by Willie Nelson","winner":false},{"ceremonyYear":1981,"film":"Nine to Five","category":"Music (Original Song)","nominee":"Nine To Five in \"Nine to Five\" Music and Lyric by Dolly Parton","winner":false},{"ceremonyYear":1981,"film":"The Competition","category":"Music (Original Song)","nominee":"People Alone in \"The Competition\" Music by Lalo Schifrin; Lyric by Wilbur Jennings","winner":false},{"ceremonyYear":1982,"film":"Arthur","category":"Music (Original Song)","nominee":"Arthur's Theme (Best That You Can Do) in \"Arthur\" Music and Lyric by Burt Bacharach, Carole Bayer Sager, Christopher Cross and Peter Allen","winner":true},{"ceremonyYear":1982,"film":"Endless Love","category":"Music (Original Song)","nominee":"Endless Love in \"Endless Love\" Music and Lyric by Lionel Richie","winner":false},{"ceremonyYear":1982,"film":"For Your Eyes Only","category":"Music (Original Song)","nominee":"For Your Eyes Only in \"For Your Eyes Only\" Music by Bill Conti; Lyric by Mick Leeson","winner":false},{"ceremonyYear":1982,"film":"Ragtime","category":"Music (Original Song)","nominee":"One More Hour in \"Ragtime\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":1982,"film":"The Great Muppet Caper","category":"Music (Original Song)","nominee":"The First Time It Happens in \"The Great Muppet Caper\" Music and Lyric by Joe Raposo","winner":false},{"ceremonyYear":1983,"film":"An Officer and a Gentleman","category":"Music (Original Song)","nominee":"Up Where We Belong in \"An Officer and a Gentleman\" Music by Jack Nitzsche and Buffy Sainte-Marie; Lyric by Will Jennings","winner":true},{"ceremonyYear":1983,"film":"Best Friends","category":"Music (Original Song)","nominee":"How Do You Keep The Music Playing? in \"Best Friends\" Music by Michel Legrand; Lyric by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1983,"film":"Rocky III","category":"Music (Original Song)","nominee":"Eye Of The Tiger in \"Rocky III\" Music and Lyric by Jim Peterik and Frankie Sullivan III","winner":false},{"ceremonyYear":1983,"film":"Tootsie","category":"Music (Original Song)","nominee":"It Might Be You in \"Tootsie\" Music by Dave Grusin; Lyric by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1983,"film":"Yes, Giorgio","category":"Music (Original Song)","nominee":"If We Were In Love in \"Yes, Giorgio\" Music by John Williams; Lyric by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1984,"film":"Flashdance","category":"Music (Original Song)","nominee":"Flashdance...What A Feeling in \"Flashdance\" Music by Giorgio Moroder; Lyric by Keith Forsey and Irene Cara","winner":true},{"ceremonyYear":1984,"film":"Flashdance","category":"Music (Original Song)","nominee":"Maniac in \"Flashdance\" Music and Lyric by Michael Sembello and Dennis Matkosky","winner":false},{"ceremonyYear":1984,"film":"Tender Mercies","category":"Music (Original Song)","nominee":"Over You in \"Tender Mercies\" Music and Lyric by Austin Roberts and Bobby Hart","winner":false},{"ceremonyYear":1984,"film":"Yentl","category":"Music (Original Song)","nominee":"Papa, Can You Hear Me? in \"Yentl\" Music by Michel Legrand; Lyric by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1984,"film":"Yentl","category":"Music (Original Song)","nominee":"The Way He Makes Me Feel in \"Yentl\" Music by Michel Legrand; Lyric by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1985,"film":"Against All Odds","category":"Music (Original Song)","nominee":"Against All Odds (Take A Look At Me Now) in \"Against All Odds\" Music and Lyric by Phil Collins","winner":false},{"ceremonyYear":1985,"film":"Footloose","category":"Music (Original Song)","nominee":"Footloose in \"Footloose\" Music and Lyric by Kenny Loggins and Dean Pitchford","winner":false},{"ceremonyYear":1985,"film":"Footloose","category":"Music (Original Song)","nominee":"Let's Hear It For The Boy in \"Footloose\" Music and Lyric by Tom Snow and Dean Pitchford","winner":false},{"ceremonyYear":1985,"film":"Ghostbusters","category":"Music (Original Song)","nominee":"Ghostbusters in \"Ghostbusters\" Music and Lyric by Ray Parker, Jr.","winner":false},{"ceremonyYear":1985,"film":"The Woman in Red","category":"Music (Original Song)","nominee":"I Just Called To Say I Love You in \"The Woman in Red\" Music and Lyric by Stevie Wonder","winner":true},{"ceremonyYear":1986,"film":"A Chorus Line","category":"Music (Original Song)","nominee":"Surprise, Surprise in \"A Chorus Line\" Music by Marvin Hamlisch; Lyric by Edward Kleban","winner":false},{"ceremonyYear":1986,"film":"Back to the Future","category":"Music (Original Song)","nominee":"The Power Of Love in \"Back to the Future\" Music by Chris Hayes and Johnny Colla; Lyric by Huey Lewis","winner":false},{"ceremonyYear":1986,"film":"The Color Purple","category":"Music (Original Song)","nominee":"Miss Celie's Blues (Sister) in \"The Color Purple\" Music by Quincy Jones and Rod Temperton; Lyric by Quincy Jones, Rod Temperton and Lionel Richie","winner":false},{"ceremonyYear":1986,"film":"White Nights","category":"Music (Original Song)","nominee":"Say You, Say Me in \"White Nights\" Music and Lyric by Lionel Richie","winner":true},{"ceremonyYear":1986,"film":"White Nights","category":"Music (Original Song)","nominee":"Separate Lives (Love Theme From 'White Nights') in \"White Nights\" Music and Lyric by Stephen Bishop","winner":false},{"ceremonyYear":1987,"film":"An American Tail","category":"Music (Original Song)","nominee":"Somewhere Out There in \"An American Tail\" Music by James Horner and Barry Mann; Lyric by Cynthia Weil","winner":false},{"ceremonyYear":1987,"film":"Little Shop of Horrors","category":"Music (Original Song)","nominee":"Mean Green Mother From Outer Space in \"Little Shop of Horrors\" Music by Alan Menken; Lyric by Howard Ashman","winner":false},{"ceremonyYear":1987,"film":"That's Life","category":"Music (Original Song)","nominee":"Life In A Looking Glass in \"That's Life\" Music by Henry Mancini; Lyric by Leslie Bricusse","winner":false},{"ceremonyYear":1987,"film":"The Karate Kid Part II","category":"Music (Original Song)","nominee":"Glory Of Love in \"The Karate Kid Part II\" Music by Peter Cetera and David Foster; Lyric by Peter Cetera and Diane Nini","winner":false},{"ceremonyYear":1987,"film":"Top Gun","category":"Music (Original Song)","nominee":"Take My Breath Away in \"Top Gun\" Music by Giorgio Moroder; Lyric by Tom Whitlock","winner":true},{"ceremonyYear":1988,"film":"Beverly Hills Cop II","category":"Music (Original Song)","nominee":"Shakedown in \"Beverly Hills Cop II\" Music by Harold Faltermeyer and Keith Forsey; Lyric by Harold Faltermeyer, Keith Forsey and Bob Seger","winner":false},{"ceremonyYear":1988,"film":"Cry Freedom","category":"Music (Original Song)","nominee":"Cry Freedom in \"Cry Freedom\" Music and Lyric by George Fenton and Jonas Gwangwa","winner":false},{"ceremonyYear":1988,"film":"Dirty Dancing","category":"Music (Original Song)","nominee":"(I've Had) The Time Of My Life in \"Dirty Dancing\" Music by Franke Previte, John DeNicola and Donald Markowitz; Lyric by Franke Previte","winner":true},{"ceremonyYear":1988,"film":"Mannequin","category":"Music (Original Song)","nominee":"Nothing's Gonna Stop Us Now in \"Mannequin\" Music and Lyric by Albert Hammond and Diane Warren","winner":false},{"ceremonyYear":1988,"film":"The Princess Bride","category":"Music (Original Song)","nominee":"Storybook Love in \"The Princess Bride\" Music and Lyric by Willy DeVille","winner":false},{"ceremonyYear":1989,"film":"Bagdad Cafe","category":"Music (Original Song)","nominee":"Calling You in \"Bagdad Cafe\" Music and Lyric by Bob Telson","winner":false},{"ceremonyYear":1989,"film":"Buster","category":"Music (Original Song)","nominee":"Two Hearts in \"Buster\" Music by Lamont Dozier; Lyric by Phil Collins","winner":false},{"ceremonyYear":1989,"film":"Working Girl","category":"Music (Original Song)","nominee":"Let The River Run in \"Working Girl\" Music and Lyric by Carly Simon","winner":true},{"ceremonyYear":1990,"film":"Chances Are","category":"Music (Original Song)","nominee":"After All in \"Chances Are\" Music by Tom Snow; Lyric by Dean Pitchford","winner":false},{"ceremonyYear":1990,"film":"Parenthood","category":"Music (Original Song)","nominee":"I Love To See You Smile in \"Parenthood\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":1990,"film":"Shirley Valentine","category":"Music (Original Song)","nominee":"The Girl Who Used To Be Me in \"Shirley Valentine\" Music by Marvin Hamlisch; Lyric by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1990,"film":"The Little Mermaid","category":"Music (Original Song)","nominee":"Kiss The Girl in \"The Little Mermaid\" Music by Alan Menken; Lyric by Howard Ashman","winner":false},{"ceremonyYear":1990,"film":"The Little Mermaid","category":"Music (Original Song)","nominee":"Under The Sea in \"The Little Mermaid\" Music by Alan Menken; Lyric by Howard Ashman","winner":true},{"ceremonyYear":1991,"film":"Dick Tracy","category":"Music (Original Song)","nominee":"Sooner Or Later (I Always Get My Man) in \"Dick Tracy\" Music and Lyric by Stephen Sondheim","winner":true},{"ceremonyYear":1991,"film":"Home Alone","category":"Music (Original Song)","nominee":"Somewhere In My Memory in \"Home Alone\" Music by John Williams; Lyric by Leslie Bricusse","winner":false},{"ceremonyYear":1991,"film":"Postcards from the Edge","category":"Music (Original Song)","nominee":"I'm Checkin' Out in \"Postcards from the Edge\" Music and Lyric by Shel Silverstein","winner":false},{"ceremonyYear":1991,"film":"The Godfather, Part III","category":"Music (Original Song)","nominee":"Promise Me You'll Remember in \"The Godfather, Part III\" Music by Carmine Coppola; Lyric by John Bettis","winner":false},{"ceremonyYear":1991,"film":"Young Guns II","category":"Music (Original Song)","nominee":"Blaze Of Glory in \"Young Guns II\" Music and Lyric by Jon Bon Jovi","winner":false},{"ceremonyYear":1992,"film":"Beauty and the Beast","category":"Music (Original Song)","nominee":"Be Our Guest in \"Beauty and the Beast\" Music by Alan Menken; Lyric by Howard Ashman","winner":false},{"ceremonyYear":1992,"film":"Beauty and the Beast","category":"Music (Original Song)","nominee":"Beauty And The Beast in \"Beauty and the Beast\" Music by Alan Menken; Lyric by Howard Ashman","winner":true},{"ceremonyYear":1992,"film":"Beauty and the Beast","category":"Music (Original Song)","nominee":"Belle in \"Beauty and the Beast\" Music by Alan Menken; Lyric by Howard Ashman","winner":false},{"ceremonyYear":1992,"film":"Hook","category":"Music (Original Song)","nominee":"When You're Alone in \"Hook\" Music by John Williams; Lyric by Leslie Bricusse","winner":false},{"ceremonyYear":1992,"film":"Robin Hood: Prince of Thieves","category":"Music (Original Song)","nominee":"(Everything I Do) I Do It For You in \"Robin Hood: Prince of Thieves\" Music by Michael Kamen; Lyric by Bryan Adams and Robert John Lange","winner":false},{"ceremonyYear":1993,"film":"Aladdin","category":"Music (Original Song)","nominee":"A Whole New World in \"Aladdin\" Music by Alan Menken; Lyric by Tim Rice","winner":true},{"ceremonyYear":1993,"film":"Aladdin","category":"Music (Original Song)","nominee":"Friend Like Me in \"Aladdin\" Music by Alan Menken; Lyric by Howard Ashman","winner":false},{"ceremonyYear":1993,"film":"The Bodyguard","category":"Music (Original Song)","nominee":"I Have Nothing in \"The Bodyguard\" Music by David Foster; Lyric by Linda Thompson","winner":false},{"ceremonyYear":1993,"film":"The Bodyguard","category":"Music (Original Song)","nominee":"Run To You in \"The Bodyguard\" Music by Jud Friedman; Lyric by Allan Rich","winner":false},{"ceremonyYear":1993,"film":"The Mambo Kings","category":"Music (Original Song)","nominee":"Beautiful Maria Of My Soul in \"The Mambo Kings\" Music by Robert Kraft; Lyric by Arne Glimcher","winner":false},{"ceremonyYear":1994,"film":"Beethoven's 2nd","category":"Music (Original Song)","nominee":"The Day I Fall In Love in \"Beethoven's 2nd\" Music and Lyric by Carole Bayer Sager, James Ingram and Clif Magness","winner":false},{"ceremonyYear":1994,"film":"Philadelphia","category":"Music (Original Song)","nominee":"Philadelphia in \"Philadelphia\" Music and Lyric by Neil Young","winner":false},{"ceremonyYear":1994,"film":"Philadelphia","category":"Music (Original Song)","nominee":"Streets Of Philadelphia in \"Philadelphia\" Music and Lyric by Bruce Springsteen","winner":true},{"ceremonyYear":1994,"film":"Poetic Justice","category":"Music (Original Song)","nominee":"Again in \"Poetic Justice\" Music and Lyric by Janet Jackson, James Harris III and Terry Lewis","winner":false},{"ceremonyYear":1994,"film":"Sleepless in Seattle","category":"Music (Original Song)","nominee":"A Wink And A Smile in \"Sleepless in Seattle\" Music by Marc Shaiman; Lyric by Ramsey McLean","winner":false},{"ceremonyYear":1995,"film":"Junior","category":"Music (Original Song)","nominee":"Look What Love Has Done in \"Junior\" Music and Lyric by Carole Bayer Sager, James Newton Howard, James Ingram and Patty Smyth","winner":false},{"ceremonyYear":1995,"film":"The Lion King","category":"Music (Original Song)","nominee":"Can You Feel The Love Tonight in \"The Lion King\" Music by Elton John; Lyric by Tim Rice","winner":true},{"ceremonyYear":1995,"film":"The Lion King","category":"Music (Original Song)","nominee":"Circle Of Life in \"The Lion King\" Music by Elton John; Lyric by Tim Rice","winner":false},{"ceremonyYear":1995,"film":"The Lion King","category":"Music (Original Song)","nominee":"Hakuna Matata in \"The Lion King\" Music by Elton John; Lyric by Tim Rice","winner":false},{"ceremonyYear":1995,"film":"The Paper","category":"Music (Original Song)","nominee":"Make Up Your Mind in \"The Paper\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":1996,"film":"Dead Man Walking","category":"Music (Original Song)","nominee":"Dead Man Walkin' in \"Dead Man Walking\" Music and Lyric by Bruce Springsteen","winner":false},{"ceremonyYear":1996,"film":"Don Juan DeMarco","category":"Music (Original Song)","nominee":"Have You Ever Really Loved A Woman in \"Don Juan DeMarco\" Music and Lyric by Michael Kamen, Bryan Adams and Robert John Lange","winner":false},{"ceremonyYear":1996,"film":"Pocahontas","category":"Music (Original Song)","nominee":"Colors Of The Wind in \"Pocahontas\" Music by Alan Menken; Lyric by Stephen Schwartz","winner":true},{"ceremonyYear":1996,"film":"Sabrina","category":"Music (Original Song)","nominee":"Moonlight in \"Sabrina\" Music by John Williams; Lyric by Alan Bergman and Marilyn Bergman","winner":false},{"ceremonyYear":1996,"film":"Toy Story","category":"Music (Original Song)","nominee":"You've Got A Friend In Me in \"Toy Story\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":1997,"film":"Evita","category":"Music (Original Song)","nominee":"You Must Love Me in \"Evita\" Music by Andrew Lloyd Webber; Lyric by Tim Rice","winner":true},{"ceremonyYear":1997,"film":"One Fine Day","category":"Music (Original Song)","nominee":"For The First Time in \"One Fine Day\" Music and Lyric by James Newton Howard, Jud J. Friedman and Allan Dennis Rich","winner":false},{"ceremonyYear":1997,"film":"That Thing You Do!","category":"Music (Original Song)","nominee":"That Thing You Do! in \"That Thing You Do!\" Music and Lyric by Adam Schlesinger","winner":false},{"ceremonyYear":1997,"film":"The Mirror Has Two Faces","category":"Music (Original Song)","nominee":"I Finally Found Someone in \"The Mirror Has Two Faces\" Music and Lyric by Barbra Streisand, Marvin Hamlisch, Bryan Adams and Robert \"Mutt\" Lange","winner":false},{"ceremonyYear":1997,"film":"Up Close and Personal","category":"Music (Original Song)","nominee":"Because You Loved Me in \"Up Close and Personal\" Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":1998,"film":"Anastasia","category":"Music (Original Song)","nominee":"Journey To The Past in \"Anastasia\" Music by Stephen Flaherty; Lyric by Lynn Ahrens","winner":false},{"ceremonyYear":1998,"film":"Con Air","category":"Music (Original Song)","nominee":"How Do I Live in \"Con Air\" Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":1998,"film":"Good Will Hunting","category":"Music (Original Song)","nominee":"Miss Misery in \"Good Will Hunting\" Music and Lyric by Elliott Smith","winner":false},{"ceremonyYear":1998,"film":"Hercules","category":"Music (Original Song)","nominee":"Go The Distance in \"Hercules\" Music by Alan Menken; Lyric by David Zippel","winner":false},{"ceremonyYear":1998,"film":"Titanic","category":"Music (Original Song)","nominee":"My Heart Will Go On in \"Titanic\" Music by James Horner; Lyric by Will Jennings","winner":true},{"ceremonyYear":1999,"film":"Armageddon","category":"Music (Original Song)","nominee":"I Don't Want To Miss A Thing in \"Armageddon\" Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":1999,"film":"Babe: Pig in the City","category":"Music (Original Song)","nominee":"That'll Do in \"Babe: Pig in the City\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":1999,"film":"Quest for Camelot","category":"Music (Original Song)","nominee":"The Prayer in \"Quest for Camelot\" Music by Carole Bayer Sager and David Foster; Lyric by Carole Bayer Sager, David Foster, Tony Renis and Alberto Testa","winner":false},{"ceremonyYear":1999,"film":"The Horse Whisperer","category":"Music (Original Song)","nominee":"A Soft Place To Fall in \"The Horse Whisperer\" Music and Lyric by Allison Moorer and Gwil Owen","winner":false},{"ceremonyYear":1999,"film":"The Prince of Egypt","category":"Music (Original Song)","nominee":"When You Believe in \"The Prince of Egypt\" Music and Lyric by Stephen Schwartz","winner":true},{"ceremonyYear":2000,"film":"Magnolia","category":"Music (Original Song)","nominee":"Save Me in \"Magnolia\" Music and Lyric by Aimee Mann","winner":false},{"ceremonyYear":2000,"film":"Music of the Heart","category":"Music (Original Song)","nominee":"Music Of My Heart in \"Music of the Heart\" Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2000,"film":"South Park: Bigger, Longer & Uncut","category":"Music (Original Song)","nominee":"Blame Canada in \"South Park: Bigger, Longer & Uncut\" Music and Lyric by Trey Parker and Marc Shaiman","winner":false},{"ceremonyYear":2000,"film":"Tarzan","category":"Music (Original Song)","nominee":"You'll Be In My Heart in \"Tarzan\" Music and Lyric by Phil Collins","winner":true},{"ceremonyYear":2000,"film":"Toy Story 2","category":"Music (Original Song)","nominee":"When She Loved Me in \"Toy Story 2\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":2001,"film":"Crouching Tiger, Hidden Dragon","category":"Music (Original Song)","nominee":"A Love Before Time in \"Crouching Tiger, Hidden Dragon\" Music by Jorge Calandrelli and Tan Dun; Lyric by James Schamus","winner":false},{"ceremonyYear":2001,"film":"Dancer in the Dark","category":"Music (Original Song)","nominee":"I've Seen It All in \"Dancer in the Dark\" Music by Björk; Lyric by Lars von Trier and Sjon Sigurdsson","winner":false},{"ceremonyYear":2001,"film":"Meet the Parents","category":"Music (Original Song)","nominee":"A Fool In Love in \"Meet the Parents\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":2001,"film":"The Emperor's New Groove","category":"Music (Original Song)","nominee":"My Funny Friend And Me in \"The Emperor's New Groove\" Music by Sting and David Hartley; Lyric by Sting","winner":false},{"ceremonyYear":2001,"film":"Wonder Boys","category":"Music (Original Song)","nominee":"Things Have Changed in \"Wonder Boys\" Music and Lyric by Bob Dylan","winner":true},{"ceremonyYear":2002,"film":"Kate & Leopold","category":"Music (Original Song)","nominee":"Until in \"Kate & Leopold\" Music and Lyric by Sting","winner":false},{"ceremonyYear":2002,"film":"Monsters, Inc.","category":"Music (Original Song)","nominee":"If I Didn't Have You in \"Monsters, Inc.\" Music and Lyric by Randy Newman","winner":true},{"ceremonyYear":2002,"film":"Pearl Harbor","category":"Music (Original Song)","nominee":"There You'll Be in \"Pearl Harbor\" Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2002,"film":"The Lord of the Rings: The Fellowship of the Ring","category":"Music (Original Song)","nominee":"May It Be in \"The Lord of the Rings: The Fellowship of the Ring\" Music and Lyric by Enya, Nicky Ryan and Roma Ryan","winner":false},{"ceremonyYear":2002,"film":"Vanilla Sky","category":"Music (Original Song)","nominee":"Vanilla Sky in \"Vanilla Sky\" Music and Lyric by Paul McCartney","winner":false},{"ceremonyYear":2003,"film":"8 Mile","category":"Music (Original Song)","nominee":"Lose Yourself in \"8 Mile\" Music by Eminem, Jeff Bass and Luis Resto; Lyric by Eminem","winner":true},{"ceremonyYear":2003,"film":"Chicago","category":"Music (Original Song)","nominee":"I Move On in \"Chicago\" Music by John Kander; Lyric by Fred Ebb","winner":false},{"ceremonyYear":2003,"film":"Frida","category":"Music (Original Song)","nominee":"Burn It Blue in \"Frida\" Music by Elliot Goldenthal; Lyric by Julie Taymor","winner":false},{"ceremonyYear":2003,"film":"Gangs of New York","category":"Music (Original Song)","nominee":"The Hands That Built America in \"Gangs of New York\" Music and Lyric by Bono, The Edge, Adam Clayton and Larry Mullen","winner":false},{"ceremonyYear":2003,"film":"The Wild Thornberrys Movie","category":"Music (Original Song)","nominee":"Father And Daughter in \"The Wild Thornberrys Movie\" Music and Lyric by Paul Simon","winner":false},{"ceremonyYear":2004,"film":"A Mighty Wind","category":"Music (Original Song)","nominee":"A Kiss At The End Of The Rainbow in \"A Mighty Wind\" Music and Lyric by Michael McKean and Annette O'Toole","winner":false},{"ceremonyYear":2004,"film":"Cold Mountain","category":"Music (Original Song)","nominee":"Scarlet Tide in \"Cold Mountain\" Music and Lyric by T Bone Burnett and Elvis Costello","winner":false},{"ceremonyYear":2004,"film":"Cold Mountain","category":"Music (Original Song)","nominee":"You Will Be My Ain True Love in \"Cold Mountain\" Music and Lyric by Sting","winner":false},{"ceremonyYear":2004,"film":"The Lord of the Rings: The Return of the King","category":"Music (Original Song)","nominee":"Into The West in \"The Lord of the Rings: The Return of the King\" Music and Lyric by Fran Walsh and Howard Shore and Annie Lennox","winner":true},{"ceremonyYear":2004,"film":"The Triplets of Belleville","category":"Music (Original Song)","nominee":"Belleville Rendez-vous in \"The Triplets of Belleville\"","winner":false},{"ceremonyYear":2005,"film":"Shrek 2","category":"Music (Original Song)","nominee":"Accidentally In Love in \"Shrek 2\" Music by Adam Duritz, Charles Gillingham, Jim Bogios, David Immergluck, Matthew Malley and David Bryson; Lyric by Adam Duritz and Daniel Vickrey","winner":false},{"ceremonyYear":2005,"film":"The Chorus (Les Choristes)","category":"Music (Original Song)","nominee":"Look To Your Path (Vois Sur Ton Chemin) in \"The Chorus (Les Choristes)\" Music by Bruno Coulais; Lyric by Christophe Barratier","winner":false},{"ceremonyYear":2005,"film":"The Motorcycle Diaries","category":"Music (Original Song)","nominee":"Music and Lyric by Jorge Drexler","winner":true},{"ceremonyYear":2005,"film":"The Phantom of the Opera","category":"Music (Original Song)","nominee":"Learn To Be Lonely in \"The Phantom of the Opera\" Music by Andrew Lloyd Webber; Lyric by Charles Hart","winner":false},{"ceremonyYear":2005,"film":"The Polar Express","category":"Music (Original Song)","nominee":"Believe in \"The Polar Express\" Music and Lyric by Glen Ballard and Alan Silvestri","winner":false},{"ceremonyYear":2006,"film":"Crash","category":"Music (Original Song)","nominee":"In The Deep in \"Crash\" Music by Kathleen \"Bird\" York and Michael Becker; Lyric by Kathleen \"Bird\" York","winner":false},{"ceremonyYear":2006,"film":"Hustle & Flow","category":"Music (Original Song)","nominee":"It's Hard Out Here For A Pimp in \"Hustle & Flow\" Music and Lyric by Jordan Houston, Cedric Coleman and Paul Beauregard","winner":true},{"ceremonyYear":2006,"film":"Transamerica","category":"Music (Original Song)","nominee":"Travelin' Thru in \"Transamerica\" Music and Lyric by Dolly Parton","winner":false},{"ceremonyYear":2007,"film":"An Inconvenient Truth","category":"Music (Original Song)","nominee":"I Need To Wake Up in \"An Inconvenient Truth\" Music and Lyric by Melissa Etheridge","winner":true},{"ceremonyYear":2007,"film":"Cars","category":"Music (Original Song)","nominee":"Our Town in \"Cars\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":2007,"film":"Dreamgirls","category":"Music (Original Song)","nominee":"Listen in \"Dreamgirls\" Music by Henry Krieger and Scott Cutler; Lyric by Anne Preven","winner":false},{"ceremonyYear":2007,"film":"Dreamgirls","category":"Music (Original Song)","nominee":"Love You I Do in \"Dreamgirls\" Music by Henry Krieger; Lyric by Siedah Garrett","winner":false},{"ceremonyYear":2007,"film":"Dreamgirls","category":"Music (Original Song)","nominee":"Patience in \"Dreamgirls\" Music by Henry Krieger; Lyric by Willie Reale","winner":false},{"ceremonyYear":2008,"film":"August Rush","category":"Music (Original Song)","nominee":"Raise It Up in \"August Rush\" Music and Lyric by Jamal Joseph, Charles Mack and Tevin Thomas","winner":false},{"ceremonyYear":2008,"film":"Enchanted","category":"Music (Original Song)","nominee":"Happy Working Song in \"Enchanted\" Music by Alan Menken; Lyric by Stephen Schwartz","winner":false},{"ceremonyYear":2008,"film":"Enchanted","category":"Music (Original Song)","nominee":"So Close in \"Enchanted\" Music by Alan Menken; Lyric by Stephen Schwartz","winner":false},{"ceremonyYear":2008,"film":"Enchanted","category":"Music (Original Song)","nominee":"That's How You Know in \"Enchanted\" Music by Alan Menken; Lyric by Stephen Schwartz","winner":false},{"ceremonyYear":2008,"film":"Once","category":"Music (Original Song)","nominee":"Falling Slowly in \"Once\" Music and Lyric by Glen Hansard and Marketa Irglova","winner":true},{"ceremonyYear":2009,"film":"Slumdog Millionaire","category":"Music (Original Song)","nominee":"Jai Ho in \"Slumdog Millionaire\" Music by A.R. Rahman; Lyric by Gulzar","winner":true},{"ceremonyYear":2009,"film":"Slumdog Millionaire","category":"Music (Original Song)","nominee":"O Saya in \"Slumdog Millionaire\" Music and Lyric by A.R. Rahman and Maya Arulpragasam","winner":false},{"ceremonyYear":2009,"film":"WALL-E","category":"Music (Original Song)","nominee":"Down To Earth in \"WALL-E\" Music by Peter Gabriel and Thomas Newman; Lyric by Peter Gabriel","winner":false},{"ceremonyYear":2010,"film":"Crazy Heart","category":"Music (Original Song)","nominee":"The Weary Kind (Theme From Crazy Heart) in \"Crazy Heart\" Music and Lyric by Ryan Bingham and T Bone Burnett","winner":true},{"ceremonyYear":2010,"film":"Nine","category":"Music (Original Song)","nominee":"Take It All in \"Nine\" Music and Lyric by Maury Yeston","winner":false},{"ceremonyYear":2010,"film":"Paris 36","category":"Music (Original Song)","nominee":"Loin De Paname in \"Paris 36\" Music by Reinhardt Wagner; Lyric by Frank Thomas","winner":false},{"ceremonyYear":2010,"film":"The Princess and the Frog","category":"Music (Original Song)","nominee":"Almost There in \"The Princess and the Frog\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":2010,"film":"The Princess and the Frog","category":"Music (Original Song)","nominee":"Down In New Orleans in \"The Princess and the Frog\" Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":2011,"film":"127 Hours","category":"Music (Original Song)","nominee":"If I Rise in \"127 Hours\" Music by A.R. Rahman; Lyric by Dido and Rollo Armstrong","winner":false},{"ceremonyYear":2011,"film":"Country Strong","category":"Music (Original Song)","nominee":"Coming Home in \"Country Strong\" Music and Lyric by Tom Douglas, Troy Verges and Hillary Lindsey","winner":false},{"ceremonyYear":2011,"film":"Tangled","category":"Music (Original Song)","nominee":"I See The Light in \"Tangled\" Music by Alan Menken; Lyric by Glenn Slater","winner":false},{"ceremonyYear":2011,"film":"Toy Story 3","category":"Music (Original Song)","nominee":"We Belong Together in \"Toy Story 3\" Music and Lyric by Randy Newman","winner":true},{"ceremonyYear":2012,"film":"Rio","category":"Music (Original Song)","nominee":"Real In Rio in \"Rio\" Music by Sergio Mendes and Carlinhos Brown; Lyric by Siedah Garrett","winner":false},{"ceremonyYear":2012,"film":"The Muppets","category":"Music (Original Song)","nominee":"\"Man Or Muppet\" in The Muppets; Music and Lyric by Bret McKenzie","winner":true},{"ceremonyYear":2013,"film":"Chasing Ice","category":"Music (Original Song)","nominee":"Before My Time in \"Chasing Ice\" Music and Lyric by J. Ralph","winner":false},{"ceremonyYear":2013,"film":"Les Misérables","category":"Music (Original Song)","nominee":"Suddenly in \"Les Misérables\" Music by Claude-Michel Schönberg; Lyric by Herbert Kretzmer and Alain Boublil","winner":false},{"ceremonyYear":2013,"film":"Life of Pi","category":"Music (Original Song)","nominee":"Pi's Lullaby in \"Life of Pi\" Music by Mychael Danna; Lyric by Bombay Jayashri","winner":false},{"ceremonyYear":2013,"film":"Skyfall","category":"Music (Original Song)","nominee":"Skyfall in \"Skyfall\" Music and Lyric by Adele Adkins and Paul Epworth","winner":true},{"ceremonyYear":2013,"film":"Ted","category":"Music (Original Song)","nominee":"Everybody Needs A Best Friend in \"Ted\" Music by Walter Murphy; Lyric by Seth MacFarlane","winner":false},{"ceremonyYear":2014,"film":"Despicable Me 2","category":"Music (Original Song)","nominee":"Happy in \"Despicable Me 2\" Music and Lyric by Pharrell Williams","winner":false},{"ceremonyYear":2014,"film":"Frozen","category":"Music (Original Song)","nominee":"\"Let It Go\" in Frozen; Music and Lyric by Kristen Anderson-Lopez and Robert Lopez","winner":true},{"ceremonyYear":2014,"film":"Her","category":"Music (Original Song)","nominee":"The Moon Song in \"Her\" Music by Karen O; Lyric by Karen O and Spike Jonze","winner":false},{"ceremonyYear":2014,"film":"Mandela: Long Walk to Freedom","category":"Music (Original Song)","nominee":"Ordinary Love in \"Mandela: Long Walk to Freedom\" Music by Paul Hewson, Dave Evans, Adam Clayton and Larry Mullen; Lyric by Paul Hewson","winner":false},{"ceremonyYear":2015,"film":"Begin Again","category":"Music (Original Song)","nominee":"“Lost Stars” from Begin Again; Music and Lyric by Gregg Alexander and Danielle Brisebois","winner":false},{"ceremonyYear":2015,"film":"Beyond the Lights","category":"Music (Original Song)","nominee":"“Grateful” from Beyond the Lights; Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2015,"film":"Glen Campbell…I’ll Be Me","category":"Music (Original Song)","nominee":"“I’m Not Gonna Miss You” from Glen Campbell…I’ll Be Me; Music and Lyric by Glen Campbell and Julian Raymond","winner":false},{"ceremonyYear":2015,"film":"Selma","category":"Music (Original Song)","nominee":"“Glory” from Selma; Music and Lyric by John Stephens and Lonnie Lynn","winner":true},{"ceremonyYear":2015,"film":"The Lego Movie","category":"Music (Original Song)","nominee":"“Everything Is Awesome” from The Lego Movie; Music and Lyric by Shawn Patterson","winner":false},{"ceremonyYear":2016,"film":"Fifty Shades of Grey","category":"Music (Original Song)","nominee":"“Earned It” from Fifty Shades of Grey; Music and Lyric by The Weeknd, Ahmad Balshe, Jason Quenneville and Stephan Moccio","winner":false},{"ceremonyYear":2016,"film":"Racing Extinction","category":"Music (Original Song)","nominee":"“Manta Ray” from Racing Extinction; Music by J. Ralph, Lyric by Anohni","winner":false},{"ceremonyYear":2016,"film":"Spectre","category":"Music (Original Song)","nominee":"“Writing’s On The Wall” from Spectre; Music and Lyric by Jimmy Napes and Sam Smith","winner":true},{"ceremonyYear":2016,"film":"The Hunting Ground","category":"Music (Original Song)","nominee":"“Til It Happens To You” from The Hunting Ground; Music and Lyric by Diane Warren and Lady Gaga","winner":false},{"ceremonyYear":2016,"film":"Youth","category":"Music (Original Song)","nominee":"“Simple Song #3” from Youth; Music and Lyric by David Lang","winner":false},{"ceremonyYear":2017,"film":"from Jim: The James Foley Story; Music and Lyric by J. Ralph and Sting","category":"Music (Original Song)","nominee":"The Empty Chair","winner":false},{"ceremonyYear":2017,"film":"from La La Land; Music by Justin Hurwitz; Lyric by Benj Pasek and Justin Paul","category":"Music (Original Song)","nominee":"Audition (The Fools Who Dream)","winner":false},{"ceremonyYear":2017,"film":"from La La Land; Music by Justin Hurwitz; Lyric by Benj Pasek and Justin Paul","category":"Music (Original Song)","nominee":"City of Stars","winner":true},{"ceremonyYear":2017,"film":"from Moana; Music and Lyric by Lin-Manuel Miranda","category":"Music (Original Song)","nominee":"How Far I'll Go","winner":false},{"ceremonyYear":2017,"film":"from Trolls; Music and Lyric by Justin Timberlake, Max Martin and Karl Johan Schuster","category":"Music (Original Song)","nominee":"Can't Stop The Feeling","winner":false},{"ceremonyYear":2018,"film":"Mighty River","category":"Music (Original Song)","nominee":"from Mudbound; Music and Lyric by Mary J. Blige, Raphael Saadiq and Taura Stinson","winner":false},{"ceremonyYear":2018,"film":"Mystery Of Love","category":"Music (Original Song)","nominee":"from Call Me by Your Name; Music and Lyric by Sufjan Stevens","winner":false},{"ceremonyYear":2018,"film":"Remember Me","category":"Music (Original Song)","nominee":"from Coco; Music and Lyric by Kristen Anderson-Lopez and Robert Lopez","winner":true},{"ceremonyYear":2018,"film":"Stand Up For Something","category":"Music (Original Song)","nominee":"from Marshall; Music by Diane Warren; Lyric by Lonnie R. Lynn and Diane Warren","winner":false},{"ceremonyYear":2018,"film":"This Is Me","category":"Music (Original Song)","nominee":"from The Greatest Showman; Music and Lyric by Benj Pasek and Justin Paul","winner":false},{"ceremonyYear":2019,"film":"All The Stars","category":"Music (Original Song)","nominee":"from Black Panther; Music by Kendrick Lamar, Mark “Sounwave” Spears and Anthony “Top Dawg” Tiffith; Lyric by Kendrick Lamar, SZA and Anthony “Top Dawg” Tiffith","winner":false},{"ceremonyYear":2019,"film":"I'll Fight","category":"Music (Original Song)","nominee":"from RBG; Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2019,"film":"Shallow","category":"Music (Original Song)","nominee":"from A Star Is Born; Music and Lyric by Lady Gaga, Mark Ronson, Anthony Rossomando and Andrew Wyatt","winner":true},{"ceremonyYear":2019,"film":"The Place Where Lost Things Go","category":"Music (Original Song)","nominee":"from Mary Poppins Returns; Music by Marc Shaiman; Lyric by Scott Wittman and Marc Shaiman","winner":false},{"ceremonyYear":2019,"film":"When A Cowboy Trades His Spurs For Wings","category":"Music (Original Song)","nominee":"from The Ballad of Buster Scruggs; Music and Lyric by Gillian Welch and David Rawlings","winner":false},{"ceremonyYear":2020,"film":"(I'm Gonna) Love Me Again","category":"Music (Original Song)","nominee":"from Rocketman; Music by Elton John; Lyric by Bernie Taupin","winner":true},{"ceremonyYear":2020,"film":"I Can't Let You Throw Yourself Away","category":"Music (Original Song)","nominee":"from Toy Story 4; Music and Lyric by Randy Newman","winner":false},{"ceremonyYear":2020,"film":"I'm Standing With You","category":"Music (Original Song)","nominee":"from Breakthrough; Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2020,"film":"Into The Unknown","category":"Music (Original Song)","nominee":"from Frozen II; Music and Lyric by Kristen Anderson-Lopez and Robert Lopez","winner":false},{"ceremonyYear":2020,"film":"Stand Up","category":"Music (Original Song)","nominee":"from Harriet; Music and Lyric by Joshuah Brian Campbell and Cynthia Erivo","winner":false},{"ceremonyYear":2021,"film":"Fight For You","category":"Music (Original Song)","nominee":"from Judas and the Black Messiah; Music by H.E.R. and Dernst Emile II; Lyric by H.E.R. and Tiara Thomas","winner":true},{"ceremonyYear":2021,"film":"Hear My Voice","category":"Music (Original Song)","nominee":"from The Trial of the Chicago 7; Music by Daniel Pemberton; Lyric by Daniel Pemberton and Celeste Waite","winner":false},{"ceremonyYear":2021,"film":"Husavik","category":"Music (Original Song)","nominee":"from Eurovision Song Contest: The Story of Fire Saga; Music and Lyric by Savan Kotecha, Fat Max Gsus and Rickard Göransson","winner":false},{"ceremonyYear":2021,"film":"Io Sì (Seen)","category":"Music (Original Song)","nominee":"from The Life Ahead (La Vita Davanti a Se); Music by Diane Warren; Lyric by Diane Warren and Laura Pausini","winner":false},{"ceremonyYear":2021,"film":"Speak Now","category":"Music (Original Song)","nominee":"from One Night in Miami...; Music and Lyric by Leslie Odom, Jr. and Sam Ashworth","winner":false},{"ceremonyYear":2022,"film":"Be Alive","category":"Music (Original Song)","nominee":"from King Richard; Music and Lyric by DIXSON and Beyoncé Knowles-Carter","winner":false},{"ceremonyYear":2022,"film":"Dos Oruguitas","category":"Music (Original Song)","nominee":"from Encanto; Music and Lyric by Lin-Manuel Miranda","winner":false},{"ceremonyYear":2022,"film":"Down To Joy","category":"Music (Original Song)","nominee":"from Belfast; Music and Lyric by Van Morrison","winner":false},{"ceremonyYear":2022,"film":"No Time To Die","category":"Music (Original Song)","nominee":"from No Time to Die; Music and Lyric by Billie Eilish and Finneas O'Connell","winner":true},{"ceremonyYear":2022,"film":"Somehow You Do","category":"Music (Original Song)","nominee":"from Four Good Days; Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2023,"film":"Applause","category":"Music (Original Song)","nominee":"from Tell It like a Woman; Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2023,"film":"Hold My Hand","category":"Music (Original Song)","nominee":"from Top Gun: Maverick; Music and Lyric by Lady Gaga and BloodPop","winner":false},{"ceremonyYear":2023,"film":"Lift Me Up","category":"Music (Original Song)","nominee":"from Black Panther: Wakanda Forever; Music by Tems, Rihanna, Ryan Coogler and Ludwig Goransson; Lyric by Tems and Ryan Coogler","winner":false},{"ceremonyYear":2023,"film":"Naatu Naatu","category":"Music (Original Song)","nominee":"from RRR; Music by M.M. Keeravaani; Lyric by Chandrabose","winner":true},{"ceremonyYear":2023,"film":"This Is A Life","category":"Music (Original Song)","nominee":"from Everything Everywhere All at Once; Music by Ryan Lott, David Byrne and Mitski; Lyric by Ryan Lott and David Byrne","winner":false},{"ceremonyYear":2024,"film":"I'm Just Ken","category":"Music (Original Song)","nominee":"from Barbie; Music and Lyric by Mark Ronson and Andrew Wyatt","winner":false},{"ceremonyYear":2024,"film":"It Never Went Away","category":"Music (Original Song)","nominee":"from American Symphony; Music and Lyric by Jon Batiste and Dan Wilson","winner":false},{"ceremonyYear":2024,"film":"The Fire Inside","category":"Music (Original Song)","nominee":"from Flamin' Hot; Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2024,"film":"Wahzhazhe (A Song For My People)","category":"Music (Original Song)","nominee":"from Killers of the Flower Moon; Music and Lyric by Scott George","winner":false},{"ceremonyYear":2024,"film":"What Was I Made For?","category":"Music (Original Song)","nominee":"from Barbie; Music and Lyric by Billie Eilish and Finneas O'Connell","winner":true},{"ceremonyYear":2025,"film":"El Mal","category":"Music (Original Song)","nominee":"from Emilia Pérez; Music by Clément Ducol and Camille; Lyric by Clément Ducol, Camille and Jacques Audiard","winner":true},{"ceremonyYear":2025,"film":"Like A Bird","category":"Music (Original Song)","nominee":"from Sing Sing; Music and Lyric by Abraham Alexander and Adrian Quesada","winner":false},{"ceremonyYear":2025,"film":"Mi Camino","category":"Music (Original Song)","nominee":"from Emilia Pérez; Music and Lyric by Camille and Clément Ducol","winner":false},{"ceremonyYear":2025,"film":"Never Too Late","category":"Music (Original Song)","nominee":"from Elton John: Never Too Late; Music and Lyric by Elton John, Brandi Carlile, Andrew Watt and Bernie Taupin","winner":false},{"ceremonyYear":2025,"film":"The Journey","category":"Music (Original Song)","nominee":"from The Six Triple Eight; Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2026,"film":"Dear Me","category":"Music (Original Song)","nominee":"from Diane Warren: Relentless; Music and Lyric by Diane Warren","winner":false},{"ceremonyYear":2026,"film":"Golden","category":"Music (Original Song)","nominee":"from KPop Demon Hunters; Music and Lyric by EJAE, Mark Sonnenblick, Joong Gyu Kwak, Yu Han Lee, Hee Dong Nam, Jeong Hoon Seo and Teddy Park","winner":true},{"ceremonyYear":2026,"film":"I Lied To You","category":"Music (Original Song)","nominee":"from Sinners; Music and Lyric by Raphael Saadiq and Ludwig Goransson","winner":false},{"ceremonyYear":2026,"film":"Sweet Dreams Of Joy","category":"Music (Original Song)","nominee":"from Viva Verdi!; Music and Lyric by Nicholas Pike","winner":false},{"ceremonyYear":2026,"film":"Train Dreams","category":"Music (Original Song)","nominee":"from Train Dreams; Music by Nick Cave and Bryce Dessner; Lyric by Nick Cave","winner":false}];

// Count an award entry once, not once per credited collaborator.
const awardKey=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const actingCategory=category=>/\b(?:actor|actress)\b/i.test(category);
const songCategory=category=>/\bsong\b/i.test(category) && !/scor(?:e|ing)/i.test(category);
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
const songIndex=new Map();
for(const record of ACADEMY_SONG_RECORDS){
  const key=`${record.ceremonyYear}|${awardKey(record.film)}`;
  if(!songIndex.has(key))songIndex.set(key,[]);
  songIndex.get(key).push(record);
}
function bundledSongEntries(title,year){
  return (songIndex.get(`${year}|${awardKey(title)}`)||[]).map((record,i)=>{
    // Separate the song from its official credit wording for a readable card.
    const match=record.nominee.match(/^([\s\S]+?)\s+(?:in|from)\s+["“][\s\S]+?["”]\s+([\s\S]+)$/i);
    const work=match?match[1]:record.nominee.split(/\s+Music by\s+/i)[0];
    const nominee=match?match[2]:record.nominee;
    return {...record,work,nominee,nominees:[nominee],ceremony:'',
      nominationKey:`academy-song:${year}:${awardKey(record.film)}:${i}`};
  });
}
async function summarizeAwardEntries(rows,title) {
  // Use complete, bundled official song entries instead of inferring work
  // counts from rows that merely repeat composer/lyricist names.
  const regular=groupAwardEntries(rows.filter(r=>!songCategory(cleanNomination(r).category)));
  const history=[...regular.history];let incomplete=regular.incomplete;
  const years=[...new Set(rows.map(nominationYear))];
  for(const year of years){
    const official=bundledSongEntries(title,year);
    if(official.length){history.push(...official);continue;}
    const fallback=groupAwardEntries(rows.filter(r=>songCategory(cleanNomination(r).category)&&nominationYear(r)===year));
    history.push(...fallback.history);
    if(fallback.incomplete||fallback.uncertain.length)incomplete=true;
  }
  history.sort((a,b)=>Number(a.ceremonyYear)-Number(b.ceremonyYear)||a.category.localeCompare(b.category)||String(a.work||'').localeCompare(String(b.work||'')));
  return {history,wins:history.filter(x=>x.winner).length,nominations:incomplete?null:history.length,
    nominationCountComplete:!incomplete,incomplete,
    countBasis:'award_entries_with_bundled_academy_song_history'};
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


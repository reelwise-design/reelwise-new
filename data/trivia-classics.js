/*
  ============================================================
  REELWISE TRIVIA VAULT — CLASSICS / PRE-1980
  ============================================================

  Curated behind-the-scenes stories, casting facts,
  filming details, production decisions and movie history.
*/

const TRIVIA_CLASSICS = {

  "the wizard of oz": [
    "Buddy Ebsen was originally cast as the Tin Man but left the production after becoming seriously ill from the aluminum-powder makeup used for the character. Jack Haley replaced him.",
    "Margaret Hamilton suffered burns while filming the Wicked Witch's fiery exit from Munchkinland when the trapdoor effect did not lower her quickly enough.",
    "The Kansas sequences were photographed in sepia-toned black-and-white, while Dorothy's arrival in Oz reveals the film's Technicolor world."
  ],

  "casablanca": [
    "Casablanca was based on the unproduced stage play Everybody Comes to Rick's by Murray Burnett and Joan Alison.",
    "Despite its Moroccan setting, Casablanca was filmed primarily on Warner Bros. soundstages in California.",
    "Dooley Wilson, who played Sam, was a drummer rather than a pianist and mimed his piano playing for the film."
  ],

  "citizen kane": [
    "Orson Welles was only 25 years old when principal photography on Citizen Kane began.",
    "Makeup artist Maurice Seiderman developed extensive aging makeup that allowed Welles to portray Charles Foster Kane across several decades.",
    "The film's similarities to newspaper publisher William Randolph Hearst caused controversy, and Hearst's newspapers largely refused to advertise or cover it."
  ],

  "it's a wonderful life": [
    "It's a Wonderful Life was the first film released by Frank Capra's independent production company, Liberty Films.",
    "The Bedford Falls set included a three-block Main Street, 75 buildings and 20 transplanted full-grown oak trees.",
    "The production created a new artificial snow compound because the older technique of using painted cornflakes created too much noise for recording dialogue.",
    "The enormous artificial snowstorm required about 300 tons of limestone and 50 tons of white plaster."
  ],

  "singin' in the rain": [
    "Gene Kelly performed the title number while suffering from a fever.",
    "Debbie Reynolds had limited dance experience when she was cast and underwent intensive training for the movie's demanding musical numbers.",
    "The story was constructed around songs producer Arthur Freed and composer Nacio Herb Brown had written years before the movie was made."
  ],

  "psycho": [
    "Alfred Hitchcock bought copies of Robert Bloch's novel Psycho in an effort to keep the story's surprises from becoming widely known before audiences saw the film.",
    "The shower sequence was constructed from rapid editing and carefully staged shots rather than showing the knife actually entering Marion Crane's body.",
    "Chocolate syrup was used to represent blood during the shower sequence because the movie was photographed in black and white.",
    "Hitchcock promoted a policy asking theaters not to admit anyone after the movie had begun, helping protect the film's surprises."
  ],

  "the graduate": [
    "Dustin Hoffman was nearly 30 years old when he played 21-year-old Benjamin Braddock.",
    "Director Mike Nichols considered actors with a more conventionally polished leading-man image before casting Hoffman.",
    "Existing Simon & Garfunkel recordings, including The Sound of Silence, became an important part of the movie's soundtrack."
  ],

  "2001: a space odyssey": [
    "Stanley Kubrick and Arthur C. Clarke developed the movie and Clarke's related novel alongside one another rather than simply adapting an already completed novel.",
    "Many of the spacecraft effects were produced using large, highly detailed physical models and extremely precise photographic techniques.",
    "A massive rotating centrifuge set allowed actors to appear to walk along the walls and ceiling of the Discovery spacecraft.",
    "Douglas Rain provided the controlled, unemotional voice of HAL 9000."
  ],

  "the godfather": [
    "Paramount initially resisted the idea of Marlon Brando playing Don Vito Corleone, while director Francis Ford Coppola strongly supported casting him.",
    "Al Pacino was not the studio's preferred choice for Michael Corleone, and Coppola fought to keep him in the role.",
    "Brando stuffed his cheeks during his screen test to help create Don Corleone's distinctive appearance; a specially made dental appliance was later used during production.",
    "The cat Brando holds during the opening scene was not part of the screenplay. Francis Ford Coppola introduced the animal on the day of filming."
  ],

  "the exorcist": [
    "Director William Friedkin had Regan's bedroom refrigerated so the actors' breath would be visible during the exorcism sequences.",
    "Mercedes McCambridge supplied the demonic voice heard coming from Regan.",
    "The production used extensive practical effects to create the physical manifestations of Regan's possession."
  ],

  "jaws": [
    "Three 25-foot mechanical shark models were constructed for the production, and all were nicknamed Bruce.",
    "Problems operating the mechanical sharks helped force Steven Spielberg to show the creature less often than originally intended, making suggestion and suspense increasingly important to the movie.",
    "Jaws was filmed extensively on and off Martha's Vineyard, Massachusetts, rather than relying primarily on a studio tank.",
    "The production's decision to film on the ocean created major logistical difficulties and contributed to a shooting schedule that ran far longer than originally planned."
  ],

  "monty python and the holy grail": [
    "The knights' imaginary horses became a running joke, with coconut shells used to create the sound of hoofbeats.",
    "The movie's restricted budget influenced several of its visual jokes and production choices.",
    "Members of Monty Python played numerous roles throughout the film, allowing the small comedy troupe to portray a much larger collection of characters."
  ],

  "taxi driver": [
    "Robert De Niro obtained a New York taxi driver's license and drove a cab while preparing to play Travis Bickle.",
    "De Niro developed the famous mirror scene beyond what was written in the screenplay, improvising Travis's repeated challenge to his reflection.",
    "Taxi Driver was the final film scored by composer Bernard Herrmann, who died in December 1975 shortly after completing his work."
  ],

  "rocky": [
    "Sylvester Stallone wrote Rocky and resisted offers that would have required another actor to play Rocky Balboa because he wanted to star in the movie himself.",
    "Butkus, Rocky's dog in the movie, was Sylvester Stallone's real dog.",
    "The production made use of the relatively new Steadicam system during portions of Rocky's Philadelphia training sequences.",
    "The ice-rink scene between Rocky and Adrian was filmed with an almost empty rink, turning the production's budget limitations into one of the movie's most intimate scenes.",
    "Rocky was made on a relatively modest budget and later won the Academy Award for Best Picture."
  ],

  "star wars": [
    "George Lucas formed Industrial Light & Magic to create the visual effects required for Star Wars.",
    "David Prowse physically portrayed Darth Vader on set, while James Earl Jones supplied Vader's voice.",
    "Tatooine's desert locations were filmed in Tunisia.",
    "Many spacecraft shots were created using highly detailed physical miniatures and newly developed camera techniques.",
    "The opening crawl was produced as a practical photographic effect rather than with modern digital animation."
  ],

  "close encounters of the third kind": [
    "Steven Spielberg cast acclaimed French filmmaker François Truffaut as scientist Claude Lacombe.",
    "A huge aircraft hangar in Mobile, Alabama, was used to house the set for the movie's climactic encounter.",
    "The five-note musical phrase used to communicate with the visitors became a central part of the movie's story and score."
  ],

  "animal house": [
    "Much of Animal House was filmed in and around Eugene, Oregon, including locations associated with the University of Oregon.",
    "John Belushi's performance as Bluto helped establish the Saturday Night Live performer as a major movie star.",
    "Donald Sutherland chose an upfront salary instead of a proposed percentage arrangement, a decision that became famous after the movie turned into a major commercial success."
  ],

  "rocky ii": [
    "Sylvester Stallone directed Rocky II as well as writing the screenplay and returning as Rocky Balboa.",
    "Stallone's real dog Butkus returned as Rocky's dog.",
    "Future world champion boxer Roberto Durán appears as one of Rocky's sparring partners.",
    "The training sequence culminates with a large group of children following Rocky up the steps of the Philadelphia Museum of Art."
  ],

  "alien": [
    "H.R. Giger's biomechanical artwork became the foundation for the design of the Alien creature and much of its environment.",
    "Bolaji Badejo, whose exceptionally tall and slender build attracted the filmmakers' attention, performed as the adult Alien in many scenes.",
    "The cast knew the basic nature of the chestburster sequence, but several performers were deliberately not told the full extent of the bloody effects that would occur during filming.",
    "Ridley Scott frequently concealed the creature with darkness, tight framing and brief glimpses rather than giving audiences prolonged clear views of it."
  ],

  "apocalypse now": [
    "Apocalypse Now's production in the Philippines was plagued by severe weather, health problems and extensive delays.",
    "Martin Sheen suffered a heart attack during production and later returned to complete his performance as Captain Willard.",
    "Francis Ford Coppola photographed Marlon Brando's Colonel Kurtz extensively in darkness and shadow, which became part of the character's distinctive appearance.",
    "A typhoon destroyed major sets during production, forcing portions of them to be rebuilt."
  ]

};

export default TRIVIA_CLASSICS;

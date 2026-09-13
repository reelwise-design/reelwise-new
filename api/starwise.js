const starwiseData = {

  16483: {
    name: "Sylvester Stallone",

    knownFor: [
      "Rocky Balboa",
      "John Rambo",
      "Barney Ross"
    ],

    highlights: [
      "Rocky transformed Stallone from a struggling actor and writer into one of Hollywood's biggest stars.",
      "He became one of the defining action stars of the 1980s through the Rocky and Rambo franchises.",
      "Decades after the original Rocky, Stallone returned as Rocky Balboa in the Creed films."
    ],

    facts: [
      "Stallone wrote the screenplay for Rocky and fought to play Rocky Balboa himself.",
      "Rocky became a major box-office success and won the Academy Award for Best Picture.",
      "Stallone has played Rocky Balboa across multiple decades, making the character one of the longest-running signature roles in movie history."
    ],

    roles: [
      "Rocky Balboa — Rocky",
      "John Rambo — First Blood",
      "Gabe Walker — Cliffhanger",
      "Ray Tango — Tango & Cash",
      "Barney Ross — The Expendables"
    ]
  },


  500: {
    name: "Tom Cruise",

    knownFor: [
      "Maverick",
      "Ethan Hunt",
      "Jerry Maguire"
    ],

    highlights: [
      "Top Gun helped turn Cruise into one of the biggest movie stars of the 1980s.",
      "The Mission: Impossible series became one of the defining franchises of his career.",
      "Top Gun: Maverick brought Cruise back to one of his most famous characters more than three decades after the original."
    ],

    facts: [
      "Cruise became a major star during the 1980s with films including Risky Business and Top Gun.",
      "He has become especially associated with performing ambitious practical stunt sequences in the Mission: Impossible films.",
      "His career has included action blockbusters as well as dramas, comedies and science-fiction films."
    ],

    roles: [
      "Pete 'Maverick' Mitchell — Top Gun",
      "Ethan Hunt — Mission: Impossible",
      "Jerry Maguire — Jerry Maguire",
      "Lt. Daniel Kaffee — A Few Good Men",
      "Vincent — Collateral"
    ]
  }

};


export default function handler(req, res) {

  const id = Number(req.query.id);

  if (!id) {
    return res.status(400).json({
      error: "Missing person id"
    });
  }

  const data = starwiseData[id];

  if (!data) {
    return res.status(200).json({
      available: false
    });
  }

  return res.status(200).json({
    available: true,
    ...data
  });

}

const reelwiseData = {
  744: {
    title: "Top Gun",

    facts: [
      "Top Gun helped define the look and attitude of blockbuster movies in the 1980s.",
      "Maverick and Iceman's rivalry became one of the film's most memorable relationships.",
      "The movie turned naval aviation into a major part of pop culture."
    ],

    casting: [
      "Top Gun helped cement Tom Cruise as one of Hollywood's biggest stars.",
      "Val Kilmer's Iceman became such an important part of the movie that the character returned decades later in Top Gun: Maverick."
    ],

    soundtrack: [
      "Danger Zone, performed by Kenny Loggins, became inseparable from Top Gun.",
      "Take My Breath Away, performed by Berlin, became another signature song from the film and won the Academy Award for Best Original Song."
    ],

    quotes: [
      "I feel the need... the need for speed!",
      "You can be my wingman any time.",
      "Talk to me, Goose."
    ]
  }
};

export default function handler(req, res) {
  const id = Number(req.query.id);

  if (!id) {
    return res.status(400).json({
      error: "Missing movie id"
    });
  }

  const data = reelwiseData[id];

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

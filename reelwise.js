const reelwiseData = {
  744: {
    title: "Top Gun",
    facts: [
      "Tom Cruise's Maverick became one of the defining movie characters of the 1980s.",
      "The movie's enormous popularity helped turn Top Gun into a cultural phenomenon far beyond the theater.",
      "The chemistry and rivalry between Maverick and Iceman became one of the movie's most memorable relationships."
    ],
    casting: [
      "Top Gun helped cement Tom Cruise's status as one of Hollywood's biggest stars.",
      "Val Kilmer's Iceman became such an iconic part of the movie that his character returned decades later in Top Gun: Maverick."
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

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
  },

  1371: {
    title: "Rocky III",

    facts: [
      "Rocky III changes the formula by making Rocky the champion at the beginning of the movie instead of the underdog.",
      "Apollo Creed goes from Rocky's greatest rival to the man who helps rebuild his confidence and fighting style.",
      "Clubber Lang became one of the Rocky series' most memorable opponents."
    ],

    casting: [
      "Mr. T made his feature-film debut as Clubber Lang and became instantly recognizable from the role.",
      "Professional wrestling star Hulk Hogan appears as Thunderlips in the exhibition match with Rocky.",
      "Carl Weathers returned as Apollo Creed, but this time Apollo becomes Rocky's trainer and mentor."
    ],

    soundtrack: [
      "Eye of the Tiger by Survivor became the signature song of Rocky III.",
      "The song became a massive hit and remains closely associated with the Rocky franchise.",
      "Rocky III's music reflects the movie's shift from Rocky's comfortable celebrity life back to hunger and determination."
    ],

    quotes: [
      "There is no tomorrow!",
      "I pity the fool.",
      "You ain't so bad."
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

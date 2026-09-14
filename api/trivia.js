const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;

async function tmdb(path) {
  let url = `https://api.themoviedb.org/3${path}`;

  const headers = {
    accept: "application/json"
  };

  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  } else if (API_KEY) {
    const separator = url.includes("?") ? "&" : "?";
    url += `${separator}api_key=${API_KEY}`;
  } else {
    throw new Error("TMDB credentials are not configured.");
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  try {
    const movieId = req.query.id;

    if (!movieId) {
      return res.status(400).json({
        error: "Movie ID is required."
      });
    }

    const movie = await tmdb(
      `/movie/${movieId}?append_to_response=credits`
    );

    const director = movie.credits?.crew?.find(
      person => person.job === "Director"
    );

    const writers = [
      ...new Set(
        (movie.credits?.crew || [])
          .filter(
            person =>
              person.department === "Writing" &&
              ["Screenplay", "Writer", "Story"].includes(person.job)
          )
          .map(person => person.name)
      )
    ].slice(0, 4);

    const cast = (movie.credits?.cast || [])
      .slice(0, 8)
      .map(person => ({
        id: person.id,
        name: person.name,
        character: person.character
      }));

    return res.status(200).json({
      movie: {
        id: movie.id,
        title: movie.title,
        year: movie.release_date
          ? movie.release_date.slice(0, 4)
          : null
      },

      context: {
        director: director?.name || null,
        writers,
        cast
      },

      trivia: [],

      message:
        "Reelwise trivia source is ready. Verified movie trivia will appear here when the trivia content source is connected."
    });
  } catch (error) {
    console.error("Trivia API error:", error);

    return res.status(500).json({
      error: "Unable to load Reelwise trivia."
    });
  }
}

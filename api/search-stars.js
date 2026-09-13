export default async function handler(req, res) {

  const query = req.query.query;

  if (!query) {
    return res.status(400).json({
      error: "Missing star search"
    });
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "TMDB token is not configured"
    });
  }

  try {

    const response = await fetch(
      `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          accept: "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.status_message || "Star search failed"
      });
    }

    const stars = (data.results || [])
      .filter(person => person.known_for_department === "Acting")
      .filter(person => person.profile_path)
      .map(person => ({
        id: person.id,
        name: person.name,
        profile_path: person.profile_path,
        popularity: person.popularity
      }));

    return res.status(200).json(stars);

  } catch (error) {

    return res.status(500).json({
      error: "Star search failed"
    });

  }

}

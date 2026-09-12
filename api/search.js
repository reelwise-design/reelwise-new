export default async function handler(req, res) {
  const query = req.query.query;

  if (!query) {
    return res.status(400).json({ error: "Missing movie search" });
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({ error: "TMDB token is not configured" });
  }

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          accept: "application/json"
        }
      }
    );

    const data = await response.json();

    return res.status(200).json(data.results || []);

  } catch (error) {
    return res.status(500).json({ error: "TMDB search failed" });
  }
}

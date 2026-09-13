export default async function handler(req, res) {
  const id = req.query.id;

  if (!id) {
    return res.status(400).json({ error: "Missing movie id" });
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({ error: "TMDB token is not configured" });
  }

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}?append_to_response=credits&language=en-US`,
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
        error: data.status_message || "Movie lookup failed"
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: "Movie lookup failed" });
  }
}

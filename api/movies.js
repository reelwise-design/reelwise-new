export default async function handler(req, res) {

  const token = process.env.TMDB_READ_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "TMDB token is not configured"
    });
  }

  try {

    const response = await fetch(
      "https://api.themoviedb.org/3/movie/popular?language=en-US&page=1",
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

    const movies = (data.results || [])
      .filter(movie => movie.poster_path)
      .map(movie => ({
        id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date,
        overview: movie.overview,
        popularity: movie.popularity
      }));

    return res.status(200).json(movies);

  } catch (error) {

    return res.status(500).json({
      error: "Movie lookup failed"
    });

  }

}

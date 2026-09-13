const reviewStatus = {
  744: {
    title: "Top Gun",
    status: "needs-review"
  },

  1366: {
    title: "Rocky",
    status: "needs-review"
  },

  1367: {
    title: "Rocky II",
    status: "needs-review"
  },

  1371: {
    title: "Rocky III",
    status: "needs-review"
  },

  1374: {
    title: "Rocky IV",
    status: "needs-review"
  },

  881: {
    title: "A Few Good Men",
    status: "needs-review"
  },

  14534: {
    title: "Rudy",
    status: "needs-review"
  },

  11635: {
    title: "Old School",
    status: "needs-review"
  },

  18785: {
    title: "The Hangover",
    status: "needs-review"
  },

  274167: {
    title: "Daddy's Home",
    status: "needs-review"
  }
};

export default function handler(req, res) {

  const id = Number(req.query.id);

  if (!id) {
    return res.status(400).json({
      error: "Missing movie id"
    });
  }

  const movie = reviewStatus[id];

  if (!movie) {
    return res.status(200).json({
      reviewed: false,
      status: "not-reviewed"
    });
  }

  return res.status(200).json({
    reviewed: movie.status === "verified",
    ...movie
  });
}

async function getWikipediaBiography(name) {
  try {
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: name,
        format: "json",
        origin: "*"
      });

    const searchData =
      await fetchJSON(searchUrl);

    const results =
      searchData?.query?.search || [];

    if (!results.length) {
      return "";
    }

    const exactMatch =
      results.find(
        item =>
          item.title &&
          item.title.toLowerCase() ===
            String(name).toLowerCase()
      );

    const pageTitle =
      exactMatch?.title ||
      results[0]?.title;

    if (!pageTitle) {
      return "";
    }

    const summaryUrl =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(pageTitle);

    const summaryData =
      await fetchJSON(summaryUrl);

    let bio =
      cleanText(
        summaryData?.extract || ""
      );

    bio =
      removeWikipediaEnding(bio);

    if (
      summaryData?.type === "disambiguation" ||
      bio.length < 80
    ) {
      return "";
    }

    return bio;

  } catch (error) {
    console.error(
      "Wikipedia biography error:",
      error
    );

    return "";
  }
}

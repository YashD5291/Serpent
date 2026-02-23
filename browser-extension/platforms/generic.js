// Generic/fallback scraper for unsupported platforms
// Tries common problem statement selectors, then falls back to main content

function scrapeGeneric() {
  // Try common problem statement containers
  const selectors = [
    ".problem-statement",
    ".problem-description",
    ".challenge-body",
    ".task-description",
    ".question-content",
    "[class*='problem']",
    "[class*='description']",
    "article",
    "main",
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent || el.innerText || "";
      if (text.trim().length > 50) {
        // Get page title
        const title =
          document.querySelector("h1")?.textContent?.trim() ||
          document.title ||
          "Problem";
        return { title, body: `${title}\n\n${text.trim()}` };
      }
    }
  }

  return null;
}

window._serpentScrapeGeneric = scrapeGeneric;

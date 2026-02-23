// CoderPad scraper — reads instructions from the instructions panel
// Also checks for Jupyter notebook mode (CoderPad supports Jupyter)

function scrapeCoderPad() {
  // Try to get instructions from padConfig first
  const config = window.padConfig;
  if (config) {
    const instructions =
      config.candidateInstructions ||
      config.instructions ||
      config.questionInstructions ||
      config.questionContent ||
      config.question;

    if (instructions && typeof instructions === "string" && instructions.trim()) {
      return {
        title: "CoderPad Instructions",
        body: instructions.trim(),
      };
    }
  }

  // Fallback: scrape the instructions panel from DOM
  const instructionsEl =
    document.querySelector("[role='tabpanel'][aria-label*='instruction' i]") ||
    document.querySelector("[role='tabpanel'][aria-label*='question' i]") ||
    document.querySelector("[class*='instruction'] [class*='markdown']") ||
    document.querySelector("[class*='instruction'] [class*='rendered']") ||
    document.querySelector("[class*='question'] [class*='content']");

  if (instructionsEl) {
    const text = instructionsEl.textContent || instructionsEl.innerText || "";
    if (text.trim()) {
      return {
        title: "CoderPad Instructions",
        body: text.trim(),
      };
    }
  }

  return null;
}

window._serpentScrapeCoderPad = scrapeCoderPad;

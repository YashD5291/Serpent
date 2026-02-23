// HackerRank problem scraper

function scrapeHackerRank() {
  const titleEl =
    document.querySelector("h1.page-label") ||
    document.querySelector("h2.hr_tour-challenge-name") ||
    document.querySelector(".challenge-view h2");

  const bodyEl = document.querySelector(".challenge-body-html");

  if (!bodyEl) return null;

  const title = titleEl?.textContent?.trim() || "HackerRank Problem";
  const bodyText = bodyEl.textContent || bodyEl.innerText || "";

  // Extract sample I/O separately for clean formatting
  const sampleInput = document.querySelector(".challenge_sample_input pre");
  const sampleOutput = document.querySelector(".challenge_sample_output pre");

  let text = `${title}\n\n${bodyText.trim()}`;

  if (sampleInput) {
    text += `\n\nSample Input:\n${sampleInput.textContent.trim()}`;
  }
  if (sampleOutput) {
    text += `\n\nSample Output:\n${sampleOutput.textContent.trim()}`;
  }

  return { title, body: text };
}

window._serpentScrapeHackerRank = scrapeHackerRank;

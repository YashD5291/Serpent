// Codility problem scraper

function scrapeCodility() {
  const titleEl = document.querySelector("#task-0-name") ||
    document.querySelector(".task-header h3");

  const bodyEl = document.querySelector("#brinza-task-description") ||
    document.querySelector(".brinza-task-description") ||
    document.querySelector(".task-description");

  if (!bodyEl) return null;

  const title = titleEl?.textContent?.trim() || "Codility Task";
  const bodyText = bodyEl.textContent || bodyEl.innerText || "";

  return { title, body: `${title}\n\n${bodyText.trim()}` };
}

window._serpentScrapeCodility = scrapeCodility;

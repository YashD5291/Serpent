// CodeChef problem scraper — React SPA, CSS module class names

function scrapeCodeChef() {
  // Title — multiple possible selectors due to CSS modules
  const titleEl =
    document.querySelector("div[class^='_problem__title'] > h1") ||
    document.querySelector("div[class^='_contestProblemTitle'] > h1") ||
    document.querySelector("div[class^='_titleStatus__container'] > h1") ||
    document.querySelector("div[class^='_problemBody'] > h1") ||
    document.querySelector("h1");

  // Problem body
  const bodyEl =
    document.querySelector("div[class^='_problemBody']") ||
    document.querySelector("div[class^='_problem__container']") ||
    document.querySelector(".problem-statement");

  if (!bodyEl) return null;

  const title = titleEl?.textContent?.trim() || "CodeChef Problem";

  // Sample I/O
  const ioTable = document.querySelector("div[class^='_input_output__table']");
  let sampleIO = "";
  if (ioTable) {
    const pres = ioTable.querySelectorAll("pre");
    for (let i = 0; i < pres.length; i += 2) {
      const inputIdx = Math.floor(i / 2) + 1;
      sampleIO += `\nSample Input ${inputIdx}:\n${pres[i].textContent.trim()}`;
      if (pres[i + 1]) {
        sampleIO += `\nSample Output ${inputIdx}:\n${pres[i + 1].textContent.trim()}`;
      }
    }
  }

  const bodyText = bodyEl.textContent || bodyEl.innerText || "";
  let text = `${title}\n\n${bodyText.trim()}`;
  if (sampleIO) text += `\n${sampleIO}`;

  return { title, body: text };
}

window._serpentScrapeCodeChef = scrapeCodeChef;

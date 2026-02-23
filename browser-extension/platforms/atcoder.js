// AtCoder problem scraper — server-rendered, stable selectors

function scrapeAtCoder() {
  const taskStatement = document.querySelector("#task-statement");
  if (!taskStatement) return null;

  // Title from h2, extract text nodes only
  const h2 = document.querySelector("h2");
  const title = h2?.textContent?.trim() || "AtCoder Problem";

  // Time/memory limits from the element before task-statement
  const limitsEl = taskStatement.previousElementSibling;
  let limits = "";
  if (limitsEl) {
    limits = limitsEl.textContent.trim();
  }

  // Full problem text
  const bodyText = taskStatement.textContent || taskStatement.innerText || "";

  // Extract sample I/O
  const samples = [];
  const h3s = taskStatement.querySelectorAll("h3");
  for (const h3 of h3s) {
    const text = h3.textContent.trim();
    if (/^(入力例|Sample Input)/i.test(text) || /^(出力例|Sample Output)/i.test(text)) {
      const pre =
        h3.parentElement?.querySelector("pre") ||
        h3.nextElementSibling;
      if (pre) {
        samples.push(`${text}:\n${pre.textContent.trim()}`);
      }
    }
  }

  let result = title;
  if (limits) result += `\n${limits}`;
  result += `\n\n${bodyText.trim()}`;
  if (samples.length > 0) {
    result += `\n\n${samples.join("\n\n")}`;
  }

  return { title, body: result };
}

window._serpentScrapeAtCoder = scrapeAtCoder;

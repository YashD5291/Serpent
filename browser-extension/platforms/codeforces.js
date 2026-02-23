// Codeforces problem scraper — server-rendered, stable selectors

function scrapeCodeforces() {
  const statement = document.querySelector(".problem-statement");
  if (!statement) return null;

  const titleEl = statement.querySelector(".header > .title");
  const title = titleEl?.textContent?.trim() || "Codeforces Problem";

  // Time and memory limits
  const timeEl = statement.querySelector(".header > .time-limit");
  const memEl = statement.querySelector(".header > .memory-limit");
  const timeLimit = timeEl?.textContent?.replace("time limit per test", "").trim() || "";
  const memLimit = memEl?.textContent?.replace("memory limit per test", "").trim() || "";

  // Problem body — all direct div children after .header that aren't special sections
  const parts = [title];
  if (timeLimit) parts.push(`Time limit: ${timeLimit}`);
  if (memLimit) parts.push(`Memory limit: ${memLimit}`);
  parts.push("");

  // Description paragraphs (direct children divs without special classes)
  for (const child of statement.children) {
    if (child.classList.contains("header")) continue;
    if (child.classList.contains("sample-tests")) continue;

    const sectionTitle = child.querySelector(".section-title");
    if (sectionTitle) {
      parts.push(`\n${sectionTitle.textContent.trim()}`);
      // Get content after section title
      const content = Array.from(child.children)
        .filter((el) => !el.classList.contains("section-title"))
        .map((el) => el.textContent.trim())
        .join("\n");
      if (content) parts.push(content);
    } else {
      const text = child.textContent?.trim();
      if (text) parts.push(text);
    }
  }

  // Sample tests
  const sampleTests = statement.querySelector(".sample-tests");
  if (sampleTests) {
    const inputs = sampleTests.querySelectorAll(".input pre");
    const outputs = sampleTests.querySelectorAll(".output pre");

    for (let i = 0; i < inputs.length; i++) {
      parts.push(`\nSample Input ${i + 1}:`);
      parts.push(inputs[i].textContent.trim());
      if (outputs[i]) {
        parts.push(`\nSample Output ${i + 1}:`);
        parts.push(outputs[i].textContent.trim());
      }
    }
  }

  // Note section
  const note = statement.querySelector(".note");
  if (note) {
    parts.push(`\nNote:`);
    parts.push(note.textContent.replace("Note", "").trim());
  }

  return { title, body: parts.join("\n") };
}

window._serpentScrapeCodeforces = scrapeCodeforces;

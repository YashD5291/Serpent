// LeetCode problem scraper — uses GraphQL API (DOM selectors are unstable)

function getLeetCodeSlug() {
  const match = window.location.pathname.match(/\/problems\/([^/]+)/);
  return match ? match[1] : null;
}

async function scrapeLeetCode() {
  const slug = getLeetCodeSlug();
  if (!slug) return null;

  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query questionData($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            title
            difficulty
            content
            sampleTestCase
          }
        }`,
        variables: { titleSlug: slug },
      }),
    });

    const json = await res.json();
    const q = json?.data?.question;
    if (!q) return null;

    // content is HTML — convert to readable text
    const div = document.createElement("div");
    div.innerHTML = q.content || "";
    const body = div.textContent || div.innerText || "";

    let text = `${q.title} [${q.difficulty}]\n\n${body.trim()}`;
    if (q.sampleTestCase) {
      text += `\n\nSample Input:\n${q.sampleTestCase}`;
    }

    return { title: q.title, body: text };
  } catch {
    // Fallback to DOM scraping
    return scrapeLeetCodeDOM();
  }
}

function scrapeLeetCodeDOM() {
  // Try multiple selectors — LeetCode changes these frequently
  const titleEl =
    document.querySelector("[data-cy='question-title']") ||
    document.querySelector("h1") ||
    document.querySelector("[class*='title']");

  const contentEl =
    document.querySelector("[data-track-load='description_content']") ||
    document.querySelector(".elfjS") ||
    document.querySelector("[class*='question-content']") ||
    document.querySelector("article");

  if (!contentEl) return null;

  const title = titleEl?.textContent?.trim() || "LeetCode Problem";
  const body = contentEl.textContent || contentEl.innerText || "";

  return { title, body: `${title}\n\n${body.trim()}` };
}

window._serpentScrapeLeetCode = scrapeLeetCode;

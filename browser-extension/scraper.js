// Platform detector + scraper router
// Injected into page context alongside platform-specific scrapers

(function () {
  "use strict";

  function detectPlatform() {
    const host = window.location.hostname;
    const path = window.location.pathname;

    // Jupyter detection first — some platforms (CoderPad, Kaggle) embed Jupyter
    if (isJupyterPage()) return "jupyter";

    if (host.includes("leetcode.com")) return "leetcode";
    if (host.includes("hackerrank.com")) return "hackerrank";
    if (host.includes("codeforces.com") || host.includes("codeforces.ml") || host.includes("codeforces.es")) return "codeforces";
    if (host.includes("codechef.com")) return "codechef";
    if (host.includes("codility.com")) return "codility";
    if (host.includes("coderpad.io")) return "coderpad";
    if (host.includes("atcoder.jp")) return "atcoder";
    if (host.includes("cses.fi")) return "cses";
    if (host.includes("kattis.com")) return "kattis";
    if (host.includes("spoj.com")) return "spoj";

    return "generic";
  }

  function isJupyterPage() {
    // JupyterLab / Notebook 7
    if (document.querySelector(".jp-Notebook")) return true;
    if (document.querySelector(".jp-Cell")) return true;
    // Classic Jupyter
    if (typeof Jupyter !== "undefined" && Jupyter.notebook) return true;
    // Jupyter-like output areas (CoderPad Jupyter mode, Kaggle notebooks)
    if (document.querySelector("#notebook-container")) return true;
    if (document.querySelector(".notebook-cell")) return true;
    return false;
  }

  async function scrapeProblem() {
    const platform = detectPlatform();

    if (platform === "jupyter") return null; // handled by inject.js

    const scrapers = {
      leetcode: window._serpentScrapeLeetCode,
      hackerrank: window._serpentScrapeHackerRank,
      codeforces: window._serpentScrapeCodeforces,
      codechef: window._serpentScrapeCodeChef,
      codility: window._serpentScrapeCodility,
      coderpad: window._serpentScrapeCoderPad,
      atcoder: window._serpentScrapeAtCoder,
      generic: window._serpentScrapeGeneric,
    };

    const scraper = scrapers[platform] || scrapers.generic;
    if (!scraper) return null;

    try {
      const result = await scraper();
      return result;
    } catch {
      // If platform-specific scraper fails, try generic
      if (platform !== "generic" && scrapers.generic) {
        try { return await scrapers.generic(); } catch { return null; }
      }
      return null;
    }
  }

  // Listen for scrape requests from content.js
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "serpent:scrapeProblem") return;

    const result = await scrapeProblem();

    window.postMessage({
      type: "serpent:problemData",
      id: event.data.id,
      platform: detectPlatform(),
      data: result,
    }, "*");
  });
})();

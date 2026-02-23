// Content script: bridges page context (inject.js / scraper.js) ↔ background.js

(function () {
  "use strict";

  // Inject all page-context scripts
  const scripts = [
    "inject.js",
    "platforms/leetcode.js",
    "platforms/hackerrank.js",
    "platforms/codeforces.js",
    "platforms/codechef.js",
    "platforms/codility.js",
    "platforms/coderpad.js",
    "platforms/atcoder.js",
    "platforms/generic.js",
    "scraper.js",
  ];

  for (const src of scripts) {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(src);
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  // --- Request cell data from inject.js (Jupyter) ---

  let pendingResolve = null;
  let requestId = 0;

  function getCellData() {
    return new Promise((resolve) => {
      const id = ++requestId;
      const timeout = setTimeout(() => {
        pendingResolve = null;
        resolve(null);
      }, 2000);

      pendingResolve = { id, resolve, timeout, type: "cell" };
      window.postMessage({ type: "serpent:getCell", id }, "*");
    });
  }

  function getProblemData() {
    return new Promise((resolve) => {
      const id = ++requestId;
      const timeout = setTimeout(() => {
        pendingResolve = null;
        resolve(null);
      }, 5000); // longer timeout for API-based scrapers (LeetCode GraphQL)

      pendingResolve = { id, resolve, timeout, type: "problem" };
      window.postMessage({ type: "serpent:scrapeProblem", id }, "*");
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || !pendingResolve) return;

    if (event.data.type === "serpent:cellData" && pendingResolve.type === "cell") {
      if (event.data.id !== pendingResolve.id) return;
      clearTimeout(pendingResolve.timeout);
      pendingResolve.resolve(event.data);
      pendingResolve = null;
    }

    if (event.data.type === "serpent:problemData" && pendingResolve.type === "problem") {
      if (event.data.id !== pendingResolve.id) return;
      clearTimeout(pendingResolve.timeout);
      pendingResolve.resolve(event.data);
      pendingResolve = null;
    }
  });

  // --- Send to background ---

  function sendToBackground(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false, error: "No response" });
        }
      });
    });
  }

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // --- Detect if we're on a Jupyter page ---

  function isJupyterPage() {
    return !!(
      document.querySelector(".jp-Notebook") ||
      document.querySelector(".jp-Cell") ||
      document.querySelector("#notebook-container") ||
      document.querySelector(".notebook-cell")
    );
  }

  // --- Send lock ---

  let sending = false;

  // --- Jupyter commands (existing) ---

  async function sendCellToTelegram() {
    if (sending) return;
    sending = true;

    try {
      const result = await getCellData();
      if (!result || !result.data) return;

      const { code, outputs, images } = result.data;

      let message = `<b>Code</b>\n<pre>${escapeHtml(code)}</pre>`;
      const outputText = outputs.join("\n").trim();
      if (outputText) {
        message += `\n\n<b>Output</b>\n<pre>${escapeHtml(outputText)}</pre>`;
      }

      await sendToBackground({ type: "serpent:sendText", text: message });

      for (const base64 of images) {
        await sendToBackground({ type: "serpent:sendImage", base64 });
      }
    } catch (err) {
      console.error("[Serpent]", err);
    } finally {
      sending = false;
    }
  }

  async function sendOutputToTelegram() {
    if (sending) return;
    sending = true;

    try {
      const result = await getCellData();
      if (!result || !result.data) return;

      const { outputs, images } = result.data;

      const outputText = outputs.join("\n").trim();
      if (outputText) {
        await sendToBackground({
          type: "serpent:sendText",
          text: `<pre>${escapeHtml(outputText)}</pre>`,
        });
      }

      for (const base64 of images) {
        await sendToBackground({ type: "serpent:sendImage", base64 });
      }
    } catch (err) {
      console.error("[Serpent]", err);
    } finally {
      sending = false;
    }
  }

  async function copyCellCode() {
    try {
      const result = await getCellData();
      if (!result || !result.data) return;
      await navigator.clipboard.writeText(result.data.code);
    } catch (err) {
      console.error("[Serpent]", err);
    }
  }

  // --- Problem scraping commands ---

  async function sendProblemToTelegram() {
    if (sending) return;
    sending = true;

    try {
      const result = await getProblemData();
      if (!result || !result.data) return;

      const { body } = result.data;
      await sendToBackground({
        type: "serpent:sendText",
        text: `<pre>${escapeHtml(body)}</pre>`,
      });
    } catch (err) {
      console.error("[Serpent]", err);
    } finally {
      sending = false;
    }
  }

  async function copyProblemToClipboard() {
    try {
      const result = await getProblemData();
      if (!result || !result.data) return;
      await navigator.clipboard.writeText(result.data.body);
    } catch (err) {
      console.error("[Serpent]", err);
    }
  }

  // --- Keybindings ---

  document.addEventListener(
    "keydown",
    (e) => {
      const jupyter = isJupyterPage();

      // Ctrl+Shift+C (no Alt) → send to Telegram
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyC") {
        e.preventDefault();
        e.stopPropagation();
        if (jupyter) {
          sendCellToTelegram();
        } else {
          sendProblemToTelegram();
        }
        return;
      }

      // Ctrl+Shift+Alt+C → copy to clipboard
      if (e.ctrlKey && e.shiftKey && e.altKey && e.code === "KeyC") {
        e.preventDefault();
        e.stopPropagation();
        if (jupyter) {
          copyCellCode();
        } else {
          copyProblemToClipboard();
        }
        return;
      }

      // Ctrl+Shift+Alt+O → send output to Telegram (Jupyter only)
      if (e.ctrlKey && e.shiftKey && e.altKey && e.code === "KeyO") {
        if (jupyter) {
          e.preventDefault();
          e.stopPropagation();
          sendOutputToTelegram();
        }
        return;
      }
    },
    true
  );
})();

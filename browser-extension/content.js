// Content script: bridges page context (inject.js) ↔ background.js

(function () {
  "use strict";

  // Inject the page-context script
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // --- Request cell data from inject.js ---

  let pendingResolve = null;
  let requestId = 0;

  function getCellData() {
    return new Promise((resolve) => {
      const id = ++requestId;
      const timeout = setTimeout(() => {
        pendingResolve = null;
        resolve(null);
      }, 2000);

      pendingResolve = { id, resolve, timeout };
      window.postMessage({ type: "serpent:getCell", id }, "*");
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "serpent:cellData") return;
    if (!pendingResolve || event.data.id !== pendingResolve.id) return;

    clearTimeout(pendingResolve.timeout);
    pendingResolve.resolve(event.data);
    pendingResolve = null;
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

  // --- Send lock ---

  let sending = false;

  // --- Commands ---

  async function sendCellToTelegram() {
    if (sending) return;
    sending = true;

    try {
      const result = await getCellData();
      if (!result || !result.data) return;

      const { code, outputs, images } = result.data;

      // Build text message
      let message = `<b>Code</b>\n<pre>${escapeHtml(code)}</pre>`;
      const outputText = outputs.join("\n").trim();
      if (outputText) {
        message += `\n\n<b>Output</b>\n<pre>${escapeHtml(outputText)}</pre>`;
      }

      const textResult = await sendToBackground({
        type: "serpent:sendText",
        text: message,
      });

      if (!textResult.ok) {
        console.error("[Serpent]", textResult.error);
      }

      // Send images
      for (const base64 of images) {
        const imgResult = await sendToBackground({
          type: "serpent:sendImage",
          base64: base64,
        });
        if (!imgResult.ok) {
          console.error("[Serpent] Image send failed:", imgResult.error);
        }
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
        const res = await sendToBackground({
          type: "serpent:sendText",
          text: `<pre>${escapeHtml(outputText)}</pre>`,
        });
        if (!res.ok) console.error("[Serpent]", res.error);
      }

      for (const base64 of images) {
        const res = await sendToBackground({
          type: "serpent:sendImage",
          base64: base64,
        });
        if (!res.ok) console.error("[Serpent]", res.error);
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

  // --- Keybindings ---

  document.addEventListener(
    "keydown",
    (e) => {
      // Ctrl+Shift+C (no Alt) → send cell to Telegram
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyC") {
        e.preventDefault();
        e.stopPropagation();
        sendCellToTelegram();
        return;
      }

      // Ctrl+Shift+Alt+C → copy code to clipboard
      if (e.ctrlKey && e.shiftKey && e.altKey && e.code === "KeyC") {
        e.preventDefault();
        e.stopPropagation();
        copyCellCode();
        return;
      }

      // Ctrl+Shift+Alt+O → send output to Telegram
      if (e.ctrlKey && e.shiftKey && e.altKey && e.code === "KeyO") {
        e.preventDefault();
        e.stopPropagation();
        sendOutputToTelegram();
        return;
      }
    },
    true // capture phase — fire before Jupyter's handlers
  );
})();

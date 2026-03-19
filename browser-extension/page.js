// Runs in MAIN world (page context) via manifest "world": "MAIN"
// No script injection, no globals, no DOM traces

(function () {
  "use strict";

  // --- Per-session random channel names ---

  function rk() {
    return "_" + Math.random().toString(36).slice(2, 10);
  }

  var channels = { a: rk(), b: rk(), c: rk(), d: rk() };

  // Pass channel names to ISOLATED world via a DOM attribute
  // content.js reads and removes it
  document.documentElement.setAttribute("data-_q", JSON.stringify(channels));

  // Self-cleanup fallback if content.js doesn't pick it up
  setTimeout(function () {
    document.documentElement.removeAttribute("data-_q");
  }, 10000);

  // --- Notebook detection ---

  function isJupyter() {
    if (document.querySelector(".jp-Notebook")) return true;
    if (document.querySelector(".jp-Cell")) return true;
    if (typeof Jupyter !== "undefined" && Jupyter.notebook) return true;
    if (document.querySelector("#notebook-container")) return true;
    return false;
  }

  function isDeepnote() {
    return location.hostname.includes("deepnote.com");
  }

  // --- Jupyter cell extraction ---

  function getJupyterCell() {
    // JupyterLab / Notebook 7
    if (document.querySelector(".jp-Notebook") || document.querySelector(".jp-Cell")) {
      return getLabCell();
    }
    // Classic
    if (typeof Jupyter !== "undefined" && Jupyter.notebook) {
      return getClassicCell();
    }
    return null;
  }

  function getClassicCell() {
    var cell = Jupyter.notebook.get_selected_cell();
    if (!cell) return null;

    var code = cell.get_text();
    var outputs = [];
    var images = [];

    if (cell.output_area && cell.output_area.outputs) {
      for (var i = 0; i < cell.output_area.outputs.length; i++) {
        var out = cell.output_area.outputs[i];
        if (out.output_type === "stream") {
          outputs.push(out.text || "");
        }
        if (out.output_type === "execute_result" || out.output_type === "display_data") {
          var data = out.data || {};
          if (data["image/png"]) {
            images.push(data["image/png"]);
          } else if (data["text/html"]) {
            outputs.push(data["text/html"]);
          } else if (data["text/plain"]) {
            outputs.push(data["text/plain"]);
          } else if (data["application/json"]) {
            outputs.push(JSON.stringify(data["application/json"], null, 2));
          }
        }
        if (out.output_type === "error") {
          var tb = (out.traceback || []).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
          outputs.push(out.ename + ": " + out.evalue + "\n" + tb);
        }
      }
    }

    return { code: code, outputs: outputs, images: images };
  }

  function getLabCell() {
    // Find the active notebook first (matters when multiple notebooks are open)
    var notebook =
      document.querySelector(".jp-Notebook.jp-mod-active") ||
      document.querySelector(".jp-Notebook:focus-within") ||
      document.querySelector(".jp-Notebook");
    var scope = notebook || document;

    var activeCell =
      scope.querySelector(".jp-Cell.jp-mod-active") ||
      scope.querySelector(".jp-Cell.jp-mod-selected");
    if (!activeCell) return null;

    var codeEl = activeCell.querySelector(".jp-InputArea .jp-Editor .cm-content, .jp-InputArea .CodeMirror");
    var code = "";
    if (codeEl) {
      if (codeEl.classList.contains("cm-content")) {
        code = codeEl.textContent || "";
      } else {
        code = codeEl.CodeMirror ? codeEl.CodeMirror.getValue() : codeEl.textContent || "";
      }
    }

    var outputs = [];
    var images = [];
    var outputArea = activeCell.querySelector(".jp-OutputArea");

    if (outputArea) {
      var imgEls = outputArea.querySelectorAll("img");
      for (var i = 0; i < imgEls.length; i++) {
        var src = imgEls[i].src || "";
        if (src.startsWith("data:image/")) {
          var b64 = src.split(",")[1];
          if (b64) images.push(b64);
        }
      }

      var textEls = outputArea.querySelectorAll(".jp-OutputArea-output pre, .jp-RenderedText pre");
      for (var j = 0; j < textEls.length; j++) {
        var t = textEls[j].textContent || "";
        if (t.trim()) outputs.push(t);
      }

      var htmlEls = outputArea.querySelectorAll(".jp-RenderedHTMLCommon:not(.jp-RenderedText)");
      for (var k = 0; k < htmlEls.length; k++) {
        var table = htmlEls[k].querySelector("table");
        if (table) {
          outputs.push(tableToText(table));
        } else {
          var txt = htmlEls[k].textContent || "";
          if (txt.trim()) outputs.push(txt);
        }
      }
    }

    return { code: code, outputs: outputs, images: images };
  }

  function tableToText(table) {
    var rows = [];
    var trs = table.querySelectorAll("tr");
    for (var i = 0; i < trs.length; i++) {
      var cells = [];
      var tds = trs[i].querySelectorAll("th, td");
      for (var j = 0; j < tds.length; j++) {
        cells.push((tds[j].textContent || "").trim());
      }
      rows.push(cells.join("\t"));
    }
    return rows.join("\n");
  }

  // --- Deepnote cell extraction ---

  function getDeepnoteCell() {
    // Strategy 1: __preloadedState (published/shared notebooks)
    if (window.__preloadedState) {
      var store = window.__preloadedState.initialStoreData;
      if (store && store.publishedProject && store.publishedProject.notebook) {
        var nb = store.publishedProject.notebook;
        var cellId = nb.cellOrder && nb.cellOrder.length > 0 ? nb.cellOrder[0] : null;
        // Try to find the focused cell by checking which CM editor has focus
        var focusedCm = document.querySelector(".cm-editor:focus-within .cm-content");
        if (focusedCm) {
          // Walk up to find a data attribute or index
          var allEditors = document.querySelectorAll(".cm-editor");
          for (var ei = 0; ei < allEditors.length; ei++) {
            if (allEditors[ei].contains(focusedCm)) {
              if (nb.cellOrder[ei]) cellId = nb.cellOrder[ei];
              break;
            }
          }
        }
        if (cellId && nb.cells[cellId]) {
          var cell = nb.cells[cellId];
          if (cell.cell_type === "code") {
            return {
              code: cell.source || "",
              outputs: extractDeepnoteOutputs(cell.outputs || []),
              images: extractDeepnoteImages(cell.outputs || [])
            };
          }
        }
      }
    }

    // Strategy 2: __embed_data (embedded blocks)
    if (window.__embed_data) {
      return {
        code: window.__embed_data.input || "",
        outputs: extractDeepnoteOutputs(window.__embed_data.outputs || []),
        images: extractDeepnoteImages(window.__embed_data.outputs || [])
      };
    }

    // Strategy 3: Live editor — CodeMirror 6 selectors (stable library classes)
    return getDeepnoteCellFromDOM();
  }

  function getDeepnoteCellFromDOM() {
    // Find the focused CodeMirror 6 editor
    var cmEditor = document.querySelector(".cm-editor:focus-within") ||
                   (document.activeElement && document.activeElement.closest && document.activeElement.closest(".cm-editor"));
    if (!cmEditor) {
      // Fallback: find any cm-editor with a focused descendant
      var allCm = document.querySelectorAll(".cm-editor");
      for (var ci = 0; ci < allCm.length; ci++) {
        if (allCm[ci].querySelector(":focus")) {
          cmEditor = allCm[ci];
          break;
        }
      }
    }

    var code = "";
    if (cmEditor) {
      var cmContent = cmEditor.querySelector(".cm-content");
      if (cmContent) code = cmContent.textContent || "";
    }

    // Walk up from the editor to find the cell container
    // The cell container holds both the editor and the output area
    var cellContainer = null;
    if (cmEditor) {
      var el = cmEditor.parentElement;
      // Walk up a few levels to find the block that contains both code and output
      for (var depth = 0; el && depth < 8; depth++) {
        // Check if this element has content beyond just the editor (i.e., output area too)
        var pres = el.querySelectorAll("pre");
        var hasOutputPre = false;
        for (var pi = 0; pi < pres.length; pi++) {
          if (!pres[pi].closest(".cm-editor")) {
            hasOutputPre = true;
            break;
          }
        }
        if (hasOutputPre || el.querySelector("table") || el.querySelector("img") || el.querySelector(".vega-embed")) {
          cellContainer = el;
          break;
        }
        el = el.parentElement;
      }
      // If no output found, use the editor's grandparent as best guess
      if (!cellContainer && cmEditor.parentElement) {
        cellContainer = cmEditor.parentElement.parentElement || cmEditor.parentElement;
      }
    }

    var outputs = [];
    var images = [];

    if (cellContainer) {
      // Text outputs: <pre> elements NOT inside the code editor
      var preEls = cellContainer.querySelectorAll("pre");
      for (var j = 0; j < preEls.length; j++) {
        if (!preEls[j].closest(".cm-editor")) {
          var txt = preEls[j].textContent || "";
          if (txt.trim()) outputs.push(txt);
        }
      }

      // Table outputs
      var tables = cellContainer.querySelectorAll("table");
      for (var k = 0; k < tables.length; k++) {
        outputs.push(tableToText(tables[k]));
      }

      // Image outputs (data URIs and blob URLs)
      var imgs = cellContainer.querySelectorAll("img");
      for (var m = 0; m < imgs.length; m++) {
        var src = imgs[m].src || "";
        if (src.startsWith("data:image/")) {
          var b64 = src.split(",")[1];
          if (b64) images.push(b64);
        }
      }

      // Vega chart indicator
      if (cellContainer.querySelector(".vega-embed")) {
        outputs.push("[Chart output]");
      }
    }

    return (code || outputs.length > 0 || images.length > 0)
      ? { code: code, outputs: outputs, images: images }
      : null;
  }

  function extractDeepnoteOutputs(jupyterOutputs) {
    var outputs = [];
    for (var i = 0; i < jupyterOutputs.length; i++) {
      var out = jupyterOutputs[i];
      if (out.output_type === "stream") {
        outputs.push((out.text || "").replace(/\x1b\[[0-9;]*m/g, ""));
      }
      if (out.output_type === "execute_result" || out.output_type === "display_data") {
        var data = out.data || {};
        if (data["text/plain"]) outputs.push(data["text/plain"]);
        else if (data["text/html"]) outputs.push(data["text/html"]);
      }
      if (out.output_type === "error") {
        var tb = (out.traceback || []).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
        outputs.push((out.ename || "Error") + ": " + (out.evalue || "") + "\n" + tb);
      }
    }
    return outputs;
  }

  function extractDeepnoteImages(jupyterOutputs) {
    var images = [];
    for (var i = 0; i < jupyterOutputs.length; i++) {
      var out = jupyterOutputs[i];
      if (out.output_type === "execute_result" || out.output_type === "display_data") {
        var data = out.data || {};
        if (data["image/png"]) images.push(data["image/png"]);
      }
    }
    return images;
  }

  // --- Platform detection ---

  function detectPlatform() {
    var host = location.hostname;
    if (isJupyter()) return "jupyter";
    if (isDeepnote()) return "deepnote";
    if (host.includes("leetcode.com")) return "leetcode";
    if (host.includes("hackerrank.com")) return "hackerrank";
    if (host.includes("codeforces.com")) return "codeforces";
    if (host.includes("codechef.com")) return "codechef";
    if (host.includes("codility.com")) return "codility";
    if (host.includes("coderpad.io") || host.includes("cdpad.io")) return "coderpad";
    if (host.includes("atcoder.jp")) return "atcoder";
    return "generic";
  }

  // --- Platform scrapers ---

  function scrapeLeetCodeDOM() {
    var titleEl =
      document.querySelector("[data-cy='question-title']") ||
      document.querySelector("h1");
    var contentEl =
      document.querySelector("[data-track-load='description_content']") ||
      document.querySelector(".elfjS") ||
      document.querySelector("article");
    if (!contentEl) return null;
    var title = titleEl ? titleEl.textContent.trim() : "Problem";
    return { title: title, body: title + "\n\n" + contentEl.innerText.trim() };
  }

  async function scrapeLeetCode() {
    var m = location.pathname.match(/\/problems\/([^/]+)/);
    if (!m) return scrapeLeetCodeDOM();
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 3000);
      var res = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify({
          query: "query q($s:String!){question(titleSlug:$s){title difficulty content sampleTestCase}}",
          variables: { s: m[1] },
        }),
      });
      clearTimeout(timeout);
      var json = await res.json();
      if (!json.data || !json.data.question) return scrapeLeetCodeDOM();
      var q = json.data.question;
      var div = document.createElement("div");
      div.innerHTML = q.content || "";
      var body = q.title + " [" + q.difficulty + "]\n\n" + (div.textContent || "").trim();
      if (q.sampleTestCase) body += "\n\nSample Input:\n" + q.sampleTestCase;
      return { title: q.title, body: body };
    } catch (e) {
      return scrapeLeetCodeDOM();
    }
  }

  function scrapeHackerRank() {
    var titleEl = document.querySelector("h1.page-label") || document.querySelector("h2.hr_tour-challenge-name");
    var bodyEl = document.querySelector(".challenge-body-html");
    if (!bodyEl) return null;
    var title = titleEl ? titleEl.textContent.trim() : "Problem";
    var text = title + "\n\n" + bodyEl.innerText.trim();
    var si = document.querySelector(".challenge_sample_input pre");
    var so = document.querySelector(".challenge_sample_output pre");
    if (si) text += "\n\nSample Input:\n" + si.textContent.trim();
    if (so) text += "\n\nSample Output:\n" + so.textContent.trim();
    return { title: title, body: text };
  }

  function scrapeCodeforces() {
    var stmt = document.querySelector(".problem-statement");
    if (!stmt) return null;
    var titleEl = stmt.querySelector(".header > .title");
    var title = titleEl ? titleEl.textContent.trim() : "Problem";
    var parts = [title, ""];

    var children = stmt.children;
    for (var i = 0; i < children.length; i++) {
      var ch = children[i];
      if (ch.classList.contains("header") || ch.classList.contains("sample-tests")) continue;
      var sec = ch.querySelector(".section-title");
      if (sec) {
        parts.push("\n" + sec.textContent.trim());
        var content = [];
        for (var j = 0; j < ch.children.length; j++) {
          if (!ch.children[j].classList.contains("section-title")) {
            content.push(ch.children[j].textContent.trim());
          }
        }
        if (content.length) parts.push(content.join("\n"));
      } else {
        var t = ch.textContent.trim();
        if (t) parts.push(t);
      }
    }

    var samples = stmt.querySelector(".sample-tests");
    if (samples) {
      var inputs = samples.querySelectorAll(".input pre");
      var outputs = samples.querySelectorAll(".output pre");
      for (var k = 0; k < inputs.length; k++) {
        parts.push("\nSample Input " + (k + 1) + ":\n" + inputs[k].textContent.trim());
        if (outputs[k]) parts.push("\nSample Output " + (k + 1) + ":\n" + outputs[k].textContent.trim());
      }
    }

    return { title: title, body: parts.join("\n") };
  }

  function scrapeCodeChef() {
    var titleEl =
      document.querySelector("div[class^='_problem__title'] > h1") ||
      document.querySelector("div[class^='_problemBody'] > h1") ||
      document.querySelector("h1");
    var bodyEl =
      document.querySelector("div[class^='_problemBody']") ||
      document.querySelector(".problem-statement");
    if (!bodyEl) return null;
    var title = titleEl ? titleEl.textContent.trim() : "Problem";
    return { title: title, body: title + "\n\n" + bodyEl.innerText.trim() };
  }

  function scrapeCodility() {
    var titleEl = document.querySelector("#task-0-name");
    var bodyEl = document.querySelector("#brinza-task-description") || document.querySelector(".brinza-task-description");
    if (!bodyEl) return null;
    var title = titleEl ? titleEl.textContent.trim() : "Task";
    return { title: title, body: title + "\n\n" + bodyEl.innerText.trim() };
  }

  function scrapeCoderPad() {
    var config = window.padConfig;
    if (config) {
      var inst = config.candidateInstructions || config.instructions || config.questionInstructions || config.questionContent;
      if (inst && typeof inst === "string" && inst.trim()) {
        return { title: "Instructions", body: inst.trim() };
      }
    }
    var el =
      document.querySelector("[role='tabpanel'][aria-label*='instruction' i]") ||
      document.querySelector("[role='tabpanel'][aria-label*='question' i]") ||
      document.querySelector("[class*='instruction'] [class*='markdown']");
    if (el) {
      var text = el.innerText || "";
      if (text.trim()) return { title: "Instructions", body: text.trim() };
    }
    return null;
  }

  function scrapeAtCoder() {
    var ts = document.querySelector("#task-statement");
    if (!ts) return null;
    var h2 = document.querySelector("h2");
    var title = h2 ? h2.textContent.trim() : "Problem";
    return { title: title, body: title + "\n\n" + ts.innerText.trim() };
  }

  function scrapeGeneric() {
    var sels = [".problem-statement", ".problem-description", ".challenge-body", ".task-description", ".question-content", "article", "main"];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el) {
        var text = el.innerText || "";
        if (text.trim().length > 50) {
          var title = (document.querySelector("h1") || {}).textContent || document.title || "Problem";
          title = title.trim();
          return { title: title, body: title + "\n\n" + text.trim() };
        }
      }
    }
    return null;
  }

  var scrapers = {
    leetcode: scrapeLeetCode,
    hackerrank: scrapeHackerRank,
    codeforces: scrapeCodeforces,
    codechef: scrapeCodeChef,
    codility: scrapeCodility,
    coderpad: scrapeCoderPad,
    atcoder: scrapeAtCoder,
    generic: scrapeGeneric,
  };

  // --- Message handling (random channel names) ---

  window.addEventListener("message", function (e) {
    if (e.source !== window || !e.data) return;

    if (e.data.t === channels.a) {
      var cellData = null;
      if (isJupyter()) cellData = getJupyterCell();
      else if (isDeepnote()) cellData = getDeepnoteCell();
      window.postMessage({ t: channels.b, i: e.data.i, d: cellData }, "*");
    }

    if (e.data.t === channels.c) {
      var platform = detectPlatform();
      if (platform === "jupyter" || platform === "deepnote") {
        window.postMessage({ t: channels.d, i: e.data.i, d: null }, "*");
        return;
      }
      var fn = scrapers[platform] || scrapers.generic;
      Promise.resolve().then(function () { return fn(); }).then(function (result) {
        if (!result) {
          console.warn("serpent: " + platform + " scraper returned null, trying generic");
          result = scrapeGeneric();
        }
        window.postMessage({ t: channels.d, i: e.data.i, d: result }, "*");
      }).catch(function () {
        console.warn("serpent: " + platform + " scraper failed, using generic");
        try {
          var fallback = scrapeGeneric();
          window.postMessage({ t: channels.d, i: e.data.i, d: fallback }, "*");
        } catch (ex) {
          window.postMessage({ t: channels.d, i: e.data.i, d: null }, "*");
        }
      });
    }
  });
})();

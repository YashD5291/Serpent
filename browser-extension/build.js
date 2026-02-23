#!/usr/bin/env node
// Reads .env, XOR-encodes bot token + chat ID, writes _cfg.js

const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
if (!fs.existsSync(envPath)) {
  console.error("Error: .env not found at", envPath);
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const token = env.SERPENT_BOT_TOKEN;
const chatId = env.SERPENT_CHAT_ID;

if (!token || !chatId) {
  console.error("Error: SERPENT_BOT_TOKEN and SERPENT_CHAT_ID must be set in .env");
  process.exit(1);
}

// Generate a random XOR key (16 bytes)
const keyBytes = [];
for (let i = 0; i < 16; i++) {
  keyBytes.push(Math.floor(Math.random() * 256));
}

function xorEncode(str, key) {
  const encoded = [];
  for (let i = 0; i < str.length; i++) {
    encoded.push(str.charCodeAt(i) ^ key[i % key.length]);
  }
  return encoded;
}

const encToken = xorEncode(token, keyBytes);
const encChatId = xorEncode(chatId, keyBytes);

const output = `// Auto-generated — do not edit
var _k=[${keyBytes.join(",")}];
var _a=[${encToken.join(",")}];
var _b=[${encChatId.join(",")}];
`;

const outPath = path.join(__dirname, "cfg.js");
fs.writeFileSync(outPath, output);
console.log("Wrote", outPath);

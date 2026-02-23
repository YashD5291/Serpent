# Serpent

Silently send Jupyter notebook cells, coding problems, and files to Telegram. No flashing, no popups, no DOM traces.

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, and copy the **bot token**
3. Add the bot to your target chat/group
4. Get your **chat ID** — message [@userinfobot](https://t.me/userinfobot) for your personal ID, or use the Telegram API to get a group chat ID

### 2. VS Code Extension

```sh
cd Serpent
./install.sh        # Mac / Linux
install.bat         # Windows
```

That's it. On first use, Serpent will prompt you for your bot token and chat ID — no manual `.env` needed.

**Manual install** (if you prefer):

```sh
npm install && npm run compile && npx @vscode/vsce package && code --install-extension serpent-0.1.0.vsix
```

You can also create a `.env` in your workspace root instead of using the setup prompt:

```
SERPENT_BOT_TOKEN=your_bot_token_here
SERPENT_CHAT_ID=your_chat_id_here
SERPENT_NOTIFICATIONS=false
```

The `.env` hot-reloads on save.

### 3. Browser Extension (Chrome)

Bake in your credentials (reads from `.env`):

```sh
node browser-extension/build.js
```

Then load the extension:

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** > select the `browser-extension/` folder

The extension appears as **Page Notes** (a decoy notes app). To change credentials later, click the title 5 times quickly to access the config panel.

## What It Does

`Ctrl+Shift+;` is the only command you need. It auto-detects your context:

| Context | What gets sent to Telegram |
|---|---|
| Jupyter notebook (VS Code) | Cell code + output + images |
| Jupyter notebook (browser) | Cell code + output + images |
| Coding platform problem page | Full problem statement |
| Regular file (VS Code) | Entire file content |

### Supported Platforms

**Jupyter notebooks:** localhost, JupyterHub, Kaggle, Databricks, SageMaker, Google Colab, CoderPad (notebook mode)

**Coding platforms:** LeetCode, HackerRank, Codeforces, CodeChef, Codility, CoderPad, AtCoder, CSES, Kattis, SPOJ

## Configuration

VS Code reads from `.env`. Browser extension uses hardcoded credentials (via `build.js`) or the hidden config panel (5x click title):

| Variable | Default | Description |
|---|---|---|
| `SERPENT_BOT_TOKEN` | — | Telegram bot token (required) |
| `SERPENT_CHAT_ID` | — | Telegram chat ID (required) |
| `SERPENT_NOTIFICATIONS` | `false` | Show status bar messages (`true`/`false`) |

## Requirements

- VS Code 1.75+ (for the VS Code extension)
- Chrome 111+ or Chromium-based browser (for the browser extension)

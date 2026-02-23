# Serpent

Silently send Jupyter notebook cells, outputs, and files to Telegram from VS Code or the browser. No flashing, no popups, no noise.

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, and copy the **bot token**
3. Add the bot to your target chat/group
4. Get your **chat ID** — message [@userinfobot](https://t.me/userinfobot) for your personal ID, or use the Telegram API to get a group chat ID

### 2. VS Code Extension

```sh
cd Serpent
npm install
npm run compile
npx @vscode/vsce package
code --install-extension serpent-0.1.0.vsix
```

Or manually: **Extensions** > **...** > **Install from VSIX** > select the `.vsix` file.

Create a `.env` file in your workspace root (or the extension directory):

```
SERPENT_BOT_TOKEN=your_bot_token_here
SERPENT_CHAT_ID=your_chat_id_here
SERPENT_NOTIFICATIONS=false
```

Reload VS Code. The `.env` hot-reloads on save.

### 3. Browser Extension (Chrome)

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** > select the `browser-extension/` folder
4. Click the Serpent icon in the toolbar > enter your bot token and chat ID

Works with Jupyter Classic, JupyterLab, Notebook 7, and hosted instances (localhost, JupyterHub, Kaggle, Databricks, SageMaker).

## Keybindings

### In Jupyter Notebooks (VS Code & Browser)

| Command | Windows/Linux | Mac | Action |
|---|---|---|---|
| Send Cell | `Ctrl+Shift+C` | `Ctrl+Shift+C` | Send code + output + images to Telegram |
| Copy Code | `Ctrl+Shift+Alt+C` | `Ctrl+Shift+Option+C` | Copy code to clipboard |
| Send Output | `Ctrl+Shift+Alt+O` | `Ctrl+Shift+Option+O` | Send output only to Telegram |
| Copy Image | `Ctrl+Shift+Alt+I` | `Ctrl+Shift+Option+I` | Copy image to system clipboard (VS Code only) |

### In Regular Files (VS Code only)

| Command | Windows/Linux | Mac | Action |
|---|---|---|---|
| Send File | `Ctrl+Shift+C` | `Ctrl+Shift+C` | Send entire file to Telegram |

Small files are sent as formatted messages. Large files (>4096 chars) are sent as document attachments.

## Configuration

All settings go in `.env`:

| Variable | Default | Description |
|---|---|---|
| `SERPENT_BOT_TOKEN` | — | Telegram bot token (required) |
| `SERPENT_CHAT_ID` | — | Telegram chat ID (required) |
| `SERPENT_NOTIFICATIONS` | `false` | Show status bar messages (`true`/`false`) |

## Requirements

- VS Code 1.75+ (for the VS Code extension)
- Chrome or Chromium-based browser (for the browser extension)

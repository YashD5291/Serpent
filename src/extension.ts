import * as vscode from "vscode";
import { execFile } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join, basename } from "path";
import * as https from "https";

// --- .env loader ---

let botToken = "";
let chatId = "";
let envLoaded = false;

async function loadEnv(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const searchPaths: string[] = [];

  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      searchPaths.push(join(folder.uri.fsPath, ".env"));
    }
  }
  searchPaths.push(join(context.extensionPath, ".env"));

  for (const envPath of searchPaths) {
    try {
      const content = await readFile(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) {
          continue;
        }
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key === "SERPENT_BOT_TOKEN") {
          botToken = val;
        } else if (key === "SERPENT_CHAT_ID") {
          chatId = val;
        }
      }
      if (botToken && chatId) {
        envLoaded = true;
        return;
      }
    } catch {
      // file not found, try next
    }
  }
  envLoaded = true;
}

function requireTelegramConfig(): boolean {
  if (!botToken || !chatId) {
    showStatus("Serpent: Set SERPENT_BOT_TOKEN and SERPENT_CHAT_ID in .env, then reload", 4000);
    return false;
  }
  return true;
}

// --- Telegram API ---

const TELEGRAM_TIMEOUT_MS = 15000;
const TELEGRAM_MSG_LIMIT = 4096;

function telegramRequest(
  method: string,
  payload: Record<string, string>,
  fileField?: { field: string; filename: string; data: Buffer; mime: string }
): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${botToken}/${method}`;

    let body: Buffer;
    let headers: Record<string, string | number>;

    if (!fileField) {
      const json = JSON.stringify(payload);
      body = Buffer.from(json);
      headers = {
        "Content-Type": "application/json",
        "Content-Length": body.length,
      };
    } else {
      const boundary = `----SerpentBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
      const parts: Buffer[] = [];

      for (const [key, val] of Object.entries(payload)) {
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
        ));
      }

      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.field}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.mime}\r\n\r\n`
      ));
      parts.push(fileField.data);
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

      body = Buffer.concat(parts);
      headers = {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      };
    }

    const req = https.request(url, { method: "POST", headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.description || `Telegram error (${res.statusCode})`));
          }
        } catch {
          reject(new Error(`Telegram returned invalid response (${res.statusCode})`));
        }
      });
    });

    req.setTimeout(TELEGRAM_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error("Telegram request timed out"));
    });

    req.on("error", (err) => {
      if (err.message.includes("ENOTFOUND") || err.message.includes("ENETUNREACH")) {
        reject(new Error("No network connection"));
      } else {
        reject(err);
      }
    });

    req.write(body);
    req.end();
  });
}

async function sendTextToTelegram(text: string): Promise<void> {
  // Telegram has a 4096 char limit per message — split if needed
  const chunks = splitMessage(text, TELEGRAM_MSG_LIMIT);
  for (const chunk of chunks) {
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: chunk,
      parse_mode: "HTML",
    });
  }
}

function splitMessage(text: string, limit: number): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline near the limit
    let splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < limit * 0.5) {
      // No good newline — split at limit
      splitAt = limit;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}

async function sendImageToTelegram(data: Buffer, caption?: string): Promise<void> {
  const payload: Record<string, string> = { chat_id: chatId };
  if (caption) {
    payload.caption = caption.slice(0, 1024); // Telegram caption limit
    payload.parse_mode = "HTML";
  }
  await telegramRequest("sendPhoto", payload, {
    field: "photo",
    filename: "output.png",
    data: data,
    mime: "image/png",
  });
}

// --- Send lock (prevent double-sends from rapid key presses) ---

let sending = false;

async function withSendLock<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (sending) {
    showStatus("Serpent: Already sending...");
    return undefined;
  }
  sending = true;
  try {
    return await fn();
  } finally {
    sending = false;
  }
}

// --- Cell helpers ---

function getActiveCell(): vscode.NotebookCell | undefined {
  const editor = vscode.window.activeNotebookEditor;
  if (!editor) {
    return undefined;
  }
  const selection = editor.selection;
  if (!selection || selection.isEmpty) {
    return undefined;
  }
  return editor.notebook.cellAt(selection.start);
}

function extractCellCode(cell: vscode.NotebookCell): string {
  return cell.document.getText();
}

function extractTextOutput(cell: vscode.NotebookCell): string {
  const parts: string[] = [];

  for (const output of cell.outputs) {
    for (const item of output.items) {
      const mime = item.mime;

      if (mime.startsWith("image/")) {
        continue;
      } else if (mime === "application/vnd.code.notebook.error") {
        try {
          const err = JSON.parse(Buffer.from(item.data).toString("utf-8"));
          const lines: string[] = [`${err.ename}: ${err.evalue}`];
          if (Array.isArray(err.traceback) && err.traceback.length > 0) {
            // Strip ANSI escape codes from traceback
            lines.push(
              ...err.traceback.map((line: string) =>
                line.replace(/\x1b\[[0-9;]*m/g, "")
              )
            );
          }
          parts.push(lines.join("\n"));
        } catch {
          parts.push(Buffer.from(item.data).toString("utf-8"));
        }
      } else {
        parts.push(Buffer.from(item.data).toString("utf-8"));
      }
    }
  }

  return parts.join("\n");
}

function extractCellOutput(cell: vscode.NotebookCell): string {
  const parts: string[] = [];

  for (const output of cell.outputs) {
    for (const item of output.items) {
      const mime = item.mime;
      const text = Buffer.from(item.data).toString("utf-8");

      if (mime.startsWith("image/")) {
        const base64 = Buffer.from(item.data).toString("base64");
        parts.push(`![output](data:${mime};base64,${base64})`);
      } else if (mime === "application/vnd.code.notebook.error") {
        try {
          const err = JSON.parse(text);
          const lines: string[] = [`${err.ename}: ${err.evalue}`];
          if (Array.isArray(err.traceback) && err.traceback.length > 0) {
            lines.push(
              ...err.traceback.map((line: string) =>
                line.replace(/\x1b\[[0-9;]*m/g, "")
              )
            );
          }
          parts.push(lines.join("\n"));
        } catch {
          parts.push(text);
        }
      } else {
        parts.push(text);
      }
    }
  }

  return parts.join("\n");
}

function debugCellOutput(cell: vscode.NotebookCell): string {
  if (cell.outputs.length === 0) {
    return "0 outputs";
  }
  const mimes: string[] = [];
  for (const output of cell.outputs) {
    for (const item of output.items) {
      mimes.push(item.mime);
    }
  }
  return `${cell.outputs.length} output(s): ${mimes.join(", ")}`;
}

function extractAllImages(cell: vscode.NotebookCell): Buffer[] {
  const images: Buffer[] = [];
  for (const output of cell.outputs) {
    for (const item of output.items) {
      if (item.mime.startsWith("image/")) {
        images.push(Buffer.from(item.data));
      }
    }
  }
  return images;
}

function extractFirstImage(cell: vscode.NotebookCell): Uint8Array | undefined {
  for (const output of cell.outputs) {
    for (const item of output.items) {
      if (item.mime.startsWith("image/")) {
        return item.data;
      }
    }
  }
  return undefined;
}

// --- Clipboard helpers ---

async function copyImageToClipboard(data: Uint8Array): Promise<void> {
  const tmpPath = join(tmpdir(), `serpent-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  await writeFile(tmpPath, data);

  try {
    if (process.platform === "darwin") {
      await execFileAsync("osascript", [
        "-e",
        `set the clipboard to (read (POSIX file "${tmpPath}") as «class PNGf»)`,
      ]);
    } else if (process.platform === "win32") {
      await execFileAsync("powershell", [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${tmpPath}'))`,
      ]);
    } else {
      await execFileAsync("xclip", ["-selection", "clipboard", "-t", "image/png", "-i", tmpPath]);
    }
  } finally {
    unlink(tmpPath).catch(() => {});
  }
}

function execFileAsync(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const cp = execFile(cmd, args, { timeout: 10000 }, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    cp.on("error", reject);
  });
}

// --- Status bar ---

function showStatus(msg: string, ms = 2000): void {
  const item = vscode.window.setStatusBarMessage(msg);
  setTimeout(() => item.dispose(), ms);
}

// --- HTML escape ---

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Activation ---

export function activate(context: vscode.ExtensionContext): void {
  const envReady = loadEnv(context);

  // Watch .env files for hot-reload
  const watcher = vscode.workspace.createFileSystemWatcher("**/.env");
  watcher.onDidChange(() => loadEnv(context));
  watcher.onDidCreate(() => loadEnv(context));
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    // Ctrl+Shift+C (notebook) — send cell to Telegram
    vscode.commands.registerCommand("serpent.copyCell", async () => {
      await envReady;
      const cell = getActiveCell();
      if (!cell) {
        showStatus("Serpent: No cell selected");
        return;
      }
      if (!requireTelegramConfig()) { return; }

      await withSendLock(async () => {
        const code = extractCellCode(cell);
        const textOutput = extractTextOutput(cell);
        const images = extractAllImages(cell);

        showStatus("🐍 Sending to Telegram...");

        try {
          let message = `<b>Code</b>\n<pre>${escapeHtml(code)}</pre>`;
          if (textOutput) {
            message += `\n\n<b>Output</b>\n<pre>${escapeHtml(textOutput)}</pre>`;
          }

          await sendTextToTelegram(message);

          for (const img of images) {
            await sendImageToTelegram(img);
          }

          showStatus("🐍 Sent to Telegram!");
        } catch (err: any) {
          showStatus(`Serpent: ${err.message}`, 4000);
        }
      });
    }),

    // Code only → clipboard
    vscode.commands.registerCommand("serpent.copyCellCodeOnly", async () => {
      const cell = getActiveCell();
      if (!cell) {
        showStatus("Serpent: No cell selected");
        return;
      }

      await vscode.env.clipboard.writeText(extractCellCode(cell));
      showStatus("🐍 Copied!");
    }),

    // Output only → send to Telegram
    vscode.commands.registerCommand("serpent.copyCellOutputOnly", async () => {
      await envReady;
      const cell = getActiveCell();
      if (!cell) {
        showStatus("Serpent: No cell selected");
        return;
      }
      if (!requireTelegramConfig()) { return; }

      const textOutput = extractTextOutput(cell);
      const images = extractAllImages(cell);

      if (!textOutput && images.length === 0) {
        const debug = debugCellOutput(cell);
        showStatus(`Serpent: No output (${debug})`, 4000);
        return;
      }

      await withSendLock(async () => {
        showStatus("🐍 Sending output to Telegram...");

        try {
          if (textOutput) {
            await sendTextToTelegram(`<pre>${escapeHtml(textOutput)}</pre>`);
          }

          for (const img of images) {
            await sendImageToTelegram(img);
          }

          showStatus("🐍 Output sent to Telegram!");
        } catch (err: any) {
          showStatus(`Serpent: ${err.message}`, 4000);
        }
      });
    }),

    // Send entire file to Telegram
    vscode.commands.registerCommand("serpent.sendFile", async () => {
      await envReady;
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        showStatus("Serpent: No file open");
        return;
      }
      if (!requireTelegramConfig()) { return; }

      const fileName = basename(editor.document.fileName) || "file";
      const content = editor.document.getText();

      if (!content.trim()) {
        showStatus("Serpent: File is empty");
        return;
      }

      await withSendLock(async () => {
        showStatus("🐍 Sending file to Telegram...");

        try {
          const message = `<b>${escapeHtml(fileName)}</b>\n<pre>${escapeHtml(content)}</pre>`;

          if (message.length <= TELEGRAM_MSG_LIMIT) {
            await sendTextToTelegram(message);
          } else {
            await telegramRequest("sendDocument", { chat_id: chatId }, {
              field: "document",
              filename: fileName,
              data: Buffer.from(content, "utf-8"),
              mime: "text/plain",
            });
          }

          showStatus("🐍 File sent to Telegram!");
        } catch (err: any) {
          showStatus(`Serpent: ${err.message}`, 4000);
        }
      });
    }),

    // Image → system clipboard
    vscode.commands.registerCommand("serpent.copyCellImage", async () => {
      const cell = getActiveCell();
      if (!cell) {
        showStatus("Serpent: No cell selected");
        return;
      }

      const imageData = extractFirstImage(cell);
      if (!imageData) {
        showStatus("Serpent: No image output in this cell");
        return;
      }

      try {
        await copyImageToClipboard(imageData);
        showStatus("🐍 Copied!");
      } catch (err: any) {
        showStatus(`Serpent: Failed to copy image — ${err.message}`, 4000);
      }
    })
  );
}

export function deactivate(): void {}

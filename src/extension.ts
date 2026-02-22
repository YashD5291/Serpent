import * as vscode from "vscode";
import { execFile } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import * as https from "https";

// --- .env loader ---

let botToken = "";
let chatId = "";

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
        return;
      }
    } catch {
      // file not found, try next
    }
  }
}

// --- Telegram API ---

function telegramRequest(
  method: string,
  payload: Record<string, string>,
  fileField?: { field: string; filename: string; data: Buffer; mime: string }
): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${botToken}/${method}`;

    if (!fileField) {
      const body = JSON.stringify(payload);
      const req = https.request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.description || "Telegram API error"));
            }
          } catch {
            reject(new Error("Invalid response from Telegram"));
          }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    } else {
      const boundary = `----SerpentBoundary${Date.now()}`;
      const parts: Buffer[] = [];

      // Add text fields
      for (const [key, val] of Object.entries(payload)) {
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
        ));
      }

      // Add file field
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.field}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.mime}\r\n\r\n`
      ));
      parts.push(fileField.data);
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

      const body = Buffer.concat(parts);

      const req = https.request(url, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.description || "Telegram API error"));
            }
          } catch {
            reject(new Error("Invalid response from Telegram"));
          }
        });
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    }
  });
}

async function sendTextToTelegram(text: string): Promise<void> {
  await telegramRequest("sendMessage", {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
  });
}

async function sendImageToTelegram(data: Buffer, caption?: string): Promise<void> {
  const payload: Record<string, string> = { chat_id: chatId };
  if (caption) {
    payload.caption = caption;
    payload.parse_mode = "HTML";
  }
  await telegramRequest("sendPhoto", payload, {
    field: "photo",
    filename: "output.png",
    data: data,
    mime: "image/png",
  });
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
        continue; // handled separately
      } else if (mime === "application/vnd.code.notebook.error") {
        try {
          const err = JSON.parse(Buffer.from(item.data).toString("utf-8"));
          parts.push(`${err.ename}: ${err.evalue}`);
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
          parts.push(`${err.ename}: ${err.evalue}`);
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
  const tmpPath = join(tmpdir(), `serpent-${Date.now()}.png`);
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
    execFile(cmd, args, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// --- Status bar ---

function showStatus(msg: string, ms = 2000): void {
  const item = vscode.window.setStatusBarMessage(msg);
  setTimeout(() => item.dispose(), ms);
}

// --- Activation ---

export function activate(context: vscode.ExtensionContext): void {
  loadEnv(context);

  context.subscriptions.push(
    // Ctrl+Shift+C — send to Telegram
    vscode.commands.registerCommand("serpent.copyCell", async () => {
      const cell = getActiveCell();
      if (!cell) {
        showStatus("Serpent: No cell selected");
        return;
      }

      if (!botToken || !chatId) {
        showStatus("Serpent: Missing SERPENT_BOT_TOKEN or SERPENT_CHAT_ID in .env", 4000);
        return;
      }

      const code = extractCellCode(cell);
      const textOutput = extractTextOutput(cell);
      const images = extractAllImages(cell);

      showStatus("🐍 Sending to Telegram...");

      try {
        // Build the text message
        let message = `<b>Code</b>\n<pre>${escapeHtml(code)}</pre>`;
        if (textOutput) {
          message += `\n\n<b>Output</b>\n<pre>${escapeHtml(textOutput)}</pre>`;
        }

        // Send text message
        await sendTextToTelegram(message);

        // Send each image
        for (const img of images) {
          await sendImageToTelegram(img);
        }

        showStatus("🐍 Sent to Telegram!");
      } catch (err: any) {
        showStatus(`Serpent: Telegram error — ${err.message}`, 4000);
      }
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
      const cell = getActiveCell();
      if (!cell) {
        showStatus("Serpent: No cell selected");
        return;
      }

      if (!botToken || !chatId) {
        showStatus("Serpent: Missing SERPENT_BOT_TOKEN or SERPENT_CHAT_ID in .env", 4000);
        return;
      }

      const textOutput = extractTextOutput(cell);
      const images = extractAllImages(cell);

      if (!textOutput && images.length === 0) {
        const debug = debugCellOutput(cell);
        showStatus(`Serpent: No output (${debug})`, 4000);
        return;
      }

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
        showStatus(`Serpent: Telegram error — ${err.message}`, 4000);
      }
    }),

    // Send entire file to Telegram
    vscode.commands.registerCommand("serpent.sendFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        showStatus("Serpent: No file open");
        return;
      }

      if (!botToken || !chatId) {
        showStatus("Serpent: Missing SERPENT_BOT_TOKEN or SERPENT_CHAT_ID in .env", 4000);
        return;
      }

      const fileName = editor.document.fileName.split("/").pop() || "file";
      const content = editor.document.getText();

      if (!content.trim()) {
        showStatus("Serpent: File is empty");
        return;
      }

      showStatus("🐍 Sending file to Telegram...");

      try {
        // Telegram message limit is 4096 chars. Send as document if too long.
        const message = `<b>${escapeHtml(fileName)}</b>\n<pre>${escapeHtml(content)}</pre>`;

        if (message.length <= 4096) {
          await sendTextToTelegram(message);
        } else {
          // Send as a document file
          await telegramRequest("sendDocument", { chat_id: chatId }, {
            field: "document",
            filename: fileName,
            data: Buffer.from(content, "utf-8"),
            mime: "text/plain",
          });
        }

        showStatus("🐍 File sent to Telegram!");
      } catch (err: any) {
        showStatus(`Serpent: Telegram error — ${err.message}`, 4000);
      }
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function deactivate(): void {}

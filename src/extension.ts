import * as vscode from "vscode";

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

function extractCellOutput(cell: vscode.NotebookCell): string {
  const parts: string[] = [];

  for (const output of cell.outputs) {
    for (const item of output.items) {
      const mime = item.mime;

      if (mime === "image/png" || mime === "image/jpeg" || mime === "image/svg+xml") {
        parts.push("[Image Output]");
      } else if (mime === "text/plain") {
        parts.push(Buffer.from(item.data).toString("utf-8"));
      } else if (mime === "text/html") {
        parts.push(Buffer.from(item.data).toString("utf-8"));
      } else if (mime === "application/json") {
        parts.push(Buffer.from(item.data).toString("utf-8"));
      } else if (mime === "application/vnd.code.notebook.error") {
        try {
          const err = JSON.parse(Buffer.from(item.data).toString("utf-8"));
          parts.push(`${err.ename}: ${err.evalue}`);
        } catch {
          parts.push(Buffer.from(item.data).toString("utf-8"));
        }
      }
    }
  }

  return parts.join("\n");
}

function showCopied(): void {
  const msg = vscode.window.setStatusBarMessage("🐍 Copied!");
  setTimeout(() => msg.dispose(), 2000);
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("serpent.copyCell", async () => {
      const cell = getActiveCell();
      if (!cell) {
        vscode.window.setStatusBarMessage("Serpent: No cell selected", 2000);
        return;
      }

      const code = extractCellCode(cell);
      const output = extractCellOutput(cell);

      let text = `--- Code ---\n${code}`;
      if (output) {
        text += `\n\n--- Output ---\n${output}`;
      }

      await vscode.env.clipboard.writeText(text);
      showCopied();
    }),

    vscode.commands.registerCommand("serpent.copyCellCodeOnly", async () => {
      const cell = getActiveCell();
      if (!cell) {
        vscode.window.setStatusBarMessage("Serpent: No cell selected", 2000);
        return;
      }

      await vscode.env.clipboard.writeText(extractCellCode(cell));
      showCopied();
    }),

    vscode.commands.registerCommand("serpent.copyCellOutputOnly", async () => {
      const cell = getActiveCell();
      if (!cell) {
        vscode.window.setStatusBarMessage("Serpent: No cell selected", 2000);
        return;
      }

      const output = extractCellOutput(cell);
      if (!output) {
        vscode.window.setStatusBarMessage("Serpent: No output", 2000);
        return;
      }

      await vscode.env.clipboard.writeText(output);
      showCopied();
    })
  );
}

export function deactivate(): void {}

# Serpent

Silently copy Jupyter notebook cells and outputs in VS Code.

No flashing, no selections, no visual noise — just the content on your clipboard.

## Usage

Focus on any cell in a Jupyter notebook and use these keybindings:

| Keybinding | Command | What gets copied |
|---|---|---|
| `Ctrl+Shift+C` | Copy Cell | Code + output |
| `Ctrl+Shift+Alt+C` | Copy Code Only | Code only |
| `Ctrl+Shift+Alt+O` | Copy Output Only | Output only |

All keybindings are scoped to notebook editors and won't interfere with anything else.

A brief "🐍 Copied!" message appears in the status bar for confirmation.

## Supported output types

| MIME type | Behavior |
|---|---|
| `text/plain` | Copied as-is |
| `text/html` | Copied as raw HTML |
| `application/json` | Copied as raw JSON |
| `image/png`, `image/jpeg`, `image/svg+xml` | Replaced with `[Image Output]` placeholder |
| Error output | Formatted as `ErrorName: message` |

## Clipboard format

When copying code + output, the result is formatted as:

```
--- Code ---
print("hello world")

--- Output ---
hello world
```

When copying code only or output only, the raw text is copied with no wrapper.

## Install from source

```sh
npm install
npm run compile
npx @vscode/vsce package
```

Then install the generated `.vsix` file: **Extensions** > **...** > **Install from VSIX**.

## Requirements

- VS Code 1.75+
- A Jupyter notebook open with the built-in notebook editor

#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "Installing Serpent..."

# Check prerequisites
if ! command -v npm &>/dev/null; then
  echo "Error: npm is not installed." >&2
  exit 1
fi

if ! command -v code &>/dev/null; then
  echo "Error: 'code' CLI not found. Open VS Code and run:" >&2
  echo "  Cmd+Shift+P > Shell Command: Install 'code' command in PATH" >&2
  exit 1
fi

# Build
npm install --silent
npm run compile --silent

# Package
npx @vscode/vsce package --no-dependencies -o serpent.vsix 2>/dev/null

# Install
code --install-extension serpent.vsix --force

# Cleanup
rm -f serpent.vsix

echo ""
echo "Done! Serpent is installed."
echo "Reload VS Code and it will prompt you for your Telegram credentials on first use."

#!/usr/bin/env bash
set -euo pipefail

echo "==> Running the old npm cleanup tool (@c0nant/claude-hooks@0.4.0)..."
npx @c0nant/claude-hooks@0.4.0 uninstall

echo "==> Removing installed skills..."
rm -rf "$HOME/.agents/skills"
rm -rf "$HOME/.claude/skills"

echo ""
echo "Clean. To reinstall from scratch:"
echo ""
echo "  npx skills@latest add C0nanT/skills"
echo "  /plugin install conan-mods --marketplace C0nanT/conan-mods  # inside Claude Code"
echo ""

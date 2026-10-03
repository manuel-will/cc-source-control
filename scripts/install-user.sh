#!/usr/bin/env bash
# Installiert die Mod für alle Projekte (Scope "user") und zeigt, wo sie
# installiert ist. Nötig, wenn /git nur im Ordner geht, in dem die Mod
# installiert wurde.
#
#   bash scripts/install-user.sh
set -euo pipefail

PLUGIN="source-control@cc-source-control"

find_claude() {
  local candidate dir
  for candidate in "$(command -v claude 2>/dev/null || true)" \
    "$HOME/.local/bin/claude" "$HOME/.local/bin/claude.exe" \
    "$HOME/.claude/local/claude" "$HOME/.claude/local/claude.exe"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  # Claude Desktop on Windows brings its own CLI under AppData
  for dir in "${APPDATA:-}" "${LOCALAPPDATA:-}"; do
    [ -n "$dir" ] || continue
    candidate="$(find "$(cygpath -u "$dir" 2>/dev/null || echo "$dir")" -maxdepth 5 -iname claude.exe -path '*claude*' 2>/dev/null | sort | tail -n 1)"
    [ -n "$candidate" ] && { echo "$candidate"; return 0; }
  done
  return 1
}

if ! CLAUDE="$(find_claude)"; then
  echo "claude-CLI nicht gefunden. Bitte in Claude Desktop in den Chat tippen:"
  echo "   /plugin install $PLUGIN"
  echo "und bei der Frage nach dem Ort \"für alle Projekte\" (user) wählen."
  exit 1
fi

echo "Vorher:"
"$CLAUDE" plugin list 2>&1 | grep -i -A3 "source-control" || echo "  (nicht installiert)"

"$CLAUDE" plugin marketplace update cc-source-control >/dev/null 2>&1 || true
"$CLAUDE" plugin install "$PLUGIN" --scope user

echo
echo "Nachher:"
"$CLAUDE" plugin list 2>&1 | grep -i -A3 "source-control"
echo
echo "Jetzt Claude Desktop ganz beenden und neu starten: /git geht dann in jedem Projekt."

#!/usr/bin/env bash
# Prüft für jedes Projekt, ob die Mod dort laden kann, und sagt, woran es
# hängt, wenn nicht.
#
#   bash scripts/diagnose.sh                 alle Projekte, die Claude kennt
#   bash scripts/diagnose.sh ~/code/projekt  nur diese Ordner
#
# Gründe, die es findet: das Plugin ist für das Projekt abgeschaltet
# (enabledPlugins), das Projekt schaltet alle Hooks ab (disableAllHooks; Mods
# bestehen aus Hooks), oder die Mod ist nur für einzelne Ordner installiert.
set -uo pipefail

PLUGIN="source-control@cc-source-control"
CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
STATE_FILE="${CLAUDE_CONFIG_DIR:+$CLAUDE_CONFIG_DIR/.claude.json}"
STATE_FILE="${STATE_FILE:-$HOME/.claude.json}"

find_claude() {
  local candidate dir
  for candidate in "$(command -v claude 2>/dev/null || true)" \
    "$HOME/.local/bin/claude" "$HOME/.local/bin/claude.exe" \
    "$HOME/.claude/local/claude" "$HOME/.claude/local/claude.exe"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  for dir in "${APPDATA:-}" "${LOCALAPPDATA:-}"; do
    [ -n "$dir" ] || continue
    candidate="$(find "$(cygpath -u "$dir" 2>/dev/null || echo "$dir")" -maxdepth 5 -iname claude.exe -path '*claude*' 2>/dev/null | sort | tail -n 1)"
    [ -n "$candidate" ] && { echo "$candidate"; return 0; }
  done
  return 1
}

# a settings file's word on something, if it has one
says() { [ -f "$1" ] && grep -Eq "$2" "$1"; }

# the projects Claude Code has opened, from its state file
known_projects() {
  [ -f "$STATE_FILE" ] || return 0
  grep -oE '"([A-Za-z]:)?[\\/][^"]*": *\{' "$STATE_FILE" |
    sed -E 's/": *\{$//; s/^"//; s#\\\\#/#g' |
    while read -r path; do
      local unix
      unix="$(cygpath -u "$path" 2>/dev/null || echo "$path")"
      [ -d "$unix" ] && echo "$unix"
    done | sort -u
}

CLAUDE="$(find_claude || true)"

echo "Mod: $PLUGIN"
if [ -n "$CLAUDE" ]; then
  "$CLAUDE" plugin list 2>/dev/null | grep -A3 "source-control" | grep -E "Scope" | sed 's/^ */  installiert, /' | sort -u
else
  echo "  (claude-CLI nicht gefunden: Status pro Projekt wird nur aus den Einstellungen gelesen)"
fi
for own in "$CONFIG/commands/git.md" "$CONFIG/skills/git/SKILL.md"; do
  [ -f "$own" ] && echo "  ⚠ $own belegt /git schon (eigener Befehl): er kann den der Mod verdecken."
done
if says "$CONFIG/settings.json" '"disableAllHooks" *: *true'; then
  echo "  ⚠ $CONFIG/settings.json schaltet ALLE Hooks ab (disableAllHooks): die Mod lädt nirgends."
fi
echo

if [ $# -gt 0 ]; then projects=("$@"); else mapfile -t projects < <(known_projects); fi
[ ${#projects[@]} -gt 0 ] || { echo "Keine Projekte gefunden. Ordner als Argumente angeben."; exit 0; }

ok=0; bad=0
for project in "${projects[@]}"; do
  reasons=()
  for file in "$project/.claude/settings.json" "$project/.claude/settings.local.json"; do
    says "$file" '"disableAllHooks" *: *true' && reasons+=("${file#"$project"/} schaltet alle Hooks ab (\"disableAllHooks\": true)")
    says "$file" "\"$PLUGIN\" *: *false" && reasons+=("${file#"$project"/} schaltet die Mod ab (enabledPlugins → false)")
  done
  if [ -n "$CLAUDE" ] && [ ${#reasons[@]} -eq 0 ]; then
    status="$(cd "$project" && "$CLAUDE" plugin list 2>/dev/null | grep -A3 "source-control" | grep -c "enabled" || true)"
    [ "${status:-0}" -eq 0 ] && reasons+=("die Mod ist hier nicht aktiv (nur in anderen Ordnern installiert? bash scripts/install-user.sh)")
  fi
  # a command or skill of the project's own named git takes /git
  for own in "$project/.claude/commands/git.md" "$project/.claude/skills/git/SKILL.md"; do
    [ -f "$own" ] && reasons+=("${own#"$project"/} belegt /git schon (eigener Befehl des Projekts)")
  done
  git -C "$project" rev-parse --git-dir >/dev/null 2>&1 || reasons+=("kein Git-Repository: /git geht, die Leiste bleibt weg")

  if [ ${#reasons[@]} -eq 0 ]; then
    ok=$((ok + 1)); echo "✓ $project"
  else
    bad=$((bad + 1)); echo "✗ $project"
    for reason in "${reasons[@]}"; do echo "    $reason"; done
  fi
done

echo
echo "$ok in Ordnung, $bad mit Hinweis."
echo "Sitzungen, die vor der Installation gestartet wurden, sehen die Mod erst nach einem Neustart von Claude Desktop."
echo "Cloud-Sitzungen (claude.ai/code) laden keine Mods – dort gibt es /git nie."

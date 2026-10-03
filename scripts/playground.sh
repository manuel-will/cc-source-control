#!/usr/bin/env bash
# Spielwiese für die Source-Control-Mod: ein Wegwerf-Repo mit eigenem
# "Remote" und einem zweiten Klon, der einen anderen Rechner spielt.
#
#   scripts/playground.sh <szenario>     Repo in einen Zustand versetzen
#   scripts/playground.sh tour [sek]     alle Szenarien nacheinander
#   scripts/playground.sh list           Szenarien auflisten
#
# Claude Code (Desktop oder Terminal) einmal im Ordner "work" öffnen und
# offen lassen; jedes Szenario baut "work" an derselben Stelle neu auf.
# Ort: $SC_PLAYGROUND, sonst ~/sc-playground. Läuft unter macOS, Linux
# und Git Bash (Windows).
set -euo pipefail

ROOT="${SC_PLAYGROUND:-$HOME/sc-playground}"
REMOTE="$ROOT/remote.git"
PC="$ROOT/pc"
WORK="$ROOT/work"

SCENARIOS="clean behind ahead diverged conflict overwrite dirty unpublished stale unfetched offline worktrees detached many merges"

g() { local dir=$1; shift; git -C "$dir" -c commit.gpgsign=false -c core.hooksPath=/dev/null -c core.autocrlf=false -c core.safecrlf=false "$@"; }

# clones without CRLF conversion, so Git for Windows stays quiet
clone() { git -c core.autocrlf=false clone -q -c core.autocrlf=false -c core.safecrlf=false "$1" "$2" 2>/dev/null; }

who() { g "$1" config user.name "$2"; g "$1" config user.email "$2@playground.local"; }

# append a line to a file and commit it
change() { printf '%s\n' "$3" >> "$1/$2"; g "$1" add -A; g "$1" commit -qm "$4"; }

ago() { date -d "-$1 hours" +%Y%m%d%H%M 2>/dev/null || date -v-"$1"H +%Y%m%d%H%M; }

fresh() {
  mkdir -p "$ROOT" "$WORK"
  rm -rf "$REMOTE" "$PC" "$ROOT/work-wt"
  git init -q --bare "$REMOTE"
  git -C "$REMOTE" symbolic-ref HEAD refs/heads/main

  clone "$REMOTE" "$PC"
  who "$PC" pc
  g "$PC" checkout -q -b main
  printf '# Spielwiese\n' > "$PC/README.md"
  printf "console.log('start')\n" > "$PC/app.js"
  g "$PC" add -A
  g "$PC" commit -qm "Initial commit"
  for n in 1 2 3; do change "$PC" "docs.md" "Abschnitt $n" "Doku: Abschnitt $n"; done
  g "$PC" push -q -u origin main 2>/dev/null

  # rebuild work in place, so a session opened in it keeps its folder
  find "$WORK" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  clone "$REMOTE" "$WORK"
  who "$WORK" laptop
  # tells the mod to report what it shows (for automated screenshot runs)
  : > "$WORK/.git/sc-tour"
}

pc_pushes() {
  local count=$1 file=${2:-pc.md} done
  # numbered on from the PC's earlier changes, so no two read the same
  done=$(g "$PC" log --oneline --grep='^PC: ' | wc -l)
  for n in $(seq $((done + 1)) $((done + count))); do change "$PC" "$file" "PC-Zeile $n" "PC: Änderung $n"; done
  g "$PC" push -q 2>/dev/null
}

scenario() {
  case "$1" in
    clean) fresh; g "$WORK" fetch -q ;;
    behind) fresh; pc_pushes 3; g "$WORK" fetch -q ;;
    ahead) fresh; change "$WORK" laptop.md "Laptop 1" "Laptop: Notiz 1"; change "$WORK" laptop.md "Laptop 2" "Laptop: Notiz 2"; g "$WORK" fetch -q ;;
    diverged) fresh; pc_pushes 2; change "$WORK" laptop.md "Laptop" "Laptop: eigene Notiz"; g "$WORK" fetch -q ;;
    conflict) fresh; pc_pushes 1 app.js; change "$WORK" app.js "console.log('laptop')" "Laptop: app.js"; g "$WORK" fetch -q
      g "$WORK" pull -q --no-rebase >/dev/null 2>&1 || true ;;
    overwrite) fresh; pc_pushes 1 app.js; g "$WORK" fetch -q; printf "console.log('lokal')\n" >> "$WORK/app.js" ;;
    dirty) fresh; g "$WORK" fetch -q
      printf 'geändert\n' >> "$WORK/README.md"
      printf 'neu\n' > "$WORK/neu.md"; g "$WORK" add neu.md
      printf 'ungetrackt\n' > "$WORK/notizen.txt"
      g "$WORK" rm -q docs.md ;;
    unpublished) fresh; g "$WORK" checkout -q -b feature/band; change "$WORK" band.md "Band" "Band-Ansicht"; g "$WORK" fetch -q ;;
    stale) fresh; pc_pushes 1; g "$WORK" fetch -q; g "$PC" log -1 >/dev/null
      pc_pushes 3; touch -t "$(ago 30)" "$WORK/.git/FETCH_HEAD" ;;
    unfetched) fresh; pc_pushes 2; rm -f "$WORK/.git/FETCH_HEAD" ;;
    offline) fresh; g "$WORK" fetch -q; g "$WORK" remote set-url origin https://offline.invalid/spielwiese.git
      touch -t "$(ago 30)" "$WORK/.git/FETCH_HEAD" ;;
    worktrees) fresh; g "$WORK" fetch -q
      g "$WORK" worktree add -q "$ROOT/work-wt" -b claude/experiment
      printf 'wip\n' > "$ROOT/work-wt/wip.md"
      printf 'stash me\n' >> "$WORK/README.md"; g "$WORK" stash -q
      g "$WORK" branch -q old-feature ;;
    detached) fresh; g "$WORK" fetch -q; g "$WORK" checkout -q --detach HEAD~1 ;;
    merges) fresh
      # the PC merged a feature branch and pushed; the laptop merged one of
      # its own: both sides of the graph fork and join
      g "$PC" checkout -q -b feature/wissen
      change "$PC" wissen.md "Hub" "Wissen-Hub: Subline"; change "$PC" wissen.md "Hero" "Wissen-Hero: Figurengruppe"
      g "$PC" checkout -q main; change "$PC" seo.md "SEO" "SEO-Report September"
      g "$PC" merge -q --no-ff feature/wissen -m "Merge branch 'feature/wissen'"; g "$PC" push -q 2>/dev/null
      g "$WORK" checkout -q -b claude/cls
      change "$WORK" cls.md "Schrift" "Schrift-Tausch CLS"; change "$WORK" cls.md "Mobil" "CLS Wissensartikel mobil"
      g "$WORK" checkout -q main; change "$WORK" folien.md "Folien" "Schulungsfolien"
      g "$WORK" merge -q --no-ff claude/cls -m "Merge branch 'claude/cls'"; g "$WORK" fetch -q ;;
    many) fresh; pc_pushes 120; change "$WORK" laptop.md "Laptop" "Laptop: eigene Notiz"; g "$WORK" fetch -q ;;
    *) echo "Unbekanntes Szenario: $1 (scripts/playground.sh list)" >&2; exit 1 ;;
  esac

  echo "Szenario '$1' bereit in $WORK"
  git -C "$WORK" status -sb | head -n 6
}

case "${1:-}" in
  ""|list) echo "Szenarien: $SCENARIOS"; echo "Ordner zum Öffnen in Claude Code: $WORK" ;;
  tour)
    for name in $SCENARIOS; do
      scenario "$name"
      if [ -n "${2:-}" ]; then sleep "$2"; else read -r -p "Enter für das nächste Szenario … " _; fi
    done ;;
  *) scenario "$1" ;;
esac

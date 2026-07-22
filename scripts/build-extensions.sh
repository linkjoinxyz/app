#!/bin/bash
# Package the browser extensions for the Chrome Web Store / AMO.
#
# There is no bundler: the source directory IS the extension, so packaging is a
# copy of the runtime files. That makes it easy to ship a broken package by
# omitting a file, which has nearly happened: the previously committed
# linkjoin-extension.zip predated lib/scheduling.js, and a naive re-zip after
# that extraction would have shipped a background.js whose very first line is
# `import ... from './lib/scheduling.js'` with the file absent. A module import
# of a missing file kills the whole service worker at load.
#
# So this verifies the package before writing it:
#   - every file the manifest names exists inside the package
#   - every relative import in every packaged .js resolves inside the package
#   - no scaffold placeholders survived
#
#   ./scripts/build-extensions.sh          → dist/linkjoin-{chrome,firefox}-<ver>.zip
set -uo pipefail

cd "$(dirname "$0")/.."
OUT="dist"
mkdir -p "$OUT"

# Runtime files only. Deliberately excludes node_modules, package.json,
# package-lock.json, tests/, vitest.config.js and docs/, none of which the
# browser loads and some of which are large.
INCLUDE=(
  manifest.json background.js content.js content.css lj-detect.js lj-auth-sync.js
  popup.html popup.css popup.js premeet.html premeet.js
  offscreen.html offscreen.js icons lib
)

build() {
  local src="$1" label="$2"
  [ -d "$src" ] || { echo "skip $label (no $src)"; return 0; }

  local ver stage errs
  ver=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$src/manifest.json" | head -1)
  stage=$(mktemp -d)
  errs=$(mktemp)

  echo "$label v$ver"
  for item in "${INCLUDE[@]}"; do
    [ -e "$src/$item" ] && cp -R "$src/$item" "$stage/"
  done

  # 1. Everything the manifest names must be present. Strips the leading "/"
  #    Chrome allows on icon paths.
  while read -r ref; do
    [ -z "$ref" ] && continue
    [ -e "$stage/$ref" ] || echo "manifest references missing file: $ref" >> "$errs"
  done < <(grep -oE '"[^"]+\.(js|css|html|png)"' "$src/manifest.json" 2>/dev/null | tr -d '"' | sed 's|^/||' | sort -u)

  # 2. Every relative import must resolve inside the package. This is the check
  #    that would have caught a missing lib/scheduling.js.
  while IFS= read -r js; do
    local rel dir
    rel="${js#"$stage"/}"
    dir=$(dirname "$rel")
    while read -r imp; do
      [ -z "$imp" ] && continue
      local resolved
      if [ "$dir" = "." ]; then resolved="$stage/$imp"; else resolved="$stage/$dir/$imp"; fi
      [ -f "$resolved" ] || echo "$rel imports missing file: ./$imp" >> "$errs"
    done < <(grep -oE "from[[:space:]]+['\"]\./[^'\"]+['\"]" "$js" 2>/dev/null | sed -E "s/.*['\"]\.\/([^'\"]+)['\"]/\1/")
  done < <(find "$stage" -name '*.js')

  # 3. No scaffold placeholders. A REPLACE_WITH client id silently disables
  #    Google sign-in with nothing surfaced to the user.
  if grep -rqE 'REPLACE_WITH|YOUR_[A-Z_]+_HERE' "$stage" 2>/dev/null; then
    echo "placeholder value found in packaged files" >> "$errs"
  fi

  if [ -s "$errs" ]; then
    sed 's/^/  ERROR: /' "$errs" >&2
    echo "  NOT PACKAGED — fix the errors above" >&2
    rm -rf "$stage" "$errs"
    return 1
  fi

  local zip_path="$PWD/$OUT/linkjoin-$label-$ver.zip"
  rm -f "$zip_path"
  ( cd "$stage" && zip -qr "$zip_path" . -x '.*' -x '__MACOSX' )
  local n sz
  n=$(unzip -l "$zip_path" | tail -1 | awk '{print $2}')
  sz=$(du -h "$zip_path" | cut -f1 | tr -d ' ')
  rm -rf "$stage" "$errs"
  echo "  $OUT/linkjoin-$label-$ver.zip  ($n files, $sz)"
}

rc=0
build linkjoin-extension chrome || rc=1
build linkjoin-extension-firefox firefox || rc=1
exit $rc

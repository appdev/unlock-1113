#!/usr/bin/env bash
set -euo pipefail

version="${1:?Usage: bash scripts/upload-draft-release.sh <tag> <artifacts...>}"
shift
test "$#" -gt 0
for artifact in "$@"; do
  test -f "$artifact"
done

if ! gh release view "$version" >/dev/null 2>&1; then
  gh release create "$version" --target "$GITHUB_SHA" --draft --title "$version"
fi

release=$(gh release view "$version" --json isDraft,targetCommitish --jq '[.isDraft, .targetCommitish] | @tsv')
if [[ "$release" != $'true\t'"$GITHUB_SHA" ]]; then
  echo "Release $version must be a draft for this workflow's commit." >&2
  exit 1
fi

gh release upload "$version" "$@" --clobber

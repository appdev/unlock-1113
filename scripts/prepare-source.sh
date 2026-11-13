#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
destination="${1:?Usage: bash scripts/prepare-source.sh <new-directory> [local-upstream-repository]}"
upstream="${2:-https://github.com/siyuan-note/siyuan.git}"
version=v3.8.9
commit=d3af9d5782082b379d45a69eedf4ebcfe8ba6889

if [[ -e "$destination" || -L "$destination" ]]; then
  echo "Source destination already exists: $destination" >&2
  exit 1
fi

git clone --no-local --branch "$version" --depth 1 -- "$upstream" "$destination"
test "$(git -C "$destination" rev-parse HEAD)" = "$commit"
for patch in disable-update default-config mock-vip-user hide-account-entry first-launch-notice managed-s3; do
  git -C "$destination" apply "$repo/patches/siyuan/$patch.patch"
done

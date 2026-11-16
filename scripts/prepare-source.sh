#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
destination="${1:?Usage: bash scripts/prepare-source.sh <new-directory> [local-upstream-repository]}"
upstream="${2:-https://github.com/siyuan-note/siyuan.git}"
version=v3.8.9
commit=d3af9d5782082b379d45a69eedf4ebcfe8ba6889
release_tag="${QINGYU_RELEASE_TAG:-$version}"

if [[ "$release_tag" != "$version" ]]; then
  revision="${release_tag#"$version"-}"
  revision="${revision#qingyu.}"
  if [[ "$release_tag" != "$version"-* || ! "$revision" =~ ^[1-9][0-9]*$ ]]; then
    echo "Expected $version, $version-<revision>, or $version-qingyu.<revision>." >&2
    exit 1
  fi
fi

if [[ -e "$destination" || -L "$destination" ]]; then
  echo "Source destination already exists: $destination" >&2
  exit 1
fi

# Apply against the upstream Git blobs before platform checkout filters run.
git clone --config core.autocrlf=false --no-checkout --no-local --branch "$version" --depth 1 -- "$upstream" "$destination"
test "$(git -C "$destination" rev-parse HEAD)" = "$commit"
git -C "$destination" read-tree HEAD
for patch in disable-update default-config mock-vip-user hide-account-entry first-launch-notice managed-s3; do
  patch_path="$repo/patches/siyuan/$patch.patch"
  sed 's/\r$//' "$patch_path" | git -C "$destination" apply --cached
done
git -C "$destination" checkout-index --all

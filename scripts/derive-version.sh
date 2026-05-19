#!/usr/bin/env bash
set -euo pipefail

SEMVER_TAG_RE='^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
CONFIG_PATH="${TAURI_VERSION_CONFIG:-.github/generated/tauri-version.json}"

is_semver_tag() {
  [[ "$1" =~ $SEMVER_TAG_RE ]]
}

normalize_tag() {
  local tag="$1"
  if [[ "$tag" == v* ]]; then
    printf '%s\n' "${tag#v}"
  else
    printf '%s\n' "$tag"
  fi
}

append_unique() {
  local value="$1"
  shift

  local existing
  for existing in "$@"; do
    if [[ "$existing" == "$value" ]]; then
      return 1
    fi
  done

  return 0
}

find_nearest_semver_tag() {
  local nearest_tag=""
  local nearest_distance=""
  local tag
  local distance

  while IFS= read -r tag; do
    if ! is_semver_tag "$tag"; then
      continue
    fi

    if ! git merge-base --is-ancestor "$tag" HEAD; then
      continue
    fi

    distance="$(git rev-list --count "${tag}..HEAD")"
    if [[ -z "$nearest_distance" || "$distance" -lt "$nearest_distance" ]]; then
      nearest_tag="$tag"
      nearest_distance="$distance"
    fi
  done < <(git tag --list)

  printf '%s\n' "$nearest_tag"
}

short_sha="$(git rev-parse --short=7 HEAD)"
ref_type="${GITHUB_REF_TYPE:-}"
ref_name="${GITHUB_REF_NAME:-}"
version=""
base_version=""
source_tag=""
distance=""

if [[ "$ref_type" == "tag" ]]; then
  if ! is_semver_tag "$ref_name"; then
    printf 'error: tag "%s" is not a valid SemVer release tag. Expected X.Y.Z or vX.Y.Z.\n' "$ref_name" >&2
    exit 1
  fi

  source_tag="$ref_name"
  version="$(normalize_tag "$source_tag")"
  base_version="$version"
  distance="0"
else
  head_tags=()
  while IFS= read -r tag; do
    head_tags+=("$tag")
  done < <(git tag --points-at HEAD)

  normalized_head_tags=()
  tag=""

  for tag in "${head_tags[@]}"; do
    if ! is_semver_tag "$tag"; then
      continue
    fi

    normalized_tag="$(normalize_tag "$tag")"
    if [[ "${#normalized_head_tags[@]}" -eq 0 ]] || append_unique "$normalized_tag" "${normalized_head_tags[@]}"; then
      normalized_head_tags+=("$normalized_tag")
      source_tag="$tag"
    fi
  done

  if [[ "${#normalized_head_tags[@]}" -gt 1 ]]; then
    printf 'error: HEAD has multiple distinct SemVer tags: %s\n' "${normalized_head_tags[*]}" >&2
    exit 1
  fi

  if [[ "${#normalized_head_tags[@]}" -eq 1 ]]; then
    version="${normalized_head_tags[0]}"
    base_version="$version"
    distance="0"
  else
    source_tag="$(find_nearest_semver_tag)"
    if [[ -n "$source_tag" ]]; then
      base_version="$(normalize_tag "$source_tag")"
      distance="$(git rev-list --count "${source_tag}..HEAD")"
    else
      base_version="0.0.0"
      distance="$(git rev-list --count HEAD)"
    fi

    version="${base_version}-dev.${distance}.g${short_sha}"
  fi
fi

mkdir -p "$(dirname "$CONFIG_PATH")"
cat > "$CONFIG_PATH" <<JSON
{
  "version": "$version"
}
JSON

printf 'Derived version: %s\n' "$version"
printf 'Tauri version config: %s\n' "$CONFIG_PATH"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'version=%s\n' "$version"
    printf 'base_version=%s\n' "$base_version"
    printf 'distance=%s\n' "$distance"
    printf 'short_sha=%s\n' "$short_sha"
    printf 'source_tag=%s\n' "$source_tag"
    printf 'config_path=%s\n' "$CONFIG_PATH"
  } >> "$GITHUB_OUTPUT"
fi

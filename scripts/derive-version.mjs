#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const semverTagPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const configPath = process.env.TAURI_VERSION_CONFIG ?? ".github/generated/tauri-version.json";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitLines(args) {
  const output = git(args);
  return output === "" ? [] : output.split(/\r?\n/);
}

function isSemverTag(tag) {
  return semverTagPattern.test(tag);
}

function normalizeTag(tag) {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

function isAncestor(tag) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", tag, "HEAD"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function countCommits(range) {
  return Number(git(["rev-list", "--count", range]));
}

function unique(values) {
  return [...new Set(values)];
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function findNearestSemverTag() {
  let nearestDistance = null;
  const nearestTags = [];

  for (const tag of gitLines(["tag", "--list"])) {
    if (!isSemverTag(tag) || !isAncestor(tag)) {
      continue;
    }

    const distance = countCommits(`${tag}..HEAD`);
    if (nearestDistance === null || distance < nearestDistance) {
      nearestDistance = distance;
      nearestTags.length = 0;
      nearestTags.push(tag);
    } else if (distance === nearestDistance) {
      nearestTags.push(tag);
    }
  }

  const normalizedTags = unique(nearestTags.map(normalizeTag));
  if (normalizedTags.length > 1) {
    fail(`nearest SemVer tag is ambiguous: ${normalizedTags.join(", ")}`);
  }

  return nearestTags[0] ?? "";
}

const shortSha = git(["rev-parse", "--short=7", "HEAD"]);
const refType = process.env.GITHUB_REF_TYPE ?? "";
const refName = process.env.GITHUB_REF_NAME ?? "";

let version = "";
let baseVersion = "";
let sourceTag = "";
let distance = "";

if (refType === "tag") {
  if (!isSemverTag(refName)) {
    fail(`tag "${refName}" is not a valid SemVer release tag. Expected X.Y.Z or vX.Y.Z.`);
  }

  sourceTag = refName;
  version = normalizeTag(sourceTag);
  baseVersion = version;
  distance = "0";
} else {
  const headTags = gitLines(["tag", "--points-at", "HEAD"]).filter(isSemverTag);
  const normalizedHeadTags = unique(headTags.map(normalizeTag));

  if (normalizedHeadTags.length > 1) {
    fail(`HEAD has multiple distinct SemVer tags: ${normalizedHeadTags.join(", ")}`);
  }

  if (normalizedHeadTags.length === 1) {
    sourceTag = headTags[0];
    version = normalizedHeadTags[0];
    baseVersion = version;
    distance = "0";
  } else {
    sourceTag = findNearestSemverTag();

    if (sourceTag !== "") {
      baseVersion = normalizeTag(sourceTag);
      distance = String(countCommits(`${sourceTag}..HEAD`));
    } else {
      baseVersion = "0.0.0";
      distance = String(countCommits("HEAD"));
    }

    version = `${baseVersion}-dev.${distance}.g${shortSha}`;
  }
}

mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(configPath, `${JSON.stringify({ version }, null, 2)}\n`);

console.log(`Derived version: ${version}`);
console.log(`Tauri version config: ${configPath}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `version=${version}`,
      `base_version=${baseVersion}`,
      `distance=${distance}`,
      `short_sha=${shortSha}`,
      `source_tag=${sourceTag}`,
      `config_path=${configPath}`,
      "",
    ].join("\n"),
  );
}

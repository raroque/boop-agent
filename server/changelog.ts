import express from "express";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const DEFAULT_BRANCH = "main";
const CACHE_TTL_MS = 60_000;

type ChangelogSource = "github-changelog" | "github-releases" | "local-changelog";

interface ChangelogPayload {
  repo: string;
  branch: string;
  version: string;
  source: ChangelogSource;
  url: string | null;
  fetchedAt: string;
  markdown: string;
  warning?: string;
}

let cache: { at: number; payload: ChangelogPayload } | null = null;

function repoFromRemote(remote: string | null): string | null {
  if (!remote) return null;
  const normalized = remote.trim().replace(/\.git$/, "");
  const match = normalized.match(/github\.com[:/]([^/\s]+\/[^/\s]+)$/);
  return match?.[1] ?? null;
}

function getOriginRepo(): string | null {
  if (process.env.BOOP_GITHUB_REPO) return process.env.BOOP_GITHUB_REPO;
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return repoFromRemote(remote);
  } catch {
    return null;
  }
}

async function getPackageVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function githubHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "boop-debug-dashboard",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function githubReleasesMarkdown(repo: string): Promise<{ markdown: string; url: string }> {
  const apiUrl = `https://api.github.com/repos/${repo}/releases?per_page=10`;
  const releases = await fetchJson<
    Array<{
      name?: string | null;
      tag_name: string;
      published_at?: string | null;
      body?: string | null;
      html_url: string;
    }>
  >(apiUrl);
  if (!releases.length) throw new Error("No GitHub releases found");

  const markdown = [
    "# Releases",
    "",
    ...releases.flatMap((release) => [
      `## ${release.name || release.tag_name}`,
      release.published_at ? `Published ${release.published_at.slice(0, 10)}` : "",
      "",
      release.body?.trim() || "_No release notes provided._",
      "",
    ]),
  ].join("\n");

  return { markdown, url: `https://github.com/${repo}/releases` };
}

async function localChangelog(): Promise<string> {
  return await readFile(resolve(root, "CHANGELOG.md"), "utf8");
}

async function loadChangelog(): Promise<ChangelogPayload> {
  const repo = getOriginRepo();
  const branch = process.env.BOOP_GITHUB_BRANCH ?? DEFAULT_BRANCH;
  const version = await getPackageVersion();
  const fetchedAt = new Date().toISOString();

  if (!repo) {
    return {
      repo: "local",
      branch,
      version,
      source: "local-changelog",
      url: null,
      fetchedAt,
      markdown: await localChangelog(),
      warning: "GitHub repository unavailable; using local changelog.",
    };
  }

  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/CHANGELOG.md`;

  try {
    return {
      repo,
      branch,
      version,
      source: "github-changelog",
      url: `https://github.com/${repo}/blob/${branch}/CHANGELOG.md`,
      fetchedAt,
      markdown: await fetchText(rawUrl),
    };
  } catch (changelogErr) {
    try {
      const releases = await githubReleasesMarkdown(repo);
      return {
        repo,
        branch,
        version,
        source: "github-releases",
        url: releases.url,
        fetchedAt,
        markdown: releases.markdown,
        warning: `CHANGELOG.md was not available on GitHub: ${String(changelogErr)}`,
      };
    } catch (releasesErr) {
      return {
        repo,
        branch,
        version,
        source: "local-changelog",
        url: null,
        fetchedAt,
        markdown: await localChangelog(),
        warning: `GitHub fetch failed: ${String(changelogErr)}; releases failed: ${String(releasesErr)}`,
      };
    }
  }
}

export function createChangelogRouter(): express.Router {
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const refresh = req.query.refresh === "true";
      if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
        res.json(cache.payload);
        return;
      }

      const payload = await loadChangelog();
      cache = { at: Date.now(), payload };
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

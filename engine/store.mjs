import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataDir = path.join(root, "data");
export const historyPath = path.join(dataDir, "history.jsonl");
export const latestPath = path.join(dataDir, "latest.json");
export const advicePath = path.join(dataDir, "advice.json");
export const statePath = path.join(dataDir, "state.json");

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeLatest(snapshot) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(latestPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}

export async function writeAdvice(advice) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(advicePath, JSON.stringify(advice, null, 2) + "\n", "utf8");
}

export async function appendHistory(snapshot) {
  await mkdir(dataDir, { recursive: true });
  const line = JSON.stringify(snapshot) + "\n";
  try {
    const prev = await readFile(historyPath, "utf8");
    await writeFile(historyPath, prev + line, "utf8");
  } catch {
    await writeFile(historyPath, line, "utf8");
  }
}

export async function readHistory() {
  try {
    const text = await readFile(historyPath, "utf8");
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export async function writeHistory(snapshots) {
  await mkdir(dataDir, { recursive: true });
  const body =
    snapshots.map((row) => JSON.stringify(row)).join("\n") +
    (snapshots.length ? "\n" : "");
  await writeFile(historyPath, body, "utf8");
}

export async function readState() {
  return (await readJson(statePath, {})) ?? {};
}

export async function writeState(state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

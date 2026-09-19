import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeKey } from "./lib-sentences.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestFile = path.join(here, "data", "sentences.json");
const cacheFile = path.join(here, "data", "translations.json");

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};

const unique = new Map();
for (const record of Object.values(manifest)) {
  for (const sentence of record.sentences) {
    const key = normalizeKey(sentence);
    if (key && !cache[key] && !unique.has(key)) unique.set(key, sentence.trim());
  }
}
let queue = [...unique.entries()];
console.log(`pending unique sentences: ${queue.length}`);

const BATCH = 40;
const PACE_MS = 1000;
const hasCJK = (text) => /[㐀-鿿]/.test(text);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let consecutiveErrors = 0;
let circuitOpenUntil = 0;

async function translateDisroot(texts) {
  const res = await fetch("https://translate.disroot.org/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: texts, source: "en", target: "zh", format: "text" }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`disroot ${res.status}`);
  const data = await res.json();
  const out = Array.isArray(data?.translatedText) ? data.translatedText : [];
  if (out.length !== texts.length) throw new Error(`disroot shape ${out.length}/${texts.length}`);
  return out;
}

async function translateGoogle(text) {
  const res = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: "q=" + encodeURIComponent(text),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = await res.json();
  const out = (data?.[0] || []).map((chunk) => chunk?.[0] || "").join("");
  if (!out) throw new Error("google empty");
  return out;
}

let done = 0;
let failedKeys = [];

function save() {
  fs.writeFileSync(cacheFile, JSON.stringify(cache), "utf8");
}

async function runBatch(chunk) {
  const circuitOpen = Date.now() < circuitOpenUntil;
  if (!circuitOpen) {
    try {
      const results = await translateDisroot(chunk.map(([, text]) => text));
      let okCount = 0;
      chunk.forEach(([key], index) => {
        const zh = results[index];
        if (zh && (hasCJK(zh) || zh === chunk[index][1])) {
          cache[key] = zh;
          okCount++;
        } else {
          failedKeys.push([key, chunk[index][1]]);
        }
      });
      done += chunk.length;
      consecutiveErrors = 0;
      if (okCount < chunk.length) await retryWithGoogle();
      return;
    } catch (error) {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        const cooldown = Math.min(5 * 60 * 1000, 20000 * 2 ** Math.floor(consecutiveErrors / 3 - 1));
        circuitOpenUntil = Date.now() + cooldown;
        console.log(`disroot failing (${error.message}); cooling down ${cooldown / 1000}s before google fallback`);
      }
    }
  }
  // google one-by-one (slow lane)
  for (const [key, text] of chunk) {
    try {
      const zh = await translateGoogle(text);
      if (zh && hasCJK(zh)) cache[key] = zh;
      else failedKeys.push([key, text]);
    } catch (error) {
      failedKeys.push([key, text]);
      await sleep(2000);
    }
    await sleep(400);
  }
  done += chunk.length;
}

async function retryWithGoogle() {
  const retry = failedKeys;
  failedKeys = [];
  for (const [key, text] of retry) {
    try {
      const zh = await translateGoogle(text);
      if (zh && hasCJK(zh)) cache[key] = zh;
      else failedKeys.push([key, text]);
    } catch {
      failedKeys.push([key, text]);
    }
    await sleep(300);
  }
}

while (queue.length) {
  const chunk = queue.slice(0, BATCH);
  queue = queue.slice(BATCH);
  await runBatch(chunk);
  if (done % 400 < BATCH) {
    save();
    console.log(`progress ${done} cached=${Object.keys(cache).length} pendingFail=${failedKeys.length}`);
  }
  await sleep(PACE_MS);
}

save();
if (failedKeys.length) {
  fs.writeFileSync(path.join(here, "data", "translations-failed.json"), JSON.stringify(failedKeys.map(([key]) => key), null, 1), "utf8");
}
console.log(`finished: cached=${Object.keys(cache).length} failed=${failedKeys.length}`);
if (failedKeys.length) console.log("rerun this script to retry the failures");

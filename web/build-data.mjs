import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSentences, normalizeKey } from "./lib-sentences.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(scriptDir, "../resources");
const output = path.resolve(scriptDir, "dist/data.js");
const dataDir = path.resolve(scriptDir, "data");
const timestampsFile = path.join(dataDir, "timestamps.json");
const metaFile = path.join(dataDir, "timestamps-meta.json");
const translationsFile = path.join(dataDir, "translations.json");
const manifestFile = path.join(dataDir, "sentences.json");

const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {});
const timestamps = readJson(timestampsFile);
const timingMeta = readJson(metaFile);
const translations = readJson(translationsFile);

const dirs = fs.readdirSync(sourceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^CET6_\d{4}\.\d{2}$/.test(entry.name))
  .sort((a, b) => b.name.localeCompare(a.name));

const records = [];
const manifest = {};

// These upstream files are mislabeled. ASR sampling confirms that set 1 and
// set 2 are swapped, so pair them by content instead of filename.
const audioOverrides = {
  "cet6_2023.12_set1": "CET6_2023.12_set2_listening.mp3",
  "cet6_2023.12_set2": "CET6_2023.12_set1_listening.mp3",
  "cet6_2025.06_set1": "CET6_2025.06_set2_listening.mp3",
  "cet6_2025.06_set2": "CET6_2025.06_set1_listening.mp3",
};

function parseQuiz(questionText, answerText) {
  const answerMap = {};
  for (const match of answerText.matchAll(/^\s*(\d+)\.\s*([A-D])\b/gm)) answerMap[Number(match[1])] = match[2];
  const quiz = [];
  const blocks = [...questionText.matchAll(/(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=\n\s*\d+\.\s|$)/g)];
  for (const block of blocks) {
    const number = Number(block[1]);
    const options = [...block[2].matchAll(/(?:^|\n)\s*([A-D])\)\s*([\s\S]*?)(?=\n\s*[A-D]\)\s|$)/g)]
      .map((match) => ({ letter: match[1], text: match[2].replace(/\s+/g, " ").trim() }));
    if (options.length >= 2) quiz.push({ number, options, correct: answerMap[number] || "" });
  }
  return quiz;
}
for (const dir of dirs) {
  const folder = path.join(sourceRoot, dir.name);
  const files = fs.readdirSync(folder);
  const transcripts = files.filter((name) => /_transcript\.md$/i.test(name)).sort();
  for (const transcriptFile of transcripts) {
    const id = transcriptFile.replace(/_transcript\.md$/i, "");
    const normalizedId = id.toLowerCase();
    const overrideFile = audioOverrides[normalizedId];
    const audioFile = overrideFile && files.includes(overrideFile) ? overrideFile : files.find((name) => {
      const base = name.replace(/_listening\.(mp3|m4a)$/i, "").toLowerCase();
      return /\.(mp3|m4a)$/i.test(name) && base === normalizedId;
    });
    if (!audioFile) continue;
    const stemFile = files.find((name) => name.toLowerCase() === `${normalizedId}_q_stem.txt`);
    const answerFile = files.find((name) => name.toLowerCase() === `${normalizedId}_q_answer.txt`);
    const setMatch = id.match(/set(\d+)/i);
    const questionText = stemFile ? fs.readFileSync(path.join(folder, stemFile), "utf8") : "暂无题干资料。";
    const answerText = answerFile ? fs.readFileSync(path.join(folder, answerFile), "utf8") : "暂无答案资料。";
    const transcript = fs.readFileSync(path.join(folder, transcriptFile), "utf8");
    const sentenceList = parseSentences(transcript);
    const meta = timingMeta[normalizedId];
    const ts = meta?.method === "estimated" ? [] : (timestamps[normalizedId] || []);
    records.push({
      id: normalizedId,
      session: dir.name.replace("CET6_", ""),
      set: setMatch ? Number(setMatch[1]) : 1,
      audio: `../../resources/${dir.name}/${audioFile}`,
      transcript,
      questions: questionText,
      answers: answerText,
      quiz: parseQuiz(questionText, answerText),
      timing: timingMeta[normalizedId] || null,
      sentences: sentenceList.map((sentence, index) => ({
        speaker: sentence.speaker,
        section: sentence.section,
        text: sentence.text,
        start: ts[index]?.[0] ?? null,
        end: ts[index]?.[1] ?? null,
        zh: translations[normalizeKey(sentence.text)] || "",
      })),
    });
    manifest[normalizedId] = {
      audio: path.relative(dataDir, path.join(sourceRoot, dir.name, audioFile)).replace(/\\/g, "/"),
      sentences: sentenceList.map((sentence) => sentence.text),
    };
  }
}

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(output, `window.CET6_DATA = ${JSON.stringify(records)};\n`, "utf8");
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1), "utf8");

const sentenceCount = records.reduce((sum, record) => sum + record.sentences.length, 0);
const timedCount = records.reduce((sum, record) => sum + record.sentences.filter((sentence) => sentence.start != null).length, 0);
const zhCount = records.reduce((sum, record) => sum + record.sentences.filter((sentence) => sentence.zh).length, 0);
const estimated = records.filter((record) => record.timing?.method === "estimated").map((record) => record.id);
console.log(JSON.stringify({ records: records.length, sentences: sentenceCount, withTimestamps: timedCount, withTranslation: zhCount, estimated, output }));

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(scriptDir, "../resources");
const output = path.resolve(scriptDir, "dist/data.js");

const dirs = fs.readdirSync(sourceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^CET6_\d{4}\.\d{2}$/.test(entry.name))
  .sort((a, b) => b.name.localeCompare(a.name));

const records = [];

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
    const audioFile = files.find((name) => {
      const base = name.replace(/_listening\.(mp3|m4a)$/i, "").toLowerCase();
      return /\.(mp3|m4a)$/i.test(name) && base === normalizedId;
    });
    if (!audioFile) continue;
    const stemFile = files.find((name) => name.toLowerCase() === `${normalizedId}_q_stem.txt`);
    const answerFile = files.find((name) => name.toLowerCase() === `${normalizedId}_q_answer.txt`);
    const setMatch = id.match(/set(\d+)/i);
    const questionText = stemFile ? fs.readFileSync(path.join(folder, stemFile), "utf8") : "暂无题干资料。";
    const answerText = answerFile ? fs.readFileSync(path.join(folder, answerFile), "utf8") : "暂无答案资料。";
    records.push({
      id: normalizedId,
      session: dir.name.replace("CET6_", ""),
      set: setMatch ? Number(setMatch[1]) : 1,
      audio: `../../resources/${dir.name}/${audioFile}`,
      transcript: fs.readFileSync(path.join(folder, transcriptFile), "utf8"),
      questions: questionText,
      answers: answerText,
      quiz: parseQuiz(questionText, answerText),
    });
  }
}

fs.writeFileSync(output, `window.CET6_DATA = ${JSON.stringify(records)};\n`, "utf8");
console.log(JSON.stringify({ records: records.length, output }));

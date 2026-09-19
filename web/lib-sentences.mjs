const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "inc", "ltd", "jr", "sr",
  "co", "corp", "u.s", "u.n", "d.c", "a.m", "p.m", "no", "nos", "fig", "vol",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "approx", "e.g", "i.e",
]);

const BLOCK_HEADER = /^\s*(conversation|passage|recording|lecture|talk|report|mini-lecture)\b/i;

export function normalizeKey(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function splitSentences(text) {
  const clean = text.replace(/\[\d+\]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  const out = [];
  let current = [];
  for (let i = 0; i < words.length; i++) {
    current.push(words[i]);
    const stripped = words[i].replace(/[)"'\]]+$/, "");
    if (!/[.!?]$/.test(stripped)) continue;
    const core = stripped.toLowerCase().replace(/\.$/, "");
    if (ABBREVIATIONS.has(core) || core.length <= 1) continue;
    const next = words[i + 1];
    if (next && !/^["'\(\[]?[A-Z0-9“‘]/.test(next)) continue;
    out.push(current.join(" "));
    current = [];
  }
  if (current.length) out.push(current.join(" "));
  return out.filter((s) => /[a-zA-Z]{2}/.test(s));
}

export function parseSentences(transcript) {
  const lines = String(transcript).split(/\r?\n/);
  const blocks = [];
  let section = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^<!--/.test(line)) continue;
    if (/^#/.test(line)) {
      const heading = line.replace(/^#+\s*/, "").trim();
      if (BLOCK_HEADER.test(heading)) section = heading;
      continue;
    }
    const speaker = line.match(/^([WM]):\s*(.*)$/);
    if (speaker) {
      if (speaker[2].trim()) blocks.push({ speaker: speaker[1], section, text: speaker[2].trim() });
    } else if (blocks.length && blocks[blocks.length - 1].section === section) {
      // wrapped continuation inside the same section
      blocks[blocks.length - 1].text += " " + line;
    } else {
      blocks.push({ speaker: "", section, text: line });
    }
  }
  const sentences = [];
  for (const block of blocks) {
    for (const text of splitSentences(block.text)) {
      sentences.push({ speaker: block.speaker, section: block.section, text });
    }
  }
  return sentences;
}

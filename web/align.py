"""Generate per-sentence audio timestamps by aligning transcripts to ASR word timings."""
import argparse
import difflib
import json
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "data" / "sentences.json"
OUTPUT = HERE / "data" / "timestamps.json"
META_OUTPUT = HERE / "data" / "timestamps-meta.json"

PUNCT_RE = re.compile(r"[^a-z0-9']")


def norm_token(word: str) -> str:
    return PUNCT_RE.sub("", word.lower().replace("\u2019", "'"))


def sentence_tokens(text: str):
    return [t for t in (norm_token(w) for w in text.split()) if t]


def raw_anchors(sentences, words):
    """Anchor each sentence via contiguously matched ASR word runs (min run length filters noise)."""
    left = []
    owner = []
    for i, text in enumerate(sentences):
        for token in sentence_tokens(text):
            left.append(token)
            owner.append(i)
    right = [w[0] for w in words]

    starts, ends = {}, {}
    if left and right:
        matcher = difflib.SequenceMatcher(a=left, b=right, autojunk=False)
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag != "equal":
                continue
            run = i2 - i1
            if run < (2 if len(sentence_tokens(sentences[owner[i1]])) <= 4 else 3):
                continue
            for offset in range(run):
                s_idx = owner[i1 + offset]
                token_start, token_end = words[j1 + offset][1], words[j1 + offset][2]
                starts[s_idx] = min(starts.get(s_idx, 1e9), token_start)
                ends[s_idx] = max(ends.get(s_idx, -1), token_end)
    return starts, ends


def filter_anchors(sentences, starts, ends):
    """Keep anchors that are monotonic and physically plausible; return dict of [start, end]."""
    kept = {}
    last_start = -1.0
    for i in range(len(sentences)):
        if i not in starts or i not in ends or ends[i] <= starts[i]:
            continue
        if starts[i] < last_start + 0.4:
            continue
        words = max(1, len(sentence_tokens(sentences[i])))
        dur = ends[i] - starts[i]
        if words >= 4 and (words / dur > 4.5 or dur < 0.7):
            continue
        kept[i] = [starts[i], ends[i]]
        last_start = starts[i]
    return kept


def interpolate(sentences, kept, duration):
    result = [None] * len(sentences)
    for i, span in kept.items():
        result[i] = list(span)
    i = 0
    while i < len(result):
        if result[i] is None:
            j = i
            while j < len(result) and result[j] is None:
                j += 1
            anchor_before = result[i - 1][1] if i > 0 and result[i - 1] else 0.0
            anchor_after = result[j][0] if j < len(result) and result[j] else duration
            anchor_after = max(anchor_after, anchor_before + 1.0)
            run = list(range(i, j))
            counts = [max(1, len(sentence_tokens(sentences[k]))) for k in run]
            total = sum(counts)
            span = anchor_after - anchor_before
            pos = anchor_before
            for k, count in zip(run, counts):
                est = span * count / total
                start = pos
                end = min(pos + est, anchor_after - 0.1)
                result[k] = [round(start, 2), round(max(end, start + 0.8), 2)]
                pos = end
            i = j
        else:
            i += 1
    prev_start = -1.0
    for item in result:
        start = max(item[0], prev_start + 0.4)
        end = max(item[1], start + 0.8)
        item[0], item[1] = round(start, 2), round(end, 2)
        prev_start = start
    return result


def proportional_estimates(sentences, duration):
    counts = [max(1, len(sentence_tokens(s))) for s in sentences]
    total = sum(counts)
    result = []
    pos = 0.0
    for count in counts:
        est = duration * count / total
        result.append([round(pos, 2), round(max(pos + est, pos + 0.8), 2)])
        pos += est
    return result


def transcribe(model, audio_path):
    segments, _ = model.transcribe(
        str(audio_path),
        language="en",
        beam_size=1,
        condition_on_previous_text=False,
        word_timestamps=True,
        vad_filter=False,
    )
    words = []
    for segment in segments:
        for word in segment.words or []:
            token = norm_token(word.word)
            if token:
                words.append((token, word.start, word.end))
    return words


def align_entry(model_name, model, entry):
    sentences = entry["sentences"]
    audio_path = Path(entry["audio"])
    if not audio_path.is_absolute():
        audio_path = (MANIFEST.parent / audio_path).resolve()
    words = transcribe(model, audio_path)
    duration = words[-1][2] if words else 0
    starts, ends = raw_anchors(sentences, words)
    kept = filter_anchors(sentences, starts, ends)
    frac = len(kept) / max(1, len(sentences))
    return sentences, words, kept, frac, duration


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="base")
    parser.add_argument("--fallback-model", default="small")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--only", default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    done = json.loads(OUTPUT.read_text(encoding="utf8")) if OUTPUT.exists() else {}
    meta = json.loads(META_OUTPUT.read_text(encoding="utf8")) if META_OUTPUT.exists() else {}
    ids = args.only.split(",") if args.only else list(manifest)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("faster_whisper not installed in this interpreter")

    def load_model(name):
        for attempt in range(2):
            try:
                return WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=16)
            except Exception as error:
                if attempt == 1:
                    raise
                os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
                print(f"model download failed ({error}); retrying via hf-mirror", flush=True)

    models = {}
    for record_id in ids:
        entry = manifest[record_id]
        if record_id in done and not args.force:
            continue
        started = time.time()
        models.setdefault(args.model, load_model(args.model))
        sentences, words, kept, frac, duration = align_entry(args.model, models[args.model], entry)
        method = args.model
        if frac < args.threshold and args.fallback_model and args.fallback_model != args.model:
            print(f"  {record_id}: {frac:.0%} anchored with {args.model}, retrying with {args.fallback_model}", flush=True)
            models.setdefault(args.fallback_model, load_model(args.fallback_model))
            s2, w2, kept2, frac2, dur2 = align_entry(args.fallback_model, models[args.fallback_model], entry)
            if frac2 > frac:
                sentences, words, kept, frac, duration, method = s2, w2, kept2, frac2, dur2, args.fallback_model
        if frac < 0.2 or not words:
            stamps = proportional_estimates(entry["sentences"], duration or 1500)
            method = "estimated"
        else:
            stamps = interpolate(entry["sentences"], kept, duration)
        done[record_id] = stamps
        meta[record_id] = {"method": method, "anchored": round(frac, 2)}
        OUTPUT.write_text(json.dumps(done), encoding="utf8")
        META_OUTPUT.write_text(json.dumps(meta), encoding="utf8")
        print(f"  {record_id}: {frac:.0%} anchored via {method} in {time.time() - started:.0f}s", flush=True)

    print(f"all requested records present in {OUTPUT}")


if __name__ == "__main__":
    main()

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Transcription on the user's own Orgo computer, without any key. Server only.
 *
 * Why not Hermes's own entry point: Hermes v0.23 does document a local faster-whisper STT provider
 * (`stt.provider: local`, `tools/transcription_tools.py: transcribe_audio`), but on the Hermes template
 * faster-whisper is not installed until first use, its interpreter lives behind a wrapper with private paths,
 * and `transcribe_audio` returns joined text only (no timestamps). So we keep a small, pinned Whisper install
 * of our own next to it, built with the `uv` binary Hermes ships (`/root/.hermes/tools/uv-*`), and decode with
 * the system ffmpeg (any audio or video container). The model follows Hermes's `stt.local.model` when set
 * (default `base`), so both share the same Hugging Face cache. Measured on the 2 vCPU template: installing
 * takes about 12 s once; 25 s of speech transcribes in about 3 s with `base`.
 */

export const WHISPER_VERSION = "om-whisper-v1";
export const DEFAULT_MODEL = process.env.VOICE_WHISPER_MODEL?.trim() || "";

const TRANSCRIBE_PY = `import json, os, subprocess, sys, time
import numpy as np
from faster_whisper import WhisperModel

src, out, model_name = sys.argv[1], sys.argv[2], sys.argv[3]
language = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None
prompt = sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] else None
t0 = time.time()

def progress(state, done=0.0, total=0.0):
    with open(out + ".progress.tmp", "w") as f:
        json.dump({"state": state, "done": round(done, 2), "total": round(total, 2)}, f)
    os.replace(out + ".progress.tmp", out + ".progress")

progress("decoding")
raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], check=True, capture_output=True).stdout
audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
total = len(audio) / 16000.0
if total < 0.3:
    raise SystemExit("The recording has no audio.")
progress("loading", 0, total)
model = WhisperModel(model_name, device="cpu", compute_type="int8")
progress("transcribing", 0, total)
segments, info = model.transcribe(audio, language=language, initial_prompt=prompt, vad_filter=True, beam_size=5)
segs = []
for s in segments:
    text = s.text.strip()
    if text:
        segs.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": text})
    progress("transcribing", s.end, total)
result = {"language": info.language, "duration": round(total, 2), "segments": segs, "text": " ".join(x["text"] for x in segs).strip(), "model": model_name, "seconds": round(time.time() - t0, 2)}
with open(out + ".tmp", "w") as f:
    json.dump(result, f)
os.replace(out + ".tmp", out)
progress("done", total, total)
`;

/** The detached job: install once (locked), then transcribe `audioPath` into `out.json` in the current folder. */
export function whisperJobScript(audioPath: string, opts: { prompt: string; language?: string | null; model?: string }): string {
  const q = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
  const py64 = Buffer.from(TRANSCRIBE_PY, "utf8").toString("base64").match(/.{1,76}/g)?.join("\n") ?? "";
  return `set -e
export HOME=/root
S=/root/.openman/stt
mkdir -p "$S"
echo '{"state":"installing","done":0,"total":0}' > out.json.progress
(
  flock -w 600 9
  if [ "$(cat "$S/version" 2>/dev/null)" != "${WHISPER_VERSION}" ] || ! "$S/venv/bin/python" -c "import faster_whisper, numpy" 2>/dev/null; then
    UV=$(ls -d /root/.hermes/tools/uv-*/uv 2>/dev/null | tail -1)
    [ -n "$UV" ] || UV=$(command -v uv || true)
    if [ -n "$UV" ]; then
      "$UV" venv -q --allow-existing --python /usr/bin/python3 "$S/venv"
      VIRTUAL_ENV="$S/venv" "$UV" pip install -q "faster-whisper==1.2.1" numpy
    else
      python3 -m venv "$S/venv"
      "$S/venv/bin/python" -m ensurepip -q
      "$S/venv/bin/python" -m pip install -q "faster-whisper==1.2.1" numpy
    fi
    echo ${WHISPER_VERSION} > "$S/version"
  fi
  base64 -d > "$S/transcribe.py" <<'OM_PY'
${py64}
OM_PY
) 9>"$S/install.lock"
command -v ffmpeg >/dev/null || { echo "ffmpeg is missing on this computer."; exit 1; }
M=${opts.model ? q(opts.model) : `$(grep -A3 '^stt:' /root/.hermes/config.yaml 2>/dev/null | grep -A1 'local:' | grep 'model:' | head -1 | awk '{print $2}' | tr -d "'\\"")`}
[ -n "$M" ] || M=base
"$S/venv/bin/python" "$S/transcribe.py" ${q(audioPath)} out.json "$M" ${q(opts.language ?? "")} ${q(opts.prompt)}
`;
}

/** Reads the job's `out.json` into a Transcript. */
export function fromWhisper(raw: string): import("./types").Transcript {
  const r = JSON.parse(raw) as { language?: string; duration?: number; segments?: { start: number; end: number; text: string }[]; text?: string; model?: string; seconds?: number };
  const segments = (r.segments ?? []).map((s) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text) }));
  return {
    text: r.text ?? segments.map((s) => s.text).join(" "),
    language: r.language ?? null,
    duration: Number(r.duration ?? 0),
    segments,
    speakers: false,
    provider: `computer:whisper-${r.model ?? "base"}`,
    seconds: r.seconds,
  };
}

// Opt-in live checks against the real AgentMail, AgentPhone and ElevenLabs accounts (the fakes live in
// mail-phone-test.mjs). Run through `node scripts/mail-phone-test.mjs --live`, or alone:
//
//   node scripts/vendors-live-test.mjs [--staging] [--no-meeting]
//
// Needs the keys and the app's vendor settings in .env.local (AGENTMAIL_*, AGENTPHONE_*, ELEVENLABS_API_KEY) and the
// dev server on :3001 with the dev identity. Prints counts and outcomes only: never a key, secret, address or number.
//
// The vendor accounts are shared with other products. This script only READS account-level data, and only writes
// inside this app's own AgentMail pod (AGENTMAIL_POD_ID) and AgentPhone sub-account (AGENTPHONE_SUB_ACCOUNT_ID):
//  - it never buys a number, registers a campaign or creates a domain;
//  - the email loop (send from a test inbox, deliver the real event to the local webhook, wait for the reply) runs only
//    when the dev user already has an agent address and LIVE_TEST_SENDER_INBOX names a second inbox in our pod;
//    otherwise it reports why it was skipped (e.g. the organization's inbox limit is reached).
// --staging also probes the staging webhook routes (APP_PUBLIC_URL) and sends AgentPhone's own signed test event
// to the sub-account's webhook (staging). --no-meeting skips the meeting-notes run on the dev computer (~2 min).
import { createHmac, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./env.mjs";

loadEnv();
const APP = process.env.TEST_APP_URL || "http://127.0.0.1:3001";
const STAGING = (process.env.APP_PUBLIC_URL || "").replace(/\/+$/, "");
const AM = (process.env.AGENTMAIL_BASE_URL || "https://api.agentmail.to").replace(/\/+$/, "");
const AP = (process.env.AGENTPHONE_BASE_URL || "https://api.agentphone.ai").replace(/\/+$/, "");
const EL = "https://api.elevenlabs.io";
const env = (k) => (process.env[k] || "").trim();

export async function runLive(argv = process.argv) {
  let failures = 0;
  const ok = (cond, label, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  [live] ${label}${!cond && extra ? `  -- ${extra}` : ""}`);
    if (!cond) failures++;
  };
  const skip = (label, why) => console.log(`SKIP  [live] ${label}  -- ${why}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const json = async (url, init = {}) => {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  };
  const am = (method, p, body) => json(`${AM}${p}`, { method, headers: { Authorization: `Bearer ${env("AGENTMAIL_API_KEY")}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const ap = (method, p, body, sub = env("AGENTPHONE_SUB_ACCOUNT_ID")) =>
    json(`${AP}${p}`, { method, headers: { Authorization: `Bearer ${env("AGENTPHONE_API_KEY")}`, "Content-Type": "application/json", ...(sub ? { "X-Sub-Account-Id": sub } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const app = (method, p, body, raw) =>
    json(`${APP}${p}`, { method, headers: { "Content-Type": raw ? "application/octet-stream" : "application/json" }, body: raw ?? (body ? JSON.stringify(body) : undefined) });

  console.log("\n--- live vendor checks ---");
  const missing = ["AGENTMAIL_API_KEY", "AGENTPHONE_API_KEY", "ELEVENLABS_API_KEY"].filter((k) => !env(k));
  if (missing.length) {
    skip("all live checks", `not set in .env.local: ${missing.join(", ")}`);
    return 0;
  }

  // ------------------------------------------------------------ keys (read-only)
  const org = await am("GET", "/v0/organizations");
  ok(org.status === 200 && typeof org.body.inbox_limit === "number", "AgentMail key works", `HTTP ${org.status}`);
  const inboxFull = org.body.inbox_count >= org.body.inbox_limit;
  console.log(`      AgentMail: inboxes ${org.body.inbox_count}/${org.body.inbox_limit}, domains ${org.body.domain_count}/${org.body.domain_limit}, sends ${org.body.daily_send_limit}/day`);
  const apUsage = await ap("GET", "/v1/usage", undefined, "");
  ok(apUsage.status === 200 && apUsage.body.numbers, "AgentPhone key works", `HTTP ${apUsage.status}`);
  console.log(`      AgentPhone (master): numbers ${apUsage.body.numbers?.used}/${apUsage.body.numbers?.limit}`);
  const sub = await json(`${EL}/v1/user/subscription`, { headers: { "xi-api-key": env("ELEVENLABS_API_KEY") } });
  ok(sub.status === 200 && typeof sub.body.tier === "string", "ElevenLabs key works", `HTTP ${sub.status}`);
  console.log(`      ElevenLabs: tier ${sub.body.tier}, credits ${sub.body.character_count}/${sub.body.character_limit}`);

  // ------------------------------------------------------------ AgentMail scoping
  const pod = env("AGENTMAIL_POD_ID");
  ok(!!pod, "AGENTMAIL_POD_ID is set (one pod for the app)");
  if (pod) {
    const p = await am("GET", `/v0/pods/${pod}`);
    ok(p.status === 200 && p.body.name === "openman", "the app's pod exists and is ours (name openman)", `HTTP ${p.status}`);
    const hooks = await am("GET", `/v0/pods/${pod}/webhooks`);
    const ours = (hooks.body.webhooks ?? []).filter((w) => String(w.url).endsWith("/api/webhooks/agentmail"));
    ok(ours.length >= 1 && ours.every((w) => w.pod_id === pod && (w.pod_ids ?? []).every((x) => x === pod) && w.enabled), "the app's webhook is scoped to its pod and enabled", JSON.stringify(ours.map((w) => ({ pod: w.pod_id === pod, enabled: w.enabled }))));
  }
  const orgHooks = await am("GET", "/v0/webhooks?limit=100");
  const unfiltered = (orgHooks.body.webhooks ?? []).filter((w) => !(w.pod_ids ?? []).length && !(w.inbox_ids ?? []).length);
  ok(unfiltered.length === 0, "no organization webhook receives every inbox's mail (our pod's events reach only our webhook)", `${unfiltered.length} unfiltered`);

  // ------------------------------------------------------------ AgentMail address through the app
  const overview = await app("GET", "/api/mail");
  ok(overview.status === 200 && overview.body.configured === true, "GET /api/mail: configured");
  let personal = overview.body.personal;
  if (!personal) {
    const created = await app("POST", "/api/mail", {});
    if (created.status === 201) {
      personal = created.body.mailbox;
      ok(!!personal?.address, "POST /api/mail created the dev user's real agent address");
    } else if (inboxFull) {
      ok(created.status === 503 && /inbox limit/.test(created.body.error ?? ""), "POST /api/mail refuses cleanly while the organization's inbox limit is reached", JSON.stringify(created.body));
      skip("real email loop", `AgentMail organization is at its inbox limit (${org.body.inbox_count}/${org.body.inbox_limit}); no address could be created`);
    } else {
      ok(false, "POST /api/mail", `${created.status} ${JSON.stringify(created.body)}`);
    }
  }
  const sender = env("LIVE_TEST_SENDER_INBOX");
  if (personal && !sender) skip("real email loop", "set LIVE_TEST_SENDER_INBOX to a second inbox in the app's pod");
  if (personal && sender) failures += await emailLoop({ personal, sender, am, ok, sleep });

  // ------------------------------------------------------------ signed webhook probes (real secrets)
  for (const base of [APP, ...(argv.includes("--staging") && STAGING ? [STAGING] : [])]) failures += await probeWebhooks(base, ok);

  // ------------------------------------------------------------ AgentPhone (no purchase)
  const subId = env("AGENTPHONE_SUB_ACCOUNT_ID");
  ok(!!subId, "AGENTPHONE_SUB_ACCOUNT_ID is set (the app's own sub-account)");
  if (subId) {
    const subHook = await ap("GET", "/v1/webhooks");
    ok(subHook.status === 200 && String(subHook.body?.url ?? "").endsWith("/api/webhooks/agentphone"), "the sub-account's webhook points at this app");
    const phone = await app("GET", "/api/phone");
    ok(phone.status === 200 && phone.body.configured === true && phone.body.pricing?.numberEvery30Days > 0, "GET /api/phone: configured, with the number price");
    const avail = await app("GET", "/api/phone/available?country=US");
    ok(avail.status === 200 && avail.body.numbers?.length > 0, "GET /api/phone/available lists purchasable US numbers (live inventory)", JSON.stringify(avail.body).slice(0, 200));
    const reg = await ap("GET", "/v1/register/status");
    console.log(`      AgentPhone sub-account: SMS campaign ${reg.body?.campaign_status ?? reg.status}`);
    if (argv.includes("--staging")) {
      // The test event needs an agent in the sub-account: a temporary one (agents cost nothing), deleted right after.
      const agent = await ap("POST", "/v1/agents", { name: "openman-webhook-test", voiceMode: "webhook" });
      const t = await ap("POST", `/v1/webhooks/test?agentId=${encodeURIComponent(agent.body?.id ?? "")}`, { from: "+15550100001", to: "+15550100002", message: "openman live test", channel: "sms" });
      if (agent.body?.id) await ap("DELETE", `/v1/agents/${encodeURIComponent(agent.body.id)}`);
      ok(t.status === 200 && t.body?.success === true && t.body?.httpStatus === 200, "AgentPhone's own signed test event reached staging's webhook and got 200", `HTTP ${t.status} ${JSON.stringify(t.body).slice(0, 160)}`);
    }
  }

  // ------------------------------------------------------------ ElevenLabs
  failures += await voiceChecks({ ok, skip, app, sleep, meeting: !argv.includes("--no-meeting") });
  return failures;
}

/** Real mail: test inbox -> agent address; the real event is delivered to the local webhook; the reply must come back in the thread. */
async function emailLoop({ personal, sender, am, ok, sleep }) {
  let failures = 0;
  const check = (c, l, e) => {
    ok(c, l, e);
    if (!c) failures++;
  };
  const subject = `openman live ${randomBytes(3).toString("hex")}`;
  const sent = await am("POST", `/v0/inboxes/${encodeURIComponent(sender)}/messages/send`, { to: [personal.address], subject, text: "What is 17 times 23? Answer with the number only." });
  check(sent.status === 200, "test inbox sent a real email to the agent address", `HTTP ${sent.status}`);
  if (sent.status !== 200) return failures;
  let msg = null;
  for (let i = 0; i < 30 && !msg; i++) {
    await sleep(3000);
    const list = await am("GET", `/v0/inboxes/${encodeURIComponent(personal.inboxId)}/messages?limit=10`);
    const hit = (list.body.messages ?? []).find((m) => m.subject === subject);
    if (hit) msg = (await am("GET", `/v0/inboxes/${encodeURIComponent(personal.inboxId)}/messages/${encodeURIComponent(hit.message_id)}`)).body;
  }
  check(!!msg, "the email arrived in the agent inbox (read back from AgentMail)");
  if (!msg) return failures;
  // The laptop cannot receive webhooks: deliver the real message as the event AgentMail would send, signed with the real secret.
  const event = { type: "event", event_type: "message.received", event_id: `live-${msg.message_id}`, message: msg, thread: { inbox_id: msg.inbox_id, thread_id: msg.thread_id, subject: msg.subject } };
  const res = await signedMailPost(APP, JSON.stringify(event));
  check(res.status === 200 && res.body.ok === true && !res.body.outcome, "local webhook accepted the real event", JSON.stringify(res.body));
  let reply = null;
  for (let i = 0; i < 100 && !reply; i++) {
    await sleep(6000);
    const thread = await am("GET", `/v0/inboxes/${encodeURIComponent(sender)}/threads/${encodeURIComponent(msg.thread_id)}`).catch(() => null);
    reply = (thread?.body?.messages ?? []).find((m) => String(m.from).toLowerCase().includes(personal.address.toLowerCase()));
  }
  check(!!reply && /391/.test(`${reply.text ?? ""}${reply.preview ?? ""}`), "the agent's real reply arrived in the same thread with the answer", reply ? (reply.preview ?? "").slice(0, 80) : "no reply");
  return failures;
}

function signedMailPost(base, raw) {
  const secret = env("AGENTMAIL_WEBHOOK_SECRET");
  const id = `msg_${randomBytes(8).toString("hex")}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${raw}`).digest("base64");
  return fetch(`${base}/api/webhooks/agentmail`, { method: "POST", headers: { "Content-Type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` }, body: raw }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

/** Unsigned requests are refused; correctly signed events for an unknown inbox / number end in a clean `not_found`. */
async function probeWebhooks(base, ok) {
  let failures = 0;
  const check = (c, l, e) => {
    ok(c, l, e);
    if (!c) failures++;
  };
  const where = base.startsWith("http://127.0.0.1") || base.startsWith("http://localhost") ? "local" : "staging";
  const now = new Date().toISOString();
  const unsigned = await fetch(`${base}/api/webhooks/agentmail`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check(unsigned.status === 401, `${where}: unsigned AgentMail webhook -> 401`, `HTTP ${unsigned.status}`);
  if (!env("AGENTMAIL_WEBHOOK_SECRET")) check(false, `${where}: AGENTMAIL_WEBHOOK_SECRET set`);
  else {
    const n = randomBytes(4).toString("hex");
    const ev = { type: "event", event_type: "message.received", event_id: `probe-${n}`, message: { inbox_id: `nobody-${n}@agentmail.to`, thread_id: `thd_${n}`, message_id: `<probe-${n}@example.com>`, labels: ["received"], timestamp: now, from: "probe@example.com", to: [`nobody-${n}@agentmail.to`], subject: "probe", text: "probe", size: 5, updated_at: now, created_at: now }, thread: { inbox_id: `nobody-${n}@agentmail.to`, thread_id: `thd_${n}` } };
    const r = await signedMailPost(base, JSON.stringify(ev));
    check(r.status === 200 && r.body?.outcome === "not_found", `${where}: signed AgentMail event for an unknown inbox -> 200 not_found`, JSON.stringify(r));
  }
  const pUnsigned = await fetch(`${base}/api/webhooks/agentphone`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check(pUnsigned.status === 401, `${where}: unsigned AgentPhone webhook -> 401`, `HTTP ${pUnsigned.status}`);
  if (env("AGENTPHONE_WEBHOOK_SECRET")) {
    const raw = JSON.stringify({ event: "agent.message", channel: "sms", timestamp: now, agentId: "agt_probe", data: { messageId: "msg_probe", numberId: `num_probe_${randomBytes(4).toString("hex")}`, from: "+15550100009", to: "+15550100010", message: "probe", direction: "inbound" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = `sha256=${createHmac("sha256", env("AGENTPHONE_WEBHOOK_SECRET")).update(`${ts}.`).update(raw).digest("hex")}`;
    const r = await fetch(`${base}/api/webhooks/agentphone`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Signature": sig, "X-Webhook-Timestamp": ts, "X-Webhook-ID": `del_probe_${randomBytes(4).toString("hex")}`, "X-Webhook-Event": "agent.message" }, body: raw });
    const b = await r.json().catch(() => null);
    check(r.status === 200 && b?.outcome === "not_found", `${where}: signed AgentPhone event for an unknown number -> 200 not_found`, JSON.stringify(b));
  }
  return failures;
}

/** Two macOS voices -> one 16 kHz mono WAV (null when `say`/`afconvert` are missing). */
function twoVoiceWav() {
  if (process.platform !== "darwin") return null;
  const dir = mkdtempSync(path.join(os.tmpdir(), "om-voice-"));
  const lines = [
    ["Samantha", "Good morning Daniel. Let's review the launch plan for the Orgo website. I think we should ship on Thursday."],
    ["Daniel", "Morning Samantha. Thursday works for me, but the pricing page still needs the new Growth plan numbers."],
    ["Samantha", "Okay. I will update the pricing page by Wednesday afternoon and send it to you for review."],
    ["Daniel", "Great. I will write the announcement email and schedule it for Thursday at nine in the morning."],
  ];
  const pcm = [];
  try {
    lines.forEach(([voice, text], i) => {
      execFileSync("say", ["-v", voice, "-o", path.join(dir, `${i}.aiff`), text]);
      execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", path.join(dir, `${i}.aiff`), path.join(dir, `${i}.wav`)]);
      const wav = readFileSync(path.join(dir, `${i}.wav`));
      const at = wav.indexOf("data");
      pcm.push(wav.subarray(at + 8), Buffer.alloc(16000)); // + 0.5 s of silence
    });
  } catch {
    return null;
  }
  const data = Buffer.concat(pcm);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(16000, 24);
  head.writeUInt32LE(32000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  const file = path.join(dir, "meeting.wav");
  writeFileSync(file, Buffer.concat([head, data]));
  return file;
}

async function voiceChecks({ ok, skip, app, sleep, meeting }) {
  let failures = 0;
  const check = (c, l, e) => {
    ok(c, l, e);
    if (!c) failures++;
  };
  const cfg = await app("GET", "/api/voice/config");
  check(cfg.body?.live === "elevenlabs" && cfg.body?.transcription === "elevenlabs" && cfg.body?.speakers === true, "GET /api/voice/config selects ElevenLabs for live and batch");
  const file = twoVoiceWav();
  if (!file || !existsSync(file)) {
    skip("ElevenLabs audio checks", "needs macOS `say` and `afconvert` to make the two-voice test file");
    return failures;
  }
  const wav = readFileSync(file);

  // Batch, the way the user's computer does it: a single-use batch_scribe token, diarize=true.
  const tok = await fetch(`${EL}/v1/single-use-token/batch_scribe`, { method: "POST", headers: { "xi-api-key": env("ELEVENLABS_API_KEY") } }).then((r) => r.json());
  check(typeof tok.token === "string", "batch_scribe single-use token minted");
  const form = new FormData();
  form.set("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
  form.set("file", new Blob([wav], { type: "audio/wav" }), "meeting.wav");
  form.set("diarize", "true");
  form.set("timestamps_granularity", "word");
  form.set("tag_audio_events", "false");
  const stt = await fetch(`${EL}/v1/speech-to-text?token=${encodeURIComponent(tok.token ?? "")}`, { method: "POST", body: form });
  const raw = await stt.text();
  check(stt.status === 200, "Scribe batch transcription answered 200", `HTTP ${stt.status} ${raw.slice(0, 120)}`);
  if (stt.status === 200) {
    const { fromScribe } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/voice/elevenlabs.ts")).href);
    const t = fromScribe(raw);
    const speakers = new Set(t.segments.map((s) => s.speaker).filter(Boolean));
    check(t.speakers && speakers.size === 2 && t.segments.length >= 4, "batch: two speakers labelled, one segment per turn (fromScribe)", JSON.stringify({ speakers: [...speakers], segments: t.segments.length }));
  }

  // Realtime: the app's token route, then the Scribe socket fed the same audio.
  const rt = await app("POST", "/api/voice/token", { maxSessionSeconds: 120 });
  check(rt.status === 200 && typeof rt.body.token === "string" && !JSON.stringify(rt.body).includes(env("ELEVENLABS_API_KEY")), "POST /api/voice/token returns a single-use token (never the key)");
  if (rt.status === 200) {
    const qs = new URLSearchParams({ model_id: rt.body.modelId, token: rt.body.token, audio_format: "pcm_16000", commit_strategy: "vad" });
    const finals = [];
    const ws = new WebSocket(`${rt.body.url}?${qs}`);
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.message_type === "committed_transcript" && m.text?.trim()) finals.push(m.text.trim());
    };
    const opened = await new Promise((res) => {
      ws.onopen = () => res(true);
      ws.onerror = () => res(false);
    });
    check(opened, "realtime socket opened with the token");
    if (opened) {
      const pcm = wav.subarray(44);
      for (let i = 0; i < pcm.length; i += 3200) {
        ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: pcm.subarray(i, i + 3200).toString("base64"), commit: false, sample_rate: 16000 }));
        await sleep(25);
      }
      ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: Buffer.alloc(3200).toString("base64"), commit: true, sample_rate: 16000 }));
      await sleep(5000);
      ws.close();
      check(/pricing page/i.test(finals.join(" ")), "realtime: committed transcript came back", finals.join(" ").slice(0, 100));
      const again = new WebSocket(`${rt.body.url}?${qs}`);
      const reuse = await new Promise((res) => {
        again.onmessage = (ev) => res(String(ev.data));
        again.onclose = () => res("closed");
        setTimeout(() => res("timeout"), 8000);
      });
      try {
        again.close();
      } catch {}
      check(/auth_error|closed/.test(reuse), "realtime: the token is single-use (reuse refused)", reuse.slice(0, 80));
    }
  }

  // Meeting recording end to end through the app (the vendor path is selected because the key is set).
  if (!meeting) return failures;
  const begin = await app("POST", "/api/voice/uploads", { title: "Live ElevenLabs check", source: "upload", fileName: "launch-sync.wav", mime: "audio/wav", sizeBytes: wav.length });
  check(begin.status === 201, "meeting upload started", JSON.stringify(begin.body).slice(0, 160));
  const m = begin.body?.meeting;
  if (!m) return failures;
  for (let i = 0; i < m.partsTotal; i++) await app("PUT", `/api/voice/uploads/${m.id}/parts/${i}`, null, wav.subarray(i * m.partSize, (i + 1) * m.partSize));
  const job = await app("POST", "/api/voice/jobs", { meetingId: m.id });
  check(job.body?.meeting?.provider?.startsWith("elevenlabs"), "meeting transcription runs on ElevenLabs", JSON.stringify(job.body?.meeting?.provider));
  let state = null;
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    state = (await app("GET", `/api/voice/jobs/${m.id}`)).body?.meeting;
    if (!state || ["done", "error"].includes(state.status)) break;
  }
  check(state?.status === "done" && state.speakers === true && !!state.taskId, "meeting: transcribed with speakers and a notes task created", JSON.stringify({ status: state?.status, error: state?.error }));
  if (!state?.taskId) return failures;
  let notes = "";
  for (let i = 0; i < 60 && !notes; i++) {
    await sleep(6000);
    const t = await app("GET", `/api/tasks/${state.taskId}`);
    if (t.body?.task?.status === "completed") notes = (t.body.events ?? []).filter((e) => e.type === "message.completed").map((e) => e.text ?? "").pop() ?? "";
    if (["failed", "error", "stopped"].includes(t.body?.task?.status)) break;
  }
  check(/Samantha/.test(notes) && /Daniel/.test(notes) && /action items/i.test(notes), "meeting notes attribute the speakers by name with action items", notes.slice(0, 120));
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = await runLive();
  console.log(failures ? `\n${failures} FAILED (live)` : "\nALL PASSED (live)");
  process.exit(failures ? 1 : 0);
}

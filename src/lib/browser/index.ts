/**
 * Cloud browser settings: the agent's browser on the user's home computer (Hermes `browser_exec`).
 *
 * - "Persist login state across tasks" is Hermes' `browser.user_data_dir` in the default profile's `config.yaml`:
 *   set, every task shares one Chromium profile (`~/.hermes/browser-data`), so cookies and sign-ins carry over;
 *   empty, each task starts signed out. Hermes reads the setting when a browser launches, so no restart is needed.
 *   On by default: applied the first time the settings are read, unless the user turned it off (kept in our
 *   `settings` document as `cloudBrowser.persist`).
 * - Saved sessions: the sites that have cookies in that profile (counts and last use only, never values) plus the
 *   Hermes credential vault's local logins (metadata only: handle, label, identifier, origin; passwords never leave it).
 * - Clearing: per site (its cookies and its vault logins) or everything (the whole profile folder and every local
 *   vault login). The agent's browser is closed first so it cannot write the cookies back.
 *
 * Everything runs as one fixed Python script on the user's own computer through their Orgo client; the only input
 * is a validated site name, passed base64-encoded. Server only.
 */
import { getSettings, patchSettings } from "@/lib/db/settings";
import type { OrgoClient } from "@/lib/orgo/user-client";

export const PROFILE_DIR = "~/.hermes/browser-data";

export interface SavedLogin {
  handle: string;
  label: string;
  identifier: string | null;
}

export interface BrowserSite {
  /** Registrable domain, e.g. `github.com`. */
  site: string;
  cookies: number;
  /** ISO time the browser last used one of the site's cookies, when known. */
  lastUsed: string | null;
  logins: SavedLogin[];
}

export interface BrowserState {
  persist: boolean;
  sites: BrowserSite[];
  /** True while the agent's browser is open (clearing closes it). */
  browserOpen: boolean;
}

export class BrowserError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** A site name as the list shows it: lower-case host labels, no scheme, port or path. */
const SITE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export function normalizeSite(raw: string): string | null {
  const site = raw.trim().toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");
  return SITE.test(site) ? site : null;
}

type Action = { op: "state" } | { op: "persist"; on: boolean } | { op: "clear_site"; site: string } | { op: "clear_all" };

/**
 * The script. Reads its action from `OM_ARGS` (base64 JSON) and prints one line `OM_BROWSER <json>`.
 * Vault calls run in Hermes' own interpreter (found from the `hermes` launcher) so they use its vault code.
 */
const SCRIPT = String.raw`
import base64, json, os, re, shutil, signal, sqlite3, subprocess, time
args = json.loads(base64.b64decode(os.environ["OM_ARGS"]).decode())
HOME = os.path.expanduser("~")
HH = os.environ.get("HERMES_HOME") or os.path.join(HOME, ".hermes")
CFG = os.path.join(HH, "config.yaml")
PROFILE_RAW = "${PROFILE_DIR}"
PROFILE = os.path.expanduser(PROFILE_RAW)
out = {}

def load_cfg():
    import yaml
    try:
        with open(CFG) as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}

def save_cfg(cfg):
    import yaml
    tmp = CFG + ".om-tmp"
    with open(tmp, "w") as f:
        yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)
    os.replace(tmp, CFG)

def udd(cfg):
    v = str(((cfg.get("browser") or {}).get("user_data_dir")) or "").strip()
    if not v:
        return ""
    v = os.path.expanduser(v)
    return v if os.path.isabs(v) else os.path.join(HH, v)

TWO = {"co.uk","org.uk","ac.uk","gov.uk","com.au","net.au","org.au","co.jp","co.nz","com.br","co.in","co.za","com.mx","com.cn","com.tr","co.kr","com.sg","com.hk"}
def site_of(host):
    h = host.lstrip(".").lower()
    if h.startswith("www."):
        h = h[4:]
    parts = h.split(".")
    if len(parts) <= 2 or re.fullmatch(r"[0-9.]+", h):
        return h
    return ".".join(parts[-3:]) if ".".join(parts[-2:]) in TWO else ".".join(parts[-2:])

def cookie_dbs(d):
    return [p for p in (os.path.join(d, "Default", "Network", "Cookies"), os.path.join(d, "Default", "Cookies")) if d and os.path.isfile(p)]

def browser_pids(d):
    if not d:
        return []
    try:
        res = subprocess.run(["pgrep", "-f", "--", "--user-data-dir=" + d], capture_output=True, text=True, timeout=10)
        return [int(x) for x in res.stdout.split() if x.isdigit() and int(x) != os.getpid()]
    except Exception:
        return []

def close_browser(d):
    pids = browser_pids(d)
    for p in pids:
        try: os.kill(p, signal.SIGTERM)
        except Exception: pass
    for _ in range(20):
        if not browser_pids(d): break
        time.sleep(0.25)
    for p in browser_pids(d):
        try: os.kill(p, signal.SIGKILL)
        except Exception: pass

VAULT_SNIPPET = r'''
import json, os
from agent.vault_store import get_vault_store
s = get_vault_store()
a = json.loads(os.environ["OMV_ARGS"])
if a[0] == "list":
    items = []
    for m in s.list_items():
        if getattr(m, "kind", "login") != "login":
            continue
        items.append({"handle": m.id, "label": m.label or "", "identifier": m.identifier or None, "origin": m.origin or ""})
    print("OMV " + json.dumps(items))
else:
    print("OMV " + json.dumps({"removed": [h for h in a[1:] if s.remove_item(h)]}))
'''
def vault(*a):
    # Hermes' own interpreter and packages, through its launcher; the snippet arrives as one exec line on stdin.
    hermes = shutil.which("hermes")
    if not hermes:
        return None
    line = "exec(__import__('base64').b64decode('%s').decode())\n" % base64.b64encode(VAULT_SNIPPET.encode()).decode()
    try:
        res = subprocess.run([hermes, "--run-module", "code"], input=line, capture_output=True, text=True, timeout=40, env={**os.environ, "HERMES_HOME": HH, "OMV_ARGS": json.dumps(list(a))})
        for line in res.stdout.splitlines():
            i = line.find("OMV ")
            if i >= 0:
                return json.loads(line[i + 4:])
    except Exception:
        return None
    return None

def origin_site(origin):
    m = re.match(r"^[a-z][a-z0-9+.-]*://([^/:?#]+)", origin or "", re.I)
    return site_of(m.group(1)) if m else (site_of(origin) if origin else "")

def chrome_time(v):
    # Chromium stores microseconds since 1601-01-01.
    if not v:
        return None
    secs = v / 1_000_000 - 11644473600
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(secs)) if secs > 0 else None

def state(cfg):
    d = udd(cfg)
    sites = {}
    for db in cookie_dbs(d):
        tmp = "/tmp/om-cookies-%d.db" % os.getpid()
        try:
            shutil.copyfile(db, tmp)
            con = sqlite3.connect(tmp)
            cols = [r[1] for r in con.execute("pragma table_info(cookies)")]
            last = "last_access_utc" if "last_access_utc" in cols else "creation_utc"
            for host, n, t in con.execute("select host_key, count(*), max(%s) from cookies group by host_key" % last):
                s = site_of(host)
                e = sites.setdefault(s, {"site": s, "cookies": 0, "lastUsed": None, "_t": 0, "logins": []})
                e["cookies"] += n
                if t and t > e["_t"]:
                    e["_t"] = t
            con.close()
        except Exception as ex:
            out["cookieError"] = type(ex).__name__
        finally:
            try: os.remove(tmp)
            except Exception: pass
    for item in (vault("list") or []):
        s = origin_site(item.get("origin")) or "(no site)"
        e = sites.setdefault(s, {"site": s, "cookies": 0, "lastUsed": None, "_t": 0, "logins": []})
        e["logins"].append({"handle": item["handle"], "label": item["label"], "identifier": item["identifier"]})
    res = []
    for e in sites.values():
        e["lastUsed"] = chrome_time(e.pop("_t"))
        res.append(e)
    res.sort(key=lambda e: (e["lastUsed"] or "", e["site"]), reverse=True)
    return {"persist": bool(d), "sites": res, "browserOpen": bool(browser_pids(d))}

cfg = load_cfg()
op = args["op"]
if op == "persist":
    b = cfg.get("browser")
    if not isinstance(b, dict):
        b = {}
        cfg["browser"] = b
    want = PROFILE_RAW if args["on"] else ""
    if (b.get("user_data_dir") or "") != want:
        if not args["on"]:
            close_browser(udd(cfg))
        b["user_data_dir"] = want
        save_cfg(cfg)
    if args["on"]:
        os.makedirs(PROFILE, mode=0o700, exist_ok=True)
elif op == "clear_site":
    site = args["site"]
    d = udd(cfg) or PROFILE
    close_browser(d)
    removed = 0
    for db in cookie_dbs(d):
        con = sqlite3.connect(db, timeout=10)
        hosts = [h for (h,) in con.execute("select distinct host_key from cookies") if site_of(h) == site]
        for h in hosts:
            removed += con.execute("delete from cookies where host_key = ?", (h,)).rowcount
        con.commit()
        con.close()
    handles = [i["handle"] for i in (vault("list") or []) if (origin_site(i.get("origin")) or "(no site)") == site]
    if handles:
        vault("rm", *handles)
    out["removedCookies"] = removed
    out["removedLogins"] = len(handles)
elif op == "clear_all":
    d = udd(cfg) or PROFILE
    for target in {d, PROFILE}:
        close_browser(target)
        if target and os.path.isdir(target) and os.path.realpath(target).startswith(os.path.realpath(HOME) + "/"):
            shutil.rmtree(target, ignore_errors=True)
    if udd(cfg):
        os.makedirs(udd(cfg), mode=0o700, exist_ok=True)
    handles = [i["handle"] for i in (vault("list") or [])]
    if handles:
        vault("rm", *handles)
    out["removedLogins"] = len(handles)
out.update(state(load_cfg()))
print("OM_BROWSER " + json.dumps(out))
`;

async function runOnComputer(orgo: OrgoClient, computerId: string, action: Action): Promise<BrowserState & Record<string, unknown>> {
  const args = Buffer.from(JSON.stringify(action)).toString("base64");
  // The script is a fixed constant under a quoted delimiter; the action is base64 (alphabet checked by construction).
  const command = `OM_ARGS='${args}' python3 - <<'OM_BROWSER_PY'\n${SCRIPT}\nOM_BROWSER_PY`;
  let output = "";
  try {
    output = (await orgo.bash(computerId, command, 90)).output ?? "";
  } catch {
    throw new BrowserError("Your computer could not be reached. Try again in a moment.");
  }
  const line = output.split("\n").find((l) => l.startsWith("OM_BROWSER "));
  if (!line) {
    console.warn("[browser] unexpected output from the computer:", output.slice(-300));
    throw new BrowserError("Your computer did not answer as expected. Try again.");
  }
  const parsed = JSON.parse(line.slice("OM_BROWSER ".length)) as BrowserState & Record<string, unknown>;
  return { ...parsed, sites: Array.isArray(parsed.sites) ? parsed.sites : [] };
}

/** The user's saved choice: true unless they turned persistence off. */
export async function persistPreference(userId: string): Promise<boolean> {
  const doc = await getSettings(userId).catch(() => ({}) as Record<string, unknown>);
  const cb = doc.cloudBrowser as { persist?: unknown } | undefined;
  return cb?.persist !== false;
}

/**
 * Current state. Applies the user's choice to the computer when the two disagree (first use: persistence on by
 * default; or a computer set up again since).
 */
export async function browserState(userId: string, orgo: OrgoClient, computerId: string): Promise<BrowserState> {
  const want = await persistPreference(userId);
  const state = await runOnComputer(orgo, computerId, { op: "state" });
  if (state.persist === want) return pick(state);
  return pick(await runOnComputer(orgo, computerId, { op: "persist", on: want }));
}

export async function setPersist(userId: string, orgo: OrgoClient, computerId: string, on: boolean): Promise<BrowserState> {
  const state = await runOnComputer(orgo, computerId, { op: "persist", on });
  await patchSettings(userId, { cloudBrowser: { persist: on } });
  return pick(state);
}

export async function clearSite(orgo: OrgoClient, computerId: string, site: string): Promise<BrowserState & { removedCookies: number; removedLogins: number }> {
  const res = await runOnComputer(orgo, computerId, { op: "clear_site", site });
  return { ...pick(res), removedCookies: Number(res.removedCookies) || 0, removedLogins: Number(res.removedLogins) || 0 };
}

export async function clearAll(orgo: OrgoClient, computerId: string): Promise<BrowserState & { removedLogins: number }> {
  const res = await runOnComputer(orgo, computerId, { op: "clear_all" });
  return { ...pick(res), removedLogins: Number(res.removedLogins) || 0 };
}

function pick(s: BrowserState): BrowserState {
  return {
    persist: !!s.persist,
    browserOpen: !!s.browserOpen,
    sites: s.sites.map((x) => ({
      site: String(x.site),
      cookies: Number(x.cookies) || 0,
      lastUsed: typeof x.lastUsed === "string" ? x.lastUsed : null,
      logins: (Array.isArray(x.logins) ? x.logins : []).map((l) => ({ handle: String(l.handle), label: String(l.label ?? ""), identifier: l.identifier ? String(l.identifier) : null })),
    })),
  };
}

/**
 * What the agent is told about the browser on every run (layer it onto the run's instructions). Asks before
 * keeping a site's login when persistence is on.
 */
export async function browserInstructions(userId: string): Promise<string> {
  const persist = await persistPreference(userId);
  return persist
    ? "Your web browser keeps sign-ins between tasks. Before you sign in to a website for the user, or save a login with browser_vault save_login, ask the user in one short question whether to keep that site's login for future tasks. If they say no, do not save it, and sign out of the site when you are done."
    : "Your web browser starts signed out in every task and its sign-ins are not kept. Do not save logins with browser_vault unless the user asks you to.";
}

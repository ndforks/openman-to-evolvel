// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
// Browser walk-through of sign-in with Orgo and the first-run screen, with screenshots in /tmp/om-shots/signin/.
//   BASE_URL=http://127.0.0.1:3002 node scripts/qa-signin.mjs
// Signed out: /signin, "Use an API key instead" (a made-up key is refused by Orgo), and the approval wait screen
// (starts one real approval request; it is never approved and expires on its own). Signed in: with ORGO_API_KEY in
// .env.local it signs in through the "Use an API key instead" form with that key (or pass OM_COOKIE, an om_session
// value), then looks at the first-run choice and Settings, and signs out at the end. Nothing here creates, changes or
// deletes an Orgo computer: the first-run screen is only looked at. Never prints the key or the cookie.
import { launch, BASE_URL } from "./cdp.mjs";
import { loadEnv } from "./env.mjs";

loadEnv();

const p = await launch({ width: 1280, height: 860, outDir: "/tmp/om-shots/signin" });
let failures = 0;
const check = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!cond) failures++;
};
const text = () => p.eval("document.body.innerText");

try {
  await p.goto("/signin?next=%2Fapp%2Ftask%2Fdemo", 3500);
  let body = await text();
  check("/signin shows one primary Continue with Orgo", /Continue with Orgo/.test(body) && !/Continue with Google/.test(body));
  check("/signin explains approval and free sign-up", /approve .* in your Orgo account/i.test(body) && /create an account there for free/i.test(body));
  await p.shot("1-signin");

  await p.click("text=Use an API key instead", 600);
  body = await text();
  check("API key form explains how to get a key", /orgo keys create --name/.test(body) && /API keys/.test(body));
  await p.click('input[name="orgo-api-key"]', 200);
  await p.type("sk_live_" + "0".repeat(48));
  await p.click("text=Sign in with key", 3500);
  body = await text();
  check("a made-up key is refused with Orgo's verdict", /doesn't accept this key/i.test(body), body.match(/Orgo[^\n]{0,80}key[^\n]*/)?.[0] ?? "");
  await p.shot("2-api-key-refused");

  await p.click("text~=Continue with Orgo instead", 500);
  await p.click("text=Continue with Orgo", 3500);
  body = await text();
  const code = body.match(/\b[A-Z0-9]{3,4}-[A-Z0-9]{3,4}(?:-[A-Z0-9]{3,4})?\b/)?.[0];
  check("waiting screen shows the code large with copy", !!code && /Copy code/.test(body), code ?? "no code");
  check("waiting screen says it continues by itself", /continues by itself/.test(body));
  await p.shot("3-waiting");
  await p.click("text=Cancel", 400);
  check("cancel returns to the start", /Continue with Orgo/.test(await text()));

  await p.goto("/?signin=1", 3000);
  check("landing ?signin=1 opens the modal with Continue with Orgo", /Continue with Orgo/.test(await text()));
  await p.shot("4-modal");

  let signedIn = false;
  if (process.env.OM_COOKIE) {
    const host = new URL(BASE_URL).hostname;
    await p.send("Network.enable");
    await p.send("Network.setCookie", { name: "om_session", value: process.env.OM_COOKIE, domain: host, path: "/", httpOnly: true });
    signedIn = true;
    await p.goto("/app", 5000);
  } else if (process.env.ORGO_API_KEY?.trim()) {
    await p.goto("/signin?next=%2Fapp", 3000);
    await p.click("text=Use an API key instead", 600);
    await p.click('input[name="orgo-api-key"]', 200);
    await p.type(process.env.ORGO_API_KEY.trim());
    await p.click("text=Sign in with key", 2500);
    body = await text();
    check("API key sign-in: signed in", /Signed in as|You're signed in/.test(body));
    if (/limited to one workspace/.test(body)) check("API key sign-in: a workspace key's limits are explained before continuing", /Continue/.test(body) && /switch workspaces/.test(body));
    await p.shot("4b-api-key-signed-in");
    if (/Continue/.test(body)) await p.click("text=Continue", 5000);
    else await p.goto("/app", 5000);
    signedIn = /\/app/.test(await p.eval("location.pathname"));
    check("API key sign-in lands on the page asked for", signedIn);
  }
  if (signedIn) {
    body = await text();
    check("first run offers a choice before creating anything", /Set up your agent computer/.test(body) && /Create a new computer/.test(body), body.slice(0, 120).replace(/\n/g, " "));
    check("the new computer's price is Orgo's", /\$0\.055 an hour/.test(body));
    await p.shot("5-first-run-choice", { captureBeyondViewport: true });
    await p.goto("/app?settings=account", 4000);
    body = await text();
    check("Settings, Account shows the linked Orgo account and workspace", /Linked account/.test(body) && /Workspace/.test(body) && /Manage on Orgo/.test(body));
    await p.shot("6-settings-account");
    await p.goto("/app?settings=security", 3500);
    body = await text();
    check("Sign-in & security offers Disconnect Orgo", /Disconnect Orgo/.test(body) && /Signed in with an Orgo API key/.test(body));
    await p.shot("7-settings-security");
    const out = await p.eval("fetch('/api/auth/signout', { method: 'POST' }).then((r) => r.status)");
    check("signed out at the end", out === 200);
  }
  const logs = p.takeLogs().filter((l) => !/Failed to load resource.*(401|403)/.test(l));
  if (logs.length) console.log("console:", logs.join("\n  "));
} finally {
  await p.close();
}
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 AnyCubical
"use strict";
// Firefox: browser.*, Chrome: chrome.* (beide liefern in MV3 Promises)
const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const FIELDS = {
  apiKey: "", merchantCode: "", affiliateAppId: "", affiliateKey: "", readerId: "",
  payText: "Zahlung", paySelector: "", totalSelector: "",
};
const out = (t) => { $("out").textContent = t; };

async function load() {
  const s = await api.storage.local.get(FIELDS);
  for (const k of Object.keys(FIELDS)) $(k).value = s[k];
}

async function save() {
  const data = {};
  for (const k of Object.keys(FIELDS)) data[k] = $(k).value.trim();
  if (!data.payText) data.payText = "Zahlung";
  await api.storage.local.set(data);
}

async function send(type, payload = {}) {
  const r = await api.runtime.sendMessage({ type, ...payload });
  if (!r?.ok) throw new Error(r?.error || "Unbekannter Fehler");
  return r.result;
}

$("save").addEventListener("click", async () => { await save(); out("Gespeichert."); });

$("pair").addEventListener("click", async () => {
  await save();
  const code = $("pairingCode").value.trim();
  if (!code) return out("Bitte den Kopplungscode vom Terminal eintragen.");
  try {
    const { reader } = await send("pairReader", { pairingCode: code, name: "Kasse" });
    $("readerId").value = reader?.id || "";
    out(`Gekoppelt: ${reader?.name || ""} (${reader?.id || "keine ID?"})`);
  } catch (e) { out(e.message); }
});

$("list").addEventListener("click", async () => {
  await save();
  try {
    const { readers } = await send("listReaders");
    out(readers.length
      ? readers.map((r) => `${r.name || "?"}  ${r.id}  ${r.status || ""}  ${r.device?.model || ""}`).join("\n")
      : "Keine Terminals gekoppelt.");
  } catch (e) { out(e.message); }
});

load();
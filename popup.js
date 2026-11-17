// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 AnyCubical
"use strict";
// Firefox: browser.*, Chrome: chrome.* (beide liefern in MV3 Promises)
const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

api.storage.local.get({ enabled: true, paySelector: "", totalSelector: "", payText: "Zahlung" })
  .then((s) => {
    $("enabled").checked = s.enabled;
    $("paySel").textContent = s.paySelector || `(Standard: Text „${s.payText}“)`;
    $("totalSel").textContent = s.totalSelector || "(noch nicht gewählt)";
  });

$("enabled").addEventListener("change", (e) => api.storage.local.set({ enabled: e.target.checked }));
$("options").addEventListener("click", () => api.runtime.openOptionsPage());

async function pick(field) {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  try {
    await api.tabs.sendMessage(tab.id, { type: "pick", field });
    window.close();
  } catch {
    $("info").textContent = "Bitte zuerst den helloCash-Tab öffnen und neu laden.";
  }
}
$("pickPay").addEventListener("click", () => pick("paySelector"));
$("pickTotal").addEventListener("click", () => pick("totalSelector"));
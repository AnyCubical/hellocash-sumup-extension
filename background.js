// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 AnyCubical
// Spricht die SumUp-API an. Läuft im Hintergrund, damit CORS kein Problem ist
// und der API-Key nie im Kontext der helloCash-Seite liegt.
"use strict";
// Firefox: browser.*, Chrome: chrome.* (beide liefern in MV3 Promises)
const api = globalThis.browser ?? globalThis.chrome;

const API = "https://api.sumup.com";
const CONFIG_DEFAULTS = {
  apiKey: "",
  merchantCode: "",
  readerId: "",
  affiliateAppId: "",
  affiliateKey: "",
};

async function cfg() {
  return api.storage.local.get(CONFIG_DEFAULTS);
}

function need(c, ...keys) {
  const missing = keys.filter((k) => !c[k]);
  if (missing.length) throw new Error(`In den Einstellungen fehlt: ${missing.join(", ")}`);
}

async function call(method, path, body) {
  const c = await cfg();
  need(c, "apiKey");
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
  if (!res.ok) {
    const detail = data?.detail || data?.message || data?.error_message ||
      data?.errors?.detail || text.slice(0, 200) || res.statusText;
    const err = new Error(`SumUp ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const enc = encodeURIComponent;

const handlers = {
  // Betrag ans Terminal schicken
  async startCheckout({ cents, description }) {
    const c = await cfg();
    need(c, "merchantCode", "readerId", "affiliateAppId", "affiliateKey");
    if (!Number.isInteger(cents) || cents <= 0) throw new Error("Ungültiger Betrag");
    const foreignId = `hcsu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const r = await call("POST",
      `/v0.1/merchants/${enc(c.merchantCode)}/readers/${enc(c.readerId)}/checkout`, {
        total_amount: { currency: "EUR", minor_unit: 2, value: cents },
        affiliate: { app_id: c.affiliateAppId, key: c.affiliateKey, foreign_transaction_id: foreignId },
        description: description || "Kartenzahlung",
      });
    const d = r?.data ?? r ?? {};
    return { clientTransactionId: d.client_transaction_id, foreignId };
  },

  // Status von Transaktion und Terminal
  async checkoutStatus({ clientTransactionId }) {
    const c = await cfg();
    need(c, "merchantCode", "readerId");
    let txStatus = null;
    let card = null;
    try {
      const tx = await call("GET",
        `/v2.1/merchants/${enc(c.merchantCode)}/transactions?client_transaction_id=${enc(clientTransactionId)}`);
      txStatus = tx?.status ?? null; // SUCCESSFUL | FAILED | CANCELLED | PENDING
      card = {
        type: tx?.card?.type ?? null,          // GIROCARD, VISA, MASTERCARD, AMEX, MAESTRO, ...
        last4: tx?.card?.last_4_digits ?? null,
        processAs: tx?.process_as ?? null,     // CREDIT | DEBIT
        entryMode: tx?.entry_mode ?? null,     // contactless, chip, apple pay, ...
      };
    } catch (e) {
      if (e.status !== 404) throw e; // 404 = Transaktion existiert noch nicht
    }
    let readerState = null;
    try {
      const s = await call("GET",
        `/v0.1/merchants/${enc(c.merchantCode)}/readers/${enc(c.readerId)}/status`);
      readerState = s?.data?.state ?? null; // IDLE, WAITING_FOR_CARD, WAITING_FOR_PIN, ...
    } catch { /* ältere Firmware oder fehlender Scope: dann nur Transaktionsstatus */ }
    return { txStatus, readerState, card };
  },

  // Laufende Zahlung am Terminal abbrechen
  async terminate() {
    const c = await cfg();
    need(c, "merchantCode", "readerId");
    await call("POST", `/v0.1/merchants/${enc(c.merchantCode)}/readers/${enc(c.readerId)}/terminate`);
    return {};
  },

  async listReaders() {
    const c = await cfg();
    need(c, "merchantCode");
    const r = await call("GET", `/v0.1/merchants/${enc(c.merchantCode)}/readers`);
    return { readers: r?.items ?? r?.data ?? r ?? [] };
  },

  async pairReader({ pairingCode, name }) {
    const c = await cfg();
    need(c, "merchantCode");
    const r = await call("POST", `/v0.1/merchants/${enc(c.merchantCode)}/readers`,
      { pairing_code: pairingCode, name: name || "Kasse" });
    const reader = r?.data ?? r;
    if (reader?.id) await api.storage.local.set({ readerId: reader.id });
    return { reader };
  },
};

// sendResponse + "return true" funktioniert in Firefox und Chrome
// (Chrome unterstützt keine Promise-Rückgabe aus onMessage).
api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  h(msg).then(
    (result) => sendResponse({ ok: true, result }),
    (e) => sendResponse({ ok: false, error: e.message || String(e) }),
  );
  return true;
});

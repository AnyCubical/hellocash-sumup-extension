// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 AnyCubical
// Läuft auf myhellocash.com: fängt „Bezahlen“ ab, fragt Bar/Karte,
// bei Karte geht der Betrag ans SumUp-Terminal. helloCash selbst wird nicht verändert.
(() => {
  "use strict";
  // Firefox: browser.*, Chrome: chrome.*
  const api = globalThis.browser ?? globalThis.chrome;
  if (window.__hcsuExtension) return;
  window.__hcsuExtension = true;

  const DEFAULTS = { enabled: true, payText: "Zahlung", paySelector: "", totalSelector: "" };
  let settings = { ...DEFAULTS };
  let passThrough = false; // true, während wir den echten Klick an helloCash weitergeben
  let picking = null;      // "paySelector" | "totalSelector" | null
  let pickHover = null;
  let modal = null;
  let panel = null;
  let pollTimer = null;

  api.storage.local.get(DEFAULTS).then((s) => { settings = s; });
  api.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    for (const [k, v] of Object.entries(ch)) {
      if (k in DEFAULTS) settings[k] = v.newValue ?? DEFAULTS[k];
    }
    if (picking && (ch.paySelector || ch.totalSelector)) stopPicking();
  });

  const send = (type, payload = {}) =>
    api.runtime.sendMessage({ type, ...payload }).then((r) => {
      if (!r?.ok) throw new Error(r?.error || "Unbekannter Fehler");
      return r.result;
    });

  // ---------- Hilfsfunktionen ----------
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v);
    }
    for (const c of children) if (c != null) el.append(c);
    return el;
  }
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const fmt = (cents) =>
    (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const isOurs = (el) => el instanceof Element && !!el.closest(".hcsu-root");

  // „1.234,56 €“ → 123456 (auch „12.34“ wird erkannt)
  function parseEuroToCents(text) {
    const s = String(text || "").replace(/\s| /g, "");
    let m = s.match(/-?\d[\d.]*,\d{1,2}/);
    if (m) {
      const [i, f] = m[0].split(",");
      return parseInt(i.replace(/\./g, ""), 10) * 100 + parseInt((f + "0").slice(0, 2), 10);
    }
    m = s.match(/-?\d+\.\d{2}(?!\d)/);
    if (m) return Math.round(parseFloat(m[0]) * 100);
    m = s.match(/-?\d+/);
    return m ? parseInt(m[0], 10) * 100 : null;
  }

  const EURO = /^-?\d[\d.]*,\d{2}\s*€$/;

  // Ohne Selektor: Gesamtsumme in der Zeile mit „Leeren“ / „Gesamtrabatt“ suchen
  // (helloCash-Kassenansicht, unabhängig von der Anzahl der Artikel).
  // Achtung: „Rabatt:“ steht auch in jeder Artikelzeile, taugt also nicht als Anker.
  function findTextAnchor(test) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (test(norm(walker.currentNode.nodeValue)) && !isOurs(el)) return el;
    }
    return null;
  }

  function autoTotalElement() {
    const anchor = findTextAnchor((t) => t === "leeren") ||
      findTextAnchor((t) => t.endsWith("gesamtrabatt"));
    for (let node = anchor, i = 0; node && node !== document.body && i < 6; i++, node = node.parentElement) {
      const hits = [...node.querySelectorAll("*")]
        .filter((el) => !el.children.length && EURO.test(el.textContent.trim()));
      if (hits.length) return hits[hits.length - 1];
    }
    return null;
  }

  function readTotalCents() {
    let el = null;
    if (settings.totalSelector) {
      try { el = document.querySelector(settings.totalSelector); } catch { el = null; }
    }
    el ??= autoTotalElement();
    if (!el) return null;
    const cents = parseEuroToCents(el.value ?? el.textContent);
    return cents && cents > 0 ? cents : null;
  }

  function findPayButton(target) {
    if (!(target instanceof Element) || isOurs(target)) return null;
    if (settings.paySelector) {
      try { return target.closest(settings.paySelector); } catch { return null; }
    }
    const want = norm(settings.payText);
    const b = target.closest("button, a, [role='button'], input[type='button'], input[type='submit']");
    if (b) return norm(b.value || b.textContent).startsWith(want) ? b : null;
    // Fallback: Button ist ein <div> o. Ä. – Vorfahren mit genau diesem Text suchen
    let node = target;
    for (let i = 0; node && node !== document.body && i < 5; i++, node = node.parentElement) {
      if (norm(node.textContent) === want) return node;
    }
    return null;
  }

  // Klick an helloCash weitergeben, ohne dass wir ihn wieder abfangen
  function proceed(btn) {
    passThrough = true;
    try { btn.click(); } finally { passThrough = false; }
  }

  // ---------- Klick abfangen ----------
  document.addEventListener("click", (e) => {
    if (picking) return onPickClick(e);
    if (passThrough || !settings.enabled || modal) return;
    const btn = findPayButton(e.target);
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showChoice(btn);
  }, true);

  // ---------- Auswahl Bar / Karte ----------
  function closeModal() {
    modal?.remove();
    modal = null;
    document.removeEventListener("keydown", onModalKey, true);
  }

  function onModalKey(e) {
    if (!modal) return;
    const k = e.key.toLowerCase();
    const map = { b: "bar", k: "karte", escape: "abbrechen" };
    if (!map[k]) return;
    if (k !== "escape" && e.target instanceof HTMLInputElement) return; // Tippen im Betragsfeld
    e.preventDefault();
    e.stopImmediatePropagation();
    modal.querySelector(`[data-action="${map[k]}"]`)?.click();
  }

  function showChoice(btn) {
    closeModal();
    const cents = readTotalCents();
    const amountInput = h("input", {
      class: "hcsu-amount-input", type: "text", inputmode: "decimal",
      placeholder: "Betrag, z. B. 12,99",
    });
    if (cents) amountInput.value = (cents / 100).toFixed(2).replace(".", ",");

    const msg = h("div", { class: "hcsu-msg" });
    const box = h("div", { class: "hcsu-box" },
      h("div", { class: "hcsu-title" }, "Wie wird bezahlt?"),
      h("div", { class: "hcsu-amount" },
        cents ? fmt(cents) : "Betrag nicht erkannt – bei Karte bitte eintragen:"),
      cents ? null : amountInput,
      msg,
      h("div", { class: "hcsu-buttons" },
        h("button", { class: "hcsu-btn hcsu-bar", "data-action": "bar",
          on: { click: () => { closeModal(); proceed(btn); } } }, "Bar (B)"),
        h("button", { class: "hcsu-btn hcsu-karte", "data-action": "karte",
          on: { click: () => {
            const c = cents || parseEuroToCents(amountInput.value);
            if (!c || c <= 0) { msg.textContent = "Bitte einen gültigen Betrag eintragen."; return; }
            startCard(btn, c, box, msg);
          } } }, "Karte (K)"),
      ),
      h("button", { class: "hcsu-link", "data-action": "abbrechen",
        on: { click: closeModal } }, "Abbrechen (Esc)"),
    );
    modal = h("div", { class: "hcsu-root hcsu-overlay" }, box);
    document.body.append(modal);
    document.addEventListener("keydown", onModalKey, true);
    if (!cents) amountInput.focus();
  }

  async function startCard(btn, cents, box, msg) {
    box.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    msg.className = "hcsu-msg";
    msg.textContent = "Sende Betrag ans Terminal …";
    try {
      const r = await send("startCheckout", { cents, description: "Kartenzahlung" });
      closeModal();
      proceed(btn);
      track(cents, r.clientTransactionId, btn);
    } catch (err) {
      msg.className = "hcsu-msg hcsu-err";
      msg.textContent = `Terminal nicht erreicht: ${err.message}`;
      const buttons = box.querySelector(".hcsu-buttons");
      buttons.replaceChildren(
        h("button", { class: "hcsu-btn hcsu-karte",
          on: { click: () => startCard(btn, cents, box, msg) } }, "Nochmal"),
        h("button", { class: "hcsu-btn hcsu-bar",
          on: { click: () => { closeModal(); proceed(btn); } } }, "Ohne Terminal weiter"),
      );
      box.querySelectorAll("button").forEach((b) => { b.disabled = false; });
    }
  }

  // ---------- Statusanzeige unten rechts ----------
  const STATE_TEXT = {
    WAITING_FOR_CARD: "Warte auf Karte …",
    WAITING_FOR_PIN: "Kunde gibt PIN ein …",
    WAITING_FOR_SIGNATURE: "Warte auf Unterschrift …",
    SELECTING_TIP: "Kunde wählt Trinkgeld …",
    UPDATING_FIRMWARE: "Terminal aktualisiert sich …",
  };

  const CARD_NAMES = {
    GIROCARD: "Girocard", VISA: "Visa", VISA_ELECTRON: "Visa Electron", VISA_VPAY: "V Pay",
    VPAY: "V Pay", MASTERCARD: "Mastercard", MAESTRO: "Maestro", AMEX: "American Express",
    DINERS: "Diners", DISCOVER: "Discover", JCB: "JCB", CUP: "UnionPay",
  };
  const ENTRY_NAMES = {
    contactless: "kontaktlos", chip: "gesteckt", "apple pay": "Apple Pay",
    "google pay": "Google Pay", magstripe: "Magnetstreifen",
  };

  // z. B. „– Mastercard (Debit) •••• 3456, Apple Pay“
  function describeCard(card) {
    if (!card?.type) return "";
    const name = CARD_NAMES[card.type] || card.type;
    const kind = card.type === "GIROCARD" ? "" :
      card.processAs === "DEBIT" ? " (Debit)" : card.processAs === "CREDIT" ? " (Kredit)" : "";
    const last4 = card.last4 ? ` •••• ${card.last4}` : "";
    const entry = ENTRY_NAMES[card.entryMode] ? `, ${ENTRY_NAMES[card.entryMode]}` : "";
    return `– ${name}${kind}${last4}${entry}`;
  }

  function stopPoll() { clearTimeout(pollTimer); pollTimer = null; }
  function closePanel() { stopPoll(); panel?.remove(); panel = null; }

  function renderPanel(kind, cents, text, actions = []) {
    panel?.remove();
    panel = h("div", { class: `hcsu-root hcsu-panel hcsu-${kind}` },
      h("div", { class: "hcsu-panel-title" }, `Karte ${fmt(cents)}`),
      h("div", { class: "hcsu-panel-text" }, text),
      actions.length ? h("div", { class: "hcsu-panel-actions" }, ...actions) : null,
    );
    document.body.append(panel);
  }

  function track(cents, ctid, btn) {
    stopPoll();
    const started = Date.now();
    let sawBusy = false;
    let idleSince = null;

    const cancelBtn = () => h("button", { class: "hcsu-btn-small", on: { click: async () => {
      try { await send("terminate"); } catch (e) { /* Status-Polling zeigt das Ergebnis */ }
    } } }, "Am Terminal abbrechen");
    const retryBtn = () => h("button", { class: "hcsu-btn-small", on: { click: async () => {
      try {
        const r = await send("startCheckout", { cents, description: "Kartenzahlung" });
        track(cents, r.clientTransactionId, btn);
      } catch (e) { renderPanel("bad", cents, `Terminal nicht erreicht: ${e.message}`, [retryBtn(), closeBtn()]); }
    } } }, "Nochmal senden");
    const closeBtn = () => h("button", { class: "hcsu-btn-small", on: { click: closePanel } }, "Schließen");

    const finish = (kind, text) => {
      stopPoll();
      renderPanel(kind, cents, text, kind === "ok" ? [closeBtn()] : [retryBtn(), closeBtn()]);
      if (kind === "ok") setTimeout(() => { if (panel?.classList.contains("hcsu-ok")) closePanel(); }, 20000);
    };

    renderPanel("pending", cents, "Betrag ist am Terminal …", [cancelBtn()]);

    const tick = async () => {
      let st;
      try {
        st = await send("checkoutStatus", { clientTransactionId: ctid });
      } catch (e) {
        renderPanel("warn", cents, `Status nicht abrufbar: ${e.message}`, [cancelBtn(), closeBtn()]);
        pollTimer = setTimeout(tick, 3000);
        return;
      }
      const age = Date.now() - started;
      const tx = st.txStatus;
      if (tx === "SUCCESSFUL") return finish("ok", `Bezahlt ✓ ${describeCard(st.card)}`.trim());
      if (tx === "FAILED" || tx === "CANCELLED") {
        return finish("bad", "NICHT bezahlt. Beleg nicht als Karte abschließen.");
      }
      if (st.readerState && st.readerState !== "IDLE") { sawBusy = true; idleSince = null; }
      if (st.readerState === "IDLE") idleSince ??= Date.now();
      // Terminal wieder frei, aber keine Transaktion: am Gerät abgebrochen oder nie gestartet
      if (!tx && idleSince && ((sawBusy && Date.now() - idleSince > 8000) || age > 75000)) {
        return finish("bad", "Am Terminal abgebrochen – NICHT bezahlt.");
      }
      if (age > 180000) return finish("warn", "Status unklar – bitte in der SumUp-App prüfen.");
      renderPanel("pending", cents, STATE_TEXT[st.readerState] || "Betrag ist am Terminal …", [cancelBtn()]);
      pollTimer = setTimeout(tick, 2000);
    };
    pollTimer = setTimeout(tick, 1500);
  }

  // ---------- Element-Auswahl (einmalige Einrichtung) ----------
  function cssPath(el) {
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      let part = node.tagName.toLowerCase();
      const cls = [...node.classList]
        .filter((c) => !/\d{3,}|^ng-|^is-|active|hover|focus|selected|disabled/.test(c))
        .slice(0, 2);
      if (cls.length) part += "." + cls.map((c) => CSS.escape(c)).join(".");
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const sel = parts.join(" > ");
      try { if (document.querySelectorAll(sel).length === 1) return sel; } catch { /* weiter */ }
      node = parent;
      if (node?.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        return `#${CSS.escape(node.id)} > ${parts.join(" > ")}`;
      }
    }
    return parts.join(" > ");
  }

  function onPickMove(e) {
    if (isOurs(e.target)) return;
    pickHover?.classList.remove("hcsu-pick-hover");
    pickHover = e.target;
    pickHover.classList.add("hcsu-pick-hover");
  }

  function onPickKey(e) {
    if (e.key === "Escape") { e.preventDefault(); stopPicking(); }
  }

  function onPickClick(e) {
    if (isOurs(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    let el = e.target;
    if (picking === "paySelector") el = el.closest("button, a, [role='button'], input") || el;
    pickHover?.classList.remove("hcsu-pick-hover");
    const sel = cssPath(el);
    const field = picking;
    api.storage.local.set({ [field]: sel });
    stopPicking();
    const preview = field === "totalSelector" ? ` → erkannt: ${(() => {
      const c = parseEuroToCents(el.value ?? el.textContent);
      return c ? fmt(c) : "kein Betrag!";
    })()}` : "";
    toast(`Gespeichert: ${sel}${preview}`);
  }

  function startPicking(field) {
    stopPicking();
    picking = field;
    document.addEventListener("mouseover", onPickMove, true);
    document.addEventListener("keydown", onPickKey, true);
    toast(field === "paySelector"
      ? "Klick jetzt auf den „Bezahlen“-Button (Esc = abbrechen)"
      : "Klick jetzt auf den Gesamtbetrag (Esc = abbrechen)", 0);
  }

  function stopPicking() {
    picking = null;
    pickHover?.classList.remove("hcsu-pick-hover");
    pickHover = null;
    document.removeEventListener("mouseover", onPickMove, true);
    document.removeEventListener("keydown", onPickKey, true);
    document.querySelector(".hcsu-toast")?.remove();
  }

  function toast(text, ms = 5000) {
    document.querySelector(".hcsu-toast")?.remove();
    const t = h("div", { class: "hcsu-root hcsu-toast" }, text);
    document.body.append(t);
    if (ms) setTimeout(() => t.remove(), ms);
  }

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // läuft in allen Frames, falls die Kasse in einem iframe steckt
    if (msg?.type !== "pick") return false;
    startPicking(msg.field);
    sendResponse({ ok: true }); // Chrome erwartet eine Antwort, sonst Fehler im Popup
    return false;
  });
})();
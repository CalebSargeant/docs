/*
 * nievah-chat.js — GENERATED. Do not edit.
 *
 * Source: MagmaMoose/nievah widget/src/*.js
 * Rebuild: node widget/build.mjs
 *
 * Usage:  <script type="module" src="nievah-chat.js"></script>
 *         <nievah-chat api="https://chat.magmamoose.com"></nievah-chat>
 *
 * This file is vendored into consumers. If you are reading it inside a
 * product repo, your edit belongs upstream in MagmaMoose/nievah — the
 * next sync will overwrite anything changed here.
 */
// ── src/styles.js ───────────────────────────────────────────────────

/**
 * The widget's shadow stylesheet.
 *
 * ── WHY EVERY VALUE HAS A THREE-LEVEL FALLBACK ──────────────────────────────
 *
 * Custom properties inherit THROUGH the shadow boundary, so a host page that
 * loads @magmamoose/tokens styles this widget for free. But not every host
 * does: an MkDocs site or a bare landing page loads no MagmaMoose tokens at
 * all, and an undefined var() with no fallback makes the whole declaration
 * invalid-at-computed-value-time — which lands on `unset`, not on something
 * sensible. Transparent text on a transparent panel, silently.
 *
 * So every value is var(--nievah-chat-X, var(--token, literal)):
 *   1. --nievah-chat-*  per-widget override, for a host that wants one
 *   2. --token          the MagmaMoose token, when the host ships them
 *   3. literal          the token's real value, so a bare page still looks right
 *
 * The literals are copied from tokens/dist/tokens.css and must stay in step
 * with it. build.mjs asserts that: it reads the token file and fails if any
 * literal here has drifted from the token it claims to mirror.
 *
 * ── --muted IS DELIBERATELY NEVER USED ──────────────────────────────────────
 *
 * tokens.json marks --muted as 4.26:1 on --obsidian-2, which is below the 4.5:1
 * needed for body text. A chat panel is exactly a raised surface full of small
 * secondary text, so it uses --muted-2 throughout. If you find yourself reaching
 * for --muted here, the answer is --muted-2.
 *
 * ── DARK ONLY, ON PURPOSE ───────────────────────────────────────────────────
 *
 * tokens.json says flatly "There is no light theme", and every host surface is
 * dark. A light variant is a v2 problem and a real one — MkDocs Material's
 * palette toggle sets data-md-color-scheme rather than changing
 * prefers-color-scheme, so a media query would not follow the control the user
 * actually operates.
 */

/**
 * The launcher grows with the viewport: 44px clears WCAG 2.2 SC 2.5.8 and is
 * right on a phone, and reads as an afterthought on a 27" monitor. A host
 * wanting one size everywhere sets --nievah-chat-launcher, which stays
 * authoritative inside each query.
 *
 * THESE TWO MUST STAY IN STEP — `sizes` is what makes the picture follow the
 * box. An `x`-descriptor srcset ignores it and picks on pixel ratio alone, so a
 * 1x display keeps taking the 44px file and stretching it.
 */
const LAUNCHER_QUERIES = `
@media (min-width: 768px) { :host { --nvh-launcher: var(--nievah-chat-launcher, 56px); } }
@media (min-width: 1280px) { :host { --nvh-launcher: var(--nievah-chat-launcher, 64px); } }`;

const AVATAR_SIZES = "(min-width: 1280px) 64px, (min-width: 768px) 56px, 44px";

const STYLES = `
:host {
  /* Resolved once here so the rest of the sheet reads plainly. */
  --nvh-accent-a: var(--nievah-chat-accent-a, var(--rose-a, #FF9CC6));
  --nvh-accent-b: var(--nievah-chat-accent-b, var(--rose-b, #D6256E));
  --nvh-ground:   var(--nievah-chat-ground, var(--obsidian-2, #15100C));
  --nvh-sunken:   var(--nievah-chat-sunken, var(--obsidian, #0E0A07));
  --nvh-text:     var(--nievah-chat-text, var(--paper, #FBF6EF));
  --nvh-dim:      var(--nievah-chat-dim, var(--paper-dim, #C9BAAE));
  --nvh-quiet:    var(--nievah-chat-quiet, var(--muted-2, #A2948A));
  --nvh-line:     var(--nievah-chat-line, var(--line, rgba(255, 255, 255, 0.08)));
  --nvh-radius:   var(--radius-panel, 16px);
  --nvh-radius-s: var(--radius-button, 11px);
  --nvh-font:     var(--font-sans, "Sora", system-ui, -apple-system, sans-serif);
  /* The panel's offset and height derive from this, so it is the only place the
     launcher's size is written. See LAUNCHER_QUERIES for why it is not 44px. */
  --nvh-launcher: var(--nievah-chat-launcher, 44px);

  /* The launcher and panel are the only fixed things this widget owns. z-index
     60/70 sits just above magmamoose.com's .to-top (60) without starting an
     arms race — see the site.css note in the README. */
  position: fixed;
  inset: auto 22px 22px auto;
  z-index: 60;
  font-family: var(--nvh-font);
  /* The host element is only ever as big as its launcher; the panel is
     positioned out of it. Without this the fixed 0x0 host still captures
     pointer events across its inset box in some engines. */
  width: var(--nvh-launcher);
  height: var(--nvh-launcher);
}

${LAUNCHER_QUERIES}

:host([hidden]) { display: none; }

*, *::before, *::after { box-sizing: border-box; }

button { font: inherit; color: inherit; }

/* ── launcher ───────────────────────────────────────────────────────────── */

.launcher {
  width: var(--nvh-launcher);
  height: var(--nvh-launcher);
  padding: 0;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: linear-gradient(135deg, var(--nvh-accent-a), var(--nvh-accent-b));
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  transition: transform 140ms ease, box-shadow 140ms ease;
}

/* An opaque portrait fills the button, so the gradient is only ever seen
   through the clip's antialiased rim — which is where it read as a pink ring.
   The badge fallback still needs it. */
.launcher.portrait { background: none; }

.launcher:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5); }
.launcher:active { transform: translateY(0); }

/* :focus-visible only — a mouse click on a launcher should not leave a ring,
   but a Tab to it absolutely must. */
.launcher:focus-visible,
.composer textarea:focus-visible,
.iconbtn:focus-visible,
.suggestion:focus-visible {
  outline: 2px solid var(--nvh-accent-a);
  outline-offset: 2px;
}

/* The img is wrapped in .face, so its width:100% resolves against the span,
   not the button — and place-items:center will not stretch that span. Without
   this the picture sits at its intrinsic 44px inside a 64px launcher, which
   looked right for exactly as long as the launcher was also 44. */
.launcher .face {
  display: block;
  width: 100%;
  height: 100%;
}

/* NO border-radius HERE: the launcher already rounds and clips. Rounding the
   child too gives two antialiased circles of identical size, and the gradient
   painted behind the child's semi-transparent rim bled through it as a pink
   ring around the avatar. One clip, one edge. */
.launcher svg, .launcher img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

/* ── panel ──────────────────────────────────────────────────────────────── */

.panel {
  position: fixed;
  right: 22px;
  /* 22 inset + launcher + 12 gap. Derived: a hardcoded 78px puts the panel on
     top of the launcher on every screen wider than a phone. */
  bottom: calc(22px + var(--nvh-launcher) + 12px);
  width: min(380px, calc(100vw - 44px));   /* the two 22px insets, not the launcher */
  max-height: min(560px, calc(100vh - var(--nvh-launcher) - 96px));
  display: none;
  flex-direction: column;
  overflow: hidden;
  z-index: 70;
  background: var(--nvh-ground);
  color: var(--nvh-text);
  border: 1px solid var(--nvh-line);
  border-radius: var(--nvh-radius);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
}

:host([data-open]) .panel { display: flex; animation: nvh-in 160ms ease-out; }

@keyframes nvh-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── header ─────────────────────────────────────────────────────────────── */

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 12px 14px;
  border-bottom: 1px solid var(--nvh-line);
  flex: 0 0 auto;
}

.head .face { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex: 0 0 auto; }
.head .face svg, .head .face img { width: 100%; height: 100%; display: block; object-fit: cover; }

.head .who { min-width: 0; flex: 1 1 auto; line-height: 1.25; }
.head .name { font-weight: var(--fw-semibold, 600); font-size: 14px; }

/*
 * THE AI DISCLOSURE. Not a footnote, not a tooltip, not behind an info icon.
 *
 * EU AI Act Art. 50(1) requires that a person is informed they are interacting
 * with an AI system, clearly and at the latest at the first interaction. It is
 * also the compensating control for using a photorealistic human avatar: a face
 * plus an explicit label is honest, a face alone is not. If you are tempted to
 * move this for visual reasons, move the avatar instead.
 */
.head .role { font-size: 11.5px; color: var(--nvh-quiet); }

.iconbtn {
  width: 32px; height: 32px;
  flex: 0 0 auto;
  display: grid; place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--nvh-radius-s);
  background: transparent;
  color: var(--nvh-dim);
  cursor: pointer;
}
.iconbtn:hover { background: rgba(255, 255, 255, 0.06); color: var(--nvh-text); }

/* ── transcript ─────────────────────────────────────────────────────────── */

.log {
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13.5px;
  line-height: 1.55;
}

.msg { max-width: 88%; padding: 9px 12px; border-radius: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.her { background: var(--nvh-sunken); border: 1px solid var(--nvh-line); border-bottom-left-radius: 5px; align-self: flex-start; }
.msg.you { background: linear-gradient(135deg, var(--nvh-accent-a), var(--nvh-accent-b)); color: #1A0D14; border-bottom-right-radius: 5px; align-self: flex-end; font-weight: var(--fw-medium, 500); }
.msg.sys { align-self: stretch; max-width: 100%; background: transparent; border: 1px dashed var(--nvh-line); color: var(--nvh-dim); font-size: 12.5px; }

.msg a { color: var(--nvh-accent-a); text-underline-offset: 2px; }

/* Hers, not the host page's: highlight pseudos inherit down the flat tree, across
   the shadow boundary. Follows --nvh-accent-a so a rebranded host stays in colour.
   The outgoing bubble is already solid accent, so it inverts to the deep end. */
::selection { background: color-mix(in srgb, var(--nvh-accent-a) 35%, transparent); color: var(--nvh-text); }
.msg.you::selection, .msg.you ::selection { background: var(--nvh-accent-b); color: #fff; }

.sources { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 7px; }
/* The one thing separating a citation from a suggestion chip. */
.sources-label {
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--nvh-quiet);
}
.sources a {
  font-size: 11.5px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--nvh-line);
  color: var(--nvh-dim);
  text-decoration: none;
}
.sources a:hover { color: var(--nvh-text); border-color: var(--nvh-accent-a); }

/* Typing indicator. Three dots when motion is welcome, plain words when it is
   not — see the reduced-motion block at the end. */
.typing { display: flex; gap: 4px; align-items: center; padding: 10px 12px; }
.typing i { width: 5px; height: 5px; border-radius: 50%; background: var(--nvh-quiet); animation: nvh-blink 1.2s infinite; }
.typing i:nth-child(2) { animation-delay: 0.16s; }
.typing i:nth-child(3) { animation-delay: 0.32s; }
.typing .word { display: none; color: var(--nvh-quiet); font-size: 12.5px; }
@keyframes nvh-blink { 0%, 60%, 100% { opacity: 0.28; } 30% { opacity: 1; } }

/* ── suggestions ────────────────────────────────────────────────────────── */

.suggestions { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 12px; }
.suggestion {
  font-size: 12.5px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--nvh-line);
  background: transparent;
  color: var(--nvh-dim);
  cursor: pointer;
}
.suggestion:hover { color: var(--nvh-text); border-color: var(--nvh-accent-a); }

/* ── composer ───────────────────────────────────────────────────────────── */

.composer {
  flex: 0 0 auto;
  border-top: 1px solid var(--nvh-line);
  padding: 10px 10px 8px;
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.composer textarea {
  flex: 1 1 auto;
  resize: none;
  min-height: 38px;
  max-height: 108px;
  padding: 9px 11px;
  font: inherit;
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--nvh-text);
  background: var(--nvh-sunken);
  border: 1px solid var(--nvh-line);
  border-radius: var(--nvh-radius-s);
}
.composer textarea::placeholder { color: var(--nievah-chat-placeholder, var(--placeholder, #877A6F)); opacity: 1; }
.composer textarea:disabled { opacity: 0.55; cursor: not-allowed; }

.send {
  width: 38px; height: 38px;
  flex: 0 0 auto;
  display: grid; place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--nvh-radius-s);
  cursor: pointer;
  color: #1A0D14;
  background: linear-gradient(135deg, var(--nvh-accent-a), var(--nvh-accent-b));
}
.send:disabled { opacity: 0.4; cursor: not-allowed; }

.foot {
  flex: 0 0 auto;
  padding: 0 12px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--nvh-quiet);
}
.foot a { color: var(--nvh-quiet); }

.count { font-size: 11px; color: var(--nvh-quiet); padding: 0 12px 6px; text-align: right; }
.count.over { color: var(--nievah-chat-crit, var(--crit-ink, #f87171)); }

/* ── mobile: bottom sheet ───────────────────────────────────────────────── */

@media (max-width: 820px) {
  .panel {
    right: 12px;
    left: 12px;
    /* Derived, not 78px: this block ends at 820px but the launcher grows at
       768px, so iPad portrait had a 44px offset under a 56px launcher. */
    bottom: calc(22px + var(--nvh-launcher) + 12px);
    width: auto;
    /* 72px nav + 12 gap; 124 = 168 - 44 holds the top edge still. */
    max-height: calc(100vh - var(--nvh-launcher) - 124px);
  }
}

/* ── reduced motion ─────────────────────────────────────────────────────── */

/*
 * One block, extending the house convention rather than scattering
 * prefers-reduced-motion through the sheet. The typing indicator does not just
 * stop animating — animated dots frozen mid-blink read as a broken widget — it
 * becomes words instead.
 */
@media (prefers-reduced-motion: reduce) {
  :host([data-open]) .panel { animation: none; }
  .launcher { transition: none; }
  .launcher:hover { transform: none; }
  .typing i { display: none; }
  .typing .word { display: block; }
}

/* Honour a host that has switched off animation wholesale. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
}
`;


// ── src/badge.js ────────────────────────────────────────────────────

/**
 * The default avatar: Nievah's eye badge, inlined as vector.
 *
 * WHY A DEFAULT AT ALL. The BUNDLE is public — nievah-chat.js is served to
 * every visitor of magmamoose.com — even though this repo is private. Nievah's
 * photorealistic portrait therefore still cannot be bundled here, not as a file
 * and not as a data: URI, and moving the widget into MagmaMoose/nievah did not
 * change that: the constraint was never the repo's visibility, it is the
 * artefact's. A consumer that has the portrait passes `avatar-src` and gets her
 * face; everything else falls back to this, which is brand-correct, 700 bytes,
 * and needs no network at all.
 *
 * The source is website/brand/svg/products/nievah-badge.svg: a 512x512 squircle
 * (rx 133 = 26% radius) with the eye glyph at translate(72 72) scale(3.075).
 * Reproduced here rather than fetched because the launcher must render on first
 * paint with zero requests — see invariant 3 in the README.
 *
 * ── GRADIENT IDS ARE PER-INSTANCE, AND THAT IS LOAD-BEARING ─────────────────
 *
 * The upstream file uses ids `bg52`/`hl53`, which come from gen.js's single
 * monotonic uid() counter — they renumber whenever a composition is inserted
 * ahead of them in the brand rebuild, so hardcoding them couples this file to
 * an unrelated file's ordering.
 *
 * Worse: SVG ids are DOCUMENT-GLOBAL even from inside a shadow root, and a
 * `url(#id)` reference resolves against the document. Two widgets on one page,
 * or one widget beside any other inlined badge, and the second element's
 * gradient silently resolves to the FIRST one's definition. It does not error;
 * the wrong colours simply render. Hence the per-instance suffix.
 */

let seq = 0;

/** Nievah's eye badge as an inline SVG string, with collision-free gradient ids. */
function eyeBadge() {
  const uid = `nvh-chat-${++seq}`;
  const bg = `${uid}-bg`;
  const hl = `${uid}-hl`;
  return `<svg viewBox="0 0 512 512" role="img" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${bg}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="512" y2="512">
      <stop offset="0" stop-color="var(--nvh-accent-a)"/>
      <stop offset="1" stop-color="var(--nvh-accent-b)"/>
    </linearGradient>
    <linearGradient id="${hl}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="133" fill="url(#${bg})"/>
  <rect width="512" height="512" rx="133" fill="url(#${hl})"/>
  <g transform="translate(72 72) scale(3.075)">
    <path fill="none" stroke="#FBF6EF" stroke-width="8" stroke-linecap="round"
          d="M14 60 C 30 32 90 32 106 60 C 90 88 30 88 14 60 Z"/>
    <circle fill="#FBF6EF" cx="60" cy="60" r="13"/>
  </g>
</svg>`;
}


// ── src/transport.js ────────────────────────────────────────────────

/**
 * The wire. This is the only file that knows the protocol, so a backend change
 * lands here and nowhere else.
 *
 * ── TWO ENDPOINTS ───────────────────────────────────────────────────────────
 *
 *   POST {api}/v1/session   -> { token, expiresIn, suggestions?, greeting? }
 *   POST {api}/v1/chat      -> text/event-stream
 *
 * The session token is an opaque string. It is held in memory for the life of
 * the tab and never written to storage: a token in localStorage outlives the
 * visit, survives into a shared browser, and is exactly the thing an XSS on the
 * host page would go looking for. Losing it on reload costs one round trip.
 *
 * It travels in `X-Nievah-Session`, NOT in `Authorization`. That is a house
 * rule with a specific reason: LiteLLM's `forward_client_headers_to_llm_api` is
 * a global flag, and several model entries authenticate by OAuth pass-through
 * with no api_key of their own — so a stray Authorization header arriving at a
 * proxy can be forwarded upstream and billed to someone else's subscription.
 * Nothing in this widget's path does that today, and keeping the header name
 * distinct means it stays true if the path ever changes.
 *
 * ── SSE EVENTS ──────────────────────────────────────────────────────────────
 *
 *   delta  { text }                  append to the current answer
 *   done   { sources?, remaining? }  answer complete
 *   limit  { reason, retryAfter? }   a guardrail fired; show it, do not retry
 *   error  { message }               something broke; show the fallback
 *
 * `limit` is separate from `error` on purpose. A limit is the system working as
 * designed and deserves a calm, specific message with a way forward; an error
 * is a fault. Collapsing them trains people to ignore both.
 */

/**
 * Read an SSE body without EventSource.
 *
 * EventSource cannot POST and cannot set headers, so it is unusable for an
 * authenticated request with a body. This is the standard manual parse: split
 * on the blank-line record separator and keep the remainder, because a chunk
 * boundary can land anywhere — including inside a multi-byte character, which
 * is why the decoder runs in streaming mode.
 */
async function* readEvents(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = "message";
        const data = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
          // ':' comment lines are keep-alives; ignore them.
        }
        if (!data.length) continue;
        let payload;
        try {
          payload = JSON.parse(data.join("\n"));
        } catch {
          // A malformed frame is a server bug. Skipping it beats tearing down a
          // stream that is otherwise fine.
          continue;
        }
        yield { event, payload };
      }
    }
  } finally {
    // Abort mid-stream (panel closed, page navigated) must not leave the body
    // half-read and the connection pinned.
    if (signal?.aborted) reader.cancel().catch(() => {});
    reader.releaseLock?.();
  }
}

class Transport {
  constructor(api) {
    this.api = String(api || "").replace(/\/+$/, "");
    this.token = null;
    this.abort = null;
  }

  /** True once a session exists, i.e. once the visitor has actually said something. */
  get live() {
    return Boolean(this.token);
  }

  /**
   * Mint a session. Called on the FIRST SEND, not on open — someone who opens
   * the panel, reads the greeting and closes it again should cost nothing at
   * all, neither a session nor a Turnstile solve.
   */
  async session(turnstileToken) {
    const res = await fetch(`${this.api}/v1/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(turnstileToken ? { turnstile: turnstileToken } : {}),
    });
    if (!res.ok) throw Object.assign(new Error(`session ${res.status}`), { status: res.status });
    const data = await res.json();
    this.token = data.token;
    return data;
  }

  /** Cancel an in-flight answer. Safe to call when nothing is in flight. */
  cancel() {
    this.abort?.abort();
    this.abort = null;
  }

  /**
   * Send one message and drive the callbacks as the answer arrives.
   *
   * Returns when the stream ends. Throws only on a transport failure — a
   * guardrail firing arrives as an onLimit call, because it is not an error.
   */
  async send(text, { onDelta, onDone, onLimit }) {
    this.cancel();
    const ctrl = new AbortController();
    this.abort = ctrl;

    const res = await fetch(`${this.api}/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nievah-Session": this.token || "",
      },
      body: JSON.stringify({ message: text }),
      signal: ctrl.signal,
    });

    // 401 means the session expired or was burned. The caller re-mints once;
    // it does not loop, because a re-mint that also 401s is a real fault.
    if (res.status === 401) {
      this.token = null;
      throw Object.assign(new Error("session expired"), { status: 401 });
    }
    if (res.status === 429 || res.status === 503) {
      let payload = {};
      try {
        payload = await res.json();
      } catch {
        /* an empty body is fine; the status carries the meaning */
      }
      onLimit?.(payload);
      return;
    }
    if (!res.ok || !res.body) {
      throw Object.assign(new Error(`chat ${res.status}`), { status: res.status });
    }

    for await (const { event, payload } of readEvents(res.body, ctrl.signal)) {
      if (event === "delta") onDelta?.(payload.text || "");
      else if (event === "limit") return onLimit?.(payload);
      else if (event === "error") throw new Error(payload.message || "stream error");
      else if (event === "done") return onDone?.(payload || {});
    }
    // A stream that ends without `done` is a truncated answer, not a clean one.
    onDone?.({ truncated: true });
  }
}

/**
 * Turnstile, rendered into a container the widget owns in the LIGHT DOM.
 *
 * turnstile.render() creates its elements against `document` and cannot find a
 * node inside a shadow root — it fails with "Cannot initialize Widget, Element
 * not found" for both open and closed roots. So the container is a 0x0 hidden
 * div appended to document.body by the widget itself. The host page still adds
 * exactly one element and one script; nothing about the contract changes.
 *
 * Entirely optional. With no `turnstile-sitekey` attribute this never runs, no
 * third-party script is fetched, and the backend falls back to its WAF and rate
 * limits. That matters for surfaces whose CSP names no third-party origins.
 */
async function turnstileToken(sitekey, action) {
  if (!sitekey) return null;
  if (!window.turnstile) {
    await new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-nvh-turnstile]");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.setAttribute("data-nvh-turnstile", "");
      s.addEventListener("load", resolve, { once: true });
      s.addEventListener("error", reject, { once: true });
      document.head.appendChild(s);
    });
  }

  let host = document.querySelector("div[data-nvh-turnstile]");
  if (!host || !host.isConnected) {
    host = document.createElement("div");
    host.setAttribute("data-nvh-turnstile", "");
    host.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none";
    document.body.appendChild(host);
  }

  return new Promise((resolve, reject) => {
    window.turnstile.render(host, {
      sitekey,
      action,
      size: "invisible",
      callback: resolve,
      "error-callback": () => reject(new Error("turnstile failed")),
      "timeout-callback": () => reject(new Error("turnstile timeout")),
    });
  });
}


// ── src/element.js ──────────────────────────────────────────────────

/**
 * <nievah-chat> — Nievah, as a chat widget, on any MagmaMoose frontend.
 *
 * ── THE PUBLIC API IS STRING ATTRIBUTES, AND ONLY STRING ATTRIBUTES ─────────
 *
 * Not properties, not object attributes, not custom events the host must bind.
 * Today's embeds are all plain HTML (MagmaMoose/website's product pages), but a
 * future React consumer changes nothing here: React 18 sets every unknown JSX
 * prop on a custom element as a STRING attribute and cannot pass an object or
 * bind a custom event without a ref. A property-based API would work in plain
 * HTML, look correct in review, and quietly do nothing the day a console embeds it.
 *
 *   api                 base URL of the chat Worker (required)
 *   avatar-src          her portrait; omit for the built-in eye badge
 *   avatar-srcset       optional srcset for the same. Prefer `w` descriptors
 *                       over `x`: the launcher sizes off the viewport, not the
 *                       pixel ratio, and only `w` lets the browser see that.
 *   name                display name (default "Nievah")
 *   turnstile-sitekey   enables Turnstile; omit to skip it entirely
 *   contact             mailto address for the human escape hatch
 *   contact-label       that link's text (default "email us")
 *   intro               greeting line; overrides the server's
 *   placeholder         the composer's placeholder (default "Ask about Magma Moose…")
 *   accent-a/accent-b   override the gem gradient
 *
 * ── WHAT THIS WIDGET WILL NOT DO ────────────────────────────────────────────
 *
 * These are invariants, not defaults, and they are the whole reason this is
 * pleasant to have on a page. Any change here needs a real argument:
 *
 *   1. It NEVER opens itself. Not on load, not on a timer, not on exit intent,
 *      not on scroll depth. There is no code path that could.
 *   2. No preview bubble, no unread badge, no sound, no proactive nag.
 *   3. NO NETWORK until the visitor sends a first message. Not on page load,
 *      not on hover, not even on open — opening, reading and closing again
 *      costs nothing, so the widget cannot become a tracking beacon.
 *   4. It writes NOTHING to the device. No cookie, no localStorage, no
 *      sessionStorage. The session token lives in memory for the tab's life.
 *      This is what keeps the host site out of consent-banner territory, and it
 *      is cheap to keep — do not "improve" it by remembering anything.
 */

const MAX_INPUT = 600;
const NEAR_BOTTOM = 24;

const SEND_ICON =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M4 12h13M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CLOSE_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round"/></svg>';

/**
 * Render model output as safe DOM.
 *
 * The answer is UNTRUSTED — it is generated text that may quote a page which
 * itself quoted a visitor. It never touches innerHTML. Text becomes text nodes
 * and links become real anchors built by the DOM, so there is no parse step an
 * injection could aim at.
 *
 * Only [label](url) and bare http(s) URLs are recognised, and only http, https
 * and mailto schemes survive — which is what rules out `javascript:`, the one
 * scheme that turns a link into script execution.
 *
 * Emphasis markers are STRIPPED, never rendered: a markdown renderer is a parse
 * step over untrusted text, which is what the paragraph above exists to avoid.
 * But a model writes `**Chargate**` whatever its prompt says and those asterisks
 * were reaching visitors, so they are removed as punctuation before anything is
 * parsed. String in, string out. The prompt asking for plain text is the fix;
 * this is the backstop.
 */
const EMPHASIS = /(\*\*|__|(?<!\*)\*(?!\*)|(?<!_)_(?!_))(?=\S)([\s\S]*?\S)\1/g;

function renderText(target, rawText) {
  const text = String(rawText).replace(EMPHASIS, "$2");
  const pattern = /\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/g;
  let last = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) target.appendChild(document.createTextNode(text.slice(last, m.index)));
    const label = m[1] ?? m[3];
    const href = m[2] ?? m[3];
    let safe = null;
    try {
      const u = new URL(href);
      if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") safe = u.href;
    } catch {
      /* not a URL we can vouch for — fall through and emit it as plain text */
    }
    if (safe) {
      const a = document.createElement("a");
      a.href = safe;
      a.textContent = label;
      a.rel = "noopener noreferrer nofollow";
      a.target = "_blank";
      target.appendChild(a);
    } else {
      target.appendChild(document.createTextNode(m[0]));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) target.appendChild(document.createTextNode(text.slice(last)));
}

class NievahChat extends HTMLElement {
  #root;
  #els = {};
  #transport = null;
  #open = false;
  #busy = false;
  #started = false;
  #follow = true;

  connectedCallback() {
    if (this.#root) return;
    this.#root = this.attachShadow({ mode: "open" });
    this.#build();
    // Tells the host page a launcher is present, so it can move any of its own
    // fixed bottom-right furniture out of the way. magmamoose.com uses this to
    // lift .to-top; see the README.
    document.documentElement.setAttribute("data-nievah", "");
  }

  disconnectedCallback() {
    this.#transport?.cancel();
    document.documentElement.removeAttribute("data-nievah");
  }

  #attr(name, fallback = "") {
    const v = this.getAttribute(name);
    return v === null || v === "" ? fallback : v;
  }

  /** The avatar, as markup: her portrait when given one, the eye badge otherwise. */
  #face(cls) {
    const src = this.#attr("avatar-src");
    if (!src) return `<span class="${cls}">${eyeBadge()}</span>`;
    const srcset = this.#attr("avatar-srcset");
    const alt = this.#attr("name", "Nievah");
    // Inert next to an `x`-descriptor srcset, so it is safe for hosts still on
    // one. It describes the launcher; the 32px header copy is the same URL.
    return (
      `<span class="${cls}"><img src="${escapeAttr(src)}"` +
      (srcset ? ` srcset="${escapeAttr(srcset)}" sizes="${escapeAttr(AVATAR_SIZES)}"` : "") +
      ` alt="${escapeAttr(alt)}" width="44" height="44" decoding="async"></span>`
    );
  }

  #build() {
    const name = this.#attr("name", "Nievah");
    const accentA = this.#attr("accent-a");
    const accentB = this.#attr("accent-b");

    const style = document.createElement("style");
    style.textContent =
      STYLES +
      (accentA ? `\n:host { --nievah-chat-accent-a: ${escapeCss(accentA)}; }` : "") +
      (accentB ? `\n:host { --nievah-chat-accent-b: ${escapeCss(accentB)}; }` : "");
    this.#root.appendChild(style);

    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <button class="launcher${this.#attr("avatar-src") ? " portrait" : ""}" type="button"
              aria-expanded="false"
              aria-label="Open chat with ${escapeAttr(name)}">${this.#face("face")}</button>
      <div class="panel" role="dialog" aria-labelledby="nvh-title" hidden>
        <div class="head">
          ${this.#face("face")}
          <div class="who">
            <div class="name" id="nvh-title">${escapeHtml(name)}</div>
            <div class="role">AI assistant &middot; answers may be wrong</div>
          </div>
          <button class="iconbtn close" type="button" aria-label="Close chat">${CLOSE_ICON}</button>
        </div>
        <div class="log" role="log" aria-live="polite" aria-atomic="false"
             aria-label="Conversation"></div>
        <div class="suggestions"></div>
        <div class="count" aria-hidden="true"></div>
        <form class="composer">
          <textarea rows="1" maxlength="${MAX_INPUT}" enterkeyhint="send"
                    aria-label="Message ${escapeAttr(name)}"
                    placeholder="${escapeAttr(this.#attr("placeholder", "Ask about Magma Moose…"))}"></textarea>
          <button class="send" type="submit" aria-label="Send message" disabled>${SEND_ICON}</button>
        </form>
        <div class="foot"></div>
      </div>`;
    while (wrap.firstChild) this.#root.appendChild(wrap.firstChild);

    const $ = (s) => this.#root.querySelector(s);
    this.#els = {
      launcher: $(".launcher"),
      panel: $(".panel"),
      close: $(".close"),
      log: $(".log"),
      suggestions: $(".suggestions"),
      count: $(".count"),
      form: $(".composer"),
      input: $("textarea"),
      send: $(".send"),
      foot: $(".foot"),
    };

    this.#els.foot.append(document.createTextNode("AI-generated. Check the linked page, or "));
    const mail = document.createElement("a");
    const contact = this.#attr("contact");
    mail.href = contact ? `mailto:${contact}` : "#";
    mail.textContent = contact ? this.#attr("contact-label", "email us") : "contact us";
    if (!contact) mail.removeAttribute("href");
    this.#els.foot.append(mail, document.createTextNode(", for anything that matters."));

    // A scroll that leaves the bottom is the reader saying "stop moving this".
    // Our own scroll-to-bottom lands within the threshold, so following re-arms.
    this.#els.log.addEventListener("scroll", () => {
      const log = this.#els.log;
      this.#follow = log.scrollHeight - log.scrollTop - log.clientHeight < NEAR_BOTTOM;
    }, { passive: true });

    this.#els.launcher.addEventListener("click", () => this.toggle());
    this.#els.close.addEventListener("click", () => this.close());
    this.#els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.#submit();
    });
    this.#els.input.addEventListener("input", () => this.#onInput());
    this.#els.input.addEventListener("keydown", (e) => {
      // Enter sends, Shift+Enter is a newline. IME composition must be left
      // alone or Japanese and Chinese input send on every candidate selection.
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.#submit();
      }
    });
    // Escape closes from anywhere inside the panel. Non-modal, so this is the
    // only key the widget takes from the page.
    this.#root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.#open) {
        e.stopPropagation();
        this.close();
      }
    });
  }

  // ── open / close ──────────────────────────────────────────────────────────

  toggle() {
    this.#open ? this.close() : this.open();
  }

  open() {
    if (this.#open) return;
    this.#open = true;
    this.toggleAttribute("data-open", true);
    this.#els.panel.hidden = false;
    this.#els.launcher.setAttribute("aria-expanded", "true");
    document.documentElement.setAttribute("data-nievah", "open");

    if (!this.#started) {
      this.#started = true;
      this.#greet();
    }
    // Focus lands in the composer, which is what someone opening a chat wants.
    // No focus trap: a corner widget that captures Tab is a serious bug, and
    // a keyboard user must be able to Tab straight back out to the page.
    this.#els.input.focus();
    this.dispatchEvent(new CustomEvent("nievah-chat:open", { bubbles: true, composed: true }));
  }

  close() {
    if (!this.#open) return;
    this.#open = false;
    this.removeAttribute("data-open");
    this.#els.panel.hidden = true;
    this.#els.launcher.setAttribute("aria-expanded", "false");
    document.documentElement.setAttribute("data-nievah", "");
    this.#transport?.cancel();
    this.#setBusy(false);
    // Focus must come back to the control that opened the panel, or a keyboard
    // user is dropped at the top of the document (W3C ARIA APG dialog pattern).
    this.#els.launcher.focus();
    this.dispatchEvent(new CustomEvent("nievah-chat:close", { bubbles: true, composed: true }));
  }

  // ── conversation ──────────────────────────────────────────────────────────

  /**
   * The greeting is LOCAL. It states who she is and what she can help with, and
   * it costs no request — which is what keeps invariant 3 true while still
   * making the panel useful the moment it opens.
   */
  #greet() {
    const name = this.#attr("name", "Nievah");
    const intro = this.#attr(
      "intro",
      `Hi, I'm ${name} — the AI assistant for Magma Moose. Ask me about the ` +
        `products, what they do, or how they fit together.`,
    );
    this.#say("her", intro);
    this.#suggest(this.#suggestions());
  }

  /**
   * The three openers, `|`-separated in a `suggestions` attribute, like `intro`.
   *
   * THEY MUST NAME THINGS THE CORPUS COVERS. These are the first words a visitor
   * sees, and clicking one sends it — so a suggestion the site does not talk
   * about is a guaranteed "I could not find that" as the opening exchange. One
   * of the three defaults used to name a product that appears on no page of
   * magmamoose.com and zero times in the generated corpus, which made the second
   * of three invitations the one question she definitionally cannot answer.
   *
   * That product is also unreleased, so the old default published its name to
   * every visitor. Keep this list to things the public site already says: this
   * file ships to browsers, comments and all.
   *
   * Overridable per page precisely because that pairing will drift again: the
   * corpus regenerates from the site on a schedule, and this list does not.
   */
  #suggestions() {
    const raw = this.#attr("suggestions");
    if (raw) {
      const parts = raw.split("|").map((q) => q.trim()).filter(Boolean);
      if (parts.length) return parts;
    }
    return [
      "What does Magma Moose build?",
      "What does Diatreme do?",
      "How do the products fit together?",
    ];
  }

  #suggest(list) {
    this.#els.suggestions.replaceChildren();
    for (const q of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "suggestion";
      b.textContent = q;
      b.addEventListener("click", () => {
        this.#els.input.value = q;
        this.#onInput();
        this.#submit();
      });
      this.#els.suggestions.appendChild(b);
    }
  }

  #say(who, text) {
    const el = document.createElement("div");
    el.className = `msg ${who}`;
    renderText(el, text);
    this.#els.log.appendChild(el);
    this.#scroll(true);
    return el;
  }

  /**
   * Follow the stream, unless the reader has deliberately scrolled away.
   *
   * Yanking the transcript down while someone is reading further up is the most
   * disorienting thing a chat widget does. But the obvious guard — "only scroll
   * if we are currently within N px of the bottom" — is broken, and visibly so:
   * while the transcript still fits there is nothing to scroll, so the moment
   * the first answer overflows the panel the distance-to-bottom jumps past the
   * threshold and following never starts. The answer renders clipped mid-word
   * and simply stops moving.
   *
   * So intent is tracked instead of inferred. #follow starts true and is
   * cleared only by a scroll event that leaves the bottom — which our own
   * scroll-to-bottom never does, so it re-arms itself.
   */
  #scroll(force) {
    if (force) this.#follow = true;
    if (!this.#follow) return;
    const log = this.#els.log;
    log.scrollTop = log.scrollHeight;
  }

  #onInput() {
    const n = this.#els.input.value.length;
    const left = MAX_INPUT - n;
    this.#els.count.textContent = left <= 80 ? `${left}` : "";
    this.#els.count.classList.toggle("over", left <= 0);
    this.#els.send.disabled = this.#busy || !this.#els.input.value.trim();
    // Grow with the text, up to the CSS max-height, then scroll internally.
    this.#els.input.style.height = "auto";
    this.#els.input.style.height = `${Math.min(this.#els.input.scrollHeight, 108)}px`;
  }

  #setBusy(busy) {
    this.#busy = busy;
    this.#els.input.disabled = busy;
    this.#els.send.disabled = busy || !this.#els.input.value.trim();
  }

  #typing() {
    const el = document.createElement("div");
    el.className = "typing";
    el.innerHTML = '<i></i><i></i><i></i><span class="word"></span>';
    // The reduced-motion fallback needs real words, not frozen dots.
    el.querySelector(".word").textContent = `${this.#attr("name", "Nievah")} is typing…`;
    this.#els.log.appendChild(el);
    this.#scroll(true);
    return el;
  }

  async #submit(retry = false) {
    const text = this.#els.input.value.trim();
    if (!text || this.#busy) return;
    if (text.length > MAX_INPUT) return;

    if (!retry) this.#say("you", text);
    this.#els.input.value = "";
    this.#onInput();
    this.#els.suggestions.replaceChildren();
    this.#setBusy(true);

    const typing = this.#typing();
    let bubble = null;
    let answer = "";

    const onDelta = (chunk) => {
      if (!bubble) {
        typing.remove();
        bubble = document.createElement("div");
        bubble.className = "msg her";
        // The bubble is hidden from assistive tech WHILE STREAMING. Pushing
        // every token into a polite live region floods a screen reader into
        // uselessness; the completed answer is announced once, on `done`.
        bubble.setAttribute("aria-hidden", "true");
        this.#els.log.appendChild(bubble);
      }
      answer += chunk;
      bubble.replaceChildren();
      renderText(bubble, answer);
      this.#scroll(false);
    };

    try {
      this.#transport ||= new Transport(this.#attr("api"));
      if (!this.#transport.live) await this.#mint();

      await this.#transport.send(text, {
        onDelta,
        onLimit: (info) => {
          typing.remove();
          bubble?.remove();
          this.#limit(info);
        },
        onDone: (info) => {
          typing.remove();
          if (bubble) {
            // Hand the finished answer to assistive tech, once.
            bubble.removeAttribute("aria-hidden");
            if (info.sources?.length) this.#sources(bubble, info.sources);
          }
          // After every answer, not just the greeting: a panel that invites one
          // question and then goes quiet reads as a search box.
          if (info.followups?.length) this.#suggest(info.followups);
          this.#scroll(false);
        },
      });
    } catch (err) {
      typing.remove();
      bubble?.remove();
      if (err?.name === "AbortError") return;
      if (err?.status === 401 && this.#started && !retry) {
        // One silent re-mint, then give up. A second 401 is a real fault, and
        // retrying it forever is how a widget turns a bad deploy into a flood.
        try {
          await this.#mint();
          this.#setBusy(false);
          this.#els.input.value = text;
          this.#onInput();
          return this.#submit(true);
        } catch {
          /* fall through to the offline message */
        }
      }
      this.#offline();
    } finally {
      this.#setBusy(false);
      this.#els.input.focus();
    }
  }

  async #mint() {
    const key = this.#attr("turnstile-sitekey");
    let ts = null;
    if (key) {
      try {
        ts = await turnstileToken(key, "nievah-chat");
      } catch {
        // A blocked or failed challenge must not be a dead end — the server
        // decides whether a tokenless session is allowed, not the browser.
        ts = null;
      }
    }
    const data = await this.#transport.session(ts);
    if (data.suggestions?.length) this.#suggest(data.suggestions);
  }

  /**
   * Citations, which must look NOTHING like the suggestion chips: both were
   * pills of the same size a row apart, so three citations read as three
   * follow-ups that made no sense as questions. "Sources" is the whole fix.
   * Deduped by URL — three chunks are routinely three headings from one page.
   */
  #sources(bubble, sources) {
    const box = document.createElement("div");
    box.className = "sources";

    const label = document.createElement("span");
    label.className = "sources-label";
    label.textContent = "Sources";
    box.appendChild(label);

    const seen = new Set();
    for (const s of sources) {
      if (!s?.url) continue;
      let safe, u;
      try {
        u = new URL(s.url);
        if (u.protocol !== "http:" && u.protocol !== "https:") continue;
        safe = u.href;
      } catch {
        continue;
      }
      if (seen.has(safe)) continue;
      seen.add(safe);
      const a = document.createElement("a");
      a.href = safe;
      a.textContent = s.title || u.pathname;
      a.rel = "noopener noreferrer";
      box.appendChild(a);
      if (seen.size === 3) break;
    }
    if (seen.size) bubble.appendChild(box);
  }

  /**
   * A guardrail fired. This is the system working, so it gets a calm sentence
   * and a way forward — never a raw 429, and never a retry button that would
   * just spend the next allowance too.
   */
  #limit(info) {
    const contact = this.#attr("contact");
    const messages = {
      session: "That's as much as I can cover in one conversation.",
      daily: "I've hit my limit for today.",
      rate: "You're going a little fast for me.",
    };
    const lead = messages[info?.reason] || "I can't answer any more right now.";
    const tail = contact ? ` Email ${contact} and a human will pick it up.` : "";
    this.#say("sys", lead + tail);
    if (info?.reason === "session" || info?.reason === "daily") {
      this.#els.input.disabled = true;
      this.#els.input.placeholder = "Chat closed for now";
    }
  }

  #offline() {
    const contact = this.#attr("contact");
    this.#say(
      "sys",
      "I can't reach my brain at the moment." +
        (contact ? ` Email ${contact} and a human will get back to you.` : ""),
    );
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}
function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
/** Attribute-supplied colours land in a <style>; keep them to colour syntax. */
function escapeCss(s) {
  return String(s).replace(/[^a-zA-Z0-9#(),.%\s-]/g, "");
}

if (!customElements.get("nievah-chat")) {
  customElements.define("nievah-chat", NievahChat);
}



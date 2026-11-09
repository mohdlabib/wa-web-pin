// PIN lock overlay for WhatsApp Web. Fails closed: the page stays covered
// until the correct PIN is entered, including when no PIN is configured.
(() => {
  const DEFAULT_IDLE_MINUTES = 5;
  const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"];
  const KEY_EVENTS = ["keydown", "keypress", "keyup", "paste"];
  const BLOCKED_EVENTS = ["keydown", "keypress", "keyup", "paste", "drop", "wheel", "mousedown", "click"];

  let locked = true;
  let lastActivity = Date.now();
  let idleMinutes = DEFAULT_IDLE_MINUTES;
  let busy = false;

  const host = document.createElement("div");
  host.id = "wapin-lock-host";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .overlay {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        background: #0b141a; color: #e9edef;
        font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .overlay[hidden] { display: none; }
      form { display: flex; flex-direction: column; align-items: center; gap: 14px; width: 280px; }
      h1 { font-size: 20px; font-weight: 600; margin: 0; }
      p { margin: 0; color: #8696a0; text-align: center; }
      input {
        width: 100%; box-sizing: border-box; padding: 12px; border-radius: 8px;
        border: 1px solid #2a3942; background: #202c33; color: #e9edef;
        font-size: 22px; letter-spacing: 6px; text-align: center; outline: none;
      }
      input:focus { border-color: #00a884; }
      button {
        width: 100%; padding: 11px; border: 0; border-radius: 8px; cursor: pointer;
        background: #00a884; color: #111b21; font-size: 15px; font-weight: 600;
      }
      button:disabled { opacity: .5; cursor: default; }
      button[hidden] { display: none; }
      .settings { background: #2a3942; color: #e9edef; }
      .error { color: #f15c6d; min-height: 1.4em; }
    </style>
    <div class="overlay" part="overlay">
      <form autocomplete="off">
        <h1>WhatsApp Web is locked</h1>
        <p class="hint">Enter your PIN to continue</p>
        <input type="password" inputmode="numeric" maxlength="12" aria-label="PIN" />
        <button type="submit">Unlock</button>
        <p class="error" role="alert"></p>
        <button type="button" class="settings" hidden>Open settings</button>
      </form>
    </div>`;

  const overlay = root.querySelector(".overlay");
  const form = root.querySelector("form");
  const input = root.querySelector("input");
  const button = root.querySelector("button");
  const hint = root.querySelector(".hint");
  const error = root.querySelector(".error");
  const settings = root.querySelector(".settings");
  settings.addEventListener("click", () => chrome.runtime.sendMessage("open-options"));

  function mount() {
    if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host);
  }

  function fromOverlay(e) {
    return e.composedPath().includes(host);
  }

  function lock() {
    locked = true;
    overlay.hidden = false;
    input.value = "";
    error.textContent = "";
    mount();
    refreshState();
    setTimeout(() => input.focus(), 0);
  }

  function unlock() {
    locked = false;
    overlay.hidden = true;
    input.value = "";
    lastActivity = Date.now();
  }

  async function refreshState() {
    const { pin, lockUntil = 0, idleMinutes: idle } = await chrome.storage.local.get(["pin", "lockUntil", "idleMinutes"]);
    idleMinutes = Number.isFinite(idle) ? idle : DEFAULT_IDLE_MINUTES;

    if (!pin) {
      hint.textContent = "No PIN is set yet.";
      input.disabled = button.disabled = true;
      settings.hidden = false;
      return;
    }
    hint.textContent = "Enter your PIN to continue";
    settings.hidden = true;

    const wait = lockUntil - Date.now();
    if (wait > 0) {
      input.disabled = button.disabled = true;
      error.textContent = `Too many attempts. Try again in ${Math.ceil(wait / 1000)}s.`;
      setTimeout(refreshState, Math.min(wait, 1000));
      return;
    }
    // Clear an expired cooldown message; keep "wrong PIN" messages.
    if (error.textContent.startsWith("Too many")) error.textContent = "";
    input.disabled = button.disabled = busy;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      const { pin, failCount = 0, lockUntil = 0 } = await chrome.storage.local.get(["pin", "failCount", "lockUntil"]);
      if (!pin || lockUntil > Date.now()) return;

      if (await WAPIN.verify(input.value, pin)) {
        await chrome.storage.local.set({ failCount: 0, lockUntil: 0 });
        unlock();
        return;
      }

      const fails = failCount + 1;
      if (fails >= WAPIN.MAX_ATTEMPTS) {
        await chrome.storage.local.set({ failCount: 0, lockUntil: Date.now() + WAPIN.COOLDOWN_MS });
      } else {
        await chrome.storage.local.set({ failCount: fails });
        error.textContent = `Wrong PIN (${WAPIN.MAX_ATTEMPTS - fails} attempts left).`;
      }
      input.value = "";
    } finally {
      busy = false;
      await refreshState();
      if (!input.disabled) input.focus();
    }
  });

  // Block interaction with WhatsApp while locked (capture phase runs before page handlers).
  for (const type of BLOCKED_EVENTS) {
    window.addEventListener(
      type,
      (e) => {
        if (!locked) return;
        if (!fromOverlay(e)) {
          e.stopImmediatePropagation();
          e.preventDefault();
        } else if (KEY_EVENTS.includes(type)) {
          // Keep PIN keystrokes away from page listeners; default actions (typing, Enter) still run.
          e.stopImmediatePropagation();
        }
      },
      true
    );
  }

  for (const type of ACTIVITY_EVENTS) {
    window.addEventListener(type, () => { if (!locked) lastActivity = Date.now(); }, { capture: true, passive: true });
  }

  // Manual lock: Ctrl+Shift+L.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!locked && e.ctrlKey && e.shiftKey && e.code === "KeyL") {
        e.preventDefault();
        e.stopImmediatePropagation();
        lock();
      }
    },
    true
  );

  setInterval(() => {
    if (!locked && idleMinutes > 0 && Date.now() - lastActivity > idleMinutes * 60000) lock();
  }, 5000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.idleMinutes) idleMinutes = changes.idleMinutes.newValue;
    if (changes.pin && locked) refreshState();
  });

  // Keep the overlay attached even if the page rewrites the document.
  new MutationObserver(mount).observe(document, { childList: true, subtree: false });
  new MutationObserver(mount).observe(document.documentElement || document, { childList: true });

  lock();
})();

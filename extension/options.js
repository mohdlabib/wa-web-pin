const $ = (id) => document.getElementById(id);

function show(el, text, ok) {
  el.textContent = text;
  el.className = "status " + (ok ? "ok" : "err");
}

async function init() {
  const { pin, idleMinutes } = await chrome.storage.local.get(["pin", "idleMinutes"]);
  $("current-wrap").hidden = !pin;
  $("idle").value = Number.isFinite(idleMinutes) ? idleMinutes : 5;
}

$("pin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("pin-status");
  const next = $("new-pin").value;
  const { pin } = await chrome.storage.local.get("pin");

  if (pin && !(await WAPIN.verify($("current").value, pin))) return show(status, "Current PIN is wrong.", false);
  if (!WAPIN.isValidPin(next)) return show(status, "PIN must be 4–12 digits.", false);
  if (next !== $("confirm").value) return show(status, "PINs do not match.", false);

  await chrome.storage.local.set({ pin: await WAPIN.hashPin(next), failCount: 0, lockUntil: 0 });
  e.target.reset();
  show(status, "PIN saved. Reload WhatsApp Web to use it.", true);
  init();
});

$("idle-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const minutes = Number($("idle").value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    return show($("idle-status"), "Enter a whole number from 0 to 1440.", false);
  }
  await chrome.storage.local.set({ idleMinutes: minutes });
  show($("idle-status"), "Saved.", true);
});

init();

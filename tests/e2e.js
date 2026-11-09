// End-to-end test: loads the extension in Chromium and serves a fake
// https://web.whatsapp.com page via request interception (no network needed).
const { chromium } = require("playwright");
const assert = require("assert");
const path = require("path");

const ext = path.resolve(__dirname, "../extension");
const PIN = "12344321";

(async () => {
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    await ctx.route("https://web.whatsapp.com/**", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: '<html><body><input id="chat"><script>window.keys=0;addEventListener("keydown",()=>window.keys++)</script></body></html>',
      })
    );
    const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
    const extId = sw.url().split("/")[2];
    const keys = () => wa.evaluate(() => window.keys);

    // Locked even without a PIN (fail closed).
    const wa = await ctx.newPage();
    await wa.goto("https://web.whatsapp.com/");
    assert.ok(await wa.$("#wapin-lock-host"), "overlay mounted without PIN");

    // Set PIN on the options page; only a salted hash is stored.
    const op = await ctx.newPage();
    await op.goto(`chrome-extension://${extId}/options.html`);
    await op.fill("#new-pin", PIN);
    await op.fill("#confirm", PIN);
    await op.click("#pin-form button");
    await op.waitForSelector("#pin-status.ok");
    const stored = await op.evaluate(() => chrome.storage.local.get(null));
    assert.ok(stored.pin.salt && stored.pin.hash, "pin record stored");
    assert.ok(!JSON.stringify(stored).includes(PIN), "plain PIN not stored");

    // Changing the PIN requires the current one.
    await op.fill("#current", "0000");
    await op.fill("#new-pin", "1111");
    await op.fill("#confirm", "1111");
    await op.click("#pin-form button");
    await op.waitForSelector("#pin-status.err");

    // Page receives no keystrokes while locked, including the typed PIN.
    await wa.bringToFront();
    await wa.reload();
    await wa.waitForTimeout(300);
    await wa.keyboard.type(PIN);
    assert.strictEqual(await keys(), 0, "PIN keystrokes hidden from page");
    await wa.keyboard.press("Enter");
    await wa.waitForTimeout(1500);

    // Unlocked: page works normally.
    await wa.focus("#chat");
    await wa.keyboard.type("hi");
    assert.strictEqual(await wa.inputValue("#chat"), "hi", "page usable after unlock");

    // Ctrl+Shift+L locks again and blocks input.
    await wa.keyboard.press("Control+Shift+KeyL");
    await wa.waitForTimeout(300);
    const before = await keys();
    await wa.keyboard.type("x");
    assert.strictEqual(await keys(), before, "input blocked after manual lock");

    // Five wrong PINs trigger a cooldown.
    for (let i = 0; i < 5; i++) {
      await wa.keyboard.type("0000");
      await wa.keyboard.press("Enter");
      await wa.waitForTimeout(900);
    }
    const { lockUntil } = await op.evaluate(() => chrome.storage.local.get("lockUntil"));
    assert.ok(lockUntil > Date.now(), "cooldown active after 5 wrong PINs");

    console.log("All e2e checks passed");
  } finally {
    await ctx.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

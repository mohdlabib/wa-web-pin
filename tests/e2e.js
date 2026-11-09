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

    const isLocked = async () => {
      const before = await keys();
      await wa.keyboard.type("x");
      return (await keys()) === before;
    };
    const unlock = async () => {
      await wa.keyboard.press("Control+A");
      await wa.keyboard.press("Backspace");
      await wa.keyboard.type(PIN);
      await wa.keyboard.press("Enter");
      await wa.waitForTimeout(1500);
      await wa.focus("#chat");
    };
    assert.strictEqual(await isLocked(), false, "stays unlocked (no idle lock by default)");

    // Floating lock button (default spot: 20px from right, 90px from bottom of 1280x720).
    await wa.mouse.click(1240, 610);
    await wa.waitForTimeout(300);
    assert.ok(await isLocked(), "floating button locks");
    await unlock();

    // Dragging the button moves it (and does not lock); new position is saved.
    await wa.mouse.move(1240, 610);
    await wa.mouse.down();
    await wa.mouse.move(900, 300, { steps: 5 });
    await wa.mouse.up();
    await wa.waitForTimeout(300);
    assert.strictEqual(await isLocked(), false, "drag does not lock");
    const { buttonPos } = await op.evaluate(() => chrome.storage.local.get("buttonPos"));
    assert.ok(buttonPos && buttonPos.x < 0.9, "button position saved");
    await wa.mouse.click(900, 300);
    await wa.waitForTimeout(300);
    assert.ok(await isLocked(), "button works at new position");
    await unlock();

    // Toolbar icon / extension command path (background -> content script).
    await sw.evaluate(() => lockActiveTab());
    await wa.waitForTimeout(300);
    assert.ok(await isLocked(), "background lock message locks");
    await unlock();

    // Alt+Shift+L locks again and blocks input.
    await wa.keyboard.press("Alt+Shift+KeyL");
    await wa.waitForTimeout(300);
    assert.ok(await isLocked(), "input blocked after shortcut lock");

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

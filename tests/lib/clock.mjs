// A fake clock for the page, installed before it loads (the same idea as Playwright's page.clock, with no
// package). It replaces Date, Date.now, performance.now, setTimeout / clearTimeout and setInterval /
// clearInterval. Time only moves when the test calls window.__clock.tick(ms): every timer that falls due runs,
// in order, with a short real pause after each so fetch replies (still real, from the fake API stub) can land.
export const CLOCK = `
(() => {
  const RealDate = Date;
  const realSetTimeout = window.setTimeout.bind(window);
  const start = RealDate.now();
  const perfStart = performance.now();
  let now = start;
  let nextId = 1;
  const timers = new Map();
  const add = (fn, ms, args, every) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args, every });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, null);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, Math.max(1, Number(ms) || 0));
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  class FakeDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(now); else super(...args); }
    static now() { return now; }
  }
  window.Date = FakeDate;
  performance.now = () => perfStart + (now - start);
  const settle = () => new Promise(resolve => realSetTimeout(resolve, 5));
  window.__clock = {
    now: () => now,
    pending: () => timers.size,
    // Moves time forward by ms, running each timer when its time comes
    async tick(ms) {
      const end = now + ms;
      for (let guard = 0; guard < 100000; guard++) {
        let id = null, due = null;
        for (const [key, timer] of timers) if (timer.at <= end && (!due || timer.at < due.at)) { id = key; due = timer; }
        if (!due) break;
        now = Math.max(now, due.at);
        if (due.every) due.at += due.every; else timers.delete(id);
        try { due.fn(...due.args); } catch (err) { console.error(err); }
        await settle();
        await settle();
      }
      now = end;
      await settle();
      return now;
    }
  };
})();`;

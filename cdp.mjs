#!/usr/bin/env node
// Minimal Chrome DevTools Protocol client (no dependencies, Node >= 22).
// Usage:
//   node cdp.mjs tabs
//   node cdp.mjs goto <url>
//   node cdp.mjs screenshot [out.png]
//   node cdp.mjs click <x> <y>
//   node cdp.mjs clicksel <css-selector>
//   node cdp.mjs type <text>
//   node cdp.mjs key <Enter|Tab|Backspace|Escape|...>
//   node cdp.mjs scroll <dy> [x y]
//   node cdp.mjs eval <js-expression>
//   node cdp.mjs raw <Method> [json-params]
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || 9222;
const [cmd, ...args] = process.argv.slice(2);

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
if (cmd === 'tabs') {
  for (const t of targets.filter(t => t.type === 'page')) console.log(`${t.id}  ${t.title}  ${t.url}`);
  process.exit(0);
}
const page = targets.find(t => t.type === 'page');
if (!page) throw new Error('No page target found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const listeners = [];
ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  } else if (msg.method) listeners.forEach(l => l(msg));
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const waitEvent = (name, ms = 15000) => new Promise(res => {
  const t = setTimeout(res, ms);
  listeners.push(m => { if (m.method === name) { clearTimeout(t); res(m); } });
});
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const mouse = async (type, x, y, extra = {}) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const click = async (x, y) => {
  await mouse('mouseMoved', x, y, { button: 'none' });
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
};

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
};

switch (cmd) {
  case 'goto': {
    await send('Page.enable');
    const loaded = waitEvent('Page.loadEventFired');
    await send('Page.navigate', { url: args[0] });
    await loaded;
    console.log('Loaded:', await evaluate('document.title'), '-', await evaluate('location.href'));
    break;
  }
  case 'screenshot': {
    const out = args[0] || 'screenshot.png';
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out, Buffer.from(data, 'base64'));
    const vp = await evaluate('[innerWidth, innerHeight, devicePixelRatio]');
    console.log(`Saved ${out} (viewport ${vp[0]}x${vp[1]} CSS px, dpr ${vp[2]})`);
    break;
  }
  case 'click':
    await click(+args[0], +args[1]);
    console.log(`Clicked at ${args[0]},${args[1]}`);
    break;
  case 'clicksel': {
    const box = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(args[0])});
      if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect();
      return [r.x + r.width/2, r.y + r.height/2]; })()`);
    if (!box) throw new Error(`No element matches ${args[0]}`);
    await click(box[0], box[1]);
    console.log(`Clicked ${args[0]} at ${box.map(Math.round).join(',')}`);
    break;
  }
  case 'type':
    await send('Input.insertText', { text: args.join(' ') });
    console.log('Typed text');
    break;
  case 'key': {
    const k = KEYS[args[0]] || { key: args[0], text: args[0] };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
    console.log(`Pressed ${args[0]}`);
    break;
  }
  case 'scroll': {
    const [dy, x = 400, y = 400] = args.map(Number);
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
    console.log(`Scrolled ${dy}`);
    break;
  }
  case 'eval':
    console.log(JSON.stringify(await evaluate(args.join(' ')), null, 2));
    break;
  case 'raw':
    console.log(JSON.stringify(await send(args[0], args[1] ? JSON.parse(args[1]) : {}), null, 2));
    break;
  default:
    console.error('Unknown command. See header of cdp.mjs for usage.');
    process.exitCode = 1;
}
ws.close();

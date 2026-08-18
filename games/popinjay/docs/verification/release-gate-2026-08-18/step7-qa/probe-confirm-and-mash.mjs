import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const URL = pathToFileURL('/Users/rayweiss/Desktop/Dev Work/popinjay/dist/popinjay.html').href;
const OUT='/Users/rayweiss/Desktop/Dev Work/popinjay/docs/verification/release-gate-2026-08-18/step7-qa';
const b = await chromium.launch(); const c = await b.newContext({viewport:{width:1440,height:900}});
const p = await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(URL,{waitUntil:'load'}); await p.waitForFunction('window.__popinjayReady === true'); await p.waitForTimeout(600);
// Seed a resumable run, quit to title, then press ENTER ONCE: the confirm guard must appear.
await p.keyboard.press('Enter'); await p.waitForTimeout(1400);
await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.keyboard.press('KeyQ'); await p.waitForTimeout(600);
const atTitle = await p.evaluate(()=>window.POPINJAY.mode);
await p.keyboard.press('Enter'); await p.waitForTimeout(600);
const afterOne = await p.evaluate(()=>window.POPINJAY.mode);
await p.screenshot({path:`${OUT}/qa-confirm-new-run-guard.png`});
await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
const afterTwo = await p.evaluate(()=>window.POPINJAY.probe());
// now mash
const t0 = afterTwo;
for (let i=0;i<24;i++){ await p.keyboard.press(i%3===0?'Escape':'KeyZ'); await p.waitForTimeout(45); }
await p.waitForTimeout(800);
const t1 = await p.evaluate(()=>window.POPINJAY.probe());
const dbg = await p.evaluate(()=>window.POPINJAY.debuglog.errors().length);
await p.screenshot({path:`${OUT}/qa-input-mash.png`});
console.log(JSON.stringify({atTitle,afterOneEnter:afterOne,confirmGuardShown:afterOne==='title',t0,t1,tickAdvanced:t1.tick>t0.tick,dbgErrors:dbg,pageErrors:errs},null,2));
await b.close();

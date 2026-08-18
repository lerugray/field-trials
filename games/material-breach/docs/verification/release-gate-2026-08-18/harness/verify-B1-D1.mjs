import { join } from 'node:path';
import { createRequire } from 'node:module';
const ROOT='/Users/rayweiss/Desktop/Dev Work/material-breach';
const require=createRequire(join(ROOT,'node_modules','noop.js'));
const {chromium}=require('playwright');
const url='file://'+join(ROOT,'dist','index.html');
const OUT=join(ROOT,'docs','verification','release-gate-2026-08-18','step7-qa');
const b=await chromium.launch();

// ---- VERIFY B1: malformed save (valid v+facility, missing cycle) bricks boot ----
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}}); const p=await ctx.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(url); await p.waitForFunction(()=>!!window.__GAME);
 await p.evaluate(()=>localStorage.setItem('material-breach:save','{"v":1,"facility":{"status":"active"}}'));
 await p.reload(); await p.waitForTimeout(2500);
 const hasGame=await p.evaluate(()=>!!window.__GAME);
 await p.screenshot({path:join(OUT,'verify-B1-malformed-save.png')});
 console.log('B1 __GAME exists after malformed save:', hasGame, '| pageerrors:', errs.length, errs[0]?errs[0].slice(0,90):'');
 // does a plain reload recover?
 await p.reload(); await p.waitForTimeout(2000);
 console.log('B1 recovers on second reload:', await p.evaluate(()=>!!window.__GAME));
 await ctx.close();
}
// ---- VERIFY D1: 'A' key spends gold when an instrument stands ----
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}}); const p=await ctx.newPage();
 await p.goto(url); await p.waitForFunction(()=>!!window.__GAME); await p.waitForTimeout(300);
 const st=()=>p.evaluate(()=>window.__GAME.state());
 await p.evaluate(()=>{const s=window.__GAME.state();const bt=s.buttons.find(b=>b.id==='enter');const r=document.getElementById('screen').getBoundingClientRect();window.__pt={x:r.left+(bt.x+bt.w/2)*(r.width/640),y:r.top+(bt.y+bt.h/2)*(r.height/360)};});
 const pt=await p.evaluate(()=>window.__pt); await p.mouse.click(pt.x,pt.y); await p.waitForTimeout(200);
 await p.keyboard.press('Enter'); await p.waitForTimeout(250);
 // advance until an instrument stands
 let s=await st(), n=0;
 while(s.ladderRung==='none' && n<40){ await p.keyboard.press('Enter'); await p.waitForTimeout(200); s=await st(); n++; }
 console.log('D1 instrument standing? rung=',s.ladderRung,'noticesServed=',s.noticesServed,'treasury=',s.treasury);
 const before=s.treasury;
 await p.keyboard.press('a'); await p.waitForTimeout(350);
 const after=(await st()).treasury;
 console.log(`D1 treasury before A: ${before} -> after A: ${after}  DELTA=${after-before}`);
 await p.screenshot({path:join(OUT,'verify-D1-akey.png')});
 await ctx.close();
}
await b.close();

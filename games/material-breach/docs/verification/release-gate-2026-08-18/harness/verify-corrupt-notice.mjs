import { join } from 'node:path';
import { createRequire } from 'node:module';
const ROOT='/Users/rayweiss/Desktop/Dev Work/material-breach';
const require=createRequire(join(ROOT,'node_modules','noop.js'));
const {chromium}=require('playwright');
const OUT=join(ROOT,'docs','verification','release-gate-2026-08-18','step3-endstates');
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:720}}); const p=await ctx.newPage();
const url='file://'+join(ROOT,'dist','index.html');
// clean title
await p.goto(url); await p.waitForFunction(()=>!!window.__GAME); await p.waitForTimeout(400);
const clean=await p.screenshot();
// corrupt save then reload
await p.evaluate(()=>localStorage.setItem('material-breach:save','{{{ not json'));
await p.reload(); await p.waitForFunction(()=>!!window.__GAME); await p.waitForTimeout(400);
const dirty=await p.screenshot({path:join(OUT,'e16-corrupt-title-diffcheck.png')});
console.log('identical bytes:', Buffer.compare(clean,dirty)===0);
// also: a save that parses but is the WRONG VERSION
await p.evaluate(()=>localStorage.setItem('material-breach:save', JSON.stringify({v:99,facility:{}})));
await p.reload(); await p.waitForFunction(()=>!!window.__GAME); await p.waitForTimeout(400);
const ver=await p.screenshot({path:join(OUT,'e17-wrongversion-title.png')});
console.log('wrongversion identical to clean:', Buffer.compare(clean,ver)===0);
await b.close();

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL;
assert(base,'managed launcher BASE_URL required');
const out=process.env.EVIDENCE_OUT;assert(out,'EVIDENCE_OUT required');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true});
async function api(path,body,revision){const r=await fetch(`${base}/api/${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',...(revision===undefined?{}:{'If-Match':String(revision)})},body:JSON.stringify(body)});const json=await r.json();assert.equal(r.status,200,`${path}: ${JSON.stringify(json)}`);return json;}
try{
 let c=(await api('characters',{gameStem:'blades-in-the-dark',playbook:'Hound'})).character;
 c=(await api(`characters/${c.id}/ops/fund.gain`,{coins:1000},c.revision)).character;
 c=(await api(`characters/${c.id}/ops/mode.set`,{mode:'score'},c.revision)).character;
 c=(await api(`characters/${c.id}/ops/mode.flow.set`,{kind:'resolution',step:'payoff'},c.revision)).character;
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`${base}/character/${c.id}`);await page.locator('.game-mode-resolution').waitFor();
 await page.getByLabel('My share coin amount').fill('2');
 const response=page.waitForResponse(r=>r.url().endsWith('/ops/flow.step.complete')&&r.request().method()==='POST');
 await page.locator('.game-mode-resolution').getByRole('button',{name:'Next',exact:true}).click();
 const r=await response;assert.equal(r.status(),200,await r.text());
 const body=await r.json();
 assert(body.sideEffects.includes('2 coin could not be stored'),JSON.stringify(body.sideEffects));
 const notice=page.locator('p.notice').filter({hasText:'satchel and stash are full'});
 await notice.waitFor();
 assert.equal(await notice.textContent(),'Stored 0 of 2 coins — satchel and stash are full');
 await page.screenshot({path:`${out}/payoff-overflow-1440x1000.png`,fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));
 await context.close();
 console.log(JSON.stringify({ok:true,sideEffects:body.sideEffects,notice:'Stored 0 of 2 coins — satchel and stash are full'}));
}finally{await browser.close();}

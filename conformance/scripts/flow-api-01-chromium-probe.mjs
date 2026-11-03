import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL;
assert(base,'managed launcher BASE_URL required');
const out=process.env.EVIDENCE_OUT;assert(out,'EVIDENCE_OUT required');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true});
const evidence=[];const failures=[];
async function api(path,body,revision){const r=await fetch(`${base}/api/${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',...(revision===undefined?{}:{'If-Match':String(revision)})},body:JSON.stringify(body)});const json=await r.json();assert.equal(r.status,200,`${path}: ${JSON.stringify(json)}`);return json;}
try{
for(const [width,height] of [[1440,1000],[768,1024],[390,844]])for(const theme of ['light','dark','hic']){
 const context=await browser.newContext({viewport:{width,height}});const page=await context.newPage();page.on('dialog',d=>d.accept());
 const requests=[];const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/'))requests.push({url:r.url().replace(base,''),headers:r.headers(),body:r.postDataJSON()});});
 const crew=(await api('crews',{gameStem:'blades-in-the-dark',crewType:'Assassins'})).crew;
 let c=(await api('characters',{gameStem:'blades-in-the-dark',playbook:'Hound'})).character;
 c=(await api(`characters/${c.id}/ops/dossier.update`,{crewId:crew.id},c.revision)).character;
 await page.goto(`${base}/character/${c.id}`);await page.locator('.mode-panel').waitFor();
 await page.locator(`.theme-controls button[data-theme="${theme==='dark'?'dark':'light'}"]`).click();
 const contrast=page.locator('.theme-controls button[title="Toggle high contrast"]');if((await contrast.getAttribute('aria-pressed')==='true')!==(theme==='hic'))await contrast.click();
 await page.waitForFunction(()=>document.querySelector('.mode-panel')?.textContent.includes('Free Play'));
 const prefix=`${width}x${height}-${theme}`;
 async function capture(state,shot=false){
  const numeric=await page.evaluate(()=>{const box=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop,overflowX:s.overflowX,overflowY:s.overflowY,minWidth:s.minWidth,display:s.display};};const personal=document.querySelector('[data-section="personal"]');return{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,contrast:document.documentElement.dataset.contrast??null,personal:personal?box(personal):null,popup:[...document.querySelectorAll('.game-mode-popup-card')].map(box),panel:box(document.querySelector('.mode-panel'))};});
  assert(numeric.documentWidth<=width,`${prefix}/${state}: document overflow ${numeric.documentWidth}`);
  assert(numeric.personal&&numeric.personal.display!=='none',`${prefix}/${state}: Personal hidden`);
  for(const p of numeric.popup){assert(p.scrollWidth<=p.clientWidth+1,`${prefix}/${state}: popup overflow`);assert(p.left>=-1&&p.right<=width+1,`${prefix}/${state}: popup escapes viewport`);}
  evidence.push({viewport:prefix,state,...numeric});
  if(shot||(width===1440&&theme==='light'))await page.screenshot({path:`${out}/${prefix}-${state}.png`});
 }
 async function waitStep(label){await page.locator('.game-mode-popup h2').filter({hasText:new RegExp(`^${label}$`)}).waitFor();await page.locator('.game-mode-popup-footer .btn-primary').waitFor();}
 async function finish(button,label){const response=page.waitForResponse(r=>r.url().endsWith('/ops/flow.step.complete')&&r.request().method()==='POST');await button.click();const r=await response;assert.equal(r.status(),200,await r.text());if(label)await waitStep(label);}
 await capture('free-play');
 await page.getByRole('navigation',{name:'Scoundrel game mode'}).getByRole('button',{name:'Score',exact:true}).click();await waitStep('Planning');await capture('planning');
 await page.locator('.approach-card').filter({hasText:'Stealth'}).click();await finish(page.locator('.game-mode-popup-footer .btn-primary'),'Loadout');await capture('loadout',true);
 await page.locator('.game-mode-popup').getByRole('button',{name:/^Normal ·/}).click();
 const item=page.locator('.game-mode-popup input[type="checkbox"]').first();if(await item.count())await item.check();
 await finish(page.locator('.game-mode-popup-footer .btn-primary'),'Engagement');await capture('engagement');
 await page.getByLabel('External outcome note').fill('The crew rolled externally; risky position.');await finish(page.locator('.game-mode-popup-footer .btn-primary'));
 await page.locator('.game-mode-popup').waitFor({state:'detached'});await capture('score');
 c=await api(`characters/${c.id}`);assert.equal(c.gear.commitment,'normal');assert.equal(c.flowProgress.planApproach,'Stealth');
 await page.locator('.mode-panel').getByRole('button',{name:'End Score',exact:true}).click();await waitStep('Scoundrel XP');await capture('scoundrel-xp',true);
 assert.equal(await page.locator('[data-xp-destination]').count(),1+c.talent.attributes.length);
 await page.locator('.xp-alloc-actions').scrollIntoViewIfNeeded();await capture('xp-allocation-controls',true);
 await finish(page.locator('.xp-alloc button').filter({hasText:'Complete Scoundrel XP'}),'Payoff');
 await page.locator('[data-crew-track="coin"] input').fill('1');await page.locator('[data-crew-track="rep"] input').fill('1');await page.getByLabel('My share coin amount').fill('1');
 const beforeCrew=await api(`crews/${crew.id}`);const beforeShare=(await api(`characters/${c.id}`)).fund.satchel.coins;await capture('payoff',true);
 await page.locator('.game-mode-popup-footer .btn-primary').scrollIntoViewIfNeeded();await capture('payoff-awards',true);
 const mark=requests.length;await finish(page.locator('.game-mode-popup-footer .btn-primary'),'Heat');
 const awardWrites=requests.slice(mark);assert.equal(awardWrites.length,1,'Payoff must be one mutation');assert(awardWrites[0].url.endsWith('/ops/flow.step.complete'));
 assert.equal(awardWrites[0].body.inputs.crewCoin,1);assert.equal(awardWrites[0].body.inputs.crewRep,1);assert.equal(awardWrites[0].body.inputs.myShare,1);assert.equal(awardWrites[0].body.inputs.crewRevision,beforeCrew.revision);
 const awardedCrew=await api(`crews/${crew.id}`);assert.equal(awardedCrew.coin,beforeCrew.coin+1);assert.equal(awardedCrew.rep.current,beforeCrew.rep.current+1);assert.equal((await api(`characters/${c.id}`)).fund.satchel.coins,beforeShare+1);
 await page.locator('[data-crew-track="heat"] input').fill('1');await capture('heat');await finish(page.locator('.game-mode-popup-footer .btn-primary'),'Entanglements');await capture('entanglements');
 await page.getByLabel('External outcome note').fill('Resolved externally with the GM.');await finish(page.locator('.game-mode-popup-footer .btn-primary'),'Crew XP');await capture('crew-xp');
 await page.locator('[data-crew-track="xp"] input').fill('1');await finish(page.locator('.game-mode-popup-footer .btn-primary'),'Crew Rep');await capture('crew-rep');
 await finish(page.locator('.game-mode-popup-footer .btn-primary'));await page.locator('.game-mode-popup').waitFor({state:'detached'});await page.locator('.activity-menu:visible').first().waitFor();await capture('downtime');
 c=await api(`characters/${c.id}`);assert.equal(c.mode,'downtime');assert.equal((await api(`crews/${crew.id}`)).experience.points,crew.experience.points+1);assert.equal(c.fund.satchel.coins,beforeShare+1);
 assert.equal(errors.length,0,errors.join('\n'));evidence.push({viewport:prefix,state:'requests',requests});await context.close();
}
}catch(error){failures.push(String(error.stack??error));throw error;}finally{await writeFile(`${out}/numeric.json`,JSON.stringify({entries:evidence,failures},null,2)+'\n');await browser.close();console.log(JSON.stringify({states:evidence.filter(x=>x.state!=='requests').length,matrices:evidence.filter(x=>x.state==='requests').length,failures}));}

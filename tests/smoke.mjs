import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const browser=await chromium.launch({
  channel:'chrome',
  headless:true,
  args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']
});
const page=await browser.newPage({viewport:{width:1550,height:930},deviceScaleFactor:1,acceptDownloads:true});
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text());});
try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:50000});
  await page.waitForFunction(()=>document.querySelector('#metric-faces')?.textContent!=='—',{timeout:55000});
  const demo=await page.locator('#metric-faces').innerText();
  assert(Number(demo.replaceAll(',',''))>0,'Demo geometry must have triangles');
  const canvas=page.locator('#viewport-canvas'),area=await canvas.boundingBox();
  assert(area&&area.width>300&&area.height>250,'Viewport must be visible');

  const before=await canvas.screenshot();
  await page.mouse.move(area.x+area.width*.55,area.y+area.height*.55);
  await page.mouse.down({button:'right'});
  await page.mouse.move(area.x+area.width*.73,area.y+area.height*.63,{steps:8});
  await page.mouse.up({button:'right'});
  const afterOrbit=await canvas.screenshot();
  assert(!before.equals(afterOrbit),'Right-drag must visibly orbit camera');

  await page.mouse.move(area.x+area.width*.5,area.y+area.height*.45);
  await page.mouse.down({button:'left'});
  await page.mouse.move(area.x+area.width*.62,area.y+area.height*.55,{steps:8});
  await page.mouse.up({button:'left'});
  const afterPan=await canvas.screenshot();
  assert(!afterOrbit.equals(afterPan),'Left-drag must visibly pan camera');

  const obj1='o Smoke_A\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
  const obj2='o Smoke_B\nv 0 0 0\nv 1 0 0\nv 0 1.5 0\nf 1 2 3\n';
  await page.locator('#model-file').setInputFiles([{name:'smoke-a.obj',mimeType:'text/plain',buffer:Buffer.from(obj1)}]);
  await page.waitForFunction(()=>document.querySelector('#project-name')?.textContent==='smoke-a.obj',{timeout:15000});
  assert.equal((await page.locator('#metric-faces').innerText()).trim(),'1','OBJ import should contain exactly one triangle');

  await page.locator('#compare-file').setInputFiles([{name:'smoke-b.obj',mimeType:'text/plain',buffer:Buffer.from(obj2)}]);
  await page.waitForFunction(()=>document.querySelector('#compare-mode')?.value==='split',{timeout:15000});
  await page.locator('[data-tab=overview]').click();
  await page.locator('#btn-projection').click();
  assert((await page.locator('#camera-info').innerText()).includes('ORTHOGRAPHIC'),'Projection toggle must work');
  await page.locator('#render-mode').selectOption('normal');
  await page.locator('#render-mode').selectOption('material');
  await page.locator('#compare-mode').selectOption('overlay');
  await page.waitForTimeout(900);

  assert.equal(errors.length,0,'No browser script exceptions: '+errors.join(' // '));
  writeFileSync('smoke-preview.png',await canvas.screenshot());
  console.log('PASS: demo WebGL, camera pan/orbit, OBJ import into A/B, split/overlay, orthographic, shading and screenshot.');
}finally{await browser.close();}

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
  writeFileSync('smoke-workspace.png',await page.screenshot({fullPage:true}));
  const canvas=page.locator('#viewport-canvas'),area=await canvas.boundingBox();
  assert(area&&area.width>300&&area.height>250,'Viewport must be visible');

  const camera=()=>page.locator('#viewport-canvas').evaluate(el=>({
    yaw:+el.dataset.cameraYaw,pitch:+el.dataset.cameraPitch,
    distance:+el.dataset.cameraDistance,target:el.dataset.cameraTarget.split(',').map(Number)
  }));
  const initial=await camera();
  // Right-click drag is specifically vertical TILT ONLY, never full orbit.
  await page.mouse.move(area.x+area.width*.5,area.y+area.height*.55);
  await page.mouse.down({button:'right'});
  await page.mouse.move(area.x+area.width*.7,area.y+area.height*.55,{steps:8});
  await page.mouse.up({button:'right'});
  const afterRightHorizontal=await camera();
  assert.equal(afterRightHorizontal.yaw,initial.yaw,'Right horizontal drag must NOT orbit horizontally');
  assert.equal(afterRightHorizontal.pitch,initial.pitch,'Right horizontal drag must NOT tilt');
  await page.mouse.move(area.x+area.width*.5,area.y+area.height*.5);
  await page.mouse.down({button:'right'});
  await page.mouse.move(area.x+area.width*.5,area.y+area.height*.65,{steps:8});
  await page.mouse.up({button:'right'});
  const afterRightVertical=await camera();
  assert.equal(afterRightVertical.yaw,initial.yaw,'Right vertical drag must not change yaw');
  assert.notEqual(afterRightVertical.pitch,initial.pitch,'Right vertical drag must tilt camera');

  // Left-click drag translates the CAMERA TARGET, preserving both orientation axes.
  await page.mouse.move(area.x+area.width*.5,area.y+area.height*.45);
  await page.mouse.down({button:'left'});
  await page.mouse.move(area.x+area.width*.62,area.y+area.height*.55,{steps:8});
  await page.mouse.up({button:'left'});
  const afterPan=await camera();
  assert.deepEqual([afterPan.yaw,afterPan.pitch],[afterRightVertical.yaw,afterRightVertical.pitch],'Left drag must not rotate');
  assert.notDeepEqual(afterPan.target,afterRightVertical.target,'Left-drag must pan the camera target');

  // Chromium exposes precision touchpad swipes as wheel events, not touch pointers.
  await page.locator('#input-device').selectOption('touchpad');
  const beforeOrbit=await camera();
  await page.locator('#viewport-canvas').evaluate(el=>{
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaMode:0,deltaX:42,deltaY:36}));
  });
  await page.waitForTimeout(100);
  const afterOrbit=await camera();
  assert.notEqual(afterOrbit.yaw,beforeOrbit.yaw,'Two-finger horizontal delta must orbit yaw');
  assert.notEqual(afterOrbit.pitch,beforeOrbit.pitch,'Two-finger vertical delta must orbit pitch');
  assert.equal(afterOrbit.distance,beforeOrbit.distance,'Two-finger orbit must not zoom');

  // Trackpad pinch produces Ctrl+wheel events; wheel events with the mouse profile zoom.
  await page.locator('#viewport-canvas').evaluate(el=>{
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-15}));
  });
  await page.waitForTimeout(100);
  const afterPinch=await camera();
  assert.notEqual(afterPinch.distance,afterOrbit.distance,'Touchpad pinch must zoom');
  await page.locator('#input-device').selectOption('mouse');
  await page.locator('#viewport-canvas').evaluate(el=>{
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:120}));
  });
  await page.waitForTimeout(100);
  const afterWheel=await camera();
  assert.notEqual(afterWheel.distance,afterPinch.distance,'Physical mouse wheel must zoom');

  // Auto-detection: fine pixel deltas imply touchpad; coarse mouse ticks imply zoom.
  await page.locator('#input-device').selectOption('auto');
  await page.locator('#viewport-canvas').evaluate(el=>{
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:7,deltaX:0}));
  });
  await page.waitForTimeout(100);
  const afterAutoTouchpad=await camera();
  assert.notEqual(afterAutoTouchpad.pitch,afterWheel.pitch,'Fine auto input should orbit');
  await page.locator('#viewport-canvas').evaluate(el=>{
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaMode:1,deltaY:3}));
  });
  await page.waitForTimeout(100);
  const afterAutoMouse=await camera();
  assert.notEqual(afterAutoMouse.distance,afterAutoTouchpad.distance,'Coarse auto input should zoom');
  assert.equal(afterAutoMouse.pitch,afterAutoTouchpad.pitch,'Mouse wheel must not orbit');

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


  // Test a real GLB generated in-browser with Three's exporter.
  const glb=await page.evaluate(async()=>{
    const T=await import('three');
    const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
    const mesh=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0x45bbef}));
    return await new Promise((resolve,reject)=>new GLTFExporter().parse(mesh,result=>resolve(Array.from(new Uint8Array(result))),reject,{binary:true}));
  });
  await page.locator('#compare-file').setInputFiles([{name:'smoke-revision.glb',mimeType:'model/gltf-binary',buffer:Buffer.from(glb)}]);
  await page.waitForFunction(()=>document.querySelector('#metric-faces')?.textContent.trim()==='12'&&document.querySelector('#metrics-slot')?.textContent==='B',{timeout:15000});
  assert.equal((await page.locator('#metric-faces').innerText()).trim(),'12','GLB cube must have 12 triangles');
  
  // Test ZIP model-pack import.
  const zipped=await page.evaluate(async()=>{
    const {zipSync,strToU8}=await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
    return Array.from(zipSync({'pack/zipped.obj':strToU8('o ZipTest\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')}));
  });
  await page.locator('#model-file').setInputFiles([{name:'packed.zip',mimeType:'application/zip',buffer:Buffer.from(zipped)}]);
  await page.waitForFunction(()=>document.querySelector('#project-name')?.textContent==='zipped.obj',{timeout:15000});
  assert.equal((await page.locator('#metric-faces').innerText()).trim(),'1','ZIP model must contain one triangle');

  assert.equal(errors.length,0,'No browser script exceptions: '+errors.join(' // '));
  writeFileSync('smoke-preview.png',await canvas.screenshot());
  console.log('PASS: WebGL, left pan, right vertical tilt ONLY, touchpad 2-finger XY orbit and pinch, mouse wheel, auto-detection, OBJ/GLB/ZIP imports, split/overlay, orthographic and shading.');
}finally{await browser.close();}


import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const $ = id => document.getElementById(id);
const q = (sel,root=document) => [...root.querySelectorAll(sel)];
const fmt = n => Number.isFinite(n) ? Math.round(n).toLocaleString() : '—';
const fixed = n => Number.isFinite(n) ? n.toFixed(3) : '—';
const supported = ['glb','gltf','obj','fbx','stl','ply','dae'];
const fileExt = name => ((name || '').split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
const urlIsLocal = s => !/^https?:\/\//i.test(s);
const download = (data,name,type) => { const blob=data instanceof Blob?data:new Blob([data],{type:type||'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000); };
let toastTimer=0;
function toast(message,error=false){const el=$('toast');el.textContent=message;el.style.borderColor=error?'#df817b':'#5c8cb0';el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),5000);}
function status(message){$('status-text').textContent=message;}
const canvas=$('viewport-canvas');
const viewport=$('viewport');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setClearColor(0x101721,1);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1;
renderer.autoClear=false;
const persp=new THREE.PerspectiveCamera(40,1,.001,200000);
const ortho=new THREE.OrthographicCamera(-2,2,2,-2,.001,200000);
const cameraState={target:new THREE.Vector3(),yaw:.35,pitch:Math.PI/2.1,distance:5,orthoSize:2,orthographic:false};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
let camera=persp,activeAspect=1,renderMode='material',comparisonMode='single',treeSlot='A',selected=null,selectedSlot='A',selectionBox=null,measureOn=false,measurePoints=[],markers=[],measurementLine=null,lastFrames=0,frameCount=0,lastFpsAt=performance.now(),fps=0;
const clock=new THREE.Clock();
const raycaster=new THREE.Raycaster();
const ndc=new THREE.Vector2();
const scenes={A:makeScene(),B:makeScene()};
const slots={A:null,B:null};
let localUrls=[],pendingDrop=0;
function makeScene(){
  const scene=new THREE.Scene();
  const hemisphere=new THREE.HemisphereLight(0xe6efff,0x314157,1.65);scene.add(hemisphere);
  const key=new THREE.DirectionalLight(0xf9f3ec,3);key.position.set(4,7,6);scene.add(key);
  const rim=new THREE.DirectionalLight(0x79acff,3.2);rim.position.set(-5,5,-6);scene.add(rim);
  const head=new THREE.DirectionalLight(0xd9ecff,.6);head.position.set(0,0,5);scene.add(head);
  const grid=new THREE.GridHelper(10,20,0x3f6689,0x2b4156);grid.position.y=-1;scene.add(grid);
  const axes=new THREE.AxesHelper(2);axes.visible=false;scene.add(axes);
  return {scene,hemisphere,key,rim,head,grid,axes,bounds:null,skeleton:[]};
}
function setCamera(aspect=activeAspect){
  activeAspect=Math.max(.01,aspect);
  const s=Math.sin(cameraState.pitch),p=cameraState;
  const offset=new THREE.Vector3(Math.sin(p.yaw)*s,Math.cos(p.pitch),Math.cos(p.yaw)*s).multiplyScalar(p.distance);
  camera=p.orthographic?ortho:persp;
  camera.position.copy(p.target).add(offset);
  camera.lookAt(p.target);
  camera.near=Math.max(.00001,p.distance/10000);
  camera.far=Math.max(1000,p.distance*1000);
  if(p.orthographic){
    ortho.left=-p.orthoSize*activeAspect;ortho.right=p.orthoSize*activeAspect;
    ortho.top=p.orthoSize;ortho.bottom=-p.orthoSize;
    $('camera-info').textContent='ORTHOGRAPHIC · Y-UP';
  }else{
    persp.aspect=activeAspect;
    $('camera-info').textContent='PERSPECTIVE · Y-UP';
  }
  camera.updateProjectionMatrix();
  $('btn-projection').textContent=p.orthographic?'ORTHOGRAPHIC ▾':'PERSPECTIVE ▾';
}
function view(name){
  const positions={front:[0,Math.PI/2],back:[Math.PI,Math.PI/2],left:[-Math.PI/2,Math.PI/2],right:[Math.PI/2,Math.PI/2],top:[0,.001],bottom:[0,Math.PI-.001]};
  if(positions[name]){cameraState.yaw=positions[name][0];cameraState.pitch=positions[name][1];setCamera();}
}
function getCombinedBox(){
  const result=new THREE.Box3();let any=false;
  for(const key of ['A','B'])if(slots[key] && (key==='A'||comparisonMode!=='single')){result.expandByObject(slots[key].wrapper);any=true;}
  return any?result:null;
}
function fit(box=getCombinedBox()){
  if(!box || box.isEmpty())return;
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const aspect=Math.max(.4,comparisonMode==='split'?(viewport.clientWidth/2)/Math.max(1,viewport.clientHeight):viewport.clientWidth/Math.max(1,viewport.clientHeight));
  const biggest=Math.max(size.x,size.y,size.z,.0001);
  cameraState.target.copy(center);
  cameraState.distance=Math.max(biggest*.9,Math.max(size.y,size.x/aspect)*.65/Math.tan(THREE.MathUtils.degToRad(20))+size.z*.7);
  cameraState.orthoSize=Math.max(size.y,size.x/aspect,size.z)*.72;
  setCamera(aspect);
}
function refreshHelpers(){
  for(const key of ['A','B']){
    const scene=scenes[key],slot=slots[key];
    scene.grid.visible=$('show-grid').checked && !!slot;
    scene.axes.visible=$('show-axes').checked && !!slot;
    if(scene.bounds){scene.scene.remove(scene.bounds);scene.bounds.geometry.dispose();scene.bounds.material.dispose();scene.bounds=null;}
    for(const helper of scene.skeleton){scene.scene.remove(helper);helper.dispose?.();}
    scene.skeleton.length=0;
    if(!slot)continue;
    const size=slot.box.getSize(new THREE.Vector3()),largest=Math.max(...size.toArray(),.001);
    scene.grid.scale.setScalar(largest/5);
    scene.grid.position.y=-size.y/2;
    scene.axes.scale.setScalar(largest/7);
    if($('show-bounds').checked){scene.bounds=new THREE.Box3Helper(new THREE.Box3().setFromObject(slot.wrapper),0x6fbeff);scene.scene.add(scene.bounds);}
    if($('show-skeleton').checked){slot.wrapper.traverse(o=>{if(o.isSkinnedMesh){const h=new THREE.SkeletonHelper(o);scene.scene.add(h);scene.skeleton.push(h);}});}
  }
}
function sceneStats(root){
  let meshes=0,vertices=0,faces=0,nodes=0,uvs=0,skinned=0,maps=0;
  const materials=new Set(),textures=new Set();
  root.traverse(o=>{
    nodes++;
    if(!o.isMesh)return;
    meshes++;if(o.isSkinnedMesh)skinned++;
    const g=o.geometry;if(g){
      const pos=g.getAttribute('position'),uv=g.getAttribute('uv');
      const v=pos?.count||0;vertices+=v;faces+=Math.floor((g.index?.count||v)/3);
      if(uv)uvs++;
    }
    const ms=Array.isArray(o.material)?o.material:[o.material];
    for(const m of ms){if(!m)continue;materials.add(m);
      for(const prop of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','bumpMap','specularMap'])if(m[prop])textures.add(m[prop]);}
  });
  return {meshes,vertices,faces,nodes,uvs,skinned,materials:materials.size,maps:textures.size};
}
function prepareModel(obj, name, clips=[],remoteUrl=null){
  const wrapper=new THREE.Group();wrapper.name='Model alignment pivot';wrapper.add(obj);
  obj.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(obj);
  if(box.isEmpty())throw Error('The file contains no renderable geometry.');
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  wrapper.position.copy(center).negate();
  obj.traverse(o=>{
    if(!o.isMesh)return;
    const mats=(Array.isArray(o.material)?o.material:[o.material]).filter(Boolean);
    o.userData.liveMaterials=mats.map(m=>m.clone());
    o.userData.resetMaterials=mats.map(m=>m.clone());
    o.userData.materialArray=Array.isArray(o.material);
    o.material=o.userData.materialArray?o.userData.liveMaterials:o.userData.liveMaterials[0];
    o.frustumCulled=false;
    if(o.geometry&&!o.geometry.getAttribute('normal'))o.geometry.computeVertexNormals();
  });
  return {name,obj,wrapper,box,originalSize:size,clips,remoteUrl,stats:sceneStats(obj),mixer:clips.length?new THREE.AnimationMixer(obj):null,action:null,activeClip:-1};
}
function freeSlot(key){
  const old=slots[key];if(!old)return;
  if(old.mixer)old.mixer.stopAllAction();
  scenes[key].scene.remove(old.wrapper);
  old.wrapper.traverse(o=>{if(o.isMesh){o.geometry?.dispose();const mats=[...(o.userData.liveMaterials||[]),...(o.userData.resetMaterials||[])];mats.forEach(m=>m.dispose());}});
  if(selected && selectedSlot===key)clearSelection();
  slots[key]=null;
}
function installModel(obj,key,name,clips=[],remoteUrl=null){
  const slot=prepareModel(obj,name,clips,remoteUrl);
  freeSlot(key);
  slots[key]=slot;
  scenes[key].scene.add(slot.wrapper);
  if(key==='B')comparisonMode='split';
  $('compare-mode').value=comparisonMode;
  if(key==='A'){$('project-name').textContent=name;$('viewport-model-name').textContent=name;$('file-state').textContent='· Loaded in A';}
  $('viewport-slot').textContent=key;
  treeSlot=key;refreshTreeSwitch();refreshTree();refreshMetrics();refreshAnimations();refreshHelpers();updateVisualModes();fit();
  $('comparison-label').classList.toggle('hidden',comparisonMode!=='split');
  toast(name+' imported into '+key+' · '+fmt(slot.stats.faces)+' triangles');
  status(key+' loaded: '+name);
  return slot;
}
function makeManager(files){
  const manager=new THREE.LoadingManager();
  if(!files || !files.length)return manager;
  const lookup=new Map();
  for(const f of files){
    const url=URL.createObjectURL(f);localUrls.push(url);
    lookup.set(f.name.toLowerCase(),url);
    lookup.set((f.webkitRelativePath||f.name).replace(/\\/g,'/').toLowerCase(),url);
  }
  manager.setURLModifier(url=>{
    if(/^(blob:|data:)/i.test(url))return url;
    const noQuery=url.split(/[?#]/)[0];
    let path=noQuery;
    try{path=decodeURIComponent(noQuery);}catch{}
    path=path.replace(/\\/g,'/').replace(/^\.\//,'').toLowerCase();
    return lookup.get(path)||lookup.get(path.split('/').pop())||url;
  });
  return manager;
}
function withLoading(label,fn){
  $('loading-text').textContent=label;$('loading-indicator').classList.remove('hidden');
  return Promise.resolve().then(fn).catch(err=>{console.error(err);toast('Load failed: '+(err?.message||err),true);status('Import error · '+(err?.message||err));}).finally(()=>$('loading-indicator').classList.add('hidden'));
}
function assetFromGeometry(geometry,name){
  geometry.computeBoundingBox();
  if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({color:0xb8c7de,roughness:.7,metalness:.1,side:THREE.DoubleSide});
  if(geometry.hasColors)mat.vertexColors=true;
  const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;return mesh;
}
const draco=new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
function gltfLoader(manager){const loader=new GLTFLoader(manager);loader.setDRACOLoader(draco);return loader;}
function parseGltf(data,manager){return new Promise((resolve,reject)=>gltfLoader(manager).parse(data,'',resolve,reject));}
async function parseFiles(files,key){
  const source=[...files].find(f=>supported.includes(fileExt(f.name)));
  if(!source)throw Error('No supported model found. Choose GLB, GLTF, OBJ, FBX, STL, PLY or DAE.');
  const ext=fileExt(source.name), manager=makeManager(files);
  let obj,clips=[];
  if(ext==='glb'||ext==='gltf'){
    const data=ext==='glb'?await source.arrayBuffer():await source.text();
    const gltf=await parseGltf(data,manager);obj=gltf.scene;clips=gltf.animations||[];
  }else if(ext==='obj'){
    const loader=new OBJLoader(manager);
    const mtl=[...files].find(f=>fileExt(f.name)==='mtl');
    if(mtl){
      const mtlLoader=new MTLLoader(manager);
      const materials=mtlLoader.parse(await mtl.text(),'');
      materials.preload();
      loader.setMaterials(materials);
    }
    obj=loader.parse(await source.text());
  }else if(ext==='fbx'){
    obj=new FBXLoader(manager).parse(await source.arrayBuffer(),'');
    clips=obj.animations||[];
  }else if(ext==='stl'){
    obj=assetFromGeometry(new STLLoader(manager).parse(await source.arrayBuffer()),source.name);
  }else if(ext==='ply'){
    obj=assetFromGeometry(new PLYLoader(manager).parse(await source.arrayBuffer()),source.name);
  }else if(ext==='dae'){
    const dae=new ColladaLoader(manager).parse(await source.text(),'');
    obj=dae.scene;clips=dae.animations||[];
  }
  installModel(obj,key,source.name,clips);
}
async function loadFiles(files,key='A'){await withLoading('Parsing local assets…',()=>parseFiles(files,key));}
async function loadURL(url,key){
  if(!url||!/^https?:\/\//i.test(url))throw Error('Enter an absolute http(s) asset URL.');
  const ext=fileExt(url);
  if(!supported.includes(ext))throw Error('Unknown 3D file extension in URL.');
  const manager=makeManager(),name=decodeURIComponent(url.split('?')[0].split('/').pop()||'Remote model');
  let obj,clips=[];
  if(['glb','gltf'].includes(ext)){
    const model=await gltfLoader(manager).loadAsync(url);obj=model.scene;clips=model.animations||[];
  }else if(ext==='obj'){
    const response=await fetch(url);if(!response.ok)throw Error('HTTP '+response.status);
    const text=await response.text(),mtlRef=text.match(/^\s*mtllib\s+(.+)$/m);
    const loader=new OBJLoader(manager);
    if(mtlRef){
      try{
        const mtlUrl=new URL(mtlRef[1].trim(),url).href;
        const creator=await new MTLLoader(manager).loadAsync(mtlUrl);
        creator.preload();loader.setMaterials(creator);
      }catch(e){console.warn('MTL unavailable:',e);}
    }
    obj=loader.parse(text);
  }else if(ext==='fbx'){obj=await new FBXLoader(manager).loadAsync(url);clips=obj.animations||[];}
  else if(ext==='dae'){const x=await new ColladaLoader(manager).loadAsync(url);obj=x.scene;clips=x.animations||[];}
  else if(ext==='ply'){obj=assetFromGeometry(await new PLYLoader(manager).loadAsync(url),name);}
  else if(ext==='stl'){obj=assetFromGeometry(await new STLLoader(manager).loadAsync(url),name);}
  installModel(obj,key,name,clips,url);
}
function refreshTreeSwitch(){
  q('#tree-slot-switch button').forEach(b=>b.classList.toggle('selected',b.dataset.slot===treeSlot));
}
function refreshTree(){
  const container=$('mesh-tree');container.replaceChildren();
  const slot=slots[treeSlot];$('tree-total').textContent=slot?.stats.nodes||0;
  if(!slot){container.innerHTML='<div class="muted tree-empty">Nothing loaded in this slot.</div>';return;}
  const maxNodes=1200;let count=0;
  function subtree(object,depth){
    if(++count>maxNodes)return null;
    const holder=document.createElement('div');
    const row=document.createElement('div');row.className='tree-node';
    if(selected===object&&selectedSlot===treeSlot)row.classList.add('selected');
    const hasChildren=object.children.length>0;
    const expand=document.createElement('button');expand.className='caret';expand.textContent=hasChildren?'▾':'·';row.append(expand);
    const type=document.createElement('span');type.className='tree-mark';type.textContent=object.isSkinnedMesh?'◆':object.isMesh?'▰':object.isBone?'⌁':'◇';row.append(type);
    const text=document.createElement('span');text.className='tree-name';text.textContent=object.name||object.type;text.title=(object.name||object.type)+' · '+object.type;row.append(text);
    const eye=document.createElement('button');eye.className='eye'+(object.visible?'':' off');eye.textContent=object.visible?'◉':'○';eye.title='Toggle visibility';eye.addEventListener('click',e=>{e.stopPropagation();object.visible=!object.visible;refreshTree();});row.append(eye);
    holder.append(row);
    const children=document.createElement('div');children.className='tree-children';holder.append(children);
    if(depth<24)for(const c of object.children){const el=subtree(c,depth+1);if(el)children.append(el);}
    if(!hasChildren)children.style.display='none';
    expand.addEventListener('click',e=>{e.stopPropagation();if(!hasChildren)return;const show=children.style.display==='none';children.style.display=show?'':'none';expand.textContent=show?'▾':'▸';});
    row.addEventListener('click',()=>selectObject(object,treeSlot));
    return holder;
  }
  const tree=subtree(slot.obj,0);if(tree)container.append(tree);
  if(count>=maxNodes){const notice=document.createElement('p');notice.className='helper';notice.textContent='Large hierarchy truncated to '+maxNodes+' nodes.';container.append(notice);}
}
function clearSelection(){
  selected=null;if(selectionBox){selectionBox.parent?.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();selectionBox=null;}
  $('selected-name').textContent='Nothing selected';
  $('selected-details').textContent='Click a mesh or pick it from the hierarchy.';
  $('material-editor').classList.add('hidden');$('material-empty').classList.remove('hidden');
  if(slots[treeSlot])refreshTree();
}
function selectObject(object,key){
  if(!object)return clearSelection();
  if(selectionBox){selectionBox.parent?.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();}
  selected=object;selectedSlot=key;treeSlot=key;refreshTreeSwitch();
  if(object.isMesh){
    selectionBox=new THREE.BoxHelper(object,0xffcc83);scenes[key].scene.add(selectionBox);
  }else selectionBox=null;
  $('selected-name').textContent=object.name||object.type;
  const g=object.geometry;
  const text=['Type: '+object.type,'Visible: '+object.visible];
  if(g){text.push('Vertices: '+fmt(g.getAttribute('position')?.count||0));text.push('Triangles: '+fmt((g.index?.count||g.getAttribute('position')?.count||0)/3));text.push('Attributes: '+Object.keys(g.attributes).join(', '));}
  $('selected-details').textContent=text.join('  ·  ');
  refreshTree();refreshMetrics();refreshMaterialEditor();
}
function visibleMeshIntersect(pointerX,pointerY){
  const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;
  let slotKey='A',x=pointerX;
  if(comparisonMode==='split'&&slots.B){const half=w/2;if(pointerX>=half){slotKey='B';x=pointerX-half;}else slotKey='A';}
  else if(comparisonMode==='single'&&!slots.A&&slots.B)slotKey='B';
  else if(comparisonMode==='overlay'&&slots.B&&treeSlot==='B')slotKey='B';
  const slot=slots[slotKey];if(!slot)return null;
  const vw=comparisonMode==='split'&&slots.B?w/2:w;
  setCamera(vw/h);
  ndc.set(x/vw*2-1,-pointerY/h*2+1);
  raycaster.setFromCamera(ndc,camera);
  const hits=raycaster.intersectObject(slot.wrapper,true).filter(hit=>hit.object.visible);
  return hits.length?{hit:hits[0],slotKey}:null;
}
function pick(x,y,measurement=false){
  const result=visibleMeshIntersect(x,y);
  if(!result){if(!measurement)clearSelection();return;}
  if(measurement)measure(result.hit.point,result.slotKey);
  else selectObject(result.hit.object,result.slotKey);
}
function makeMarker(pos,key){
  const marker=new THREE.Mesh(new THREE.SphereGeometry(Math.max(.004,cameraState.distance*.005),12,8),new THREE.MeshBasicMaterial({color:0xffd37b,depthTest:false}));
  marker.position.copy(pos);marker.renderOrder=100;scenes[key].scene.add(marker);markers.push({mesh:marker,key});
}
function measure(point,key){
  if(measurePoints.length>=2)clearMeasure();
  if(measurePoints.length===1&&key!==measurePoints[0].key){toast('Measure both points on the same model slot.',true);return;}
  measurePoints.push({position:point.clone(),key});makeMarker(point,key);
  if(measurePoints.length===2){
    const a=measurePoints[0].position,b=measurePoints[1].position,dist=a.distanceTo(b);
    const geom=new THREE.BufferGeometry().setFromPoints([a,b]);
    const mat=new THREE.LineBasicMaterial({color:0xffd37b,depthTest:false});
    measurementLine=new THREE.Line(geom,mat);measurementLine.renderOrder=99;scenes[key].scene.add(measurementLine);
    $('measurement-result').textContent=fixed(dist)+' model units';
    status('Measured distance: '+fixed(dist)+' model units');
  }else $('measurement-result').textContent='First point set · pick second point';
}
function clearMeasure(){
  markers.forEach(({mesh,key})=>{scenes[key].scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();});markers=[];
  if(measurementLine){measurementLine.parent?.remove(measurementLine);measurementLine.geometry.dispose();measurementLine.material.dispose();measurementLine=null;}
  measurePoints=[];$('measurement-result').textContent='Pick first point…';
}
const clay=new THREE.MeshStandardMaterial({color:0xa8b5c8,roughness:.66,metalness:0,side:THREE.DoubleSide});
const normalMat=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
let uvTexture=null;
function makeUVTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;
  const ctx=c.getContext('2d');const block=32;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    ctx.fillStyle=(x+y)%2?'#31475d':'#9aaabd';ctx.fillRect(x*block,y*block,block,block);
    ctx.fillStyle=(x+y)%2?'#d3e4f2':'#172636';ctx.font='bold 8px monospace';ctx.fillText(x+','+y,x*block+3,y*block+13);
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;
}
const uvMaterial=new THREE.MeshBasicMaterial({map:makeUVTexture(),side:THREE.DoubleSide});
function updateVisualModes(){
  renderMode=$('render-mode').value;
  for(const key of ['A','B']){
    const slot=slots[key];if(!slot)continue;
    slot.obj.traverse(o=>{
      if(!o.isMesh)return;
      const original=o.userData.liveMaterials||[];
      if(renderMode==='clay')o.material=clay;
      else if(renderMode==='normal')o.material=normalMat;
      else if(renderMode==='uv')o.material=uvMaterial;
      else{
        original.forEach(m=>{m.wireframe=renderMode==='wire';m.needsUpdate=true;});
        o.material=o.userData.materialArray?original:original[0];
      }
    });
  }
}
function refreshMetrics(){
  const slot=slots[treeSlot];const s=slot?.stats;
  $('metrics-slot').textContent=treeSlot;
  for(const [key,value] of [['metric-faces',s?.faces],['metric-vertices',s?.vertices],['metric-meshes',s?.meshes],['metric-materials',s?.materials]])$(key).textContent=value===undefined?'—':fmt(value);
  $('metric-dims').textContent=slot?'Width X: '+fixed(slot.originalSize.x)+'  |  Height Y: '+fixed(slot.originalSize.y)+'  |  Depth Z: '+fixed(slot.originalSize.z):'—';
  $('asset-extra').textContent=slot?'Nodes: '+fmt(s.nodes)+' · Skinned meshes: '+fmt(s.skinned)+' · UV meshes: '+fmt(s.uvs)+' · Texture maps: '+fmt(s.maps)+' · Clips: '+fmt(slot.clips.length):'No model loaded.';
  $('clip-count').textContent=(slot?.clips.length||0)+' clips';
}
function selectedMaterial(){
  if(!selected?.isMesh)return null;
  return selected.userData.liveMaterials?.[0]||null;
}
function refreshMaterialEditor(){
  const mat=selectedMaterial();
  $('material-editor').classList.toggle('hidden',!mat);
  $('material-empty').classList.toggle('hidden',!!mat);
  if(!mat)return;
  $('material-title').textContent=mat.name||mat.type;
  $('mat-color').value=mat.color?'#'+mat.color.getHexString():'#ffffff';
  for(const [id,p,def] of [['mat-metal','metalness',0],['mat-rough','roughness',.5],['mat-opacity','opacity',1],['mat-emissive','emissiveIntensity',0]]){
    const n=mat[p]??def;$(id).value=n;$(id+'-val').textContent=n.toFixed(2);
  }
  $('mat-double').checked=mat.side===THREE.DoubleSide;
  const list=$('texture-list');list.replaceChildren();
  let found=0;
  for(const [prop,label] of [['map','Albedo / base color'],['normalMap','Normal'],['roughnessMap','Roughness'],['metalnessMap','Metallic'],['aoMap','Occlusion'],['emissiveMap','Emissive'],['alphaMap','Alpha'],['bumpMap','Bump'],['specularMap','Specular']]){
    const t=mat[prop];if(!t)continue;found++;
    const node=document.createElement('div');node.className='tex-card';
    const preview=document.createElement('canvas');preview.width=preview.height=43;preview.className='tex-preview';
    try{if(t.image?.width)preview.getContext('2d').drawImage(t.image,0,0,43,43);}catch{}
    const text=document.createElement('div');const title=document.createElement('b');title.textContent=label;const detail=document.createElement('small');detail.textContent=(t.name||'')+' '+(t.image?.width||'?')+'×'+(t.image?.height||'?');
    text.append(title,detail);node.append(preview,text);list.append(node);
  }
  if(!found){const p=document.createElement('p');p.className='helper';p.textContent='No linked texture maps.';list.append(p);}
}
function refreshAnimations(){
  const slot=slots[treeSlot],select=$('animation-select');select.replaceChildren();
  const blank=new Option('No animation',-1);select.add(blank);
  if(slot)slot.clips.forEach((clip,i)=>select.add(new Option((clip.name||'Clip '+(i+1))+' · '+clip.duration.toFixed(2)+'s',i)));
  select.value=String(slot?.activeClip??-1);
  $('btn-animation').textContent=slot?.action?.isRunning()?'❚❚ Pause':'▶ Play';
}
function chooseAnimation(index){
  const slot=slots[treeSlot];if(!slot?.mixer)return;
  slot.mixer.stopAllAction();
  slot.activeClip=index;
  slot.action=index>=0?slot.mixer.clipAction(slot.clips[index]):null;
  if(slot.action){slot.action.reset().play();slot.action.paused=false;}
  refreshAnimations();
}
function applyLighting(){
  for(const key of ['A','B']){
    const s=scenes[key];s.key.intensity=+$('light-key').value;s.hemisphere.intensity=+$('light-fill').value;s.rim.intensity=+$('light-rim').value;
  }
  renderer.toneMappingExposure=+$('exposure').value;
  for(const id of ['light-key','light-fill','light-rim','exposure','overlay-opacity'])$(id+'-val').textContent=(+$(id).value).toFixed(2);
}
function setComparison(mode){
  if(mode!=='single'&&!slots.B){toast('Load a revision into B to compare.',true);mode='single';}
  comparisonMode=mode;$('compare-mode').value=mode;$('comparison-label').classList.toggle('hidden',mode!=='split');fit();
}
function renderOne(key,x,w,h,clearColor=true,overlay=false){
  const slot=slots[key];if(!slot)return;
  renderer.setViewport(x,0,w,h);renderer.setScissor(x,0,w,h);renderer.setScissorTest(true);
  setCamera(w/h);
  if(clearColor)renderer.clear(true,true,true);
  else renderer.clearDepth();
  let saved=null;
  if(overlay){
    saved=[];
    slot.obj.traverse(o=>{
      if(!o.isMesh)return;
      const m=o.material,mats=Array.isArray(m)?m:[m];
      saved.push([o,m]);
      const opacity=+$('overlay-opacity').value;
      const temp=mats.map(orig=>{const clone=orig.clone();clone.transparent=true;clone.opacity=opacity;clone.depthWrite=false;clone.side=THREE.DoubleSide;return clone;});
      o.material=Array.isArray(m)?temp:temp[0];
    });
    scenes[key].grid.visible=false;
  }
  renderer.render(scenes[key].scene,camera);
  if(saved){for(const [o,old] of saved){const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(x=>x.dispose());o.material=old;}scenes[key].grid.visible=$('show-grid').checked;}
}
function renderFrame(){
  requestAnimationFrame(renderFrame);
  const delta=Math.min(clock.getDelta(),.05);
  for(const key of ['A','B'])slots[key]?.mixer?.update(delta);
  if($('auto-rotate').checked)cameraState.yaw+=delta*.24;
  if($('rotate-light').checked)for(const key of ['A','B'])scenes[key].head.position.copy(camera.position);
  if(selectionBox)selectionBox.update();
  const w=viewport.clientWidth,h=viewport.clientHeight;
  if(w<1||h<1)return;
  const pixelRatio=renderer.getPixelRatio(),actualW=Math.floor(w*pixelRatio),actualH=Math.floor(h*pixelRatio);
  if(canvas.width!==actualW||canvas.height!==actualH)renderer.setSize(w,h,false);
  const rw=canvas.width,rh=canvas.height;
  renderer.setClearColor($('bg-color').value,1);
  renderer.info.autoReset=false;renderer.info.reset();
  if(comparisonMode==='split'&&slots.B){
    const half=Math.floor(rw/2);
    renderOne('A',0,half,rh);
    renderOne('B',half,rw-half,rh);
  }else if(comparisonMode==='overlay'&&slots.B){
    renderOne('A',0,rw,rh);
    renderOne('B',0,rw,rh,false,true);
  }else{
    renderOne(slots.A?'A':'B',0,rw,rh);
  }
  renderer.setScissorTest(false);
  frameCount++;
  const now=performance.now();
  if(now-lastFpsAt>700){
    fps=Math.round(frameCount*1000/(now-lastFpsAt));
    $('fps').textContent=fps+' FPS';
    $('drawcalls').textContent=fmt(renderer.info.render.calls)+' calls';
    $('triangles').textContent=fmt(renderer.info.render.triangles)+' tris';
    frameCount=0;lastFpsAt=now;
  }
  const active=slots.A||slots.B;
  if(active&&active.activeClip>=0){
    const action=active.action,clip=active.clips[active.activeClip];
    $('animation-time').textContent=(action?.time||0).toFixed(1)+'s / '+clip.duration.toFixed(1)+'s';
  }
}
function demo(){
  const root=new THREE.Group();root.name='DEMO · Inspection probe';
  function mesh(geo,mat,name,x=0,y=0,z=0,group=root){const o=new THREE.Mesh(geo,mat);o.name=name;o.position.set(x,y,z);group.add(o);return o;}
  const gunmetal=new THREE.MeshStandardMaterial({color:0x354c68,roughness:.38,metalness:.8});
  const ceramic=new THREE.MeshStandardMaterial({color:0xb7c8e1,roughness:.3,metalness:.4});
  const blue=new THREE.MeshStandardMaterial({color:0x63bfff,roughness:.22,metalness:.3,emissive:0x247bb9,emissiveIntensity:.7});
  const orange=new THREE.MeshStandardMaterial({color:0xffb672,roughness:.27,metalness:.55,emissive:0x7c391d,emissiveIntensity:.45});
  const core=mesh(new THREE.IcosahedronGeometry(.75,2),gunmetal,'Chassis · faceted carbon');
  mesh(new THREE.IcosahedronGeometry(.55,2),blue,'Energy core');
  const ring=mesh(new THREE.TorusGeometry(1,.055,14,120),ceramic,'Rotation ring · latitude');ring.rotation.x=.65;
  const ring2=mesh(new THREE.TorusGeometry(1.2,.044,14,120),orange,'Rotation ring · longitude');ring2.rotation.y=.8;
  const shafts=new THREE.Group();shafts.name='Stabilizer wing assembly';root.add(shafts);
  for(const side of [-1,1]){
    const wing=mesh(new THREE.BoxGeometry(1,.14,.45),gunmetal,(side===-1?'Left':'Right')+' stabilizer',side*1.38,.05,0,shafts);wing.rotation.z=side*.12;
    const fin=mesh(new THREE.ConeGeometry(.25,.62,4),ceramic,(side===-1?'Left':'Right')+' fin',side*1.88,.18,0,shafts);fin.rotation.z=side*.25;
    mesh(new THREE.SphereGeometry(.09,16,10),orange,(side===-1?'Port':'Starboard')+' beacon',side*1.84,-.05,.3,shafts);
  }
  const stem=mesh(new THREE.CylinderGeometry(.12,.17,1.1,12),gunmetal,'Central antenna',0,1.2);
  mesh(new THREE.SphereGeometry(.21,16,12),blue,'Antenna sensor',0,1.8);
  root.rotation.y=.25;
  return root;
}
function bindUI(){
  $('btn-open').onclick=$('load-a').onclick=()=>$('model-file').click();
  $('btn-compare-open').onclick=$('load-b').onclick=()=>$('compare-file').click();
  $('btn-folder').onclick=()=>$('folder-file').click();
  $('model-file').onchange=e=>{loadFiles(e.target.files,'A');e.target.value='';};
  $('compare-file').onchange=e=>{loadFiles(e.target.files,'B');e.target.value='';};
  $('folder-file').onchange=e=>{loadFiles(e.target.files,treeSlot);e.target.value='';};
  $('btn-url').onclick=()=>withLoading('Loading model URL…',()=>loadURL($('url-input').value.trim(),'A'));
  $('btn-compare-url').onclick=()=>withLoading('Loading revision URL…',()=>loadURL($('compare-url').value.trim(),'B'));
  $('url-input').addEventListener('keydown',e=>{if(e.key==='Enter')$('btn-url').click();});
  $('compare-url').addEventListener('keydown',e=>{if(e.key==='Enter')$('btn-compare-url').click();});
  $('btn-screenshot').onclick=()=>{renderer.domElement.toBlob(b=>{if(b){download(b,'parallax-comparison-'+Date.now()+'.png','image/png');toast('Viewport image exported.');}},'image/png');};
  $('btn-report').onclick=()=>exportReport();
  $('btn-frame').onclick=()=>fit();
  $('btn-reset').onclick=()=>{cameraState.yaw=.35;cameraState.pitch=Math.PI/2.1;fit();};
  $('btn-projection').onclick=()=>{cameraState.orthographic=!cameraState.orthographic;setCamera();};
  $('render-mode').onchange=()=>updateVisualModes();
  $('compare-mode').onchange=e=>setComparison(e.target.value);
  $('btn-swap').onclick=()=>{if(!slots.B){toast('Load B first.');return;}const a=slots.A,b=slots.B;scenes.A.scene.remove(a.wrapper);scenes.B.scene.remove(b.wrapper);slots.A=b;slots.B=a;scenes.A.scene.add(b.wrapper);scenes.B.scene.add(a.wrapper);$('project-name').textContent=b.name;clearSelection();refreshTree();refreshMetrics();refreshHelpers();fit();toast('Swapped original and revision.');};
  q('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
  q('#tree-slot-switch button').forEach(b=>b.onclick=()=>{treeSlot=b.dataset.slot;refreshTreeSwitch();clearSelection();refreshTree();refreshMetrics();refreshAnimations();});
  q('.tabs button').forEach(b=>b.onclick=()=>{q('.tabs button').forEach(x=>x.classList.toggle('active',x===b));q('.tab-page').forEach(x=>x.classList.toggle('active',x.dataset.page===b.dataset.tab));});
  $('btn-focus-selected').onclick=()=>{if(selected){const box=new THREE.Box3().setFromObject(selected);fit(box);}else fit();};
  $('btn-hide-selected').onclick=()=>{if(selected){selected.visible=!selected.visible;refreshTree();}};
  $('btn-isolate').onclick=()=>{
    const slot=slots[selectedSlot];if(!slot||!selected)return;
    slot.obj.traverse(o=>{if(o.isMesh)o.visible=o===selected||selected===o.parent;});refreshTree();
  };
  $('btn-show-all').onclick=()=>{for(const key of ['A','B'])slots[key]?.obj.traverse(o=>o.visible=true);refreshTree();};
  $('animation-select').onchange=e=>chooseAnimation(+e.target.value);
  $('btn-animation').onclick=()=>{
    const slot=slots[treeSlot];if(!slot?.action){if(slot?.clips.length)chooseAnimation(0);return;}
    slot.action.paused=!slot.action.paused;$('btn-animation').textContent=slot.action.paused?'▶ Play':'❚❚ Pause';
  };
  $('btn-animation-reset').onclick=()=>chooseAnimation(-1);
  $('animation-speed').oninput=e=>{const s=slots[treeSlot];if(s?.mixer)s.mixer.timeScale=clamp(+e.target.value,.1,4);};
  for(const id of ['show-grid','show-axes','show-bounds','show-skeleton'])$(id).onchange=refreshHelpers;
  $('measure-toggle').onchange=e=>{measureOn=e.target.checked;canvas.style.cursor=measureOn?'crosshair':'grab';};
  $('btn-clear-measure').onclick=clearMeasure;
  for(const id of ['light-key','light-fill','light-rim','exposure','overlay-opacity'])$(id).oninput=applyLighting;
  for(const [id,p] of [['mat-color','color'],['mat-metal','metalness'],['mat-rough','roughness'],['mat-opacity','opacity'],['mat-emissive','emissiveIntensity']]){
    $(id).addEventListener('input',e=>{
      const m=selectedMaterial();if(!m)return;
      if(p==='color')m.color?.set(e.target.value);else m[p]=+e.target.value;
      if(p==='opacity')m.transparent=+e.target.value<1;
      m.needsUpdate=true;
      if(p!=='color')$(id+'-val').textContent=(+e.target.value).toFixed(2);
    });
  }
  $('mat-double').onchange=e=>{const m=selectedMaterial();if(m){m.side=e.target.checked?THREE.DoubleSide:THREE.FrontSide;m.needsUpdate=true;}};
  $('btn-reset-material').onclick=()=>{
    if(!selected?.isMesh)return;
    selected.userData.liveMaterials=selected.userData.resetMaterials.map(m=>m.clone());updateVisualModes();refreshMaterialEditor();toast('Selected material restored.');
  };
  $('btn-bookmark').onclick=saveBookmark;
  $('btn-copy-link').onclick=copyShareLink;
  $('btn-export-state').onclick=exportSetup;
  $('btn-import-state').onclick=()=>$('state-file').click();
  $('state-file').onchange=e=>{importSetup(e.target.files?.[0]);e.target.value='';};
  window.addEventListener('keydown',handleKey);
  installControls();
  installDrop();
}
function installControls(){
  let drag=null;
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==2&&e.button!==1)return;
    drag={button:e.button,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:0,shift:e.shiftKey};
    canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');
    e.preventDefault();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;drag.moved+=Math.abs(dx)+Math.abs(dy);
    if(drag.button===0){
      setCamera();
      const right=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0);
      const up=new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);
      const height=canvas.getBoundingClientRect().height;
      const unit=(cameraState.orthographic?cameraState.orthoSize*2:2*cameraState.distance*Math.tan(THREE.MathUtils.degToRad(20)))/Math.max(1,height);
      cameraState.target.addScaledVector(right,-dx*unit).addScaledVector(up,dy*unit);
    }else{
      cameraState.yaw-=dx*.006;cameraState.pitch=clamp(cameraState.pitch-dy*.006,.003,Math.PI-.003);
    }
    e.preventDefault();
  });
  const end=e=>{
    if(!drag)return;
    if(drag.button===0&&drag.moved<5){
      const rect=canvas.getBoundingClientRect();pick(e.clientX-rect.left,e.clientY-rect.top,measureOn||drag.shift);
    }
    drag=null;canvas.classList.remove('dragging');
    try{canvas.releasePointerCapture(e.pointerId);}catch{}
  };
  canvas.addEventListener('pointerup',end);
  canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const factor=Math.exp(clamp(e.deltaY,-200,200)*.00125);
    if(cameraState.orthographic)cameraState.orthoSize=clamp(cameraState.orthoSize*factor,.00001,1e8);
    else cameraState.distance=clamp(cameraState.distance*factor,.00001,1e8);
  },{passive:false});
}
function installDrop(){
  const overlay=$('drop-overlay');
  window.addEventListener('dragover',e=>{e.preventDefault();pendingDrop=Date.now();overlay.classList.remove('hidden');});
  window.addEventListener('dragleave',e=>{if(!e.relatedTarget)overlay.classList.add('hidden');});
  window.addEventListener('drop',async e=>{
    e.preventDefault();overlay.classList.add('hidden');
    const entries=[...(e.dataTransfer.items||[])].map(item=>item.webkitGetAsEntry?.()).filter(Boolean);
    let files=[...e.dataTransfer.files];
    if(entries.some(en=>en.isDirectory)){
      files=[];
      async function walk(entry){
        if(entry.isFile)return new Promise(res=>entry.file(f=>res([f]),()=>res([])));
        if(entry.isDirectory){
          const reader=entry.createReader(),items=[];
          while(true){
            const batch=await new Promise(res=>reader.readEntries(res,()=>res([])));
            if(!batch.length)break;items.push(...batch);
          }
          return (await Promise.all(items.map(walk))).flat();
        }
        return [];
      }
      files=(await Promise.all(entries.map(walk))).flat();
    }
    if(files.length)await loadFiles(files,e.shiftKey?'B':'A');
  });
}
function handleKey(e){
  if(e.ctrlKey||e.metaKey||e.altKey||/input|select|textarea/i.test(document.activeElement.tagName))return;
  if(e.key==='f'||e.key==='F'){if(selected)fit(new THREE.Box3().setFromObject(selected));else fit();}
  else if(e.key==='p'||e.key==='P')$('btn-projection').click();
  else if(e.key==='o'||e.key==='O')$('model-file').click();
  else if(e.key==='m'||e.key==='M'){$('measure-toggle').click();}
  else if(e.key==='h'||e.key==='H')$('btn-hide-selected').click();
  else if(e.key==='Escape')clearSelection();
  else if(/^[1-6]$/.test(e.key))view(['front','back','left','right','top','bottom'][+e.key-1]);
}
const keyBookmarks='parallax-inspection-bookmarks-v1';
function bookmarks(){try{return JSON.parse(localStorage.getItem(keyBookmarks)||'[]');}catch{return [];}}
function saveBookmark(){
  const name=$('bookmark-name').value.trim()||'View '+new Date().toLocaleTimeString();
  const all=bookmarks();all.push({id:Date.now(),name,...getCameraJSON()});localStorage.setItem(keyBookmarks,JSON.stringify(all.slice(-50)));$('bookmark-name').value='';renderBookmarks();toast('View bookmark saved.');
}
function renderBookmarks(){
  const el=$('bookmark-list');el.replaceChildren();
  for(const item of bookmarks()){
    const row=document.createElement('div');row.className='bookmark-row';
    const go=document.createElement('button');go.textContent='◎ '+item.name;go.onclick=()=>{useCameraJSON(item);toast('Camera restored: '+item.name);};
    const del=document.createElement('button');del.className='delete';del.textContent='×';del.title='Delete bookmark';del.onclick=()=>{localStorage.setItem(keyBookmarks,JSON.stringify(bookmarks().filter(x=>x.id!==item.id)));renderBookmarks();};
    row.append(go,del);el.append(row);
  }
  if(!bookmarks().length)el.innerHTML='<p class="helper">No saved views yet.</p>';
}
function getCameraJSON(){return {yaw:cameraState.yaw,pitch:cameraState.pitch,distance:cameraState.distance,orthoSize:cameraState.orthoSize,orthographic:cameraState.orthographic,target:cameraState.target.toArray()};}
function useCameraJSON(a){
  if(!a)return;
  for(const key of ['yaw','pitch','distance','orthoSize'])if(Number.isFinite(a[key]))cameraState[key]=a[key];
  if(typeof a.orthographic==='boolean')cameraState.orthographic=a.orthographic;
  if(Array.isArray(a.target)&&a.target.length===3)cameraState.target.fromArray(a.target);
  setCamera();
}
function getSetup(){
  return {application:'PARALLAX',version:1,camera:getCameraJSON(),modelA:slots.A?.remoteUrl||null,modelB:slots.B?.remoteUrl||null,renderMode,comparisonMode,treeSlot,lighting:{key:+$('light-key').value,ambient:+$('light-fill').value,rim:+$('light-rim').value,exposure:+$('exposure').value},showGrid:$('show-grid').checked,showAxes:$('show-axes').checked,bgColor:$('bg-color').value,overlayOpacity:+$('overlay-opacity').value};
}
function exportSetup(){download(JSON.stringify(getSetup(),null,2),'parallax-inspection.json');toast('Inspection setup exported.');}
function exportReport(){
  const report={application:'PARALLAX',generated:new Date().toISOString(),setup:getSetup(),assets:{}};
  for(const key of ['A','B'])if(slots[key]){
    const s=slots[key];const meshes=[];
    s.obj.traverse(o=>{if(o.isMesh)meshes.push({name:o.name||o.type,visible:o.visible,vertices:o.geometry?.getAttribute('position')?.count||0,triangles:Math.floor((o.geometry?.index?.count||o.geometry?.getAttribute('position')?.count||0)/3),material:Array.isArray(o.material)?o.material.map(m=>m.name||m.type):[o.material?.name||o.material?.type]});});
    report.assets[key]={name:s.name,metrics:s.stats,dimensions:s.originalSize.toArray(),clips:s.clips.map(c=>({name:c.name,duration:c.duration})),meshes};
  }
  if(measurePoints.length===2)report.measurement={distance:measurePoints[0].position.distanceTo(measurePoints[1].position),slot:measurePoints[0].key,points:measurePoints.map(p=>p.position.toArray())};
  download(JSON.stringify(report,null,2),'parallax-report-'+new Date().toISOString().slice(0,10)+'.json');
  toast('Detailed JSON inspection report exported.');
}
async function importSetup(file){
  if(!file)return;
  try{
    const obj=JSON.parse(await file.text());
    if(obj.application!=='PARALLAX')throw Error('Not a PARALLAX setup file.');
    await applySetup(obj);
    toast('Inspection setup restored.');
  }catch(e){toast('Invalid inspection setup: '+e.message,true);}
}
async function applySetup(obj){
  if(obj.modelA)await withLoading('Loading A from setup…',()=>loadURL(obj.modelA,'A'));
  if(obj.modelB)await withLoading('Loading B from setup…',()=>loadURL(obj.modelB,'B'));
  if(obj.renderMode){$('render-mode').value=obj.renderMode;updateVisualModes();}
  if(obj.comparisonMode)setComparison(obj.comparisonMode);
  if(obj.treeSlot&&['A','B'].includes(obj.treeSlot)){treeSlot=obj.treeSlot;refreshTreeSwitch();refreshTree();refreshMetrics();}
  if(obj.lighting){
    for(const [id,k] of [['light-key','key'],['light-fill','ambient'],['light-rim','rim'],['exposure','exposure']])if(obj.lighting[k]!=null)$(id).value=obj.lighting[k];
  }
  if(obj.bgColor)$('bg-color').value=obj.bgColor;
  if(obj.overlayOpacity!=null)$('overlay-opacity').value=obj.overlayOpacity;
  if(typeof obj.showGrid==='boolean')$('show-grid').checked=obj.showGrid;
  if(typeof obj.showAxes==='boolean')$('show-axes').checked=obj.showAxes;
  applyLighting();refreshHelpers();useCameraJSON(obj.camera);
}
function copyShareLink(){
  const setup=getSetup(),params=new URLSearchParams();
  if(setup.modelA)params.set('model',setup.modelA);
  if(setup.modelB)params.set('compare',setup.modelB);
  params.set('view',encodeURIComponent(JSON.stringify(getCameraJSON())));
  if(comparisonMode!=='single')params.set('mode',comparisonMode);
  const url=location.origin+location.pathname+'?'+params.toString();
  navigator.clipboard?.writeText(url).then(()=>toast('Inspection link copied.')).catch(()=>toast('Copy failed. Use Export setup instead.',true));
  if(!setup.modelA&&!setup.modelB)toast('Camera link copied (local files cannot be shared).');
}
function loadFromQuery(){
  const p=new URLSearchParams(location.search);
  const model=p.get('model'),compare=p.get('compare');
  if(!model&&!compare)return;
  withLoading('Opening linked inspection…',async()=>{
    if(model)await loadURL(model,'A');
    if(compare)await loadURL(compare,'B');
    if(p.get('mode'))setComparison(p.get('mode'));
    if(p.get('view')){try{useCameraJSON(JSON.parse(decodeURIComponent(p.get('view'))));}catch{}}
  });
}
bindUI();
renderBookmarks();
applyLighting();
installModel(demo(),'A','Inspection probe · demo');
$('file-state').textContent='· Demo scene';
$('viewport-model-name').textContent='Inspection probe · demo';
status('Ready · Drag files onto the viewport or open the original Roxy GLB.');
setCamera();
renderFrame();
loadFromQuery();
window.addEventListener('beforeunload',()=>localUrls.forEach(URL.revokeObjectURL));

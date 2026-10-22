/**
 * Browser wheel events do not include a reliable mouse-vs-touchpad discriminator.
 * Explicit input override always wins. Auto uses the best-known Windows
 * precision-touchpad heuristics, plus short gesture continuity.
 */
export function classifyWheel(e, mode='auto', previous='mouse', lastGestureAt=0, now=0){
  if(e.ctrlKey)return 'pinch';
  if(mode==='touchpad')return 'touchpad';
  if(mode==='mouse')return 'mouse';
  if(e.shiftKey)return 'touchpad';
  if(e.deltaMode!==0)return 'mouse';
  if(Math.abs(e.deltaX)>0.01)return 'touchpad';
  if(previous==='touchpad' && now-lastGestureAt<600)return 'touchpad';
  const y=Math.abs(e.deltaY);
  if(y<1e-6)return 'mouse';
  if(y<65 || Math.abs(y-Math.round(y))>.02)return 'touchpad';
  return 'mouse';
}
export function wheelPixels(e,viewportHeight){
  const multiplier=e.deltaMode===1?16:e.deltaMode===2?viewportHeight:1;
  return {x:e.deltaX*multiplier,y:e.deltaY*multiplier};
}
export function zoomFactor(delta, isPinch=false){
  return Math.exp(Math.max(-250,Math.min(250,delta))*(isPinch?.009:.00125));
}

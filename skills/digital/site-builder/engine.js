/* Learner-only geometry. Upstream object dimensions are not safety clearances. */
(function(g){
'use strict';
const palette=['container-10ft','container-20ft','site-cabin','portable-toilet','fence-panel','jersey-barrier','traffic-cone','person'];
function validate(data){
 if(!data||data.version!==1||!Array.isArray(data.objects)||data.objects.length>24)throw Error('Use a version 1 site plan with at most 24 objects.');
 const ids=new Set();
 const objects=data.objects.map(o=>{
  if(!o||!palette.includes(o.asset)||typeof o.uid!=='string'||!/^[A-Za-z0-9-]{1,40}$/.test(o.uid)||ids.has(o.uid))throw Error('Unknown object or duplicate identifier.');
  ids.add(o.uid);
  for(const k of ['x','y','rotation','start','end'])if(typeof o[k]!=='number'||!Number.isFinite(o[k]))throw Error('Positions and times must be finite numbers.');
  if(Math.abs(o.x)>20||Math.abs(o.y)>20||o.rotation<0||o.rotation>=360||o.start<0||o.end>8||o.end<=o.start)throw Error('Use positions from −20 to 20 m, rotation 0–359°, and times 0–8 with end after start.');
  return {uid:o.uid,asset:o.asset,x:o.x,y:o.y,rotation:o.rotation,start:o.start,end:o.end};
 });
 return {version:1,objects};
}
function corners(o){const s=g.MCSITECAT.specOf(o.asset),a=o.rotation*Math.PI/180,c=Math.cos(a),n=Math.sin(a);if(!s)throw Error('Object dimensions are unavailable.');return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{const x=u*s.L/2,y=v*s.W/2;return [o.x+x*c-y*n,o.y+x*n+y*c];});}
function overlap(a,b){const A=corners(a),B=corners(b);for(const p of [A,B])for(let i=0;i<2;i++){const q=p[i],r=p[i+1],axis=[-(r[1]-q[1]),r[0]-q[0]];const x=A.map(v=>v[0]*axis[0]+v[1]*axis[1]),y=B.map(v=>v[0]*axis[0]+v[1]*axis[1]);if(Math.max(...x)<=Math.min(...y)+1e-8||Math.max(...y)<=Math.min(...x)+1e-8)return false;}return true;}
function active(o,h){return o.start<=h&&h<o.end;}
function conflicts(objects,h){const out=[];for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++){const a=objects[i],b=objects[j],start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);if(start<end&&(h===undefined||active(a,h)&&active(b,h))&&overlap(a,b))out.push({a:a.uid,b:b.uid,start,end});}return out;}
g.LearnerSite={palette,validate,corners,overlap,active,conflicts};
})(typeof window!=='undefined'?window:globalThis);

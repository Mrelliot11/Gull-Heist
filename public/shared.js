// Gull Heist shared world + rules. Loaded by the browser (window.GH) and by the
// server (require). Everything here is deterministic from a match seed so the
// server can check what each client shows.
(function(root,factory){const m=factory();if(typeof module==='object'&&module.exports)module.exports=m;else root.GH=m;})(typeof self!=='undefined'?self:this,function(){
'use strict';

function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function h32(a,b,c){let x=Math.imul(a|0,0x9E3779B1)^Math.imul((b|0)+1,0x85EBCA77)^Math.imul((c|0)+7,0xC2B2AE3D);x^=x>>>15;x=Math.imul(x,0x2C1B3C6D);x^=x>>>12;x=Math.imul(x,0x297A2D39);x^=x>>>15;return x>>>0;}
const TAU=Math.PI*2;
const wrap=a=>((a+Math.PI)%TAU+TAU)%TAU-Math.PI;
const turnTo=(a,b,k)=>{const d=wrap(b-a);return a+Math.max(-k,Math.min(k,d));};
const lerpAng=(a,b,w)=>a+wrap(b-a)*w;

// ================= city (fixed layout, same for everyone) =================
const R=mulberry(20260922);
const P=500,SW=100,NS=6,W=(NS-1)*P+SW,RIM=18;
const nodeXY=i=>i*P+50;
const PARK=[3,1],PLAZA=[1,3];
const ROOF=['#d98e73','#8fa9b8','#c9b07a','#8a9a78','#b7a3c9','#e0c9a6','#9fb5a0','#c77f7f','#7f93a8','#d7b56d'];
const buildings=[],blocks=[];
for(let bi=0;bi<5;bi++)for(let bj=0;bj<5;bj++){
  const ox=bi*P+SW,oy=bj*P+SW;
  const kind=(bi===PARK[0]&&bj===PARK[1])?'park':(bi===PLAZA[0]&&bj===PLAZA[1])?'plaza':'city';
  blocks.push({x:ox,y:oy,kind});
  if(kind==='city')split(ox+RIM,oy+RIM,400-2*RIM,400-2*RIM,0);
}
function split(x,y,w,h,d){
  if(d>=2||(d>=1&&R()<0.35)||w<130||h<130){
    const b={x:x+4,y:y+4,w:w-8,h:h-8,c:ROOF[(R()*ROOF.length)|0],ht:1+((R()*3)|0),det:[]};
    const n=1+((R()*3)|0);
    for(let k=0;k<n;k++){const dw=14+R()*18,dh=10+R()*14;b.det.push({t:'ac',x:b.x+10+R()*(b.w-dw-20),y:b.y+10+R()*(b.h-dh-20),w:dw,h:dh});}
    if(R()<0.3&&b.w>70&&b.h>70)b.det.push({t:'tank',x:b.x+b.w*(0.25+R()*0.5),y:b.y+b.h*(0.25+R()*0.5),r:12+R()*6});
    if(R()<0.25&&b.w>90&&b.h>90)b.det.push({t:'garden',x:b.x+14,y:b.y+b.h-44,w:Math.min(60,b.w-28),h:30});
    buildings.push(b);return;
  }
  if(w>h||(w===h&&R()<0.5)){const s=w*(0.35+R()*0.3);split(x,y,s,h,d+1);split(x+s,y,w-s,h,d+1);}
  else{const s=h*(0.35+R()*0.3);split(x,y,w,s,d+1);split(x,y+s,w,h-s,d+1);}
}
const parkO={x:PARK[0]*P+SW,y:PARK[1]*P+SW}, plazaO={x:PLAZA[0]*P+SW,y:PLAZA[1]*P+SW};
const trees=[];
for(let k=0;k<22;k++){let x,y,ok=false,tries=0;
  while(!ok&&tries++<40){x=parkO.x+RIM+20+R()*(400-2*RIM-40);y=parkO.y+RIM+20+R()*(400-2*RIM-40);
    ok=Math.abs(x-(parkO.x+200))>38&&Math.abs(y-(parkO.y+200))>38&&trees.every(t=>Math.hypot(t.x-x,t.y-y)>34);}
  if(ok)trees.push({x,y,r:17+R()*9});}
const BLANKET_SPOTS=[[parkO.x+95,parkO.y+110],[parkO.x+300,parkO.y+105],[parkO.x+110,parkO.y+300],[parkO.x+290,parkO.y+295]];
const blankets=BLANKET_SPOTS.map(([x,y],i)=>({x,y,c:i%2?'#3d7dd8':'#e8483b'}));
const FX=plazaO.x+200,FY=plazaO.y+200;
const benches=[0,1,2,3].map(k=>{const a=k*TAU/4+TAU/8;return{x:FX+Math.cos(a)*112,y:FY+Math.sin(a)*112,a:a+Math.PI/2,ang:a};});
const CART_SPOTS=[[plazaO.x+80,plazaO.y+70,'hotdog','#e8483b'],[plazaO.x+320,plazaO.y+330,'icecream','#ff8fb1'],[parkO.x+200,parkO.y+48,'pretzel','#3d7dd8'],[2*P+SW+30,2*P+SW+30,'pizza','#46a36b']];

// ================= food =================
const FOODS={
  fries:{v:10,n:'Fries'},donut:{v:15,n:'Donuts'},pretzel:{v:15,n:'Pretzels'},hotdog:{v:20,n:'Hot dogs'},
  pizza:{v:20,n:'Pizza'},icecream:{v:25,n:'Ice cream'},sandwich:{v:30,n:'Sandwiches'}
};
const STREET_FOOD=['fries','fries','donut','pretzel','hotdog','pizza','icecream'];

// ================= people (deterministic from a match seed) =================
const SKIN=['#f1c7a3','#d9a47c','#b57a52','#8a5a3b','#5e3b27','#f5d6bd'];
const HAIR=['#2b1d14','#5a3a22','#c9a25a','#1a1a1a','#8c4a2f','#9aa0a6'];
const SHIRT=['#3d7dd8','#e86a5c','#46a36b','#f2b134','#8a5cc7','#2fb3b3','#e27bb1','#f7f7f7','#445066'];
const GSHIRT=['#5d6470','#6b5a4a','#4a5a4f'];
function neighbors(i,j){return[[i+1,j],[i-1,j],[i,j+1],[i,j-1]].filter(n=>n[0]>=0&&n[0]<NS&&n[1]>=0&&n[1]<NS);}
function pickNextR(to,from,r){const ns=neighbors(to[0],to[1]);const f=ns.filter(n=>!(from&&n[0]===from[0]&&n[1]===from[1]));const a=f.length?f:ns;return a[(r()*a.length)|0];}
const pickR=(arr,r)=>arr[(r()*arr.length)|0];
// crowd: extra walkers (Frenzy), added after everyone else so the usual cast keeps its indices
function buildEnts(seed,crowd){
  const r=mulberry(seed>>>0),ents=[];
  const walker=k=>{
    const rr=mulberry((seed^Math.imul(k+1,0x9E3779B1))>>>0);
    const s=[(rr()*NS)|0,(rr()*NS)|0];
    const grump=r()<0.25;
    ents.push({kind:'walk',rr,route:[s,pickNextR(s,null,rr)],phase:r()*P*0.999,speed:26+r()*20,off:(r()<.5?-1:1)*59,grump,
      startFood:r()<0.72,first:4+r()*10,skin:pickR(SKIN,r),hair:pickR(HAIR,r),shirt:grump?pickR(GSHIRT,r):pickR(SHIRT,r),
      x:0,y:0,face:NaN,walk:r()*6,angryT:0});
  };
  for(let k=0;k<46;k++)walker(k);
  BLANKET_SPOTS.forEach(([x,y])=>{
    [[x-9,y-4,'park1'],[x+10,y+5,'park2']].forEach(([sx,sy,menu])=>ents.push({kind:'sit',x:sx,y:sy,menu,grump:false,startFood:true,
      ph:r()*TAU,ph2:r()*TAU,w1:0.35+r()*0.35,w2:0.9+r()*0.6,skin:pickR(SKIN,r),hair:pickR(HAIR,r),shirt:pickR(SHIRT,r),face:0,walk:0,angryT:0}));
  });
  benches.forEach((bn,k)=>ents.push({kind:'sit',x:bn.x-Math.cos(bn.ang)*6,y:bn.y-Math.sin(bn.ang)*6,menu:'street',grump:k===1,startFood:true,
    ph:r()*TAU,ph2:r()*TAU,w1:0.35+r()*0.35,w2:0.9+r()*0.6,skin:pickR(SKIN,r),hair:pickR(HAIR,r),shirt:k===1?GSHIRT[0]:pickR(SHIRT,r),face:0,walk:0,angryT:0}));
  CART_SPOTS.forEach(([x,y,f,c])=>ents.push({kind:'cart',x,y,cfood:f,col:c,startFood:true,ph:r()*TAU,ph2:r()*TAU,w1:0.35+r()*0.25,w2:0.8+r()*0.5,
    skin:pickR(SKIN,r),hair:pickR(HAIR,r),face:0,angryT:0}));
  for(let k=0;k<(crowd|0);k++)walker(46+k);
  return ents;
}
// Walkers stay on the sidewalk; on the outer streets the sidewalk is always the city side.
function segOff(e,a,b){const dx=Math.sign(b[0]-a[0]),dy=Math.sign(b[1]-a[1]);let off=e.off;
  if(dy===0){const j=a[1];if(j===0&&dx*off<0)off=-off;if(j===NS-1&&dx*off>0)off=-off;}
  else{const i=a[0];if(i===0&&-dy*off<0)off=-off;if(i===NS-1&&-dy*off>0)off=-off;}
  return{dx,dy,ox:-dy*off,oy:dx*off};}
// position and facing of a walker at match time t (pure: the route only ever extends)
function walkerAt(e,t){
  const d=e.phase+e.speed*Math.max(0,t),k=Math.floor(d/P),f=d/P-k;
  while(e.route.length<k+3){const L=e.route.length;e.route.push(pickNextR(e.route[L-1],e.route[L-2],e.rr));}
  const a=e.route[k],b=e.route[k+1],v=segOff(e,a,b);let ox=v.ox,oy=v.oy,dir=Math.atan2(v.dy,v.dx);
  if(f<0.1&&k>0){const u=segOff(e,e.route[k-1],a),w=0.5+0.5*(f/0.1);ox=u.ox*(1-w)+v.ox*w;oy=u.oy*(1-w)+v.oy*w;dir=lerpAng(Math.atan2(u.dy,u.dx),dir,w);}
  else if(f>0.9){const u=segOff(e,b,e.route[k+2]),w=0.5+0.5*((1-f)/0.1);ox=u.ox*(1-w)+v.ox*w;oy=u.oy*(1-w)+v.oy*w;dir=lerpAng(Math.atan2(u.dy,u.dx),dir,w);}
  const ax=nodeXY(a[0]),ay=nodeXY(a[1]);
  return{x:ax+(nodeXY(b[0])-ax)*f+ox,y:ay+(nodeXY(b[1])-ay)*f+oy,dir};
}
function typeFor(seed,i,e,c){
  if(e.kind==='cart')return e.cfood;
  if(e.menu==='park1')return'sandwich';
  const h=h32(seed,i,c);
  if(e.menu==='park2')return['sandwich','icecream','pizza'][h%3];
  return STREET_FOOD[h%STREET_FOOD.length];
}
function valueFor(e,type){return e.kind==='cart'?50:FOODS[type].v*(e.grump?2:1);}
function restockFor(seed,i,e,c){const h=h32(seed,i,c+1000);return e.kind==='cart'?11:e.kind==='sit'?14+(h%800)/100:12+(h%1200)/100;}

// ================= rules for the people =================
// Every person has an awareness cone. Swooping into it gets you shooed (regular
// people) or swatted (grumps, cart vendors; costs a feather). A person who was
// just robbed or swooped at stays alert: wider cone, facing the nearest gull.
const ALERT_STEAL=4,ALERT_TRY=2;
const CONES={
  person:{half:0.6,range:60,kind:'shoo'}, personAlert:{half:1.0,range:75,kind:'shoo'},
  grump:{half:1.0,range:72,kind:'swat'},  grumpAlert:{half:1.35,range:90,kind:'swat'},
  cart:{half:0.95,range:135,kind:'swat'}, cartAlert:{half:1.25,range:160,kind:'swat'},
};
function coneOf(e,alert){const b=e.kind==='cart'?'cart':e.grump?'grump':'person';return CONES[alert?b+'Alert':b];}
function bodyAt(e,t){if(e.kind==='walk'){const p=walkerAt(e,t);return{x:p.x,y:p.y,dir:p.dir};}
  const target=e.ph+(e.kind==='cart'?2.3:1.7)*Math.sin(Math.max(0,t)*e.w1+e.ph2)+(e.kind==='cart'?0.7:0.6)*Math.sin(Math.max(0,t)*e.w2);
  return{x:e.x,y:e.y,dir:target};}
// where the person looks from (the vendor stands just below the cart)
function guardPos(e,b){return e.kind==='cart'?{x:b.x,y:b.y+20}:{x:b.x,y:b.y};}
function nearest(o,gulls){let best=null,bd=1e18;for(const g of gulls||[]){const d=(g.x-o.x)**2+(g.y-o.y)**2;if(d<bd){bd=d;best=g;}}return best;}
// facing at time t. alertUntil: match time until which this person is alert
function faceAt(e,t,alertUntil,gulls){const b=bodyAt(e,t);
  if(alertUntil>t){const o=guardPos(e,b),g=nearest(o,gulls);if(g&&(g.x!==o.x||g.y!==o.y))return Math.atan2(g.y-o.y,g.x-o.x);}
  return b.dir;}
// the food: in the hand for people, on top for carts
function foodPos(e,b,face){if(e.kind==='cart')return{x:b.x,y:b.y};
  return{x:b.x+Math.cos(face)*10-Math.sin(face)*9,y:b.y+Math.sin(face)*10+Math.cos(face)*9};}
function grabRadius(e){return e.kind==='cart'?30:22;}
function inCone(o,face,x,y,half,range){const dx=x-o.x,dy=y-o.y;if(dx*dx+dy*dy>range*range)return false;
  return Math.abs(wrap(Math.atan2(dy,dx)-face))<half;}
// distance from point p to segment a-b
function segDist(ax,ay,bx,by,px,py){const vx=bx-ax,vy=by-ay,l=vx*vx+vy*vy;let u=l?((px-ax)*vx+(py-ay)*vy)/l:0;u=Math.max(0,Math.min(1,u));
  return Math.hypot(ax+vx*u-px,ay+vy*u-py);}

// ================= matches =================
const DUR=90,COUNTDOWN=3,MAX_FEATHERS=3,GROUND_TIME=6,INV_TIME=2.2,COMBO_TIME=3.5,MAX_COMBO=5,STEAL_CD=0.55;
// Game modes. Classic is the game as it always was. crowd: extra walkers; restock: how much
// sooner food comes back; allFood: everyone starts with lunch; puEvery: seconds between
// power-ups; bonus: each steal adds time (Rush); gold: the Golden Chip is in play.
// solo / mp: where the mode can be picked.
const MODES={
  classic:{n:'Classic',dur:DUR,solo:1,mp:1},
  frenzy:{n:'Frenzy',dur:60,crowd:24,restock:0.5,allFood:1,puEvery:4,solo:1,mp:1},
  rush:{n:'Rush',dur:30,bonus:1,solo:1,mp:0},
  gold:{n:'Golden Chip',dur:120,gold:1,solo:0,mp:1},
};
const modeOf=M=>MODES[M&&M.mode]||MODES.classic;
// o: {mode, pu}. Without it a match is Classic with no power-ups, exactly as before modes existed.
function createMatch(id,seed,dur,o){o=o||{};
  const mode=MODES[o.mode]?o.mode:'classic',md=MODES[mode];
  const ents=buildEnts(seed,md.crowd);
  const M={id,seed,dur:dur||DUR,ents,cnt:ents.map(()=>0),fu:ents.map(e=>e.startFood||md.allFood?0:Math.round(e.first*10)/10),al:ents.map(()=>0),sc:{}};
  M.mode=mode;M.dz=ents.map(()=>0);M.pus=o.pu?puSchedule(seed,mode):[];M.pg=M.pus.map(()=>0);
  if(md.gold)M.gold={by:null,x:GOLD_HOME.x,y:GOLD_HOME.y,at:0,safe:0,free:0};
  return M;
}
// fx: match time until which each timed power-up lasts; shield: one swat blocked
function newPlayer(id){return{id,feathers:MAX_FEATHERS,invUntil:0,groundUntil:0,comboN:0,comboUntil:0,lastTry:-1e9,fx:{wind:0,cloak:0,beak:0,dbl:0},shield:0};}
const fxOn=(pl,k,t)=>!!(pl&&pl.fx&&pl.fx[k]>t);
function hasFoodAt(M,i,t){return t>=0&&M.fu[i]<=t;}
// which food a gull at (x,y) would snatch: the closest available one in reach.
// px,py: where the gull was a moment ago, so fast swoops can't pass through a target.
function findTarget(M,t,x,y,px,py,gulls,slack){
  let bi=-1,bd=1e9;
  M.ents.forEach((e,i)=>{if(!hasFoodAt(M,i,t))return;const b=bodyAt(e,t);if(Math.abs(b.x-x)>200||Math.abs(b.y-y)>200)return;
    const fp=foodPos(e,b,faceAt(e,t,M.al[i],gulls));const d=segDist(px,py,x,y,fp.x,fp.y);
    if(d<grabRadius(e)+(slack||0)&&d<bd){bd=d;bi=i;}});
  return bi<0?null:{i:bi,d:bd};
}
// judge a steal attempt on food i by a gull at (x,y) at time t, without changing anything.
// margin shrinks the danger cones (the server gives players the benefit of the doubt).
function judgeSteal(M,pl,i,x,y,t,gulls,o){o=o||{};
  const e=M.ents[i];if(!e)return{k:'bad'};
  if(t<0||t>M.dur)return{k:'bad'};
  if(pl.groundUntil>t)return{k:'bad'};
  if(!hasFoodAt(M,i,t))return{k:'gone'};
  const b=bodyAt(e,t),face=faceAt(e,t,M.al[i],gulls),fp=foodPos(e,b,face);
  if(Math.hypot(fp.x-x,fp.y-y)>grabRadius(e)+(o.slack||0)+reach(pl,t))return{k:'far'};
  const c=coneOf(e,M.al[i]>t);
  // a screeched (dazed) person sees nothing; camouflage fools regular people, not grumps or vendors
  const blind=(M.dz&&M.dz[i]>t)||(c.kind==='shoo'&&fxOn(pl,'cloak',t));
  if(!blind&&inCone(guardPos(e,b),face,x,y,c.half-(o.margin||0),c.range-(o.margin?8:0)))
    return{k:c.kind==='swat'&&pl.invUntil<=t?(pl.shield?'block':'swat'):'shoo'};
  const type=typeFor(M.seed,i,e,M.cnt[i]);const combo=pl.comboUntil>t?Math.min(MAX_COMBO,pl.comboN+1):1;
  return{k:'steal',type,combo,pts:valueFor(e,type)*combo*(fxOn(pl,'dbl',t)?2:1),cart:e.kind==='cart'};
}
// judge and apply. Returns the outcome with the new state the client needs.
function attemptSteal(M,pl,i,x,y,t,gulls,o){
  const r=judgeSteal(M,pl,i,x,y,t,gulls,o);
  if(r.k==='bad'||r.k==='far'||r.k==='gone')return r;
  pl.lastTry=t;
  const md=modeOf(M);
  if(r.k==='steal'){M.cnt[i]++;M.fu[i]=Math.round((t+restockFor(M.seed,i,M.ents[i],M.cnt[i])*(md.restock||1))*10)/10;M.al[i]=t+ALERT_STEAL;
    pl.comboN=r.combo;pl.comboUntil=t+COMBO_TIME;M.sc[pl.id]=(M.sc[pl.id]||0)+r.pts;
    if(md.bonus){r.bonus=rushBonus(r);M.dur+=r.bonus;}}
  else{M.al[i]=Math.max(M.al[i],t+ALERT_TRY);
    if(r.k==='block'){pl.shield=0;pl.invUntil=t+INV_TIME;}
    if(r.k==='swat'){pl.feathers=Math.max(0,pl.feathers-1);pl.invUntil=t+INV_TIME;pl.comboN=0;pl.comboUntil=0;
      if(pl.feathers<=0){pl.groundUntil=t+GROUND_TIME;}}}
  r.feathers=pl.feathers;r.ground=pl.groundUntil>t?pl.groundUntil-t:0;r.cnt=M.cnt[i];r.fu=M.fu[i];r.al=M.al[i];
  return r;
}
// Rush: seconds a steal adds to the clock
function rushBonus(r){return(r.cart?4:2)+(r.combo>=3?1:0);}

// ================= power-ups =================
// Power-ups hover over the streets on a timetable fixed by the match seed, so the page and the
// server agree on where and when without sending it. The first gull to fly through one gets it.
// dur: seconds it lasts (0: shield waits for a swat, screech happens at once); w: how common.
const PU={
  wind:{n:'Tailwind',dur:6,w:3},   cloak:{n:'Camouflage',dur:6,w:2}, beak:{n:'Big beak',dur:8,w:3},
  shield:{n:'Shield feather',dur:0,w:2}, dbl:{n:'Double loot',dur:8,w:2}, screech:{n:'Screech',dur:0,w:2},
};
const PU_KEYS=Object.keys(PU),PU_W=PU_KEYS.reduce((s,k)=>s+PU[k].w,0);
const PU_FIRST=4,PU_EVERY=8,PU_LIFE=13,PU_R=26,WIND=1.5,BEAK=12,SCREECH_R=150,SCREECH_TIME=3.5;
function puSchedule(seed,mode){
  const md=MODES[mode]||MODES.classic,every=md.puEvery||PU_EVERY,end=md.bonus?300:md.dur,out=[];
  for(let k=0,t=PU_FIRST;t<end-2;k++,t+=every){
    let w=h32(seed,k,11)%PU_W,type=PU_KEYS[0];
    for(const key of PU_KEYS){if(w<PU[key].w){type=key;break;}w-=PU[key].w;}
    // somewhere along a street, away from the city's edge
    const g=h32(seed,k,12),line=nodeXY((g>>>1)%NS),along=Math.round(90+((g>>>8)%1000)/1000*(W-180));
    out.push({type,x:g&1?along:line,y:g&1?line:along,t0:t,t1:t+PU_LIFE});
  }
  return out;
}
// tailwind: how much faster than usual the gull may fly (the server's speed check uses it)
function speedMult(pl,t){return fxOn(pl,'wind',t)?WIND:1;}
// big beak: extra grab reach
function reach(pl,t){return fxOn(pl,'beak',t)?BEAK:0;}
// judge taking power-up k by a gull at (x,y) at time t, without changing anything
function judgePickup(M,pl,k,x,y,t,o){o=o||{};
  const s=M.pus&&M.pus[k];
  if(!s||t<0||t>M.dur||pl.groundUntil>t)return{k:'bad'};
  if(M.pg[k]||t<s.t0||t>s.t1+(o.grace||0))return{k:'gone'};
  if(Math.hypot(s.x-x,s.y-y)>PU_R+(o.slack||0))return{k:'far'};
  return{k:'pu',type:s.type};
}
// apply a pickup (clients mirror the server's with pl = null for someone else's)
function applyPickup(M,pl,k,x,y,t){
  const s=M.pus[k];M.pg[k]=1;
  if(pl){if(s.type==='shield')pl.shield=1;else if(PU[s.type].dur)pl.fx[s.type]=t+PU[s.type].dur;}
  return s.type==='screech'?screech(M,x,y,t):null;
}
function attemptPickup(M,pl,k,x,y,t,o){const r=judgePickup(M,pl,k,x,y,t,o);if(r.k==='pu')r.dazed=applyPickup(M,pl,k,x,y,t);return r;}
// everyone near (x,y) is stunned for a moment: they see nothing
function screech(M,x,y,t){const out=[];
  M.ents.forEach((e,i)=>{const o=guardPos(e,bodyAt(e,t));if(Math.hypot(o.x-x,o.y-y)<SCREECH_R){M.dz[i]=Math.round((t+SCREECH_TIME)*1000)/1000;out.push(i);}});
  return out;}

// ================= the Golden Chip =================
// One golden fry. Whoever carries it scores GOLD_PTS a second but flies a little slower.
// Swoop onto the carrier to snatch it; a swat or a grounding drops it where it happened.
const GOLD_R=28,GOLD_MUG=34,GOLD_PTS=5,GOLD_SAFE=1.5,GOLD_SLOW=0.88,GOLD_HOME={x:FX,y:FY-72};
// a gull at (x,y) goes for the chip: pick it up when it's loose, or snatch it from the carrier at (hx,hy)
function goldGrab(M,pl,x,y,t,hx,hy,o){o=o||{};const G=M.gold;
  if(!G||t<0||t>M.dur||pl.groundUntil>t||G.by===pl.id)return{k:'bad'};
  if(!G.by){if(t<G.free)return{k:'bad'};if(Math.hypot(G.x-x,G.y-y)>GOLD_R+(o.slack||0))return{k:'far'};
    G.by=pl.id;G.at=t;G.safe=t+GOLD_SAFE;return{k:'pick'};}
  if(t<G.safe)return{k:'safe'};
  if(Math.hypot(hx-x,hy-y)>GOLD_MUG+(o.slack||0))return{k:'far'};
  const from=G.by;G.by=pl.id;G.at=t;G.safe=t+GOLD_SAFE;return{k:'mug',from};
}
function goldDrop(M,x,y,t){const G=M.gold;if(!G||!G.by)return false;
  G.by=null;G.x=Math.max(20,Math.min(W-20,x));G.y=Math.max(20,Math.min(W-20,y));G.free=t+0.8;return true;}
// call regularly: pays the carrier for every whole second held. Returns the points paid.
function goldTick(M,t){const G=M.gold;if(!G||!G.by)return 0;let n=0;
  while(t-G.at>=1){G.at+=1;n+=GOLD_PTS;}
  if(n)M.sc[G.by]=(M.sc[G.by]||0)+n;return n;}

// call regularly: gives feathers back after being grounded
function tickPlayer(pl,t){if(pl.groundUntil&&t>=pl.groundUntil){pl.groundUntil=0;pl.feathers=MAX_FEATHERS;pl.invUntil=t+2;return true;}return false;}
// spread-out spawn points around the middle of the city
function spawnPoint(seed,slot){const a=(h32(seed,slot,3)%6283)/1000+slot*2.39996,r=140+(slot%4)*70;
  return{x:Math.round(W/2+Math.cos(a)*r),y:Math.round(W/2+Math.sin(a)*r)};}

const COLS=['#ff9f1c','#3d7dd8','#e8483b','#46a36b','#8a5cc7','#ff8fb1','#2fb3b3','#ffd23f'];
// a gull's look besides its collar: plumage (p), hat (h) and eyewear (e), each an index into
// the page's wardrobe. Only the counts live here so the server can check them.
const LOOK_N={p:8,h:9,e:5};
function cleanLook(v){const o={p:0,h:0,e:0};if(!v||typeof v!=='object'||Array.isArray(v))return o;
  for(const k in LOOK_N){const n=v[k];if(Number.isInteger(n)&&n>=0&&n<LOOK_N[k])o[k]=n;}return o;}
function cleanNick(s){return typeof s!=='string'?'Gull':(s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,'').trim().slice(0,14)||'Gull');}
function cleanRoom(s){return typeof s!=='string'?'':s.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,24);}

return{mulberry,h32,TAU,wrap,turnTo,lerpAng,
  P,SW,NS,W,RIM,nodeXY,buildings,blocks,trees,blankets,benches,FX,FY,parkO,plazaO,CART_SPOTS,
  FOODS,STREET_FOOD,buildEnts,walkerAt,typeFor,valueFor,restockFor,
  CONES,coneOf,bodyAt,guardPos,faceAt,foodPos,grabRadius,inCone,segDist,
  DUR,COUNTDOWN,MAX_FEATHERS,GROUND_TIME,INV_TIME,COMBO_TIME,STEAL_CD,ALERT_STEAL,
  createMatch,newPlayer,hasFoodAt,findTarget,judgeSteal,attemptSteal,tickPlayer,spawnPoint,COLS,LOOK_N,cleanLook,cleanNick,cleanRoom,
  MODES,modeOf,rushBonus,fxOn,PU,PU_KEYS,PU_R,PU_LIFE,WIND,BEAK,SCREECH_R,SCREECH_TIME,puSchedule,speedMult,reach,judgePickup,applyPickup,attemptPickup,screech,
  GOLD_R,GOLD_MUG,GOLD_PTS,GOLD_SAFE,GOLD_SLOW,GOLD_HOME,goldGrab,goldDrop,goldTick};
});

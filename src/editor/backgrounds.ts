// @ts-nocheck — code de dessin repris tel quel de l'ancien Studio Zing (fonds générés par code).
/*
 * Bibliothèque de fonds : chaque fond est une fonction draw(ctx, W, H), avec un générateur
 * pseudo-aléatoire à graine fixe : la vignette et le rendu pleine résolution sont identiques.
 */

const BG_CATS=[{id:'uni',name:'Unis chics'},{id:'degrade',name:'Dégradés'},
               {id:'boheme',name:'Bohème & Mariage'},{id:'peps',name:'Peps & Fête'},
               {id:'texture',name:'Textures'}];
const BGS=[];
function addBg(id,name,cat,draw){BGS.push({id,name,cat,draw});}

/* PRNG déterministe : la vignette et le rendu final sont identiques */
function rng(seed){let a=seed;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function fill(ctx,W,H,c){ctx.fillStyle=c;ctx.fillRect(0,0,W,H);}
function linGrad(ctx,W,H,stops,dir){
  const g=dir==='h'?ctx.createLinearGradient(0,0,W,0):dir==='d'?ctx.createLinearGradient(0,0,W,H):ctx.createLinearGradient(0,0,0,H);
  stops.forEach(st=>g.addColorStop(st[0],st[1]));ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}
function radGrad(ctx,W,H,stops,cx,cy){
  const g=ctx.createRadialGradient(W*(cx??.5),H*(cy??.42),0,W*(cx??.5),H*(cy??.42),Math.max(W,H)*.9);
  stops.forEach(st=>g.addColorStop(st[0],st[1]));ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}

/* ── Unis chics (15) ── */
[['blanc-casse','Blanc cassé','#FDFCF9'],['ivoire','Ivoire','#F7F2E7'],['champagne','Champagne','#F0E3CC'],
 ['sable','Sable','#E8DCC8'],['lin','Lin','#EDE7DC'],['sauge','Sauge pâle','#DCE5DA'],
 ['eucalyptus','Eucalyptus','#B9CBB8'],['terracotta','Terracotta','#C9805F'],['blush','Blush','#F3DEDA'],
 ['rose-poudre','Rose poudré','#E3BDB8'],['bleu-nuit','Bleu nuit','#16283C'],['anthracite','Anthracite','#2B2B2E'],
 ['bordeaux','Bordeaux','#5E1F2B'],['noir-elegant','Noir élégant','#111113'],['vert-foret','Vert forêt','#22402F'],
].forEach(([id,name,c])=>addBg(id,name,'uni',(ctx,W,H)=>fill(ctx,W,H,c)));

/* ── Dégradés (14) ── */
[['d-or-champagne','Or & champagne',[[0,'#FBF3E2'],[1,'#D4B166']],'v'],
 ['d-champagne-dore','Champagne doré',[[0,'#F7E9CE'],[.55,'#E4C98F'],[1,'#C8A250']],'d'],
 ['d-sauge','Sauge douce',[[0,'#F2F5F0'],[1,'#A8BFA5']],'v'],
 ['d-eucalyptus','Eucalyptus',[[0,'#DCE7DB'],[1,'#7D9A7C']],'d'],
 ['d-terracotta','Terracotta',[[0,'#F6E2D6'],[1,'#B96A47']],'v'],
 ['d-blush','Blush poudré',[[0,'#FDF0EE'],[1,'#E0B2AC']],'v'],
 ['d-bleu-nuit','Bleu nuit',[[0,'#2C4A66'],[1,'#0D1B2A']],'v'],
 ['d-crepuscule','Crépuscule',[[0,'#E9B7A6'],[.5,'#C98E8E'],[1,'#5C4A63']],'v'],
 ['d-or-rose','Or rose',[[0,'#F7DCD2'],[1,'#C98F7A']],'d'],
 ['d-vert-profond','Vert profond',[[0,'#4A6B52'],[1,'#1E2E24']],'v'],
 ['d-lavande','Lavande',[[0,'#F1ECF6'],[1,'#B3A2C7']],'v'],
 ['d-sable-chaud','Sable chaud',[[0,'#F7EEE0'],[1,'#D3B48C']],'v'],
 ['d-nuit-or','Nuit & or',[[0,'#101E2C'],[.75,'#22384C'],[1,'#8C7233']],'v'],
 ['d-perle','Perle',[[0,'#FFFFFF'],[1,'#DFDCD5']],'d'],
 ['d-sunset','Sunset',[[0,'#F9D8A7'],[.45,'#EE9B6E'],[1,'#B5527A']],'v'],
].forEach(([id,name,stops,dir])=>addBg(id,name,'degrade',(ctx,W,H)=>linGrad(ctx,W,H,stops,dir)));

/* ── Textures (12) ── */
function marbre(ctx,W,H,base,vein,seed,n){
  fill(ctx,W,H,base);const r=rng(seed);ctx.lineCap='round';
  for(let i=0;i<n;i++){
    let x=r()*W,y=-H*.05;ctx.beginPath();ctx.moveTo(x,y);
    for(let k=0;k<6;k++){const nx=x+(r()-.5)*W*.55,ny=y+H/6;ctx.quadraticCurveTo(x+(r()-.5)*W*.25,(y+ny)/2,nx,ny);x=nx;y=ny;}
    ctx.strokeStyle=vein;ctx.globalAlpha=.08+r()*.18;ctx.lineWidth=Math.max(1,W*(.0008+r()*.0038));ctx.stroke();
  }
  ctx.globalAlpha=1;
}
function toile(ctx,W,H,base,line,stepR,a){
  fill(ctx,W,H,base);ctx.strokeStyle=line;ctx.globalAlpha=a;ctx.lineWidth=Math.max(.5,W*.0012);
  const st=W*stepR;
  for(let x=0;x<W;x+=st){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=st){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.globalAlpha=1;
}
function grain(ctx,W,H,base,seed,a,col){
  fill(ctx,W,H,base);const r=rng(seed),n=Math.round(W*H/700),s2=Math.max(1,W*.0022);
  ctx.fillStyle=col||'#000';
  for(let i=0;i<n;i++){ctx.globalAlpha=r()*a;ctx.fillRect(r()*W,r()*H,s2,s2);}
  ctx.globalAlpha=1;
}
function aquarelle(ctx,W,H,base,cols,seed){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let i=0;i<10;i++){
    const cx=r()*W,cy=r()*H,rad=Math.max(W,H)*(.13+r()*.24);
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,rad);
    const c=cols[Math.floor(r()*cols.length)];
    g.addColorStop(0,c+'4D');g.addColorStop(1,c+'00');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }
}
addBg('t-marbre-blanc','Marbre blanc','texture',(c,W,H)=>marbre(c,W,H,'#F8F6F2','#9A9384',7,14));
addBg('t-marbre-or','Marbre or','texture',(c,W,H)=>marbre(c,W,H,'#FAF4E8','#C2A35B',11,13));
addBg('t-marbre-noir','Marbre noir','texture',(c,W,H)=>marbre(c,W,H,'#1E1E22','#C9A84C',23,12));
addBg('t-lin-naturel','Lin naturel','texture',(c,W,H)=>toile(c,W,H,'#EFE9DC','#C9BCA3',.011,.45));
addBg('t-lin-gris','Lin gris','texture',(c,W,H)=>toile(c,W,H,'#E7E7E4','#B6B6B0',.011,.45));
addBg('t-jute','Toile de jute','texture',(c,W,H)=>toile(c,W,H,'#E0CFAE','#B39B70',.007,.55));
addBg('t-kraft','Papier kraft','texture',(c,W,H)=>grain(c,W,H,'#DEC9A6',7,.16,'#7A5C2E'));
addBg('t-papier','Papier grainé','texture',(c,W,H)=>grain(c,W,H,'#F7F3EA',13,.10));
addBg('t-aqua-sauge','Aquarelle sauge','boheme',(c,W,H)=>aquarelle(c,W,H,'#F4F7F2',['#8FAE8B','#B9CBB8','#6E8C6C'],5));
addBg('t-aqua-blush','Aquarelle blush','boheme',(c,W,H)=>aquarelle(c,W,H,'#FDF6F4',['#E3AEA6','#F0CFC9','#C98F86'],9));

/* ── Bois (2 textures) ── */
function bois(ctx,W,H,base,veine,seed){
  fill(ctx,W,H,base);const r=rng(seed);ctx.lineCap='round';
  for(let i=0;i<26;i++){
    const y=r()*H;ctx.beginPath();ctx.moveTo(-W*.05,y);
    for(let x=0;x<=W*1.05;x+=W*.08)ctx.lineTo(x,y+Math.sin(x/W*6+i)*H*.012);
    ctx.strokeStyle=veine;ctx.globalAlpha=.10+r()*.20;
    ctx.lineWidth=Math.max(1,W*(.0015+r()*.005));ctx.stroke();
  }
  for(let i=0;i<5;i++){                       /* nœuds du bois */
    const x=r()*W,y=r()*H;
    for(let k=1;k<=4;k++){
      ctx.beginPath();ctx.ellipse(x,y,W*.012*k,W*.02*k,r(),0,Math.PI*2);
      ctx.strokeStyle=veine;ctx.globalAlpha=.10;ctx.lineWidth=Math.max(1,W*.002);ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
}
addBg('t-bois-clair','Bois clair','texture',(c,W,H)=>bois(c,W,H,'#E8D5B7','#B08D5E',5));
addBg('t-bois-fonce','Bois foncé','texture',(c,W,H)=>bois(c,W,H,'#5B3A25','#2E1B10',9));

/* ── Bois et guirlandes lumineuses (6) ──
   Planches verticales, puis lumières : bokeh flou pour la profondeur,
   ampoules suspendues pour la guinguette. */
function planches(ctx,W,H,base,veine,joint,seed,n){
  fill(ctx,W,H,base);const r=rng(seed);const lw=W/n;
  for(let i=0;i<n;i++){
    const x=i*lw;
    /* Chaque planche a sa nuance */
    ctx.fillStyle=veine;ctx.globalAlpha=.05+r()*.10;
    ctx.fillRect(x,0,lw,H);
    ctx.globalAlpha=1;
    for(let k=0;k<9;k++){
      const y=r()*H;
      ctx.beginPath();ctx.moveTo(x,y);
      for(let xx=x;xx<=x+lw;xx+=lw/5)ctx.lineTo(xx,y+Math.sin(xx/lw*5+k)*H*.008);
      ctx.strokeStyle=veine;ctx.globalAlpha=.10+r()*.16;
      ctx.lineWidth=Math.max(1,W*.0016);ctx.stroke();
    }
    ctx.globalAlpha=.32;ctx.strokeStyle=joint;ctx.lineWidth=Math.max(1,W*.0028);
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();
  }
  ctx.globalAlpha=1;
}
/** Halo lumineux flou : le dégradé radial remplace un flou coûteux. */
function halo(ctx,x,y,R,col,a){
  const g=ctx.createRadialGradient(x,y,0,x,y,R);
  g.addColorStop(0,col);g.addColorStop(.35,col);g.addColorStop(1,'rgba(255,214,140,0)');
  ctx.globalAlpha=a;ctx.fillStyle=g;
  ctx.beginPath();ctx.arc(x,y,R,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
}
function bokeh(ctx,W,H,seed,n,col){
  const r=rng(seed);
  for(let i=0;i<n;i++)halo(ctx,r()*W,r()*H,W*(.020+r()*.075),col,.14+r()*.34);
}
/** Guirlande d'ampoules suspendues à un câble. */
function ampoules(ctx,W,H,seed,rangs,col){
  const r=rng(seed);
  for(let g=0;g<rangs;g++){
    const y0=H*(.05+g*.12), creux=H*.055;
    ctx.strokeStyle='rgba(30,20,12,.55)';ctx.lineWidth=Math.max(1,W*.0022);
    ctx.beginPath();ctx.moveTo(0,y0);ctx.quadraticCurveTo(W/2,y0+creux*2,W,y0);ctx.stroke();
    const n=Math.max(6,Math.round(W/(W*.085)));
    for(let k=0;k<=n;k++){
      const t=k/n, x=t*W, y=y0+2*t*(1-t)*creux*2;
      ctx.strokeStyle='rgba(30,20,12,.5)';ctx.lineWidth=Math.max(1,W*.0016);
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+W*.022);ctx.stroke();
      halo(ctx,x,y+W*.032,W*.045,col,.55+r()*.3);
      ctx.fillStyle='#FFF3CE';ctx.globalAlpha=.95;
      ctx.beginPath();ctx.ellipse(x,y+W*.032,W*.010,W*.013,0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
    }
  }
}
/** Fines lumières façon fairy lights, en fils qui retombent. */
function fairyLights(ctx,W,H,seed,fils,col){
  const r=rng(seed);
  for(let f=0;f<fils;f++){
    const x0=(f+.5)*(W/fils)+(r()-.5)*W*.05;
    ctx.strokeStyle='rgba(255,235,180,.20)';ctx.lineWidth=Math.max(1,W*.0012);
    ctx.beginPath();ctx.moveTo(x0,0);
    for(let y=0;y<=H;y+=H*.1)ctx.lineTo(x0+Math.sin(y/H*7+f)*W*.02,y);
    ctx.stroke();
    for(let k=0;k<16;k++){
      const y=(k/16)*H+r()*H*.03;
      const x=x0+Math.sin(y/H*7+f)*W*.02;
      halo(ctx,x,y,W*(.012+r()*.022),col,.35+r()*.45);
      ctx.fillStyle='#FFF6DA';ctx.globalAlpha=.9;
      ctx.beginPath();ctx.arc(x,y,W*.0035,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    }
  }
}
const LUM='rgba(255,206,130,.85)';
addBg('t-bois-bokeh','Bois foncé & bokeh doré','texture',(c,W,H)=>{
  planches(c,W,H,'#3A2618','#1C1109','#170D06',3,7);bokeh(c,W,H,5,26,LUM);});
addBg('t-bois-clair-ampoules','Bois clair & ampoules','texture',(c,W,H)=>{
  planches(c,W,H,'#DFC7A2','#B08D5E','#A67F4F',7,8);ampoules(c,W,H,11,2,LUM);});
addBg('t-bois-rustique','Bois rustique & lumières chaudes','texture',(c,W,H)=>{
  planches(c,W,H,'#6B4A30','#3A2416','#2A190E',13,6);bokeh(c,W,H,17,18,'rgba(255,190,110,.9)');
  ampoules(c,W,H,19,1,LUM);});
addBg('t-palettes-fairy','Mur de palettes & fairy lights','texture',(c,W,H)=>{
  planches(c,W,H,'#8A6A4A','#4E3520','#3A2616',23,9);fairyLights(c,W,H,29,6,LUM);});
addBg('t-bois-nuit-guirlande','Bois nuit & guirlande','texture',(c,W,H)=>{
  planches(c,W,H,'#241A12','#0F0A06','#0A0604',31,7);ampoules(c,W,H,37,3,LUM);
  bokeh(c,W,H,41,14,'rgba(255,214,150,.8)');});
addBg('t-bois-blanchi','Bois blanchi & lumières','texture',(c,W,H)=>{
  planches(c,W,H,'#EDE2D2','#C4AE92','#B39C7E',43,8);bokeh(c,W,H,47,20,'rgba(255,200,120,.75)');});

/* ── Motifs de base, réutilisés par Bohème et Peps ── */
function confettis(ctx,W,H,base,cols,seed,n){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let i=0;i<n;i++){
    ctx.save();ctx.translate(r()*W,r()*H);ctx.rotate(r()*Math.PI);
    ctx.fillStyle=cols[Math.floor(r()*cols.length)];ctx.globalAlpha=.5+r()*.5;
    ctx.fillRect(-W*.004,-W*.011,W*.008,W*.022);ctx.restore();
  }
  ctx.globalAlpha=1;
}
function etincelle(ctx,x,y,s2,col,a){
  ctx.save();ctx.translate(x,y);ctx.fillStyle=col;ctx.globalAlpha=a;ctx.beginPath();
  ctx.moveTo(0,-s2);ctx.quadraticCurveTo(0,0,s2,0);ctx.quadraticCurveTo(0,0,0,s2);
  ctx.quadraticCurveTo(0,0,-s2,0);ctx.quadraticCurveTo(0,0,0,-s2);ctx.fill();ctx.restore();
}
function etoiles(ctx,W,H,base,col,seed,n){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let i=0;i<n;i++)etincelle(ctx,r()*W,r()*H,W*(.005+r()*.015),col,.3+r()*.55);
  ctx.globalAlpha=1;
}
function feuille(ctx,x,y,len,ang,col,a){
  ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.globalAlpha=a;ctx.fillStyle=col;
  ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(len*.4,-len*.3,len,0);
  ctx.quadraticCurveTo(len*.4,len*.3,0,0);ctx.fill();ctx.restore();
}
function feuillage(ctx,W,H,base,col,seed,n){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let i=0;i<n;i++)feuille(ctx,r()*W,r()*H,W*(.028+r()*.05),r()*Math.PI*2,col,.22+r()*.35);
  ctx.globalAlpha=1;
}
function brins(ctx,W,H,base,col,seed,n){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let i=0;i<n;i++){
    const x=r()*W,y=r()*H,ang=r()*Math.PI*2,L=W*(.11+r()*.09);
    ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.globalAlpha=.3+r()*.3;
    ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,W*.0022);
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(L,0);ctx.stroke();
    for(let k=1;k<=5;k++){const px=L*k/6;feuille(ctx,px,0,L*.24,-.7,col,.5);feuille(ctx,px,0,L*.24,.7,col,.5);}
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
addBg('m-feuillage','Feuillage minimaliste','boheme',(c,W,H)=>feuillage(c,W,H,'#F3F6F1','#7E9A7C',3,46));
addBg('m-eucalyptus','Eucalyptus dispersé','boheme',(c,W,H)=>brins(c,W,H,'#F5F7F3','#6E8C6C',11,13));
addBg('m-confettis-or','Confettis dorés','peps',(c,W,H)=>confettis(c,W,H,'#FCF8F0',['#D4AF37','#E8CE8A','#C9A84C'],17,80));
addBg('m-confettis-pastel','Confettis pastel','peps',(c,W,H)=>confettis(c,W,H,'#FFFDFB',['#E9B7A6','#A8BFA5','#B3A2C7','#E8CE8A'],23,80));
addBg('m-etoiles','Étoiles fines','peps',(c,W,H)=>etoiles(c,W,H,'#14243A','#F0DFA8',29,70));
/* ══ BOHÈME & MARIAGE ══
   Feuillages, arches et couronnes dessinés au trait — un rendu proche de
   l'aquarelle vectorielle, sans aucune image externe. */

/** Bouquet de feuilles autour d'un point, orienté. */
function bouquet(ctx,x,y,R,ang,col,n){
  for(let i=0;i<n;i++){
    const a=ang+(i/n-.5)*2.1, L=R*(.55+((i*37)%10)/16);
    feuille(ctx,x,y,L,a,col,.30+((i*53)%10)/26);
  }
}
/** Fleur stylisée à pétales arrondis. */
function fleur(ctx,x,y,R,col,coeurCol,a){
  ctx.save();ctx.translate(x,y);ctx.globalAlpha=a;
  for(let i=0;i<6;i++){
    ctx.rotate(Math.PI/3);ctx.fillStyle=col;
    ctx.beginPath();ctx.ellipse(0,-R*.62,R*.34,R*.62,0,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle=coeurCol;ctx.beginPath();ctx.arc(0,0,R*.26,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
/** Feuillage dans les quatre coins. */
function cadreVegetal(ctx,W,H,base,col,dens){
  fill(ctx,W,H,base);const R=Math.min(W,H)*.30;
  bouquet(ctx,0,0,R,.8,col,dens);
  bouquet(ctx,W,0,R,Math.PI-.8,col,dens);
  bouquet(ctx,0,H,R,-.8,col,dens);
  bouquet(ctx,W,H,R,Math.PI+.8,col,dens);
  ctx.globalAlpha=1;
}
/** Arche de fleurs et feuilles en haut de page. */
function archeFlorale(ctx,W,H,base,vert,f1,f2){
  fill(ctx,W,H,base);
  const cx=W/2, ry=H*.30, rx=W*.44;
  for(let t=0;t<=1.001;t+=1/54){
    const a=Math.PI*(1+t), x=cx+Math.cos(a)*rx, y=H*.34+Math.sin(a)*ry;
    feuille(ctx,x,y,W*.055,a+Math.PI/2,vert,.35);
    if(t*54%4<1)fleur(ctx,x,y,W*.028,t*54%8<4?f1:f2,'#F3E2B8',.85);
  }
  ctx.globalAlpha=1;
}
/** Couronne végétale centrée. */
function couronne(ctx,W,H,base,vert,fl){
  fill(ctx,W,H,base);
  const cx=W/2,cy=H*.44,R=Math.min(W,H)*.30;
  for(let i=0;i<40;i++){
    const a=(i/40)*Math.PI*2;
    feuille(ctx,cx+Math.cos(a)*R,cy+Math.sin(a)*R,W*.05,a+Math.PI/2,vert,.34);
  }
  if(fl)for(let i=0;i<7;i++){
    const a=(i/7)*Math.PI*2+.3;
    fleur(ctx,cx+Math.cos(a)*R,cy+Math.sin(a)*R,W*.025,fl,'#F0DFA8',.8);
  }
  ctx.globalAlpha=1;
}
/** Plumes de pampa en bas de page. */
function pampas(ctx,W,H,base,col,seed){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let i=0;i<16;i++){
    const x=(i%2?1:0)*W+(r()-.5)*W*.42, y=H*(1.02-r()*.10);
    const L=H*(.30+r()*.26), a=(i%2?-1:1)*(1.25+r()*.35);
    ctx.save();ctx.translate(x,y);ctx.rotate(a-Math.PI/2);
    ctx.strokeStyle=col;ctx.globalAlpha=.30;ctx.lineWidth=Math.max(1,W*.002);
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-L);ctx.stroke();
    for(let k=0;k<22;k++){
      const t=k/22, yy=-L*(.35+t*.65), ll=L*.13*(1-t*.4);
      feuille(ctx,0,yy,ll,-1.05,col,.20+r()*.20);
      feuille(ctx,0,yy,ll,-Math.PI+1.05,col,.20+r()*.20);
    }
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
/** Cadre floral rectangulaire. */
function cadreFloral(ctx,W,H,base,vert,fl){
  fill(ctx,W,H,base);
  const m=Math.min(W,H)*.075;
  const pts=[];
  for(let t=0;t<=1.001;t+=1/22){pts.push([m+(W-2*m)*t,m],[m+(W-2*m)*t,H-m]);}
  for(let t=0;t<=1.001;t+=1/30){pts.push([m,m+(H-2*m)*t],[W-m,m+(H-2*m)*t]);}
  pts.forEach(([x,y],i)=>{
    feuille(ctx,x,y,W*.042,i*1.7,vert,.30);
    if(i%9===0)fleur(ctx,x,y,W*.022,fl,'#F3E2B8',.75);
  });
  ctx.globalAlpha=1;
}

addBg('b-euca-coins','Eucalyptus aux coins','boheme',(c,W,H)=>cadreVegetal(c,W,H,'#F5F7F3','#6E8C6C',9));
addBg('b-sauge-coins','Sauge aux coins','boheme',(c,W,H)=>cadreVegetal(c,W,H,'#FBFAF6','#9CB79A',11));
addBg('b-terra-coins','Feuillage terracotta','boheme',(c,W,H)=>cadreVegetal(c,W,H,'#FBF3ED','#C08160',9));
addBg('b-olive-coins','Olivier','boheme',(c,W,H)=>cadreVegetal(c,W,H,'#F7F6EE','#7C8B4F',12));
addBg('b-arche-blush','Arche fleurie blush','boheme',(c,W,H)=>archeFlorale(c,W,H,'#FDF7F5','#8FA98D','#E7B3AE','#F0D3CE'));
addBg('b-arche-terra','Arche terracotta','boheme',(c,W,H)=>archeFlorale(c,W,H,'#FDF6F1','#9A9E72','#C9805F','#E5A986'));
addBg('b-arche-blanche','Arche blanche','boheme',(c,W,H)=>archeFlorale(c,W,H,'#F8F9F6','#8FA98D','#FFFFFF','#F2EFE6'));
addBg('b-arche-nuit','Arche sur nuit','boheme',(c,W,H)=>archeFlorale(c,W,H,'#16283C','#5E7C63','#E7C9A8','#C9A84C'));
addBg('b-couronne-sauge','Couronne sauge','boheme',(c,W,H)=>couronne(c,W,H,'#F6F8F4','#7E9A7C',null));
addBg('b-couronne-fleurs','Couronne fleurie','boheme',(c,W,H)=>couronne(c,W,H,'#FDFAF4','#8AA487','#E7B3AE'));
addBg('b-couronne-or','Couronne dorée','boheme',(c,W,H)=>couronne(c,W,H,'#14243A','#8C7233','#E4C98F'));
addBg('b-pampas-creme','Pampas crème','boheme',(c,W,H)=>pampas(c,W,H,'#F7F1E6','#C6AF8C',7));
addBg('b-pampas-terra','Pampas terracotta','boheme',(c,W,H)=>pampas(c,W,H,'#FAF2EC','#B98763',13));
addBg('b-cadre-sauge','Cadre floral sauge','boheme',(c,W,H)=>cadreFloral(c,W,H,'#FBFCF9','#7E9A7C','#EBD9C6'));
addBg('b-cadre-terra','Cadre floral terracotta','boheme',(c,W,H)=>cadreFloral(c,W,H,'#FDF6F1','#A98A5E','#C9805F'));
addBg('b-cadre-blush','Cadre floral blush','boheme',(c,W,H)=>cadreFloral(c,W,H,'#FDF7F6','#93AC90','#E3BDB8'));

/* ══ PEPS & FÊTE ══ */

/** Gerbe de feu d'artifice. */
function gerbe(ctx,x,y,R,col,n,a){
  ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=col;ctx.lineCap='round';
  for(let i=0;i<n;i++){
    const ang=(i/n)*Math.PI*2, L=R*(.55+((i*29)%10)/14);
    ctx.lineWidth=Math.max(1,R*.018);
    ctx.beginPath();ctx.moveTo(x+Math.cos(ang)*R*.12,y+Math.sin(ang)*R*.12);
    ctx.lineTo(x+Math.cos(ang)*L,y+Math.sin(ang)*L);ctx.stroke();
    ctx.fillStyle=col;ctx.beginPath();
    ctx.arc(x+Math.cos(ang)*L,y+Math.sin(ang)*L,R*.022,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
function feuxArtifice(ctx,W,H,base,cols,seed,n){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let i=0;i<n;i++)
    gerbe(ctx,r()*W,r()*H*.85,W*(.09+r()*.14),cols[Math.floor(r()*cols.length)],14+Math.floor(r()*10),.45+r()*.45);
  for(let i=0;i<70;i++)etincelle(ctx,r()*W,r()*H,W*(.004+r()*.008),cols[0],.25+r()*.4);
  ctx.globalAlpha=1;
}
function ballons(ctx,W,H,base,cols,seed,n){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let i=0;i<n;i++){
    const x=r()*W,y=r()*H*.9,R=W*(.030+r()*.038),col=cols[Math.floor(r()*cols.length)];
    ctx.save();ctx.globalAlpha=.55+r()*.35;
    ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(x,y,R*.82,R,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.45)';ctx.beginPath();
    ctx.ellipse(x-R*.28,y-R*.34,R*.16,R*.24,-.5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=col;ctx.lineWidth=Math.max(1,W*.0016);ctx.globalAlpha=.35;
    ctx.beginPath();ctx.moveTo(x,y+R);
    ctx.quadraticCurveTo(x+R*.5,y+R*2.1,x,y+R*3.2);ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
function guirlande(ctx,W,H,base,cols,seed,rangs){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let g=0;g<rangs;g++){
    const y0=H*(.06+g*(.92/rangs)), creux=H*.075;
    ctx.strokeStyle='rgba(255,255,255,.30)';ctx.lineWidth=Math.max(1,W*.002);
    ctx.beginPath();ctx.moveTo(0,y0);ctx.quadraticCurveTo(W/2,y0+creux*2,W,y0);ctx.stroke();
    for(let k=0;k<=16;k++){
      const t=k/16, x=t*W, y=y0+2*t*(1-t)*creux*2;
      const col=cols[k%cols.length];
      ctx.save();ctx.globalAlpha=.85;
      ctx.fillStyle=col;ctx.beginPath();
      ctx.ellipse(x,y+W*.014,W*.010,W*.016,0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.22;ctx.beginPath();
      ctx.arc(x,y+W*.014,W*.032,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha=1;
}
function paillettes(ctx,W,H,base,cols,seed,n){
  fill(ctx,W,H,base);const r=rng(seed);
  for(let i=0;i<n;i++){
    const x=r()*W,y=r()*H,R=W*(.004+r()*.014);
    ctx.save();ctx.translate(x,y);ctx.rotate(r()*Math.PI);
    ctx.fillStyle=cols[Math.floor(r()*cols.length)];ctx.globalAlpha=.25+r()*.6;
    ctx.beginPath();
    ctx.moveTo(0,-R);ctx.lineTo(R*.34,-R*.34);ctx.lineTo(R,0);ctx.lineTo(R*.34,R*.34);
    ctx.lineTo(0,R);ctx.lineTo(-R*.34,R*.34);ctx.lineTo(-R,0);ctx.lineTo(-R*.34,-R*.34);
    ctx.closePath();ctx.fill();ctx.restore();
  }
  ctx.globalAlpha=1;
}
function disco(ctx,W,H,base,cols,seed){
  fill(ctx,W,H,base);const r=rng(seed);
  const cx=W/2,cy=H*.40,R=Math.min(W,H)*.24;
  for(let a=0;a<Math.PI*2;a+=.26)for(let b=-1.3;b<1.3;b+=.26){
    const x=cx+Math.cos(a)*Math.cos(b)*R, y=cy+Math.sin(b)*R;
    ctx.fillStyle=cols[Math.floor(r()*cols.length)];ctx.globalAlpha=.3+r()*.6;
    ctx.fillRect(x-R*.055,y-R*.055,R*.10,R*.10);
  }
  ctx.globalAlpha=.16;
  for(let i=0;i<26;i++){
    const a=r()*Math.PI*2;
    ctx.strokeStyle=cols[Math.floor(r()*cols.length)];ctx.lineWidth=W*(.006+r()*.014);
    ctx.beginPath();ctx.moveTo(cx,cy);
    ctx.lineTo(cx+Math.cos(a)*W,cy+Math.sin(a)*W);ctx.stroke();
  }
  ctx.globalAlpha=1;
}

const OR=['#F2C12E','#E4C98F','#D4AF37','#FBEBBF'];
const FETE=['#FF5D73','#FFC531','#4ECDC4','#9B7EDE','#5AC8FA'];
addBg('p-feux-nuit','Feux d’artifice dorés','peps',(c,W,H)=>feuxArtifice(c,W,H,'#0D1B2A',OR,3,7));
addBg('p-feux-encre','Feux sur encre','peps',(c,W,H)=>feuxArtifice(c,W,H,'#141322',OR,11,9));
addBg('p-feux-multi','Feux multicolores','peps',(c,W,H)=>feuxArtifice(c,W,H,'#111018',FETE,17,8));
addBg('p-feux-bordeaux','Feux sur bordeaux','peps',(c,W,H)=>feuxArtifice(c,W,H,'#3A1220',OR,23,7));
addBg('p-ballons-multi','Ballons multicolores','peps',(c,W,H)=>ballons(c,W,H,'#FFFDF8',FETE,5,26));
addBg('p-ballons-pastel','Ballons pastel','peps',(c,W,H)=>ballons(c,W,H,'#FDFBFA',['#F6C7C7','#CFE3F5','#DCE9CE','#F3E1B8'],9,26));
addBg('p-ballons-or','Ballons dorés','peps',(c,W,H)=>ballons(c,W,H,'#16283C',OR,15,22));
addBg('p-ballons-fete','Ballons de fête','peps',(c,W,H)=>ballons(c,W,H,'#221B2E',FETE,21,24));
addBg('p-guirlande-nuit','Guirlande lumineuse','peps',(c,W,H)=>guirlande(c,W,H,'#101E2C',OR,7,4));
addBg('p-guirlande-multi','Guirlande colorée','peps',(c,W,H)=>guirlande(c,W,H,'#151228',FETE,13,4));
addBg('p-guirlande-blanche','Guinguette','peps',(c,W,H)=>guirlande(c,W,H,'#1D2B24',['#FFF6DA','#FFE9A8'],19,5));
addBg('p-paillettes-or','Paillettes or sur noir','peps',(c,W,H)=>paillettes(c,W,H,'#0B0B0D',OR,3,320));
addBg('p-paillettes-rose','Paillettes rose gold','peps',(c,W,H)=>paillettes(c,W,H,'#1A1216',['#E9A6A0','#F3C9B4','#C98F7A'],9,320));
addBg('p-paillettes-argent','Paillettes argent','peps',(c,W,H)=>paillettes(c,W,H,'#14161A',['#E8ECF2','#B9C2CC','#FFFFFF'],15,320));
addBg('p-paillettes-multi','Paillettes multicolores','peps',(c,W,H)=>paillettes(c,W,H,'#101018',FETE,27,320));
addBg('p-disco-or','Boule disco dorée','peps',(c,W,H)=>disco(c,W,H,'#0D1B2A',OR,4));
addBg('p-disco-multi','Boule disco colorée','peps',(c,W,H)=>disco(c,W,H,'#131020',FETE,8));




export type Background = { id: string; name: string; cat: string; draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void }
export const BACKGROUND_CATS: { id: string; name: string }[] = BG_CATS
export const BACKGROUNDS: Background[] = BGS
export const backgroundById = (id: string): Background | undefined => BGS.find((b) => b.id === id)

/** Dessine un fond sur un canvas neuf de W × H px. */
export function renderBackground(id: string, W: number, H: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  ctx.save()
  ;(backgroundById(id) ?? BGS[0]).draw(ctx, W, H)
  ctx.restore()
  return c
}

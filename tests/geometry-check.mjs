// Verification for the strike-lab geometry fix.
// Oracle: 36 black-key centres measured from the SheetMusicBoss reference frame
// (1220px wide keyboard => whiteW 23.462px), plus the true-scale aspect ratio.
const BLACK = new Set([1,3,6,8,10]);
const BLACK_OFFSET = {1:-1/6, 3:1/6, 6:-1/4, 8:0, 10:1/4};

function layout(W, {aspect=6.33, blackWRatio=0.583, trueOffsets=true} = {}) {
  const whiteW = W/52, blackW = whiteW*blackWRatio;
  const keys = []; let wi = 0;
  for (let p = 21; p <= 108; p++) {
    if (BLACK.has(p%12)) {
      const off = trueOffsets ? BLACK_OFFSET[p%12]*blackW : 0;
      keys.push({p, black:true, x: wi*whiteW + off - blackW/2, w: blackW});
    } else {
      keys.push({p, black:false, x: wi*whiteW, w: whiteW}); wi++;
    }
  }
  return {keys, whiteW, blackW, keyboardH: whiteW*aspect};
}

let fails = 0;
const t = (name, fn) => { try { fn(); console.log(`  ok   ${name}`); }
  catch(e){ fails++; console.log(`  FAIL ${name}\n       ${e.message}`); } };
const near = (a,b,tol,what) => { if (Math.abs(a-b) > tol)
  throw new Error(`${what}: ${a.toFixed(3)} vs expected ${b.toFixed(3)} (tol ${tol})`); };

console.log('\ngeometry');
const g = layout(1220);

t('88 keys, 52 white and 36 black', () => {
  if (g.keys.length !== 88) throw new Error(`${g.keys.length} keys`);
  const w = g.keys.filter(k=>!k.black).length, b = g.keys.filter(k=>k.black).length;
  if (w !== 52 || b !== 36) throw new Error(`${w} white / ${b} black`);
});

t('white keys tile the full width with no gap or overhang', () => {
  const whites = g.keys.filter(k=>!k.black);
  near(whites[0].x, 0, 1e-9, 'first white left edge');
  near(whites[51].x + whites[51].w, 1220, 1e-9, 'last white right edge');
  for (let i=1;i<whites.length;i++) near(whites[i].x, whites[i-1].x+whites[i-1].w, 1e-9, `white ${i} abuts previous`);
});

t('keyboard height is true piano scale (6.33 : 1)', () => {
  near(g.keyboardH/g.whiteW, 6.33, 1e-9, 'aspect');
  near(g.keyboardH, 148.5, 3, 'height vs reference-measured 148px');
});

// Oracle measured from the reference screenshot: offset of each black key centre
// from the white-key boundary, in px, at whiteW = 23.462.
const MEASURED = {1:-2.08, 3:+1.96, 6:-3.53, 8:-0.07, 10:+3.42};
t('black key offsets match the reference frame within 0.5px', () => {
  let wi = 0; const boundary = {};
  for (let p=21;p<=108;p++){ if (BLACK.has(p%12)) boundary[p] = wi*g.whiteW; else wi++; }
  for (const k of g.keys.filter(k=>k.black)) {
    const centre = k.x + k.w/2;
    near(centre - boundary[k.p], MEASURED[k.p%12], 0.5, `${k.p} (pc ${k.p%12})`);
  }
});

t('G# alone sits on the boundary; the other four do not', () => {
  let wi = 0; const boundary = {};
  for (let p=21;p<=108;p++){ if (BLACK.has(p%12)) boundary[p] = wi*g.whiteW; else wi++; }
  for (const k of g.keys.filter(k=>k.black)) {
    const d = Math.abs((k.x + k.w/2) - boundary[k.p]);
    if (k.p%12 === 8) near(d, 0, 1e-9, 'G# on boundary');
    else if (d < 1) throw new Error(`pitch class ${k.p%12} is centred on the boundary (d=${d.toFixed(3)})`);
  }
});

t('white tails behind the black keys are equal within each group', () => {
  // C-D-E group of the middle octave: C=60
  const by = new Map(g.keys.map(k=>[k.p,k]));
  const tails = (whites, blacks) => {
    const edges = [by.get(whites[0]).x, ...blacks.flatMap(p=>[by.get(p).x, by.get(p).x+by.get(p).w]),
                   by.get(whites.at(-1)).x + by.get(whites.at(-1)).w];
    const out = []; for (let i=0;i<edges.length;i+=2) out.push(edges[i+1]-edges[i]);
    return out;
  };
  for (const [w,b,label] of [[[60,62,64],[61,63],'C-D-E'], [[65,67,69,71],[66,68,70],'F-G-A-B']]) {
    const ts = tails(w,b);
    for (const x of ts) near(x, ts[0], 1e-6, `${label} tail widths equal`);
  }
});

t('naive mode reproduces the old bug, so the toggle is meaningful', () => {
  const naive = layout(1220, {trueOffsets:false});
  let wi = 0; const boundary = {};
  for (let p=21;p<=108;p++){ if (BLACK.has(p%12)) boundary[p] = wi*(1220/52); else wi++; }
  for (const k of naive.keys.filter(k=>k.black)) near(k.x + k.w/2, boundary[k.p], 1e-9, 'naive centred');
});

console.log(fails ? `\n${fails} FAILED\n` : '\nall passed\n');
process.exit(fails ? 1 : 0);

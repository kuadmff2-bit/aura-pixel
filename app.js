(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('pixelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const STORAGE = 'aura-pixel-reset-v1';
  const palette = ['#000000','#ffffff','#ff0000','#ff6b6b','#ff9f43','#ffd166','#00b894','#00cec9','#0984e3','#6c5ce7','#a855f7','#fd79a8','#8b5e3c','#6b7280','#1f2937','#f3f4f6'];
  const state = {
    width: 32, height: 32, zoom: 16, color: '#ff6b6b', background: '#ffffff',
    tool: 'pencil', size: 1, grid: true, layer: 0, drawing: false, last: null,
    pixels: [], undo: [], redo: [], project: 'Aura Pixel', dark: false
  };

  const blank = () => new Array(state.width * state.height).fill(null);
  const index = (x, y) => y * state.width + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < state.width && y < state.height;
  const clonePixels = p => p.slice();

  function toast(text) {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 1300);
  }

  function snapshot() { return clonePixels(state.pixels); }
  function pushUndo() {
    state.undo.push(snapshot());
    if (state.undo.length > 40) state.undo.shift();
    state.redo.length = 0;
  }
  function undo() {
    if (!state.undo.length) return;
    state.redo.push(snapshot());
    state.pixels = state.undo.pop();
    render();
  }
  function redo() {
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    state.pixels = state.redo.pop();
    render();
  }

  function hexToRgb(hex) {
    const h = hex.replace('#','');
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }
  function paintCell(x, y, color) {
    const r = Math.floor(state.size / 2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const px = x + dx, py = y + dy;
      if (inside(px, py)) state.pixels[index(px, py)] = color;
    }
  }
  function line(x0, y0, x1, y1, color) {
    let dx = Math.abs(x1-x0), sx = x0<x1?1:-1;
    let dy = -Math.abs(y1-y0), sy = y0<y1?1:-1;
    let err = dx + dy;
    while (true) {
      paintCell(x0,y0,color);
      if (x0===x1 && y0===y1) break;
      const e2 = 2*err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function pointFromClient(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = Math.floor((clientX - r.left) * state.width / r.width);
    const y = Math.floor((clientY - r.top) * state.height / r.height);
    return inside(x,y) ? {x,y} : null;
  }

  function begin(clientX, clientY) {
    const p = pointFromClient(clientX, clientY);
    if (!p) return;
    state.drawing = true;
    state.last = p;
    pushUndo();
    const color = state.tool === 'eraser' ? null : state.color;
    paintCell(p.x, p.y, color);
    render();
  }
  function move(clientX, clientY) {
    if (!state.drawing) return;
    const p = pointFromClient(clientX, clientY);
    if (!p) return;
    const color = state.tool === 'eraser' ? null : state.color;
    if (state.last) line(state.last.x, state.last.y, p.x, p.y, color);
    else paintCell(p.x,p.y,color);
    state.last = p;
    render();
  }
  function end() { state.drawing = false; state.last = null; save(); }

  // Mouse fallback: deliberately simple and independent of Pointer Events.
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    begin(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', e => {
    if (!state.drawing) return;
    e.preventDefault();
    move(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', e => {
    if (state.drawing) { e.preventDefault(); end(); }
  });

  // Touch fallback for phones/tablets.
  canvas.addEventListener('touchstart', e => {
    if (!e.touches[0]) return;
    e.preventDefault();
    begin(e.touches[0].clientX, e.touches[0].clientY);
  }, {passive:false});
  canvas.addEventListener('touchmove', e => {
    if (!e.touches[0]) return;
    e.preventDefault();
    move(e.touches[0].clientX, e.touches[0].clientY);
  }, {passive:false});
  window.addEventListener('touchend', e => {
    if (state.drawing) { e.preventDefault(); end(); }
  }, {passive:false});
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function render() {
    canvas.width = state.width;
    canvas.height = state.height;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.imageSmoothingEnabled = false;
    canvas.style.width = `${state.width * state.zoom}px`;
    canvas.style.height = `${state.height * state.zoom}px`;
    ctx.fillStyle = state.background;
    ctx.fillRect(0,0,state.width,state.height);
    for (let y=0;y<state.height;y++) for (let x=0;x<state.width;x++) {
      const c = state.pixels[index(x,y)];
      if (c) { ctx.fillStyle=c; ctx.fillRect(x,y,1,1); }
    }
    if (state.grid && state.zoom >= 4) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,0,0,.13)';
      ctx.lineWidth = 0.06;
      for (let x=0;x<=state.width;x++){ctx.moveTo(x,0);ctx.lineTo(x,state.height)}
      for (let y=0;y<=state.height;y++){ctx.moveTo(0,y);ctx.lineTo(state.width,y)}
      ctx.stroke();
    }
    updateUI();
  }

  function updateUI() {
    const z=$('zoomLabel'), g=$('gridLabel'), p=$('projectLabel');
    if(z) z.textContent = `${state.zoom}×`;
    if(g) g.textContent = `${state.width} × ${state.height}`;
    if(p) p.textContent = state.project;
    document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===state.tool));
    document.querySelectorAll('.size').forEach(b=>b.classList.toggle('active',Number(b.dataset.size)===state.size));
    renderLayers(); renderFrames();
  }

  function renderPalette() {
    const el=$('palette'); if(!el)return;
    el.innerHTML='';
    palette.forEach(c=>{const b=document.createElement('button');b.type='button';b.className='swatch';b.style.background=c;b.title=c;b.addEventListener('click',()=>{state.color=c; if($('colorPicker'))$('colorPicker').value=c});el.appendChild(b)});
  }
  function renderLayers() {
    const el=$('layers'); if(!el)return;
    el.innerHTML='';
    const row=document.createElement('div'); row.className='layer active';
    row.innerHTML='<span>◼</span><span class="layer-name">Camada 1</span><span>✓</span>';
    el.appendChild(row);
  }
  function renderFrames() {
    const el=$('frames'); if(!el)return;
    el.innerHTML='';
    const f=document.createElement('div'); f.className='frame active'; f.textContent='Frame 1'; el.appendChild(f);
  }

  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify({width:state.width,height:state.height,zoom:state.zoom,color:state.color,pixels:state.pixels,grid:state.grid,project:state.project,dark:state.dark})); } catch(e) {}
  }
  function load() {
    try {
      const d=JSON.parse(localStorage.getItem(STORAGE)||'null');
      if (!d) { state.pixels=blank(); return; }
      state.width=Number(d.width)||32; state.height=Number(d.height)||32;
      state.zoom=Number(d.zoom)||16; state.color=d.color||'#ff6b6b'; state.grid=d.grid!==false; state.project=d.project||'Aura Pixel'; state.dark=!!d.dark;
      const expected=state.width*state.height;
      state.pixels=Array.isArray(d.pixels)&&d.pixels.length===expected?d.pixels:blank();
      document.body.classList.toggle('dark',state.dark);
      if($('colorPicker'))$('colorPicker').value=state.color;
      if($('widthInput'))$('widthInput').value=state.width;
      if($('heightInput'))$('heightInput').value=state.height;
    } catch(e) { state.pixels=blank(); }
  }

  function resize() {
    const w=Math.max(1,Math.min(256,Number($('widthInput').value)||32));
    const h=Math.max(1,Math.min(256,Number($('heightInput').value)||32));
    pushUndo();
    const old=state.pixels, ow=state.width, oh=state.height;
    state.width=w; state.height=h; state.pixels=blank();
    for(let y=0;y<Math.min(h,oh);y++)for(let x=0;x<Math.min(w,ow);x++)state.pixels[index(x,y)]=old[y*ow+x];
    render(); save();
  }

  function bind(id,event,fn){const e=$(id);if(e)e.addEventListener(event,fn)}
  document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>{state.tool=b.dataset.tool;updateUI()}));
  document.querySelectorAll('.size').forEach(b=>b.addEventListener('click',()=>{state.size=Number(b.dataset.size);updateUI()}));
  bind('colorPicker','input',e=>{state.color=e.target.value});
  bind('undoBtn','click',undo); bind('redoBtn','click',redo);
  bind('gridBtn','click',()=>{state.grid=!state.grid;render()});
  bind('zoomIn','click',()=>{state.zoom=Math.min(32,state.zoom+1);render()});
  bind('zoomOut','click',()=>{state.zoom=Math.max(2,state.zoom-1);render()});
  bind('resizeBtn','click',resize);
  bind('saveBtn','click',()=>{save();toast('Projeto salvo')});
  bind('exportBtn','click',()=>{const a=document.createElement('a');a.download='aura-pixel.png';a.href=canvas.toDataURL('image/png');a.click();toast('PNG exportado')});
  bind('themeBtn','click',()=>{state.dark=!state.dark;document.body.classList.toggle('dark',state.dark);save()});
  bind('addLayerBtn','click',()=>toast('Editor reiniciado com uma camada funcional'));
  bind('deleteLayerBtn','click',()=>toast('A camada base não pode ser removida'));
  bind('addFrameBtn','click',()=>toast('Frame 1 ativo'));
  bind('newProjectBtn','click',()=>{if(confirm('Começar um projeto novo?')){state.width=32;state.height=32;state.pixels=blank();state.zoom=16;state.color='#ff6b6b';state.project='Aura Pixel';state.undo=[];state.redo=[];render();save();toast('Projeto resetado')}});
  window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}else if(e.key.toLowerCase()==='e'){state.tool='eraser';updateUI()}else if(e.key.toLowerCase()==='p'){state.tool='pencil';updateUI()}});

  load();
  renderPalette();
  render();
})();

(function(){
'use strict';

/* =====================================================================
   How to add something new?
   1) From the page itself: press "✎ EDIT", then add days/tasks/courses.
   2) From the code: add a new line to DEFAULT_DATA below.
   Either way, any new item automatically gets the styling, interactivity,
   and responsiveness.
   Note: if you edit DEFAULT_DATA and want the change to show up, bump
   dataVersion by one (progress and checkmarks are kept, but items you
   added from the page will go back to the original defaults).
   ===================================================================== */
const CONFIG = {
  title: 'Study & Workout Hub',
  subtitle: 'Your schedule, workouts, and courses in one place.',
  heroImage: '',        // Image URL or a file name next to the html (e.g. 'cover.jpg'). Empty = no image.
  resetWeekly: false,    // true = study/workout checkmarks reset every week (starting Saturday). false = permanent.
  dataVersion: 2
};

/* Everything below is an example, edit freely.
   Study:  ['task text', 'time']   |  Workout: ['exercise name', 'reps']  |  Lessons: 'lesson name'
   wd = day number (Sat 6, Sun 0, Mon 1, Tue 2, Wed 3, Thu 4, Fri 5) so that "Today" gets highlighted. */
const DEFAULT_DATA  = {
  study: { days: [
    { name:'Saturday',  wd:6, items:[['Weekly review','18:00'], ['Subject 1: new lesson','20:00']]},
    { name:'Sunday',    wd:0, items:[['Subject 1: practice problems','17:00'], ['Subject 2: reading','19:30']] },
    { name:'Monday',    wd:1, items:[['Subject 2: new lesson','17:00'], ['Quick review','20:00']] },
    { name:'Tuesday',   wd:2, items:[['Subject 1: hands-on practice','17:00'], ['Summarize the day','20:00']] },
    { name:'Wednesday', wd:3, items:[['Subject 2: practice problems','17:00'], ['Review mistakes','19:30']] },
    { name:'Thursday',  wd:4, items:[['Test yourself on the whole week','18:00']] },
    { name:'Friday',    wd:5, items:[['Rest or light review','']]}
  ]},
  workout: { days: [
    { name:'Day A: Push',        items:[['Push-ups','3 × 12'], ['Pike push-ups','3 × 8'], ['Dips','3 × 8']] },
    { name:'Day B: Pull',        items:[['Pull-ups','3 × 6'], ['Inverted rows','3 × 10'], ['Plank','3 × 40s']] },
    { name:'Day C: Legs & Core', items:[['Squats','4 × 15'], ['Lunges','3 × 12'], ['Leg raises','3 × 12']] }
  ]},
  courses: [
    { title:'Sample Course 1', link:'', image:'', lessons:['Lesson 1: Introduction','Lesson 2: The basics','Lesson 3: Practice','Lesson 4: Review','Lesson 5: Quiz'] },
    { title:'Sample Course 2', link:'', image:'', lessons:['Lesson 1: Getting started','Lesson 2: Concepts','Lesson 3: Examples','Lesson 4: Mini project'] }
  ]
};

/* ============================ Small helpers ============================ */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = x => JSON.parse(JSON.stringify(x));
const pad = n => String(n).padStart(2,'0');
const ymd = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const uid = () => 'n'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-3);
function hash(s){ let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); }
function safeUrl(u, isLink){
  u = String(u||'').trim();
  if (/^(javascript|vbscript):/i.test(u)) return '';
  if (isLink && /^data:/i.test(u)) return '';
  return u;
}
function weekKey(){
  const t = new Date(), back = (t.getDay()+1)%7;           // The week starts on Saturday
  return ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate()-back));
}
const itemKey = id => CONFIG.resetWeekly ? id+'@'+weekKey() : id;

/* ============================ Storage ============================ */
const KEY = 'studyhub:v1';
const Store = {
  mode:'none',
  async init(){
    if (window.storage){
      try { await window.storage.set('studyhub:ping','1'); this.mode='artifact'; return; } catch(e){}
    }
    try { localStorage.setItem('studyhub:ping','1'); localStorage.removeItem('studyhub:ping'); this.mode='local'; }
    catch(e){ this.mode='none'; }
  },
  async load(){
    try{
      if (this.mode==='artifact'){ const r = await window.storage.get(KEY); return r && r.value ? JSON.parse(r.value) : null; }
      if (this.mode==='local'){ const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; }
    }catch(e){}
    return null;
  },
  async save(obj){
    const s = JSON.stringify(obj);
    try{
      if (this.mode==='artifact') await window.storage.set(KEY, s);
      else if (this.mode==='local') localStorage.setItem(KEY, s);
    }catch(e){}
  }
};

/* ============================ State ============================ */
let state = { data:null, done:{}, levels:{}, theme:'auto', edit:false };
let range = 14;
let pendingFocus = null;

const persistable = () => ({ data:state.data, done:state.done, levels:state.levels, theme:state.theme, dataVersion:CONFIG.dataVersion });
const save = () => Store.save(persistable());

/* Prepare data: gives every item a stable id automatically, so you don't have to write ids by hand */
function normItems(arr, pid, metaKey){
  const seen = new Set();
  return (arr||[]).map(x=>{
    if (typeof x === 'string') x = { text:x };
    else if (Array.isArray(x)){ const t = { text:x[0] }; if (x[1]) t[metaKey]=x[1]; x = t; }
    else x = { ...x };
    let id = x.id || 'i'+hash(pid+'|'+x.text), n = 1;
    while (seen.has(id)) id = (x.id || 'i'+hash(pid+'|'+x.text)) + '_' + (n++);
    seen.add(id); x.id = id;
    return x;
  });
}
function normalize(d){
  ['study','workout'].forEach(sec=>{
    const mk = sec==='study' ? 'time' : 'detail';
    d[sec].days = d[sec].days.map(day=>{
      day = { ...day };
      day.id = day.id || 'd'+hash(sec+'|'+day.name);
      day.items = normItems(day.items, day.id, mk);
      return day;
    });
  });
  d.courses = d.courses.map(c=>{
    c = { ...c };
    c.id = c.id || 'c'+hash(c.title);
    c.link = c.link || ''; c.image = c.image || '';
    c.lessons = normItems(c.lessons, c.id, 'x');
    return c;
  });
  return d;
}

/* ============================ Rendering (HTML) ============================ */
function itemHTML(o){
  return `<li class="item">
    <label class="check"><input type="checkbox" data-key="${esc(o.key)}" ${state.done[o.key]?'checked':''}><span class="box" aria-hidden="true"></span><span class="txt">${esc(o.it.text)}</span></label>
    ${o.meta ? `<span class="chip">${esc(o.meta)}</span>` : ''}
    <button type="button" class="icon-btn edit-only" data-act="${o.del}" data-sec="${o.sec}" data-parent="${o.parent}" data-id="${o.it.id}" aria-label="Delete">×</button>
  </li>`;
}
function addRow(act, ph1, ph2, attrs){
  const fk = act+'|'+attrs.replace(/\W/g,'');
  return `<form class="add-row edit-only" data-act="${act}" data-fk="${fk}" ${attrs} autocomplete="off">
    <input class="in" name="f1" placeholder="${ph1}" aria-label="${ph1}" required>
    ${ph2 ? `<input class="in short" name="f2" placeholder="${ph2}" aria-label="${ph2}">` : ''}
    <button class="btn primary" type="submit">+ Add</button>
  </form>`;
}
function dayCard(sec, day){
  const isToday = sec==='study' && day.wd === new Date().getDay();
  const items = day.items.map(it => itemHTML({
    it, sec, parent:day.id, key:itemKey(it.id), del:'del-item',
    meta: sec==='study' ? it.time : it.detail
  })).join('');
  return `<article class="card ${isToday?'today':''}" data-card>
    <header class="card-h">
      <h3>${esc(day.name)}${isToday?'<span class="badge">Today</span>':''}</h3>
      <span class="count" data-count></span>
      <button type="button" class="icon-btn edit-only" data-confirm data-act="del-day" data-sec="${sec}" data-id="${day.id}" aria-label="Delete day">×</button>
    </header>
    <div class="bar"><i></i></div>
    <ul class="list">${items}</ul>
    ${addRow('add-item', sec==='study' ? 'New task' : 'New exercise', sec==='study' ? 'Time' : 'Reps', `data-sec="${sec}" data-parent="${day.id}"`)}
  </article>`;
}
function courseCard(c){
  const img = safeUrl(c.image), link = safeUrl(c.link, true);
  const lessons = c.lessons.map(l => itemHTML({ it:l, sec:'courses', parent:c.id, key:l.id, del:'del-lesson', meta:'' })).join('');
  return `<article class="card course" data-card>
    ${img ? `<img class="cover" src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
    <header class="card-h">
      <h3>${esc(c.title)}</h3>
      <span class="count" data-count></span>
      <button type="button" class="icon-btn edit-only" data-confirm data-act="del-course" data-id="${c.id}" aria-label="Delete course">×</button>
    </header>
    <div class="bar"><i></i></div>
    ${link ? `<a class="course-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open course</a>` : ''}
    <ul class="list">${lessons}</ul>
    <div class="fields edit-only">
      <input class="in" data-act="set-field" data-field="image" data-id="${c.id}" value="${esc(c.image)}" placeholder="Course image URL or file name" aria-label="Course image">
      <input class="in" data-act="set-field" data-field="link" data-id="${c.id}" value="${esc(c.link)}" placeholder="Course link" aria-label="Course link">
    </div>
    ${addRow('add-lesson', 'New lesson', '', `data-parent="${c.id}"`)}
  </article>`;
}

function renderAll(){
  const D = state.data;
  document.title = CONFIG.title;
  $('#title').textContent = CONFIG.title;
  $('#subtitle').textContent = CONFIG.subtitle;
  $('#dateLbl').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const hero = $('#hero'), hi = safeUrl(CONFIG.heroImage);
  hero.classList.toggle('has-img', !!hi);
  hero.style.backgroundImage = hi ? `url("${hi.replace(/"/g,'%22')}")` : '';

  const per = CONFIG.resetWeekly ? ' (this week)' : '';
  $('#meters').innerHTML = [['study','Study'+per],['workout','Workout'+per],['courses','Courses']].map(([k,t]) =>
    `<div class="meter" data-pill="${k}"><div class="meter-t"><span>${t}</span><span class="meter-n">0/0</span></div><div class="bar"><i></i></div></div>`
  ).join('');

  const hint = CONFIG.resetWeekly ? 'Checkmarks reset automatically every Saturday.' : 'Checkmarks stay until you remove them yourself.';
  $('#studyHint').textContent = hint; $('#workoutHint').textContent = hint;

  $('#studyGrid').innerHTML   = D.study.days.map(d => dayCard('study', d)).join('');
  $('#workoutGrid').innerHTML = D.workout.days.map(d => dayCard('workout', d)).join('');
  $('#coursesGrid').innerHTML = D.courses.map(courseCard).join('');
  $('#studyAdd').innerHTML    = addRow('add-day', 'New day (e.g. Exam day)', '', 'data-sec="study"');
  $('#workoutAdd').innerHTML  = addRow('add-day', 'New workout day', '', 'data-sec="workout"');
  $('#coursesAdd').innerHTML  = addRow('add-course', 'New course name', '', 'data-sec="courses"');

  updateProgress(); renderStats(); renderChart(); renderLevelForm();

  if (pendingFocus){
    const el = document.querySelector(`[data-fk="${pendingFocus}"] input`);
    if (el) el.focus();
    pendingFocus = null;
  }
}

/* ============================ Progress ============================ */
function updateProgress(){
  $$('[data-card]').forEach(card=>{
    const boxes = $$('input[type=checkbox]', card), n = boxes.length, d = boxes.filter(b=>b.checked).length;
    $('[data-count]', card).textContent = n ? d+'/'+n : '—';
    $('.bar i', card).style.width = n ? (d/n*100)+'%' : '0%';
    card.classList.toggle('complete', n>0 && d===n);
  });
  $$('[data-pill]').forEach(p=>{
    const boxes = $$('#'+p.dataset.pill+'Grid input[type=checkbox]'), n = boxes.length, d = boxes.filter(b=>b.checked).length;
    $('.meter-n', p).textContent = d+'/'+n;
    $('.bar i', p).style.width = n ? (d/n*100)+'%' : '0%';
  });
}

function countsByDate(){ const m = {}; Object.values(state.done).forEach(d => m[d] = (m[d]||0)+1); return m; }
function lastDays(n){
  const t = new Date(), out = [];
  for (let i=n-1; i>=0; i--) out.push(ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate()-i)));
  return out;
}
function sumRange(counts, back, n){
  const t = new Date(); let s = 0;
  for (let i=0; i<n; i++) s += counts[ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate()-back-i))] || 0;
  return s;
}
function deltaTag(d, extra=''){
  if (d>0) return `<span class="delta up">▲ <bdi>+${d}</bdi>${extra}</span>`;
  if (d<0) return `<span class="delta down">▼ <bdi>${d}</bdi>${extra}</span>`;
  return `<span class="delta flat">● No change</span>`;
}
function renderStats(){
  const counts = countsByDate(), today = counts[ymd(new Date())] || 0;
  const l7 = sumRange(counts,0,7), p7 = sumRange(counts,7,7);
  const pct = p7>0 ? ` <bdi>(${l7-p7>0?'+':''}${Math.round((l7-p7)/p7*100)}%)</bdi>` : '';
  const ds = Object.keys(state.levels).sort();
  const cur = ds.length ? state.levels[ds[ds.length-1]] : null;
  const prev = ds.length>1 ? state.levels[ds[ds.length-2]] : null;
  $('#stats').innerHTML = `
    <div class="stat"><span class="k">Tasks today</span><b class="v">${today}</b></div>
    <div class="stat"><span class="k">Last 7 days</span><b class="v">${l7}</b>${deltaTag(l7-p7, pct)}<span class="s">Compared to the previous 7 days (${p7})</span></div>
    <div class="stat"><span class="k">Level</span><b class="v">${cur===null?'—':cur}<small>/10</small></b>${prev!==null?deltaTag(cur-prev):''}<span class="s">${cur===null?'Log your level for the first time below.':(prev!==null?'Compared to the previous log ('+prev+')':'First log. Log again tomorrow to compare.')}</span></div>`;
}
function renderLevelForm(){
  const ds = Object.keys(state.levels).sort();
  const v = state.levels[ymd(new Date())] ?? (ds.length ? state.levels[ds[ds.length-1]] : 5);
  $('#lvl').value = v; $('#lvlOut').textContent = v;
}
function saveLevel(){
  state.levels[ymd(new Date())] = Number($('#lvl').value);
  save(); renderStats(); renderChart();
  $('#lvlMsg').textContent = "Today's level logged: " + $('#lvl').value;
}

function renderChart(){
  const days = lastDays(range), counts = countsByDate(), n = days.length;
  const W=640, H=280, L=38, R=38, T=16, B=32, pw=W-L-R, ph=H-T-B;
  const vals = days.map(d => counts[d] || 0);
  const top = Math.max(5, Math.ceil(Math.max(...vals)/5)*5);
  const slot = pw/n, bw = Math.min(28, slot*0.62), k = Math.ceil(n/8);
  const fmt = d => d.slice(5,7)+'/'+d.slice(8);
  let s = '';
  for (let i=0; i<=5; i++){
    const y = T+ph-ph*i/5;
    s += `<line class="gl" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/>`
       + `<text class="ax" x="${L-8}" y="${y+4}" text-anchor="end">${top*i/5}</text>`
       + `<text class="ax ax2" x="${W-R+8}" y="${y+4}" text-anchor="start">${2*i}</text>`;
  }
  days.forEach((d,i)=>{
    const cx = L+slot*(i+.5), v = vals[i];
    if (v>0){ const h = ph*v/top; s += `<rect class="br" x="${(cx-bw/2).toFixed(1)}" y="${(T+ph-h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4"><title>${fmt(d)}: ${v} ${v===1?'task':'tasks'}</title></rect>`; }
    if ((n-1-i)%k===0) s += `<text class="ax" x="${cx.toFixed(1)}" y="${H-10}" text-anchor="middle">${fmt(d)}</text>`;
  });
  const pts = days.map((d,i)=> state.levels[d]!=null ? [L+slot*(i+.5), T+ph-ph*state.levels[d]/10, state.levels[d], d] : null).filter(Boolean);
  if (pts.length>1) s += `<polyline class="ln" points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/>`;
  pts.forEach(p => s += `<circle class="dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4"><title>${fmt(p[3])}: level ${p[2]}</title></circle>`);
  $('#chart').innerHTML = s;
  $('#chartEmpty').hidden = vals.some(v=>v>0) || pts.length>0;
}

/* ============================ Interaction ============================ */
function commit(fk){ save(); pendingFocus = fk || null; renderAll(); }

function arm(btn){
  btn.classList.add('armed'); btn.dataset.label = btn.textContent; btn.textContent = 'Sure?';
  setTimeout(()=>{ if (btn.isConnected && btn.classList.contains('armed')){ btn.classList.remove('armed'); btn.textContent = btn.dataset.label; } }, 3000);
}

function onClick(e){
  const r = e.target.closest('[data-range]');
  if (r){
    range = +r.dataset.range;
    $$('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(b===r)));
    renderChart(); return;
  }
  const t = e.target.closest('button[data-act]');
  if (!t) return;
  if (t.hasAttribute('data-confirm') && !t.classList.contains('armed')){ arm(t); return; }
  const { act, sec, parent, id } = t.dataset, D = state.data;
  switch (act){
    case 'del-item': { const day = D[sec].days.find(d=>d.id===parent); day.items = day.items.filter(i=>i.id!==id); break; }
    case 'del-day': D[sec].days = D[sec].days.filter(d=>d.id!==id); break;
    case 'del-course': D.courses = D.courses.filter(c=>c.id!==id); break;
    case 'del-lesson': { const c = D.courses.find(c=>c.id===parent); c.lessons = c.lessons.filter(l=>l.id!==id); break; }
    case 'export': exportData(); return;
    case 'reset': state.done = {}; state.levels = {}; state.data = normalize(clone(DEFAULT_DATA)); break;
    default: return;
  }
  commit();
}

function onChange(e){
  const cb = e.target.closest('input[type=checkbox][data-key]');
  if (cb){
    if (cb.checked) state.done[cb.dataset.key] = ymd(new Date()); else delete state.done[cb.dataset.key];
    save(); updateProgress(); renderStats(); renderChart();
    return;
  }
  const sf = e.target.closest('[data-act="set-field"]');
  if (sf){
    const c = state.data.courses.find(c=>c.id===sf.dataset.id);
    if (c){ c[sf.dataset.field] = sf.value.trim(); commit(); }
  }
}

function onSubmit(e){
  const f = e.target.closest('form.add-row');
  if (!f) return;
  e.preventDefault();
  const v1 = f.elements.f1.value.trim(), v2 = f.elements.f2 ? f.elements.f2.value.trim() : '';
  if (!v1) return;
  const D = state.data, { act, sec, parent } = f.dataset;
  if (act==='add-item'){
    const day = D[sec].days.find(d=>d.id===parent);
    day.items.push(sec==='study' ? { id:uid(), text:v1, time:v2 } : { id:uid(), text:v1, detail:v2 });
  } else if (act==='add-day'){
    D[sec].days.push({ id:uid(), name:v1, items:[] });
  } else if (act==='add-course'){
    D.courses.push({ id:uid(), title:v1, link:'', image:'', lessons:[] });
  } else if (act==='add-lesson'){
    D.courses.find(c=>c.id===parent).lessons.push({ id:uid(), text:v1 });
  }
  commit(f.dataset.fk);
}

function exportData(){
  const blob = new Blob([JSON.stringify(persistable(), null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'study-hub-backup-'+ymd(new Date())+'.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}
function importData(file){
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try{
      const o = JSON.parse(fr.result);
      if (!(o.data && o.data.study && o.data.workout && Array.isArray(o.data.courses))) throw 0;
      state.done = o.done || {}; state.levels = o.levels || {};
      state.data = normalize(o.data);
      commit();
    }catch(err){ alert("This file isn't a valid backup."); }
  };
  fr.readAsText(file);
}

const THEMES = ['auto','light','dark'], THEME_LBL = { auto:'THEME : AUTO', light:'THEME : LIGHT', dark:'THEME : DARK' };
function applyTheme(){
  const r = document.documentElement;
  if (state.theme==='auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', state.theme);
  $('#themeBtn').textContent = THEME_LBL[state.theme];
}

function bind(){
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  $('#themeBtn').addEventListener('click', ()=>{
    state.theme = THEMES[(THEMES.indexOf(state.theme)+1)%THEMES.length];
    save(); applyTheme();
  });
  $('#editBtn').addEventListener('click', ()=>{
    state.edit = !state.edit;
    document.body.classList.toggle('editing', state.edit);
    $('#editBtn').setAttribute('aria-pressed', String(state.edit));
    $('#editBtn').textContent = state.edit ? '✓ DONE' : '✎ EDIT';
  });
  $('#lvl').addEventListener('input', e => { $('#lvlOut').textContent = e.target.value; });
  $('#lvlSave').addEventListener('click', saveLevel);
  $('#importFile').addEventListener('change', e => { importData(e.target.files[0]); e.target.value = ''; });
}

async function init(){
  await Store.init();
  const saved = await Store.load();
  if (saved && typeof saved === 'object'){
    state.done = saved.done || {}; state.levels = saved.levels || {}; state.theme = saved.theme || 'auto';
    if (saved.data && saved.dataVersion === CONFIG.dataVersion) state.data = saved.data;
  }
  if (!state.data) state.data = clone(DEFAULT_DATA);
  state.data = normalize(state.data);
  $('#storageWarn').hidden = Store.mode !== 'none';
  applyTheme(); bind(); renderAll();
}
init();
})();
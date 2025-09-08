// R‑kalender – pealogika
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const state = {
  events: [],
  settings: { weekEmoji: '📅', weekNote: '', soundOn: false },
  installPromptEvent: null,
  timers: new Map(),
};

const DAYS_ET = ['Esmaspäev','Teisipäev','Kolmapäev','Neljapäev','Reede','Laupäev','Pühapäev'];
const pad2 = n => String(n).padStart(2,'0');

function getTodayLocal(){ return new Date(); }
function getWeekStart(d = getTodayLocal()){
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (dt.getDay()+6)%7; dt.setDate(dt.getDate()-day); dt.setHours(0,0,0,0); return dt;
}
function dateToISO(d){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function dayDateOfWeek(i){ const ws = getWeekStart(); const d = new Date(ws); d.setDate(ws.getDate()+i); return d; }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function minutesFromTimeStr(t){ if(!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m; }
function timeStrFromMinutes(min){ const h=Math.floor(min/60), m=min%60; return `${pad2(h)}:${pad2(m)}`; }

function load(){
  const ws = dateToISO(getWeekStart());
  state.events = JSON.parse(localStorage.getItem('rk_events_'+ws)||'[]');
  Object.assign(state.settings, JSON.parse(localStorage.getItem('rk_settings_'+ws)||'{}'));
}
function save(){
  const ws = dateToISO(getWeekStart());
  localStorage.setItem('rk_events_'+ws, JSON.stringify(state.events));
  localStorage.setItem('rk_settings_'+ws, JSON.stringify(state.settings));
}

function buildDaySelect(){
  const sel = $('#day'); sel.innerHTML='';
  for(let i=0;i<7;i++){
    const d = dayDateOfWeek(i);
    const opt = document.createElement('option');
    opt.value=String(i); opt.textContent = `${DAYS_ET[i]} (${d.getDate()}.${d.getMonth()+1})`;
    if (sameDay(d, getTodayLocal())) opt.selected = true;
    sel.appendChild(opt);
  }
}
function renderWeekRange(){
  const ws = getWeekStart(); const we = new Date(ws); we.setDate(ws.getDate()+6);
  $('#weekRange').textContent = `${ws.getDate()}.${ws.getMonth()+1}.${ws.getFullYear()} – ${we.getDate()}.${we.getMonth()+1}.${we.getFullYear()}`;
}
function renderCalendar(){
  const cal = $('#calendar'); cal.innerHTML='';
  const wsISO = dateToISO(getWeekStart());
  const evs = state.events.filter(e=>e.weekStartISO===wsISO).slice().sort((a,b)=>a.dayIndex-b.dayIndex||a.startMin-b.startMin);
  for(let i=0;i<7;i++){
    const dayWrap = document.createElement('div'); dayWrap.className='day-col';
    const head = document.createElement('div'); head.className='day-head';
    const d = dayDateOfWeek(i);
    const name = document.createElement('div'); name.className='day-name'; name.textContent=DAYS_ET[i];
    const date = document.createElement('div'); date.className='day-date'; date.textContent=`${d.getDate()}.${d.getMonth()+1}`;
    head.append(name,date);
    const list = document.createElement('div'); list.className='event-list';
    for(const e of evs.filter(x=>x.dayIndex===i)){
      const node = document.getElementById('eventItemTpl').content.firstElementChild.cloneNode(true);
      node.dataset.id = e.id;
      node.querySelector('.dot').style.background = colorToHex(e.color);
      node.querySelector('.time').textContent = e.endMin!=null ? `${timeStrFromMinutes(e.startMin)}–${timeStrFromMinutes(e.endMin)}` : timeStrFromMinutes(e.startMin);
      node.querySelector('.title').textContent = e.title;
      node.querySelector('.notes').textContent = e.notes||'';
      node.querySelector('.edit').addEventListener('click', ()=>editEvent(e.id));
      node.querySelector('.del').addEventListener('click', ()=>deleteEvent(e.id));
      list.appendChild(node);
    }
    dayWrap.append(head,list); cal.appendChild(dayWrap);
  }
}
function colorToHex(c){
  switch(c){case'red':return'#ef4444';case'yellow':return'#f59e0b';case'blue':return'#3b82f6';case'green':return'#10b981';case'purple':return'#a855f7';case'brown':return'#8b5e3c';case'pink':return'#ec4899';case'orange':return'#f97316';default:return'#64748b';}
}

async function requestNotificationPermission(){
  if(!('Notification'in window)){ alert('Teavitused ei ole toetatud.'); return; }
  const res = await Notification.requestPermission();
  if(res!=='granted'){ alert('Teavitused keelati. Luba need brauseri seadetes.'); }
  updateNotifyBtn();
}
function supportsScheduledNotifications(){
  return ('serviceWorker'in navigator)&&('showNotification'in ServiceWorkerRegistration.prototype)&&('TimestampTrigger'in window);
}
function scheduleAll(){
  clearAllTimers();
  const wsISO = dateToISO(getWeekStart());
  state.events.filter(e=>e.weekStartISO===wsISO).forEach(scheduleForEvent);
}
function dateForEventTime(dayIndex, minutes){
  const d = dayDateOfWeek(dayIndex); const h=Math.floor(minutes/60), m=minutes%60; d.setHours(h,m,0,0); return d;
}
function buildBody(e,prefix){
  const d = dayDateOfWeek(e.dayIndex);
  return [prefix, e.title, e.notes||'', `${DAYS_ET[e.dayIndex]} ${d.getDate()}.${d.getMonth()+1}`].filter(Boolean).join(' • ');
}
function scheduleForEvent(e){
  const startDate = dateForEventTime(e.dayIndex, e.startMin);
  const endDate = e.endMin!=null ? dateForEventTime(e.dayIndex, e.endMin) : null;
  if (supportsScheduledNotifications()){
    navigator.serviceWorker.ready.then(reg=>{
      if(e.notifyStart) reg.showNotification('R‑kalender',{ body:buildBody(e,'Algus: '+timeStrFromMinutes(e.startMin)), tag:`start-${e.id}`, showTrigger:new TimestampTrigger(startDate.getTime()), data:{eventId:e.id,type:'start'} }).catch(console.warn);
      if(e.notifyEnd&&endDate) reg.showNotification('R‑kalender',{ body:buildBody(e,'Lõpp: '+timeStrFromMinutes(e.endMin)), tag:`end-${e.id}`, showTrigger:new TimestampTrigger(endDate.getTime()), data:{eventId:e.id,type:'end'} }).catch(console.warn);
    });
  } else {
    if(e.notifyStart) setLocalTimer(`start-${e.id}`, startDate, ()=>showNow(e,'start'));
    if(e.notifyEnd&&endDate) setLocalTimer(`end-${e.id}`, endDate, ()=>showNow(e,'end'));
  }
}
function setLocalTimer(key, when, cb){
  const delta = when - Date.now();
  if (delta<=0){ cb(); return; }
  const to = setTimeout(cb, Math.min(delta, 0x7fffffff));
  state.timers.set(key,to);
}
function clearAllTimers(){ for(const to of state.timers.values()) clearTimeout(to); state.timers.clear(); }
function showNow(e,type){
  if(!('Notification'in window)||Notification.permission!=='granted') return;
  const body = buildBody(e, type==='start'?('Algus: '+timeStrFromMinutes(e.startMin)):('Lõpp: '+timeStrFromMinutes(e.endMin)));
  const n = new Notification('R‑kalender', { body, tag:`${type}-${e.id}` });
  if(state.settings.soundOn){ try{ playBeep(); }catch{} }
  n.onclick=()=>window.focus();
}
function playBeep(){
  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination);
  o.type='sine'; const now=ctx.currentTime; o.frequency.setValueAtTime(880, now);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.3, now+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now+0.6); o.start(now); o.stop(now+0.62);
}

// Install (A2HS)
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); state.installPromptEvent=e; $('#btnInstall').style.display='inline-block'; });
$('#btnInstall').addEventListener('click', async ()=>{
  if(state.installPromptEvent){ state.installPromptEvent.prompt(); const choice=await state.installPromptEvent.userChoice; if(choice.outcome==='accepted') $('#btnInstall').textContent='Lisatud'; state.installPromptEvent=null; }
  else alert('Lisa avaekraanile: Chrome -> 3 täppi -> Lisa avalehele');
});

// CRUD
function addEventFromForm(evt){
  evt.preventDefault();
  const title=$('#title').value.trim(); if(!title) return;
  const dayIndex=Number($('#day').value);
  const startMin=minutesFromTimeStr($('#start').value);
  const endMin=minutesFromTimeStr($('#end').value);
  if(endMin!=null && endMin<startMin){ alert('Lõppaeg peab olema hiljem kui algusaeg.'); return; }
  const color = ($('input[name="color"]:checked')?.value)||'blue';
  const notifyStart=$('#notifyStart').checked; const notifyEnd=$('#notifyEnd').checked;
  const notes=$('#notes').value.trim();
  const id=(crypto?.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2));
  const wsISO=dateToISO(getWeekStart());
  state.events.push({ id,title,notes,color,dayIndex,startMin,endMin,notifyStart,notifyEnd,weekStartISO:wsISO });
  save(); renderCalendar(); scheduleAll(); $('#eventForm').reset();
}
function editEvent(id){
  const e=state.events.find(x=>x.id===id); if(!e) return;
  $('#title').value=e.title; $('#day').value=String(e.dayIndex); $('#start').value=timeStrFromMinutes(e.startMin); $('#end').value=e.endMin!=null?timeStrFromMinutes(e.endMin):'';
  const radio=document.querySelector(`#colorGroup input[value="${e.color}"]`); if(radio) radio.checked=true;
  $('#notifyStart').checked=!!e.notifyStart; $('#notifyEnd').checked=!!e.notifyEnd; $('#notes').value=e.notes||'';
  const btn=$('#eventForm .btn.primary'); btn.textContent='Uuenda';
  const onSubmit=(ev)=>{ ev.preventDefault();
    e.title=$('#title').value.trim(); e.dayIndex=Number($('#day').value);
    e.startMin=minutesFromTimeStr($('#start').value); e.endMin=minutesFromTimeStr($('#end').value);
    e.color=($('input[name="color"]:checked')?.value)||'blue';
    e.notifyStart=$('#notifyStart').checked; e.notifyEnd=$('#notifyEnd').checked;
    e.notes=$('#notes').value.trim(); save(); renderCalendar(); scheduleAll();
    $('#eventForm').reset(); btn.textContent='Lisa'; $('#eventForm').removeEventListener('submit', onSubmit); $('#eventForm').addEventListener('submit', addEventFromForm, { once:true });
  };
  $('#eventForm').removeEventListener('submit', addEventFromForm);
  $('#eventForm').addEventListener('submit', onSubmit, { once:true });
}
function deleteEvent(id){
  const idx=state.events.findIndex(x=>x.id===id); if(idx<0) return;
  state.events.splice(idx,1); save(); renderCalendar(); scheduleAll();
}

// Settings
function loadSettingsToUI(){
  $('#weekEmoji').textContent=state.settings.weekEmoji||'📅';
  $('#weekEmojiSelect').value=state.settings.weekEmoji||'📅';
  $('#weekNote').value=state.settings.weekNote||'';
  $('#soundOn').checked=!!state.settings.soundOn;
}
function bindSettings(){
  $('#weekEmojiSelect').addEventListener('change', ()=>{ state.settings.weekEmoji=$('#weekEmojiSelect').value; $('#weekEmoji').textContent=state.settings.weekEmoji; save(); });
  $('#weekNote').addEventListener('input', ()=>{ state.settings.weekNote=$('#weekNote').value.slice(0,120); save(); });
  $('#soundOn').addEventListener('change', ()=>{ state.settings.soundOn=$('#soundOn').checked; save(); });
}
function updateNotifyBtn(){
  const b=$('#btnNotify');
  if(!('Notification'in window)){ b.disabled=true; b.textContent='Teavitused mitte toetatud'; return; }
  if(Notification.permission==='granted'){ b.textContent='Teavitused lubatud'; b.disabled=true; } else { b.textContent='Luba teavitused'; b.disabled=false; }
}

// SW
async function registerSW(){
  if('serviceWorker'in navigator){
    try{
      const reg = await navigator.serviceWorker.register('./sw.js'); // NB! suhteline tee
      console.log('SW registreeritud', reg.scope);
    }catch(e){ console.warn('SW viga', e); }
  }
}
async function requestPersistent(){ if(navigator.storage?.persist){ try{ await navigator.storage.persist(); }catch{} } }
function initDayDefaults(){ const s=$('#start'); const now=new Date(); s.value=`${pad2(now.getHours())}:${pad2(Math.floor(now.getMinutes()/5)*5)}`; }
function bindUI(){ $('#btnNotify').addEventListener('click', requestNotificationPermission); $('#eventForm').addEventListener('submit', addEventFromForm); $('#resetForm').addEventListener('click', ()=>$('#eventForm').reset()); }

(async function main(){
  await registerSW(); await requestPersistent(); load(); buildDaySelect(); renderWeekRange(); renderCalendar(); loadSettingsToUI(); bindSettings(); bindUI(); initDayDefaults(); updateNotifyBtn(); scheduleAll();
})();

setInterval(()=>{
  const wsNow = dateToISO(getWeekStart());
  const lastWs = (state.events[0]?.weekStartISO) || localStorage.getItem('rk_last_ws');
  if(lastWs!==wsNow){
    localStorage.setItem('rk_last_ws', wsNow);
    load(); buildDaySelect(); renderWeekRange(); renderCalendar(); loadSettingsToUI(); scheduleAll();
  }
}, 60*1000);

navigator.serviceWorker?.addEventListener?.('message', (e)=>{ if(e?.data?.type==='focus') window.focus(); });

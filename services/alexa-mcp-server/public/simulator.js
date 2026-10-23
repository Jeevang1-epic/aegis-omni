'use strict';
const $ = id => document.getElementById(id);
let rpcId = 1, scenarios = [], active = null, busy = false, start = 0, playing = true, mode = 'sports';
let mediaTime = 0, lastFrame = performance.now(), frames = 0, fpsStart = lastFrame, previousFocus = null, remoteTarget = null;
const annotations = [];
let lastAnnotation = 0;
const origin = location.origin;
function status(text) { $('status').textContent = text; }
function logRpc(message, headers, response, body) {
  const entry = document.createElement('article'); entry.className = 'log-entry' + (response.ok ? '' : ' error');
  const heading = document.createElement('div'); heading.className = 'log-heading';
  const method = document.createElement('span'); method.textContent = 'POST /mcp';
  const code = document.createElement('span'); code.textContent = `${response.status} ${response.statusText}`;
  heading.append(method, code);
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = `${message.id ?? 'notification'} · ${message.method}${message.params?.name ? ' / ' + message.params.name : ''}`;
  const pre = document.createElement('pre'); pre.textContent = JSON.stringify({ headers: { Origin: origin, ...headers }, request: message, response: body }, null, 2);
  details.append(summary, pre); entry.append(heading, details); $('protocol-log').prepend(entry);
  while ($('protocol-log').children.length > 30) $('protocol-log').lastChild.remove();
}
async function rpc(method, params, notification = false) {
  const message = { jsonrpc: '2.0', ...(!notification ? { id: rpcId++ } : {}), method, ...(params ? { params } : {}) };
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' };
  const response = await fetch('/mcp', { method: 'POST', headers, body: JSON.stringify(message) });
  const text = await response.text(); let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  logRpc(message, headers, response, body);
  if (!response.ok || body?.error || body?.result?.isError) throw new Error(body?.error?.message ?? body?.result?.content?.[0]?.text ?? `MCP ${response.status}`);
  return body?.result;
}
async function tool(name, args = {}) { const result = await rpc('tools/call', { name, arguments: args }); return JSON.parse(result.content[0].text); }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`); return data;
}
function selectFocus(element) {
  document.querySelectorAll('.remote-focus').forEach(node => node.classList.remove('remote-focus'));
  if (!element) return; remoteTarget = element; element.classList.add('remote-focus'); element.focus({ preventScroll: true });
  $('focus-name').textContent = element.id || element.textContent.trim().slice(0, 30);
}
function candidates() { const root = active ? $('pip') : document; return [...root.querySelectorAll('[data-nav]')].filter(node => !node.disabled && node.getClientRects().length); }
async function trigger(scenario) {
  if (busy || active) return;
  busy = true; previousFocus = $('play'); start = mediaTime; $('catchup').hidden = true;
  document.querySelectorAll('.scenario').forEach(button => { button.disabled = true; button.classList.toggle('selected', button.dataset.scenario === scenario.id); });
  try {
    const result = await api('/api/scenarios/trigger', { scenarioId: scenario.id });
    active = result; $('pip').hidden = false; $('camera-name').textContent = scenario.cameraId.toUpperCase();
    $('pip-title').textContent = scenario.title; $('pip-observation').textContent = scenario.observation;
    $('bee-note').textContent = result.bee.matchedUtterance; $('bee-source').textContent = 'MATCHED DEMO';
    $('bee-alarm').textContent = 'Sample alarm: ' + result.bee.todoItem.alarmAtIso + ' / ' + result.bee.todoItem.alarmAtEpochMs;
    $('pip-status').textContent = 'ICE COMPLETE · POSTING VIDEO-ONLY RECVONLY';
    $('reminder').disabled = false; $('resolve').disabled = true; selectFocus($('dismiss'));
    const whep = await api('/api/ring/whep', { deviceId: scenario.cameraId, caretakingMode: scenario.id, iceGatheringState: 'complete', sdpOffer: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly\r\n' });
    if (!whep.sdpValidated) throw new Error('SDP validation failed');
    $('pip-status').textContent = '201 CREATED · VIDEO-ONLY RECVONLY · SIMULATED';
    $('resolve').disabled = false; selectFocus($('resolve'));
    await tool('query_household_care_status');
    status('PiP focus locked. Resolve the moment, or create a reminder.');
  } catch (error) { status(error.message); $('pip-status').textContent = 'CONNECTION ERROR · RETURN TO GAME'; }
  finally { busy = false; if (!active) document.querySelectorAll('.scenario').forEach(button => button.disabled = false); }
}
async function dismiss() {
  if (!active || busy) return; busy = true;
  try {
    await tool('dispatch_perimeter_resolution', { eventId: active.event.id, actionType: 'acknowledge' });
    const end = mediaTime;
    const summary = await tool('generate_live_broadcast_catchup', { startSeconds: start, endSeconds: end, events: annotations.filter(event => event.at > start && event.at <= end).slice(-200) });
    $('catchup-title').textContent = `${summary.durationSeconds.toFixed(1)} seconds away. All caught up.`;
    $('catchup-text').textContent = summary.summary;
    $('catchup').hidden = false; $('pip').hidden = true; active = null;
    document.querySelectorAll('.scenario').forEach(button => button.disabled = false);
    selectFocus(previousFocus?.matches('[data-nav]') ? previousFocus : $('play'));
    status('Focus restored. Catch-up uses the exact missed media interval.');
  } catch (error) { status('Could not resolve: ' + error.message + '. Try again.'); }
  finally { busy = false; }
}
async function reminder() {
  if (!active || busy) return; busy = true;
  try {
    const todo = await tool('create_caretaking_followup_todo', { text: active.scenario.followup, alarm_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
    $('bee-alarm').textContent = `Reminder ${todo.id}: ${todo.alarmAtIso} / ${todo.alarm_at}`;
    $('reminder').disabled = true; selectFocus($('resolve')); status('Follow-up saved in the local demo session.');
  } catch (error) { status(error.message); } finally { busy = false; }
}
function remote(key) {
  if (key === 'Escape') { void dismiss(); return; }
  const nodes = candidates(); if (!nodes.length) return;
  const current = nodes.includes(remoteTarget) ? remoteTarget : nodes[0];
  if (key === 'Enter') { current.click(); return; }
  const box = current.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'; const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  const ranked = nodes.filter(node => node !== current).map(node => { const rect = node.getBoundingClientRect(); const dx = rect.x + rect.width / 2 - x, dy = rect.y + rect.height / 2 - y; return { node, forward: (horizontal ? dx : dy) * sign, cross: Math.abs(horizontal ? dy : dx) }; }).filter(item => item.forward > 2).sort((a, b) => a.forward + a.cross * 2 - b.forward - b.cross * 2);
  if (ranked.length) selectFocus(ranked[0].node); else selectFocus(current);
}
document.addEventListener('keydown', event => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape'].includes(event.key)) { event.preventDefault(); remote(event.key); }
  if (event.key === 'Tab' && active) { event.preventDefault(); const nodes = candidates(); const index = nodes.indexOf(document.activeElement); selectFocus(nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length]); }
});
document.addEventListener('focusin', event => { if (event.target.matches('[data-nav]')) { remoteTarget = event.target; $('focus-name').textContent = event.target.id; } });
document.querySelectorAll('[data-key]').forEach(button => { button.addEventListener('mousedown', event => event.preventDefault()); button.onclick = () => remote(button.dataset.key); });
$('resolve').onclick = dismiss; $('dismiss').onclick = dismiss; $('reminder').onclick = reminder;
$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? 'Ⅱ' : '▶'; $('play').setAttribute('aria-label', playing ? 'Pause broadcast' : 'Play broadcast'); };
$('content-mode').onclick = () => { mode = mode === 'sports' ? 'fitness' : 'sports'; $('content-mode').textContent = mode === 'sports' ? 'Switch to fitness' : 'Switch to sports'; document.querySelector('.broadcast-caption h2').textContent = mode === 'sports' ? 'Harbor vs. Summit' : 'Movement / Studio session'; };
$('clear-log').onclick = () => $('protocol-log').replaceChildren();
const ctx = $('broadcast').getContext('2d'), cam = $('camera').getContext('2d');
function render(now) {
  const elapsed = (now - lastFrame) / 1000; lastFrame = now; if (playing) mediaTime += elapsed;
  frames++; if (now - fpsStart > 1000) { $('fps').textContent = `${Math.round(frames * 1000 / (now - fpsStart))} FPS / 60 TARGET`; frames = 0; fpsStart = now; }
  while (Math.floor(mediaTime / 10) > lastAnnotation) {
    lastAnnotation += 1;
    annotations.push({ at: lastAnnotation * 10, description: mode === 'sports' ? ['Harbor completes a three-point play.', 'Summit gathers the defensive rebound.', 'Harbor calls a timeout to reset.'][lastAnnotation % 3] : 'The studio transitions into the next guided mobility sequence.' });
    if (annotations.length > 200) annotations.shift();
    $('score-home').textContent = String(82 + Math.floor(lastAnnotation / 3) * 3);
  }
  const seconds = Math.floor(mediaTime); $('timecode').textContent = `${String(Math.floor(seconds / 3600)).padStart(2,'0')}:${String(Math.floor(seconds / 60) % 60).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  $('progress-fill').style.width = `${(mediaTime % 300) / 3}%`; $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const w = 1600, h = 900;
  const gradient = ctx.createLinearGradient(0,0,0,h); gradient.addColorStop(0,'#ded2be'); gradient.addColorStop(1,'#625447'); ctx.fillStyle = gradient; ctx.fillRect(0,0,w,h);
  for (let i=0;i<80;i++) { ctx.fillStyle = i%3 ? '#a39480' : '#eee3d1'; ctx.fillRect(i*23,130+(i%4)*12,6,5); }
  ctx.save(); ctx.translate(800,450); ctx.scale(1,.65); ctx.rotate(-.11);
  ctx.fillStyle = mode === 'sports' ? '#cba776' : '#e9e1d2'; ctx.fillRect(-690,-340,1380,680);
  for (let i=0;i<20;i++) { ctx.fillStyle = i%2 ? '#c2a27411' : '#1f170a11'; ctx.fillRect(-690+i*69,-340,69,680); }
  if (mode === 'sports') { ctx.strokeStyle = '#f9edd7'; ctx.lineWidth=4; ctx.strokeRect(-660,-310,1320,620); ctx.beginPath();ctx.moveTo(0,-310);ctx.lineTo(0,310);ctx.stroke();ctx.beginPath();ctx.arc(0,0,100,0,Math.PI*2);ctx.stroke();
  for (const side of [-1,1]) { ctx.strokeRect(side<0?-660:450,-130,210,260); ctx.beginPath();ctx.arc(side*600,0,270,side<0?-Math.PI/2:Math.PI/2,side<0?Math.PI/2:Math.PI*1.5);ctx.stroke();ctx.fillStyle='#dbdfd5';ctx.fillRect(side*620,-45,8,90); }
  } else { for (let mat=0;mat<5;mat++) { ctx.fillStyle=mat%2?'#a9b5a0':'#baa88e'; ctx.fillRect(-550+mat*235,-130,150,310); } }
  ctx.fillStyle='#65503b';ctx.font='bold 35px Segoe UI';ctx.textAlign='center';ctx.fillText(mode==='sports'?'AEGIS ARENA':'MOVEMENT STUDIO',0,15);
  for (let i=0;i<(mode==='sports'?10:5);i++) { const x=Math.sin(mediaTime*.35+i*1.7)*440,y=Math.cos(mediaTime*.25+i*2.1)*230;ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(x+6,y+15,24,12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=i<5?'#305e4b':'#a75038';ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 13px Segoe UI';ctx.fillText(String(i+1),x,y+5); }
  ctx.restore();
  // Architectural camera vignettes, explicitly illustrative rather than inferred video.
  const garden = active?.scenario.id === 'elder_care';
  const sideDoor = active?.scenario.id === 'accessibility_relay';
  cam.fillStyle='#ece4d7';cam.fillRect(0,0,640,360);
  cam.fillStyle='#d3c5ae';cam.fillRect(0,270,640,90);
  for(let slat=0;slat<13;slat++){cam.fillStyle=slat%2?'#e1d6c4':'#e8dece';cam.fillRect(slat*50,0,48,270);}
  if(garden){
    cam.fillStyle='#a9b49a';cam.fillRect(0,130,640,140);
    cam.fillStyle='#e7ddc9';cam.beginPath();cam.moveTo(260,150);cam.lineTo(350,150);cam.lineTo(480,360);cam.lineTo(140,360);cam.fill();
    for(const x of [65,535]){cam.fillStyle='#7c6953';cam.fillRect(x,90,12,160);cam.fillStyle='#647b58';cam.beginPath();cam.ellipse(x+5,95,60,70,0,0,Math.PI*2);cam.fill();}
    cam.fillStyle='#6a7264';cam.beginPath();cam.arc(305,170,13,0,Math.PI*2);cam.fill();cam.fillRect(292,185,26,48);
  }else{
    cam.fillStyle='#b6a18a';cam.fillRect(330,35,220,300);cam.fillStyle=sideDoor?'#697466':'#71513c';cam.fillRect(345,45,190,290);
    for(let seam=0;seam<6;seam++){cam.fillStyle='#ffffff12';cam.fillRect(350+seam*31,45,2,290);}
    cam.fillStyle='#c8a97e';cam.fillRect(502,175,6,40);cam.fillStyle='#41382e';cam.fillRect(568,135,18,30);
    cam.fillStyle='#a98457';cam.fillRect(225,245,100,70);cam.fillStyle='#d6bd92';cam.fillRect(265,245,16,70);
    cam.fillStyle='#7f8d6b';cam.beginPath();cam.ellipse(90,190,37,58,0,0,Math.PI*2);cam.fill();cam.fillStyle='#b58268';cam.fillRect(65,235,50,65);
  }
  cam.strokeStyle='#2d6a4f';cam.lineWidth=3;cam.strokeRect(205,145,170,185);
  cam.fillStyle='#fffcf7';cam.fillRect(205,123,190,23);cam.fillStyle='#234e3b';cam.font='14px Consolas';cam.fillText(garden?'CHECK-IN REGION':'OBJECT REGION',211,140);
  cam.fillStyle='#fffcf7';cam.fillRect(12,10,305,24);cam.fillStyle='#4a433b';cam.font='13px Consolas';cam.fillText('ILLUSTRATIVE CV ? NO INFERENCE',20,27);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
(async () => {
  try {
    scenarios = (await api('/api/scenarios')).scenarios;
    scenarios.forEach((scenario, index) => { const button = document.createElement('button'); button.className='scenario';button.dataset.nav='';button.dataset.scenario=scenario.id;button.id=`scenario-${index+1}`;
      const number=document.createElement('span');number.className='number';number.textContent=`0${index+1}`;const label=document.createElement('span');const title=document.createElement('strong');title.textContent=scenario.title;const detail=document.createElement('small');detail.textContent=scenario.cameraId+' · Ring + Bee + Alexa';label.append(title,detail);button.append(number,label);button.onclick=()=>trigger(scenario);$('scenario-list').append(button); });
    await rpc('initialize', { protocolVersion:'2025-11-25', capabilities:{}, clientInfo:{name:'aegis-control-center',version:'2.0.0'} });
    await rpc('notifications/initialized', undefined, true); await rpc('tools/list');
    $('mcp-state').textContent='HTTP connected';status('Choose a moment. All actions stay inside this local simulator.');selectFocus($('play'));
  } catch (error) { $('mcp-state').textContent='Unavailable';status(error.message); }
})();

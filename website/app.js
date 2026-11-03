// UniSpace front-end application.
// Edit this file for page behavior and API calls. Visual styling lives in styles.css.
// Sections: shared state/helpers, login, navigation, dashboard, users, schedules,
// reservations, campus explorer, and Three.js rendering.
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let API = localStorage.getItem('unispace_api') || window.location.origin, token = sessionStorage.getItem('unispace_token') || '', user = null, buildings = [], rooms = [], schedules = [], reservations = [], users = [], page = 'dashboard', selected = null, floor = 1, view = 'campus', threeScene = null, reservationRoomId = null;
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// API HELPER: sends requests to the Cloudflare Worker backend.
async function request(path, method = 'GET', body) {
  if (!API)
    throw Error('Set your backend Worker URL first'); const r = await fetch(API.replace(/\/$/, '') + '/api/' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { 'authorization': 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); let data = await r.json(); if (!r.ok)
    throw Error(data.error || 'Request failed'); return data;
}

// UI HELPER: displays a temporary success or error message.
function notice(s, error = false) { const n = document.createElement('div'); n.className = 'alert' + (error ? '' : ' success'); n.textContent = s; $('#messages')?.prepend(n); setTimeout(() => n.remove(), 6000); }

// LOGIN: handles sign-in and saving the backend API URL in this browser.
function loginScreen() {
  app.innerHTML = `<div class="login"><div class="loginbox"><section class="loginleft"><div style="font-size:35px">🏛️</div><h2>Welcome back</h2><p class="muted">UniSpace • Bulacan State University</p><form id="loginform" class="stack"><label class="field">Username<input name="username" required autocomplete="username"></label><label class="field">Password<input name="password" type="password" required autocomplete="current-password"></label><button class="primary">Sign in</button></form><div id="messages"></div><p class="note">Accounts are created by administrators, not selected on this screen.</p><details><summary class="muted">Backend API settings</summary><label class="field">API URL<input id="apiurl" placeholder="https://your-unispace.pages.dev" value="${esc(API)}"></label><button class="secondary" id="saveapi">Save URL</button></details></section><section class="loginright"><div style="font-size:38px">✦</div><h1>Welcome to<br>BulSU</h1><p>A connected campus, smarter scheduling, and simpler classroom reservations.</p><hr style="width:100%;border:0;border-top:1px solid #ffffff55"><h3>Our Campus</h3><p>Explore buildings, locate classrooms, and manage learning spaces in one place.</p></section></div></div>`; $('#saveapi').onclick = () => { API = $('#apiurl').value.trim().replace(/\/$/, ''); localStorage.setItem('unispace_api', API); notice('API URL saved'); }; $('#loginform').onsubmit = async (e) => {
    e.preventDefault(); try {
      const d = Object.fromEntries(new FormData(e.target));
      const r = await request('login', 'POST', d);
      token = r.token;
      user = r.user;
      sessionStorage.setItem('unispace_token', token);
      await load();
      render();
    }
      catch (x) {
        notice(x.message, true);
      }
  };
}

// DATA LOADING: fetches the records needed by the current user.
async function load() {
  const a = await Promise.all([request('buildings'), request('rooms'), request('schedules'), request('reservations')]); buildings = a[0].buildings; rooms = a[1].rooms; schedules = a[2].schedules; reservations = a[3].reservations; if (user.role === 'admin')
    users = (await request('users')).users;
}

// NAVIGATION: admins see the additional User Management page.
function navItems() { return [['dashboard', user.role === 'admin' ? 'Admin Overview' : 'My Calendar'], ['campus', 'Campus Overview'], ['rooms', 'Classrooms'], ['schedules', 'Weekly Schedules'], ['reservations', 'Reservations'], ...(user.role === 'admin' ? [['users', 'User Management']] : [])]; }

// APP SHELL: builds the sidebar and routes to the selected page.
function render() {
  if (!user)
    return loginScreen(); app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand">✦ UniSpace</div><div class="muted" style="padding:0 10px">${esc(user.name)}<br><small>${esc(user.role === 'officer' ? user.position : user.role)} ${esc(user.section || '')}</small></div><div class="nav">${navItems().map(([k, t]) => `<button data-nav="${k}" class="${page === k ? 'active' : ''}">${t}</button>`).join('')}</div><div style="margin-top:auto"><button id="logout" class="secondary">Sign out</button></div></aside><main class="main"><div class="top"><div><h1>${esc(navItems().find(x => x[0] === page)?.[1] || 'UniSpace')}</h1><div class="muted">Real records stored in Cloudflare D1</div></div><span class="pill">${esc(user.role)}</span></div><div id="messages"></div><div id="content"></div></main></div>`; document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { page = b.dataset.nav; render(); }); $('#logout').onclick = async () => {
      try {
        await request('logout', 'POST');
      }
      catch { } token = ''; user = null; sessionStorage.removeItem('unispace_token'); loginScreen();
    }; const c = $('#content'); if (page === 'dashboard')
    dashboard(c); if (page === 'campus')
    campus(c); if (page === 'rooms')
    roomPage(c); if (page === 'schedules')
    schedulePage(c); if (page === 'reservations')
    reservationPage(c); if (page === 'users')
    userPage(c);
}

// DASHBOARD: summary cards and role-specific welcome text.
function dashboard(c) {
  if (user.role === 'admin') {
    c.innerHTML = `<div class="cards">${[['Campus Buildings', buildings.length], ['Classrooms', rooms.length], ['Weekly Classes', schedules.length], ['Reservations', reservations.length]].map(([a, b]) => `<div class="card"><div class="muted">${a}</div><div class="stat">${b}</div></div>`).join('')}</div><div class="grid2"><div class="card"><h2>Campus operations</h2><p>Manage accounts, official schedules, room availability and reservation approvals.</p><button class="primary" id="jumpCampus">Open campus overview →</button></div><div class="card"><h2>Pending reservations</h2><div class="stat">${reservations.filter(x => x.status === 'pending').length}</div><p class="muted">Requests waiting for administrator review.</p><button class="secondary" id="jumpReservations">Review requests</button></div></div>`;
    $('#jumpCampus').onclick = () => { page = 'campus'; render(); };
    $('#jumpReservations').onclick = () => { page = 'reservations'; render(); };
    return;
  }
  const week = days.slice(1).concat(days[0]);
  const today = new Date().getDay();
  const todayName = days[today];
  const my = schedules.slice().sort((a,b) => a.weekday-b.weekday || a.start_time.localeCompare(b.start_time));
  c.innerHTML = `<div class="calendar-head"><div><h2>${user.role === 'professor' ? 'My Teaching Calendar' : 'My Section Calendar'}</h2><p class="muted">${user.role === 'professor' ? 'Your assigned teaching schedule.' : `Official classes for ${esc(user.section || 'your section')}.`}</p></div><span class="pill">Today: ${todayName}</span></div><div class="week-calendar">${week.map(day => { const idx=days.indexOf(day); const entries=my.filter(x=>x.weekday===idx); return `<section class="day-column ${idx===today?'today':''}"><header>${day}<small>${entries.length} ${entries.length===1?'class':'classes'}</small></header><div class="day-events">${entries.length?entries.map(x=>`<article class="class-event"><b>${esc(x.subject)}</b><span>${esc(x.start_time)}–${esc(x.end_time)}</span><span>${esc(x.building)} · ${esc(x.room_number)}</span><small>${user.role==='professor'?esc(x.section):esc(x.professor||'Professor not assigned')}</small></article>`).join(''):'<div class="empty-day">No classes</div>'}</div></section>`; }).join('')}</div><div class="calendar-actions"><button class="secondary" id="campusFromCalendar">Check room availability in Campus Overview</button><button class="primary" id="reserveFromCalendar">Request a room</button></div>`;
  $('#campusFromCalendar').onclick=()=>{page='campus';render();};
  $('#reserveFromCalendar').onclick=()=>{page='reservations';render();};
}

// CLASSROOM DIRECTORY: filters rooms by building.
function roomPage(c) {
  const activeBuildings=buildings;
  c.innerHTML = `${user.role==='admin'?`<div class="card"><h2>Add a Classroom</h2><form id="addRoom" class="formgrid"><label class="field">Building<select name="building_id" required>${activeBuildings.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label><label class="field">Room number<input name="room_number" required placeholder="e.g. 125"></label><label class="field">Floor<input name="floor" type="number" min="1" value="1" required></label><label class="field">Capacity<input name="capacity" type="number" min="0" value="40" required></label><label class="field">Room type<select name="kind"><option value="classroom">Classroom</option><option value="laboratory">Laboratory</option><option value="audiovisual">AVR</option><option value="library">Library</option><option value="office">Office</option><option value="facility">Facility</option></select></label><div class="span2"><button class="primary">Add Classroom</button></div></form></div><div class="card"><h2>Mark a Room Unavailable</h2><p class="muted">Block a room for maintenance, events, or other activities. This will remove the time from public availability.</p><form id="blockRoom" class="formgrid"><label class="field">Room<select name="room_id" required>${rooms.filter(r=>r.active).map(r=>`<option value="${r.id}">${esc(r.building)} · ${esc(r.room_number)}</option>`).join('')}</select></label><label class="field">Date<input type="date" name="date" min="${new Date().toISOString().slice(0,10)}" required></label><label class="field">Start time<input type="time" name="start_time" value="08:00" required></label><label class="field">End time<input type="time" name="end_time" value="17:00" required></label><label class="field span2">Reason<input name="reason" placeholder="Maintenance / campus event" required></label><div class="span2"><button class="primary">Save Unavailability</button></div></form></div>`:''}<div class="card"><h2>Room Directory</h2><label class="field">Filter by building<select id="buildingFilter"><option value="">All buildings</option>${activeBuildings.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label><div id="roomTable" class="tablewrap"></div></div>${user.role==='admin'?`<div class="card"><h2>Scheduled Room Closures</h2><div id="blockTable" class="tablewrap">Loading…</div></div>`:''}`;
  const update=()=>{$('#roomTable').innerHTML=`<table><thead><tr><th>Building</th><th>Room</th><th>Floor</th><th>Type</th><th>Capacity</th><th>Status</th>${user.role==='admin'?'<th>Action</th>':''}</tr></thead><tbody>${rooms.filter(r=>(!$('#buildingFilter').value||r.building_id==$('#buildingFilter').value)).map(r=>`<tr><td>${esc(r.building)}</td><td>${esc(r.room_number)}</td><td>${r.floor}</td><td>${esc(r.kind)}</td><td>${r.capacity}</td><td><span class="pill ${r.active?'approved':'rejected'}">${r.active?'Active':'Unavailable'}</span></td>${user.role==='admin'?`<td><button class="secondary" data-room-toggle="${r.id}">${r.active?'Deactivate':'Reactivate'}</button></td>`:''}</tr>`).join('')}</tbody></table>`;};
  $('#buildingFilter').onchange=update;update();
  if(user.role==='admin'){
    $('#addRoom').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target));for(const k of ['building_id','floor','capacity'])d[k]=Number(d[k]);await request('rooms','POST',d);await load();render();notice('Classroom added');}catch(x){notice(x.message,true);}};
    document.querySelectorAll('[data-room-toggle]').forEach(b=>b.onclick=async()=>{const r=rooms.find(x=>x.id==b.dataset.roomToggle);try{await request('rooms/'+r.id,'PATCH',{active:!r.active});await load();render();notice(r.active?'Classroom deactivated':'Classroom reactivated');}catch(x){notice(x.message,true);}});
    $('#blockRoom').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target));d.room_id=Number(d.room_id);await request('unavailability','POST',d);await renderBlocks();e.target.reset();notice('Room closure saved');}catch(x){notice(x.message,true);}};
    renderBlocks();
  }
}
async function renderBlocks(){const el=$('#blockTable');if(!el)return;try{const d=await request('unavailability');el.innerHTML=d.blocks.length?`<table><thead><tr><th>Date</th><th>Room</th><th>Time</th><th>Reason</th><th></th></tr></thead><tbody>${d.blocks.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.building)} · ${esc(x.room_number)}</td><td>${esc(x.start_time)}–${esc(x.end_time)}</td><td>${esc(x.reason)}</td><td><button class="secondary danger" data-unblock="${x.id}">Remove block</button></td></tr>`).join('')}</tbody></table>`:'No scheduled closures.';document.querySelectorAll('[data-unblock]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this room closure?'))return;try{await request('unavailability/'+b.dataset.unblock,'DELETE');await renderBlocks();notice('Room closure removed');}catch(x){notice(x.message,true);}});}catch(x){el.textContent=x.message;}}


// ADMIN USER MANAGEMENT: create accounts and activate/deactivate them.
function userPage(c) {
  if (user.role !== 'admin')
    return; c.innerHTML = `<div class="card"><h2>Add New User</h2><p class="muted">Creates a real D1 account with a server-side password hash.</p><form id="addUser" class="formgrid"><label class="field">Full name<input name="name" required></label><label class="field">Username<input name="username" pattern="[A-Za-z0-9._-]{3,30}" required></label><label class="field">Password (10+ characters)<input type="password" name="password" minlength="10" required></label><label class="field">Role<select name="role" id="role"><option value="professor">Professor</option><option value="officer">Class Officer</option><option value="admin">Administrator</option></select></label><label class="field officer" style="display:none">Section<input name="section" placeholder="CompTech 3H"></label><label class="field officer" style="display:none">Position<select name="position"><option>Class Mayor</option><option>Vice Mayor</option><option>Secretary</option></select></label><div class="span2"><button class="primary">Create Account</button></div></form></div><div class="card"><h2>Existing Users</h2><div class="tablewrap"><table><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Section</th><th>Status</th><th>Action</th></tr></thead><tbody>${users.map(x => `<tr><td>${esc(x.username)}</td><td>${esc(x.name)}</td><td>${esc(x.position || x.role)}</td><td>${esc(x.section || '—')}</td><td>${x.active ? 'Active' : 'Inactive'}</td><td><button class="secondary" data-reset="${x.id}">Reset password</button> <button class="secondary" data-user="${x.id}" ${x.id === user.id ? 'disabled' : ''}>${x.active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('')}</tbody></table></div></div>`; $('#role').onchange = () => document.querySelectorAll('.officer').forEach(x => x.style.display = $('#role').value === 'officer' ? '' : 'none'); $('#addUser').onsubmit = async (e) => {
      e.preventDefault(); try {
        await request('users', 'POST', Object.fromEntries(new FormData(e.target)));
        await load();
        render();
        notice('Account saved in D1');
      }
        catch (x) {
          notice(x.message, true);
        }
    }; document.querySelectorAll('[data-user]').forEach(b => b.onclick = async () => {
      const x = users.find(v => v.id == b.dataset.user); try {
        await request('users/' + x.id, 'PATCH', { active: !x.active });
        await load();
        render();
        notice('Account updated');
      }
        catch (e) {
          notice(e.message, true);
        }
    });
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
    const x = users.find(v => v.id == b.dataset.reset);
    const password = prompt(`Set a new password for ${x?.username || 'this user'} (at least 10 characters):`);
    if (!password) return;
    if (password.length < 10) return notice('Password must contain at least 10 characters.', true);
    try { await request('users/' + b.dataset.reset, 'PATCH', { password }); await load(); render(); notice('Password reset. The user can now sign in with the new password.'); }
    catch (e) { notice(e.message, true); }
  });
}

// WEEKLY SCHEDULES: admins create official schedules; users view permitted records.
function schedulePage(c) {
  c.innerHTML = `${user.role === 'admin' ? `<div class="card"><h2>Add Official Schedule</h2><form id="addSchedule" class="formgrid"><label class="field">Subject<input name="subject" required placeholder="Database Management Systems"></label><label class="field">Section<input name="section" required placeholder="CompTech 3H"></label><label class="field">Professor<select name="professor_id"><option value="">Unassigned</option>${users.filter(u => u.role === 'professor' && u.active).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label><label class="field">Room<select name="room_id" required>${rooms.map(r => `<option value="${r.id}">${esc(r.building)} · ${esc(r.room_number)}</option>`).join('')}</select></label><label class="field">Day<select name="weekday">${days.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></label><label class="field">Start<input type="time" name="start_time" required value="08:00"></label><label class="field">End<input type="time" name="end_time" required value="09:00"></label><div class="span2"><button class="primary">Save Schedule</button></div></form></div>` : ''}<div class="card"><h2>Weekly Timetable</h2><div class="tablewrap"><table><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Section</th><th>Professor</th><th>Room</th>${user.role === 'admin' ? '<th></th>' : ''}</tr></thead><tbody>${schedules.map(s => `<tr><td>${days[s.weekday]}</td><td>${esc(s.start_time)}–${esc(s.end_time)}</td><td>${esc(s.subject)}</td><td>${esc(s.section)}</td><td>${esc(s.professor || 'Unassigned')}</td><td>${esc(s.building)} ${esc(s.room_number)}</td>${user.role === 'admin' ? `<td><button class="secondary danger" data-del="${s.id}">Delete</button></td>` : ''}</tr>`).join('')}</tbody></table></div></div>`; if (user.role === 'admin') {
    $('#addSchedule').onsubmit = async (e) => {
      e.preventDefault(); try {
        const d = Object.fromEntries(new FormData(e.target));
        d.professor_id = d.professor_id ? Number(d.professor_id) : null;
        await request('schedules', 'POST', d);
        await load();
        render();
        notice('Schedule saved in D1');
      }
        catch (x) {
          notice(x.message, true);
        }
    };
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Delete this schedule?'))
        return; try {
          await request('schedules/' + b.dataset.del, 'DELETE');
          await load();
          render();
          notice('Schedule deleted');
        }
      catch (e) {
        notice(e.message, true);
      }
    });
  }
}

// RESERVATIONS: request rooms and allow admins to approve or reject requests.
function reservationPage(c) {
  const today=new Date().toISOString().slice(0,10);
  const selectedRoom=reservationRoomId||'';
  c.innerHTML=`<div class="card"><h2>Find an Available Classroom</h2><p class="muted">Choose a room and date to see time slots that are not occupied by classes, approved bookings, or room closures.</p><form id="availabilitySearch" class="formgrid"><label class="field">Classroom<select name="room_id" id="reserveRoom" required><option value="">Choose a room</option>${rooms.filter(r=>r.active&&r.kind==='classroom').map(r=>`<option value="${r.id}" ${r.id==selectedRoom?'selected':''}>${esc(r.building)} · ${esc(r.room_number)} (Floor ${r.floor})</option>`).join('')}</select></label><label class="field">Date<input type="date" id="reserveDate" name="date" min="${today}" value="${today}" required></label><div class="span2"><button class="primary" type="submit">Check available times</button></div></form><div id="slotResults" style="margin-top:18px"><p class="muted">Select a room and date to see available times.</p></div><form id="confirmReservation" class="formgrid" style="display:none;margin-top:18px"><input type="hidden" name="room_id"><input type="hidden" name="date"><input type="hidden" name="start_time"><input type="hidden" name="end_time"><label class="field">Section<input name="section" value="${esc(user.section||'')}" ${user.role==='officer'?'readonly':''} required></label><label class="field">Purpose<input name="purpose" placeholder="Make-up class / meeting" required></label><div class="span2"><div id="chosenSlot" class="pill"></div><button class="primary" style="margin-top:10px">Submit Reservation Request</button></div></form></div><div class="card"><h2>Reservation Requests</h2><div class="tablewrap"><table><thead><tr><th>Date</th><th>Time</th><th>Room</th><th>Section</th><th>Purpose</th><th>Requester</th><th>Status</th>${user.role==='admin'?'<th>Review</th>':''}</tr></thead><tbody>${reservations.map(v=>`<tr><td>${esc(v.date)}</td><td>${esc(v.start_time)}–${esc(v.end_time)}</td><td>${esc(v.building)} ${esc(v.room_number)}</td><td>${esc(v.section)}</td><td>${esc(v.purpose)}</td><td>${esc(v.requester)}</td><td><span class="pill ${esc(v.status)}">${esc(v.status)}</span></td>${user.role==='admin'?`<td>${v.status==='pending'?`<button class="secondary" data-review="${v.id}" data-status="approved">Approve</button> <button class="secondary danger" data-review="${v.id}" data-status="rejected">Reject</button>`:'—'}</td>`:''}</tr>`).join('')}</tbody></table></div></div>`;
  async function check(){const roomId=$('#reserveRoom').value,date=$('#reserveDate').value;$('#confirmReservation').style.display='none';if(!roomId||!date)return;const box=$('#slotResults');box.textContent='Checking availability…';try{const d=await request(`availability?room_id=${encodeURIComponent(roomId)}&date=${encodeURIComponent(date)}`);const open=d.slots.filter(s=>s.available);box.innerHTML=`<h3>Available times</h3><p class="muted">${open.length} available one-hour slots · ${esc(date)}</p>${open.length?`<div class="slot-grid">${open.map(s=>`<button type="button" class="slot-button" data-slot-start="${s.start_time}" data-slot-end="${s.end_time}">${s.start_time}–${s.end_time}</button>`).join('')}</div>`:'<div class="alert">No available time slots for this date. Try another date or classroom.</div>'}<details style="margin-top:12px"><summary class="muted">Why are other times unavailable?</summary><p class="note">Unavailable periods include official weekly classes, approved reservations, and administrator room closures.</p></details>`;box.querySelectorAll('[data-slot-start]').forEach(b=>b.onclick=()=>{box.querySelectorAll('.slot-button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');const f=$('#confirmReservation');f.style.display='grid';f.elements.room_id.value=roomId;f.elements.date.value=date;f.elements.start_time.value=b.dataset.slotStart;f.elements.end_time.value=b.dataset.slotEnd;$('#chosenSlot').textContent=`Selected: ${b.dataset.slotStart}–${b.dataset.slotEnd}`;});}catch(x){box.innerHTML=`<div class="alert">${esc(x.message)}</div>`;}}
  $('#availabilitySearch').onsubmit=e=>{e.preventDefault();check();};$('#reserveRoom').onchange=check;$('#reserveDate').onchange=check;if(selectedRoom)check();
  $('#confirmReservation').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target));await request('reservations','POST',d);reservationRoomId=null;await load();render();notice('Reservation request submitted. It will appear as pending until reviewed.');}catch(x){notice(x.message,true);check();}};
  document.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{try{await request('reservations/'+b.dataset.review,'PATCH',{status:b.dataset.status});await load();render();notice('Request reviewed');}catch(x){notice(x.message,true);}});
}

// CAMPUS EXPLORER UI: building selector, floors, and rooms.
function campus(c) {
  c.innerHTML = `<div class="campus-layout"><div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h2 style="margin:0">UniSpace 3D Campus Explorer</h2><div class="note">Drag to rotate • Scroll to zoom • Click a building</div></div><button class="secondary" id="backCampus">← Campus Overview</button></div><div class="scene" id="scene"><div class="fallback">Loading interactive campus…</div></div><p class="note">Building positions follow your hand-drawn sketch approximately. Interiors are simplified 3D visualizations.</p></div><div class="card"><h2 id="selTitle">Select a building</h2><p class="muted" id="selDesc">Choose a building on the 3D map or use the list below.</p><label class="field">Building<select id="selectBuilding"><option value="">Choose a building</option>${buildings.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label><div id="floorPicker" style="margin:15px 0"></div><div id="roomPicker" class="roomchips"></div><div id="roomInfo" style="margin-top:14px"></div></div></div>`; $('#selectBuilding').onchange = e => {
    const b = buildings.find(x => x.id == e.target.value); if (b)
      chooseBuilding(b);
  }; $('#backCampus').onclick = () => { selected = null; view = 'campus'; floor = 1; $('#selectBuilding').value = ''; $('#selTitle').textContent = 'Select a building'; $('#selDesc').textContent = 'Choose a building to explore its floors.'; $('#floorPicker').innerHTML = ''; $('#roomPicker').innerHTML = ''; $('#roomInfo').innerHTML = ''; draw3d(); }; draw3d();
}

// CAMPUS EXPLORER STATE: selects a building and displays its floors.
function chooseBuilding(b) { selected = b; floor = 1; view = 'building'; $('#selectBuilding').value = b.id; $('#selTitle').textContent = b.name; $('#selDesc').textContent = `${b.floors} floor${b.floors > 1 ? 's' : ''} • ${rooms.filter(r => r.building_id === b.id).length} registered rooms`; updateFloors(); draw3d(); }

// CAMPUS EXPLORER STATE: lists rooms for the selected floor.
function updateFloors() {
  if (!selected)
    return; $('#floorPicker').innerHTML = Array.from({ length: selected.floors }, (_, i) => `<button class="secondary floorbtn ${floor === i + 1 ? 'active' : ''}" data-floor="${i + 1}" style="margin:3px">Floor ${i + 1}</button>`).join(''); document.querySelectorAll('[data-floor]').forEach(b => b.onclick = () => { floor = Number(b.dataset.floor); view = 'building'; updateFloors(); draw3d(); }); const list = rooms.filter(r => r.building_id === selected.id && r.floor === floor); $('#roomPicker').innerHTML = list.length ? list.map(r => `<button data-room="${r.id}">${esc(r.room_number)}</button>`).join('') : 'No classrooms recorded on this floor.'; document.querySelectorAll('[data-room]').forEach(b => b.onclick = () => {
      const r = rooms.find(x => x.id == b.dataset.room); view = 'room'; $('#roomInfo').innerHTML = `<div class="card" style="background:#f4f5eb"><b>${esc(selected.name)} · ${esc(r.room_number)}</b><div class="muted">Floor ${r.floor} · ${esc(r.kind)} · Capacity ${r.capacity}</div><div style="margin-top:12px">${r.active?'<span class="pill approved">Available for booking</span>':'<span class="pill rejected">Unavailable</span>'}</div><button class="primary" id="requestThis" style="margin-top:10px" ${!r.active?'disabled':''}>Check dates & available times</button></div>`; $('#requestThis').onclick = () => {
        reservationRoomId = r.id; page = 'reservations'; render();
      }; draw3d();
    });
}

// THREE.JS RENDERING: the 3D scene is loaded from a hosted Three.js module.
let THREE = null;
async function ensureThree() {
  if (THREE)
    return THREE; THREE = await import('https://esm.sh/three@0.160.1'); return THREE;
}
async function draw3d() {
  const holder = $('#scene');
  if (!holder) return;
  holder.innerHTML = '<div class="fallback">Loading UniSpace 3D campus…</div>';
  try {
    const T = await ensureThree();
    if (!document.contains(holder)) return;
    const scene = new T.Scene();
    scene.background = new T.Color('#e8eee4');
    scene.fog = new T.Fog('#e8eee4', 65, 145);
    const camera = new T.PerspectiveCamera(40, 1, .1, 260);
    const renderer = new T.WebGLRenderer({antialias:true, alpha:false});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
    renderer.outputColorSpace=T.SRGBColorSpace; renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12;
    holder.innerHTML=''; holder.appendChild(renderer.domElement);
    scene.add(new T.HemisphereLight(0xf5f7ed,0x657c65,2.1));
    const sun=new T.DirectionalLight(0xfff1d7,3.1); sun.position.set(-28,42,25); sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-42,right:42,top:42,bottom:-42}); scene.add(sun);
    const clickable=[];
    const material=(color,roughness=.82,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
    const cream=material('#f0eadb'), ivory=material('#fff9ed'), green=material('#285b43'), deepGreen=material('#17432f'), red=material('#a72f36'), gold=material('#e4b83f'), glass=material('#8bb8bd',.25,.12), roof=material('#536d5a'), concrete=material('#aaa99b'), asphalt=material('#b8b6a8'), lawn=material('#a8c39b');
    function mesh(geo,mat,x,y,z,meta=null,cast=true){const o=new T.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=cast;o.receiveShadow=true;scene.add(o);if(meta){o.userData=meta;clickable.push(o);}return o;}
    function box(w,h,d,mat,x,y,z,meta=null){return mesh(new T.BoxGeometry(w,h,d),typeof mat==='string'?material(mat):mat,x,y,z,meta);}
    function tree(x,z,scale=1){mesh(new T.CylinderGeometry(.12*scale,.18*scale,.8*scale,8),material('#76563d'),x,.4*scale,z);mesh(new T.SphereGeometry(.62*scale,14,11),material('#477c51'),x,1.02*scale,z);mesh(new T.SphereGeometry(.4*scale,12,9),material('#6d9b68'),x-.2*scale,1.3*scale,z-.08*scale);}
    function gableRoof(x,z,w,d,y,color=roof){
      const left=box(w*.72,.22,d+.3,color,x-w*.18,y,z); left.rotation.z=-.34;
      const right=box(w*.72,.22,d+.3,color,x+w*.18,y,z); right.rotation.z=.34;
      box(.18,.28,d+.35,ivory,x,y+.18,z);
      box(w+.2,.12,.16,green,x,y-.03,z+d/2);
    }
    // Hand-drawn layout: top row Pancho/CBA/Hangar; middle MPG/Admin/Canteen; bottom Infirmary/Activity/Study.
    const layout={'Pancho Hall':[-13,-12],'CBA':[0,-12],'Hangar':[13,-12],'MPG':[-13,0],'Administration':[0,0],'Old Canteen':[13,0],'Infirmary':[-13,12],'Activity Center':[0,12],'Study Area':[13,12]};
    const positions=b=>layout[b.name]||[Number(b.map_x)||0,Number(b.map_z)||0];
    box(54,.55,48,lawn,0,-.48,0);
    // Main campus paths and a central green courtyard.
    box(54,.10,2.7,asphalt,0,-.18,0); box(2.7,.11,48,asphalt,0,-.16,0);
    box(11,.08,7,material('#d9d2bd'),0,-.12,0);
    for(let i=-2;i<=2;i++){box(1.35,.08,.12,ivory,i*2.0,-.055,0);}
    // Decorative grass beds, hedges, benches, lamp posts.
    for(const [x,z] of [[-7,-5],[7,-5],[-7,5],[7,5]]){box(3,.12,2.2,material('#78966b'),x,-.08,z);for(let j=0;j<3;j++)tree(x-0.8+j*.8,z,.42);}
    for(const [x,z] of [[-24,-19],[0,-21],[24,-19],[-24,0],[24,0],[-24,19],[0,21],[24,19],[-7,-20],[7,20]])tree(x,z,.82);
    function addWindow(x,y,z,scale=1){box(.66*scale,.88*scale,.075,ivory,x,y,z);box(.48*scale,.68*scale,.045,glass,x,y,z+.045);box(.06,.72*scale,.07,green,x,y,z+.075);}
    function building(b){
      const [x,z]=positions(b), name=b.name.toLowerCase(), id={building:b.id};
      const floors=Math.max(1,Number(b.floors)||1);
      let w=7.1,d=5.1,fh=2.55,style='academic';
      if(name.includes('pancho')){w=9.4;d=5.6;style='hall';}
      else if(name==='cba'){w=8.0;d=5.4;style='cba';}
      else if(name.includes('hangar')){w=9.2;d=7.0;fh=3.0;style='hangar';}
      else if(name.includes('mpg')){w=7.8;d=4.8;style='mpg';}
      else if(name.includes('administration')){w=7.0;d=5.3;style='admin';}
      else if(name.includes('canteen')){w=6.8;d=5.1;fh=2.7;style='canteen';}
      else if(name.includes('infirmary')){w=6.4;d=4.8;style='medical';}
      else if(name.includes('activity')){w=9.5;d=8.0;fh=3.1;style='activity';}
      else if(name.includes('study')){w=6.5;d=5.0;style='study';}
      const total=floors*fh;
      // Raised foundation, plinth and ground apron.
      box(w+.9,.38,d+.9,concrete,x,.02,z,id); box(w+.35,.16,d+.35,ivory,x,.29,z);
      if(style==='hangar'||style==='activity'){
        // Open-span pavilion with visible structural columns and arched metal roof.
        for(const sx of [-1,1])for(let k=0;k<5;k++){const zz=z-d/2+k*(d/4);box(.24,fh*1.9,.24,green,x+sx*(w/2-.18),fh*.92,zz,id);}
        for(let f=0;f<Math.max(1,floors);f++){
          const yy=.38+f*fh;box(w,.18,d,cream,x,yy,z);
          for(let k=0;k<8;k++){const xx=x-w/2+.6+k*(w-1.2)/7;box(.10,.12,.10,gold,xx,yy+fh*1.65,z-d/2);}
        }
        const arch=mesh(new T.CylinderGeometry(d*.68,d*.68,.28,32,1,true,0,Math.PI),material(style==='hangar'?'#667a70':'#4d7058'),x,total+1.0,z);arch.rotation.z=Math.PI/2;arch.scale.set(1,w/d,1);
        for(let k=0;k<9;k++){const xx=x-w/2+.35+k*(w-.7)/8;const rib=mesh(new T.TorusGeometry(d*.66,.055,7,32,Math.PI),material('#d8d3c3'),xx,total+1.03,z);rib.rotation.y=Math.PI/2;rib.scale.set(1,1,.72);}
      } else {
        for(let f=0;f<floors;f++){
          const y=.38+f*fh+fh/2;
          box(w,fh-.06,d,cream,x,y,z,id);
          // Green horizontal floor bands and corner pilasters.
          box(w+.12,.13,d+.12,green,x,.38+f*fh+.12,z);
          for(const sx of [-1,1])for(const sz of [-1,1])box(.20,fh-.08,.20,ivory,x+sx*(w/2-.12),y,z+sz*(d/2-.12));
          const count=Math.max(5,Math.floor(w/1.05));
          for(let k=0;k<count;k++){const xx=x-w/2+.65+k*(w-1.3)/(count-1);addWindow(xx,y,z+d/2+.055,.92);addWindow(xx,y,z-d/2-.055,.92);}
          // End-wall windows and continuous balcony ledges for multi-storey blocks.
          for(const side of [-1,1])for(let k=0;k<3;k++){const zz=z-d/2+.75+k*(d-1.5)/2;box(.08,.85,.55,glass,x+side*(w/2+.045),y,zz);}
          if(f>0){box(w-.45,.12,.55,concrete,x,y-.55,z+d/2+.22);box(w-.45,.07,.07,green,x,y-.20,z+d/2+.48);}
        }
        // BulSU-inspired vertical red/yellow facade accents on academic blocks.
        if(['hall','cba','admin'].includes(style)){box(.48,total+.1,.16,red,x+w*.30,total/2+.36,z+d/2+.12);box(.20,total+.1,.18,gold,x+w*.30+.34,total/2+.36,z+d/2+.14);}
        // Entrance glass, portico, steps and signage panel.
        box(1.35,1.9,.12,glass,x,.98,z+d/2+.09);box(.10,2.0,.16,green,x-.76,1,z+d/2+.10);box(.10,2.0,.16,green,x+.76,1,z+d/2+.10);
        box(2.5,.16,1.05,red,x,2.05,z+d/2+.52);box(2.7,.12,1.15,ivory,x,2.16,z+d/2+.52);
        for(let st=0;st<3;st++)box(2.9-st*.22,.12,.36,concrete,x,.28+st*.12,z+d/2+.88+st*.30);
        if(style==='study'){
          // Open-sided shaded study pavilion.
          for(let sx of [-1,1])for(let sz of [-1,1])box(.16,2.4,.16,green,x+sx*(w/2-.15),1.5,z+sz*(d/2-.15));
          box(w+.25,.18,d+.25,green,x,2.75,z);
        } else gableRoof(x,z,w,d,total+.38,roof);
      }
      // Forecourt, small planted beds and facade name plate.
      box(2.9,.13,.16,ivory,x,.56,z+d/2+.2);box(2.5,.07,.07,green,x,.56,z+d/2+.30);
      for(const side of [-1,1]){const tx=x+side*(w/2+.9),tz=z+d/2+.65;box(.9,.12,.9,material('#78966b'),tx,.02,tz);tree(tx,tz,.58);}
    }
    if(view==='campus'){
      buildings.forEach(building);
      camera.position.set(39,33,44);camera.lookAt(0,1.2,0);
    } else if(view==='building') {
      const b=selected, list=rooms.filter(r=>r.building_id===b.id&&Number(r.floor)===Number(floor));
      const cols=list.length>18?6:list.length>10?5:4, rows=Math.max(1,Math.ceil(list.length/cols));
      const cellW=2.8,cellD=2.65, width=cols*cellW+.8,depth=rows*cellD+2.4;
      box(width,.34,depth,lawn,0,-.15,0);box(width-.5,.20,depth-.5,material('#e8dfce'),0,.12,0);
      // Three-sided cutaway walls leave the room layout visible from the camera.
      box(width,.22,.22,green,0,1.7,-depth/2+.1);box(.22,1.8,depth,green,-width/2+.1,.95,0);box(.22,1.8,depth,green,width/2-.1,.95,0);
      // A visible corridor strip separates room banks where the building has enough rooms.
      if(rows>1)box(width-.6,.06,.85,material('#d1c7ad'),0,.27,0);
      list.forEach((r,i)=>{
        const col=i%cols,row=Math.floor(i/cols),xx=-width/2+cellW/2+.4+col*cellW,zz=-depth/2+cellD/2+.8+row*cellD,meta={room:r.id};
        box(cellW-.16,.14,cellD-.16,ivory,xx,.34,zz,meta);
        box(cellW-.16,1.65,.12,cream,xx,1.18,zz-cellD/2+.08,meta);
        box(.12,1.65,cellD-.16,cream,xx-cellW/2+.08,1.18,zz,meta);
        box(.12,1.65,cellD-.16,cream,xx+cellW/2-.08,1.18,zz,meta);
        // Door opening represented by a dark green inset and room label plaque.
        box(.78,1.35,.08,green,xx,.98,zz+cellD/2-.05,meta);
        box(1.05,.08,.10,gold,xx,1.86,zz-cellD/2+.12);
        box(1.2,.08,.65,material('#b78f63'),xx,.48,zz-.2);
      });
      camera.position.set(width*.95,depth*.85,width*1.15);camera.lookAt(0,.9,0);
    } else {
      // Room-level view: furnished classroom with a front teaching wall.
      box(15,.3,11,material('#e8dfce'),0,-.12,0);box(15,4.4,.22,cream,0,2,-5.4);box(.22,4.4,11,cream,-7.4,2,0);box(.22,4.4,11,cream,7.4,2,0);
      box(4.8,1.7,.14,material('#315c49'),0,2.3,-5.22);box(2.0,.18,.75,material('#9c7652'),0,1.0,-3.7);
      for(let row=0;row<3;row++)for(let col=0;col<4;col++){const x=-5+col*3.3,z=-2+row*2.25;box(1.55,.14,.78,material('#bd956a'),x,1,z);box(.12,.92,.12,material('#755a43'),x-.65,.52,z);box(.12,.92,.12,material('#755a43'),x+.65,.52,z);box(1.0,.12,.72,material('#527a59'),x,.68,z+.83);}
      camera.position.set(11,9,15);camera.lookAt(0,1.4,0);
    }
    const ray=new T.Raycaster(),pointer=new T.Vector2();let dragging=false,moved=false,last=null,az=0,el=.62,dist=45,target=new T.Vector3(0,view==='room'?1.4:1,0);
    const initial=camera.position.clone();dist=initial.distanceTo(target);az=Math.atan2(initial.x-target.x,initial.z-target.z);el=Math.asin((initial.y-target.y)/dist);
    function updateCamera(){camera.position.set(target.x+dist*Math.sin(az)*Math.cos(el),target.y+dist*Math.sin(el),target.z+dist*Math.cos(az)*Math.cos(el));camera.lookAt(target);}
    const down=e=>{dragging=true;moved=false;last={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture?.(e.pointerId);};
    const move=e=>{if(!dragging||!last)return;const dx=e.clientX-last.x,dy=e.clientY-last.y;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;az-=dx*.006;el=Math.max(.12,Math.min(1.35,el+dy*.005));last={x:e.clientX,y:e.clientY};updateCamera();};
    const up=e=>{if(!dragging)return;dragging=false;last=null;if(moved)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(clickable,false)[0];if(hit){const bid=hit.object.userData.building,rid=hit.object.userData.room;if(bid){const b=buildings.find(v=>v.id===bid);if(b)chooseBuilding(b);}if(rid)document.querySelector(`[data-room="${rid}"]`)?.click();}};
    const wheel=e=>{e.preventDefault();dist=Math.max(8,Math.min(100,dist+e.deltaY*.035));updateCamera();};
    renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);renderer.domElement.addEventListener('wheel',wheel,{passive:false});
    let alive=true;const resize=()=>{if(!document.contains(holder)){alive=false;renderer.dispose();return;}const w=Math.max(1,holder.clientWidth),h=Math.max(1,holder.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
    const loop=()=>{if(!alive||!document.contains(holder)){renderer.dispose();return;}resize();renderer.render(scene,camera);requestAnimationFrame(loop);};resize();loop();
  } catch(e) { console.error('UniSpace 3D error:',e);holder.innerHTML='<div class="fallback"><p><b>3D view could not load.</b><br>Use an internet connection and a browser with WebGL enabled.</p></div>'; }
}
(async () => {
  if (!token)
    return loginScreen(); try {
      user = (await request('me')).user;
      await load();
      render();
    }
  catch (e) {
    token = '';
    sessionStorage.removeItem('unispace_token');
    loginScreen();
  }
})();

// Paste this complete script into the campusspace-api Worker editor.
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const enc=new TextEncoder();
const hex=buf=>[...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
async function hashPassword(password,salt,iterations=100000){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations},key,256));}
function err(message,status=400){return json({error:message},status)}
function validTime(s){return /^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')}
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))}
async function read(req){try{return await req.json()}catch{return {}}}
const publicUser=u=>({id:u.id,username:u.username,name:u.full_name,role:u.role,section:u.section,position:u.position,active:!!u.active});
async function getAuth(req,db){const match=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization')||'');if(!match)return null;const hash=await digest(match[1]);return db.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.active=1").bind(hash).first();}
async function collision(db,room,date,start,end,section,professor,skip=0){const weekday=new Date(date+'T12:00:00Z').getUTCDay();const r=await db.prepare(`SELECT 1 FROM schedules WHERE weekday=? AND start_time<? AND end_time>? AND (room_id=? OR section=? OR (? IS NOT NULL AND professor_id=?)) LIMIT 1`).bind(weekday,end,start,room,section,professor,professor).first();if(r)return true;const a=await db.prepare(`SELECT 1 FROM reservations WHERE date=? AND start_time<? AND end_time>? AND status='approved' AND id<>? AND (room_id=? OR section=?) LIMIT 1`).bind(date,end,start,skip,room,section).first();if(a)return true;const blocked=await db.prepare(`SELECT 1 FROM room_unavailability WHERE room_id=? AND date=? AND start_time<? AND end_time>? LIMIT 1`).bind(room,date,end,start).first();return !!blocked;}
export default {async fetch(req,env){
 const origin=req.headers.get('origin')||'';const allowed=(env.ALLOWED_ORIGIN||'').replace(/\/$/,'');
 const cors=origin&&origin===allowed?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'Content-Type, Authorization, X-Setup-Secret','access-control-allow-methods':'GET, POST, PATCH, DELETE, OPTIONS'}:{};
 if(req.method==='OPTIONS')return new Response(null,{status:origin===allowed?204:403,headers:cors});
 const send=(obj,status=200)=>json(obj,status,cors);const fail=(msg,status=400)=>send({error:msg},status);
 if(origin&&origin!==allowed)return fail('Website origin is not allowed. Set ALLOWED_ORIGIN in Worker settings.',403);
 if(!env.DB)return fail('D1 binding DB is missing',500);
 const db=env.DB,url=new URL(req.url),path=url.pathname;
 try{
  if(path==='/api/health')return send({ok:true,database:'D1',websiteOrigin:allowed?'configured':'missing'});
  if(path==='/api/setup'&&req.method==='POST'){
   if(!env.BOOTSTRAP_SECRET||req.headers.get('x-setup-secret')!==env.BOOTSTRAP_SECRET)return fail('Setup secret is missing or incorrect',403);
   const count=await db.prepare('SELECT COUNT(*) AS n FROM users').first();if(count.n>0)return fail('Initial administrator already exists',409);
   const d=await read(req);if(!/^[a-zA-Z0-9._-]{3,30}$/.test(d.username||'')||!d.password||d.password.length<10||!d.name)return fail('Username, name, and password (10+ characters) required');
   const salt=random(),hash=await hashPassword(d.password,salt);
   await db.prepare('INSERT INTO users(username,full_name,role,salt,password_hash,iterations) VALUES(?,?,?,?,?,100000)').bind(d.username.trim(),d.name.trim(),'admin',salt,hash).run();return send({ok:true,message:'Initial admin created. Disable or rotate BOOTSTRAP_SECRET after setup.'},201);
  }
  if(path==='/api/login'&&req.method==='POST'){
   const d=await read(req);const u=await db.prepare('SELECT * FROM users WHERE username=? AND active=1').bind(String(d.username||'').trim()).first();
   if(!u||!d.password||await hashPassword(d.password,u.salt,u.iterations)!==u.password_hash)return fail('Invalid username or password',401);
   const token=random(),hash=await digest(token);await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+8 hours'))").bind(hash,u.id).run();return send({token,user:publicUser(u)});
  }
  const u=await getAuth(req,db);if(!u)return fail('Please sign in',401);
  if(path==='/api/me'&&req.method==='GET')return send({user:publicUser(u)});
  if(path==='/api/logout'&&req.method==='POST'){const token=(req.headers.get('authorization')||'').slice(7);await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();return send({ok:true});}
  if(path==='/api/buildings'&&req.method==='GET')return send({buildings:(await db.prepare('SELECT * FROM buildings ORDER BY id').all()).results});
  if(path==='/api/rooms'&&req.method==='GET'){
   const id=Number(url.searchParams.get('building_id'));let query='SELECT r.*,b.name AS building FROM rooms r JOIN buildings b ON b.id=r.building_id WHERE 1=1';const args=[];if(u.role!=='admin')query+=' AND r.active=1';if(id){query+=' AND r.building_id=?';args.push(id)}query+=' ORDER BY b.id,r.floor,r.room_number';return send({rooms:(await db.prepare(query).bind(...args).all()).results});
  }
  if(path==='/api/rooms'&&req.method==='POST'){
   if(u.role!=='admin')return fail('Admin only',403);const d=await read(req);const building=Number(d.building_id),floor=Number(d.floor),capacity=Number(d.capacity||40);
   if(!building||!d.room_number||!Number.isInteger(floor)||floor<1||!Number.isInteger(capacity)||capacity<0||!['classroom','laboratory','audiovisual','library','office','facility'].includes(d.kind||'classroom'))return fail('Provide a building, room number, valid floor, capacity and room type');
   const b=await db.prepare('SELECT floors FROM buildings WHERE id=?').bind(building).first();if(!b||floor>b.floors)return fail('Selected floor does not exist in this building');
   try{const r=await db.prepare('INSERT INTO rooms(building_id,room_number,floor,capacity,kind,active) VALUES(?,?,?,?,?,1)').bind(building,String(d.room_number).trim(),floor,capacity,d.kind||'classroom').run();return send({ok:true,id:r.meta.last_row_id},201)}catch(e){if(String(e).includes('UNIQUE'))return fail('That room already exists in this building',409);throw e}
  }
  if(/^\/api\/rooms\/\d+$/.test(path)&&req.method==='PATCH'){
   if(u.role!=='admin')return fail('Admin only',403);const id=Number(path.split('/').pop()),d=await read(req);const room=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(id).first();if(!room)return fail('Room not found',404);
   if(typeof d.active==='boolean')await db.prepare('UPDATE rooms SET active=? WHERE id=?').bind(d.active?1:0,id).run();
   const capacity=d.capacity===undefined?room.capacity:Number(d.capacity);const kind=d.kind===undefined?room.kind:d.kind;
   if(!Number.isInteger(capacity)||capacity<0||!['classroom','laboratory','audiovisual','library','office','facility'].includes(kind))return fail('Invalid room details');
   if(d.capacity!==undefined||d.kind!==undefined)await db.prepare('UPDATE rooms SET capacity=?,kind=? WHERE id=?').bind(capacity,kind,id).run();
   return send({ok:true});
  }
  if(path==='/api/availability'&&req.method==='GET'){
   const roomId=Number(url.searchParams.get('room_id')),date=url.searchParams.get('date');if(!roomId||!validDate(date))return fail('Choose a room and valid date');
   const room=await db.prepare('SELECT id FROM rooms WHERE id=? AND active=1').bind(roomId).first();if(!room)return fail('Room is unavailable',404);
   const weekday=new Date(date+'T12:00:00Z').getUTCDay();
   const [classes,bookings,blocks]=await Promise.all([
    db.prepare('SELECT start_time,end_time,subject AS label FROM schedules WHERE room_id=? AND weekday=?').bind(roomId,weekday).all(),
    db.prepare("SELECT start_time,end_time,purpose AS label FROM reservations WHERE room_id=? AND date=? AND status='approved'").bind(roomId,date).all(),
    db.prepare('SELECT start_time,end_time,reason AS label FROM room_unavailability WHERE room_id=? AND date=?').bind(roomId,date).all()
   ]);
   const busy=[...classes.results.map(x=>({...x,type:'class'})),...bookings.results.map(x=>({...x,type:'reservation'})),...blocks.results.map(x=>({...x,type:'blocked'}))];
   const slots=[];for(let h=8;h<18;h++){const start=String(h).padStart(2,'0')+':00',end=String(h+1).padStart(2,'0')+':00';const conflict=busy.some(x=>x.start_time<end&&x.end_time>start);slots.push({start_time:start,end_time:end,available:!conflict});}
   return send({room_id:roomId,date,busy,slots});
  }
  if(path==='/api/unavailability'&&req.method==='GET'){
   const roomId=Number(url.searchParams.get('room_id'));let q=`SELECT x.*,r.room_number,b.name AS building FROM room_unavailability x JOIN rooms r ON r.id=x.room_id JOIN buildings b ON b.id=r.building_id`;const args=[];if(roomId){q+=' WHERE x.room_id=?';args.push(roomId)}q+=' ORDER BY x.date,x.start_time';return send({blocks:(await db.prepare(q).bind(...args).all()).results});
  }
  if(path==='/api/unavailability'&&req.method==='POST'){
   if(u.role!=='admin')return fail('Admin only',403);const d=await read(req);if(!d.room_id||!validDate(d.date)||!validTime(d.start_time)||!validTime(d.end_time)||d.start_time>=d.end_time||!d.reason)return fail('Provide room, date, valid time range and reason');
   const r=await db.prepare('SELECT id FROM rooms WHERE id=? AND active=1').bind(d.room_id).first();if(!r)return fail('Active room not found',404);
   const id=await db.prepare('INSERT INTO room_unavailability(room_id,date,start_time,end_time,reason,created_by) VALUES(?,?,?,?,?,?)').bind(d.room_id,d.date,d.start_time,d.end_time,d.reason,u.id).run();return send({ok:true,id:id.meta.last_row_id},201);
  }
  if(/^\/api\/unavailability\/\d+$/.test(path)&&req.method==='DELETE'){
   if(u.role!=='admin')return fail('Admin only',403);await db.prepare('DELETE FROM room_unavailability WHERE id=?').bind(Number(path.split('/').pop())).run();return send({ok:true});
  }
  if(path==='/api/users'&&req.method==='GET'){
   if(u.role!=='admin')return fail('Admin only',403);return send({users:(await db.prepare('SELECT id,username,full_name AS name,role,section,position,active FROM users ORDER BY id').all()).results});
  }
  if(path==='/api/users'&&req.method==='POST'){
   if(u.role!=='admin')return fail('Admin only',403);const d=await read(req);
   if(!/^[a-zA-Z0-9._-]{3,30}$/.test(d.username||'')||!d.name||!d.password||d.password.length<10||!['admin','professor','officer'].includes(d.role))return fail('Provide valid username, full name, role and password of at least 10 characters');
   if(d.role==='officer'&&(!d.section||!['Class Mayor','Vice Mayor','Secretary'].includes(d.position)))return fail('Officer section and position required');
   const salt=random(),hash=await hashPassword(d.password,salt);try{const r=await db.prepare('INSERT INTO users(username,full_name,role,section,position,salt,password_hash,iterations) VALUES(?,?,?,?,?,?,?,100000)').bind(d.username.trim(),d.name.trim(),d.role,d.role==='officer'?d.section.trim():null,d.role==='officer'?d.position:null,salt,hash).run();return send({ok:true,id:r.meta.last_row_id},201)}catch(e){if(String(e).includes('UNIQUE'))return fail('Username already exists',409);throw e}
  }
  if(/^\/api\/users\/\d+$/.test(path)&&req.method==='PATCH'){
   if(u.role!=='admin')return fail('Admin only',403);const id=Number(path.split('/').pop()),d=await read(req);if(id===u.id&&d.active===false)return fail('Cannot deactivate your own account');
   const old=await db.prepare('SELECT id FROM users WHERE id=?').bind(id).first();if(!old)return fail('Account not found',404);
   if(typeof d.active==='boolean')await db.prepare('UPDATE users SET active=? WHERE id=?').bind(d.active?1:0,id).run();
   if(typeof d.password==='string'&&d.password.length>=10){const salt=random(),hash=await hashPassword(d.password,salt,100000);await db.prepare('UPDATE users SET salt=?,password_hash=?,iterations=100000 WHERE id=?').bind(salt,hash,id).run();}
   else if(d.password!==undefined)return fail('New password must contain at least 10 characters');
   return send({ok:true});
  }
  if(path==='/api/schedules'&&req.method==='GET'){
   let q=`SELECT s.*,r.room_number,b.name AS building,p.full_name AS professor FROM schedules s JOIN rooms r ON r.id=s.room_id JOIN buildings b ON b.id=r.building_id LEFT JOIN users p ON p.id=s.professor_id`;const args=[];
   if(u.role==='professor'){q+=' WHERE s.professor_id=?';args.push(u.id)}if(u.role==='officer'){q+=' WHERE s.section=?';args.push(u.section)}q+=' ORDER BY s.weekday,s.start_time';return send({schedules:(await db.prepare(q).bind(...args).all()).results});
  }
  if(path==='/api/schedules'&&req.method==='POST'){
   if(u.role!=='admin')return fail('Admin only',403);const d=await read(req);if(!d.subject||!d.section||!Number.isInteger(Number(d.room_id))||!Number.isInteger(Number(d.weekday))||Number(d.weekday)<0||Number(d.weekday)>6||!validTime(d.start_time)||!validTime(d.end_time)||d.start_time>=d.end_time)return fail('Invalid schedule fields');
   const overlaps=await db.prepare('SELECT id FROM schedules WHERE weekday=? AND start_time<? AND end_time>? AND (room_id=? OR section=? OR (? IS NOT NULL AND professor_id=?)) LIMIT 1').bind(d.weekday,d.end_time,d.start_time,d.room_id,d.section,d.professor_id||null,d.professor_id||null).first();if(overlaps)return fail('Conflicting recurring schedule',409);
   const r=await db.prepare('INSERT INTO schedules(subject,section,professor_id,room_id,weekday,start_time,end_time) VALUES(?,?,?,?,?,?,?)').bind(d.subject,d.section,d.professor_id||null,d.room_id,d.weekday,d.start_time,d.end_time).run();return send({ok:true,id:r.meta.last_row_id},201);
  }
  if(/^\/api\/schedules\/\d+$/.test(path)&&req.method==='DELETE'){if(u.role!=='admin')return fail('Admin only',403);await db.prepare('DELETE FROM schedules WHERE id=?').bind(Number(path.split('/').pop())).run();return send({ok:true});}
  if(path==='/api/reservations'&&req.method==='GET'){
   let q=`SELECT v.*,r.room_number,b.name AS building,x.full_name AS requester FROM reservations v JOIN rooms r ON r.id=v.room_id JOIN buildings b ON b.id=r.building_id JOIN users x ON x.id=v.requested_by`;const args=[];
   if(u.role==='professor'){q+=' WHERE v.requested_by=?';args.push(u.id)}if(u.role==='officer'){q+=' WHERE v.section=?';args.push(u.section)}q+=' ORDER BY v.created_at DESC';return send({reservations:(await db.prepare(q).bind(...args).all()).results});
  }
  if(path==='/api/reservations'&&req.method==='POST'){
   const d=await read(req);if(!d.room_id||!validDate(d.date)||!validTime(d.start_time)||!validTime(d.end_time)||d.start_time>=d.end_time||!d.purpose||!d.section)return fail('Invalid reservation fields');
   if(u.role==='officer'&&d.section!==u.section)return fail('You can only request for your section',403);
   const room=await db.prepare('SELECT id FROM rooms WHERE id=? AND active=1').bind(d.room_id).first();if(!room)return fail('Room not found',404);
   if(await collision(db,d.room_id,d.date,d.start_time,d.end_time,d.section,u.role==='professor'?u.id:null))return fail('Conflict with an official schedule or approved reservation',409);
   const r=await db.prepare('INSERT INTO reservations(room_id,requested_by,section,purpose,date,start_time,end_time) VALUES(?,?,?,?,?,?,?)').bind(d.room_id,u.id,d.section,d.purpose,d.date,d.start_time,d.end_time).run();return send({ok:true,id:r.meta.last_row_id},201);
  }
  if(/^\/api\/reservations\/\d+$/.test(path)&&req.method==='PATCH'){
   if(u.role!=='admin')return fail('Admin only',403);const id=Number(path.split('/').pop()),d=await read(req);if(!['approved','rejected'].includes(d.status))return fail('Invalid status');
   const v=await db.prepare('SELECT v.*,x.role AS requester_role FROM reservations v JOIN users x ON x.id=v.requested_by WHERE v.id=?').bind(id).first();if(!v)return fail('Request not found',404);if(v.status!=='pending')return fail('Already reviewed',409);
   if(d.status==='approved'&&await collision(db,v.room_id,v.date,v.start_time,v.end_time,v.section,v.requester_role==='professor'?v.requested_by:null,id))return fail('Conflict found; cannot approve',409);
   await db.prepare("UPDATE reservations SET status=?,reviewed_by=? WHERE id=? AND status='pending'").bind(d.status,u.id,id).run();return send({ok:true});
  }
  return fail('Endpoint not found',404);
 }catch(e){console.error(e);return fail('Server error. Check Worker logs and D1 schema.',500)}
}};

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, 'public');
const routes = {
  '/': 'index.html',
  '/apresentacao': 'pages/apresentacao.html',
  '/venda': 'pages/venda.html',
  '/login': 'pages/login.html',
  '/admin/login': 'pages/admin-login.html'
};
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const COOKIE = 'forgelab_admin';
const SESSION_SECONDS = 8 * 60 * 60;

function send(res, status, body, headers={}) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});
  res.end(JSON.stringify(body));
}
function parseCookies(header='') {
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('='); return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))];
  }));
}
function safeEqual(a,b) {
  const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function sessionSecret() {
  const s=process.env.ADMIN_SESSION_SECRET || '';
  return s.length>=32 ? s : null;
}
function sign(payload) {
  const secret=sessionSecret();
  if(!secret) return null;
  const data=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function validSession(req) {
  const token=parseCookies(req.headers.cookie||'')[COOKIE];
  const secret=sessionSecret();
  if(!token || !secret) return false;
  const [data,sig]=token.split('.');
  if(!data || !sig) return false;
  const expected=crypto.createHmac('sha256',secret).update(data).digest('base64url');
  if(!safeEqual(sig,expected)) return false;
  try {
    const payload=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
    return payload.email===process.env.ADMIN_EMAIL && Number(payload.exp)>Math.floor(Date.now()/1000);
  } catch { return false; }
}
function readJson(req) {
  return new Promise((resolve,reject)=>{
    let raw=''; req.on('data',chunk=>{raw+=chunk;if(raw.length>16_384){reject(new Error('Payload muito grande'));req.destroy();}});
    req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('JSON inválido'));}});
    req.on('error',reject);
  });
}
function serveFile(req,res,file) {
  const full=path.resolve(root,file);
  if(!full.startsWith(root+path.sep) && full!==path.join(root,'index.html')) {res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(full,(err,data)=>{
    if(err){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('Arquivo não encontrado');}
    res.writeHead(200,{'content-type':types[path.extname(full)]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','cache-control':'no-store'});
    res.end(data);
  });
}
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/health') return send(res,200,{ok:true,app:'ForgeLab Studio',mode:'portal',adminConfigured:Boolean(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD&&sessionSecret())});
  if(url.pathname==='/api/admin/login' && req.method==='POST') {
    try {
      const {email,password}=await readJson(req);
      const configured=Boolean(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD&&sessionSecret());
      if(!configured) return send(res,503,{error:'A autenticação administrativa não está configurada. Defina ADMIN_EMAIL, ADMIN_PASSWORD e ADMIN_SESSION_SECRET (mínimo 32 caracteres).'});
      if(!safeEqual(String(email||'').trim().toLowerCase(),String(process.env.ADMIN_EMAIL).trim().toLowerCase()) || !safeEqual(password||'',process.env.ADMIN_PASSWORD)) return send(res,401,{error:'Credenciais inválidas.'});
      const token=sign({email:process.env.ADMIN_EMAIL,exp:Math.floor(Date.now()/1000)+SESSION_SECONDS});
      const secure=(req.headers['x-forwarded-proto']==='https')?' Secure;':'';
      return send(res,200,{ok:true},{'set-cookie':`${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS};${secure}`});
    } catch { return send(res,400,{error:'Solicitação inválida.'}); }
  }
  if(url.pathname==='/api/admin/session') return validSession(req)?send(res,200,{authenticated:true}):send(res,401,{authenticated:false});
  if(url.pathname==='/api/admin/logout' && req.method==='POST') {
    const secure=(req.headers['x-forwarded-proto']==='https')?' Secure;':'';
    return send(res,200,{ok:true},{'set-cookie':`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0;${secure}`});
  }
  if(url.pathname==='/admin') {
    if(!validSession(req)){res.writeHead(302,{location:'/admin/login','cache-control':'no-store'});return res.end();}
    return serveFile(req,res,'pages/admin.html');
  }
  if(url.pathname==='/api/admin' || url.pathname.startsWith('/api/admin/')) return send(res,404,{error:'Endpoint administrativo não encontrado.'});
  let file=routes[url.pathname];
  if(!file && url.pathname.startsWith('/assets/')) file=url.pathname.slice(1);
  if(!file){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('Página não encontrada');}
  return serveFile(req,res,file);
}).listen(process.env.PORT||4173,()=>console.log(`ForgeLab Studio: http://localhost:${process.env.PORT||4173}`));

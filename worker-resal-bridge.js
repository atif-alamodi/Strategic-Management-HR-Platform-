/* ============================================================
   HR Strategic Proxy — Worker
   SECURE bridge to the JISR HR API (resal.jisr.net tenant).
   Keys are read from encrypted environment Secrets only.

   JISR Open API base:  https://apis.jisr.net/api
   Auth model: TOKEN EXCHANGE
     1) POST api key/secret to the auth endpoint -> get access_token
     2) Call employee endpoints with  Authorization: Bearer <access_token>

   Employee Open APIs that JISR exposes (NO update, NO delete exist):
     GET   list employees
     GET   one employee basic info
     POST  create employee

   SECRETS (Cloudflare > Settings > Variables and Secrets):
     RESAL_BASE        default https://apis.jisr.net/api   (no trailing slash)
     RESAL_API_KEY     = HxesJSA3lJV08OKFRQuqjA
     RESAL_API_SECRET  = BvAjBTBBGmX5kef41Lj8dw
     RESAL_AUTH_MODE   = token   (recommended for Jisr) | keysecret | bearer | basic
     RESAL_AUTH_PATH   default /v2/auth/access_token   (confirm from openapi.jisr.net)
     RESAL_EMP_PATH    default /v2/employees           (list + create)
     RESAL_EMP_ONE_PATH default <RESAL_EMP_PATH>/{id}   (one employee)

   Front-end routes (unchanged for the client):
     GET   /resal/employees        -> list
     POST  /resal/employees        -> create
     GET   /resal/employee/{id}    -> one
   ============================================================ */

const ALLOW_ORIGIN = "https://atif-alamodi.github.io";
const DEFAULT_BASE = "https://apis.jisr.net/api";

function cors(extra){
  return Object.assign({
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  }, extra||{});
}
function J(obj, status){ return new Response(JSON.stringify(obj), {status:status||200, headers:cors()}); }

function baseOf(env){ return ((env.RESAL_BASE || DEFAULT_BASE) || "").replace(/\/+$/,""); }
function collPath(env){ return env.RESAL_EMP_PATH || "/v2/employees"; }
function onePath(env, id){
  const t = env.RESAL_EMP_ONE_PATH || (collPath(env) + "/{id}");
  return t.replace("{id}", encodeURIComponent(id));
}

/* ---- TOKEN EXCHANGE: get a Jisr access token from key/secret ---- */
async function getToken(env){
  const base = baseOf(env);
  const path = env.RESAL_AUTH_PATH || "/v2/auth/access_token";
  const key = env.RESAL_API_KEY || "";
  const secret = env.RESAL_API_SECRET || "";
  /* send common field-name variants so it works regardless of Jisr's exact naming */
  const body = JSON.stringify({
    api_key:key, api_secret:secret,
    key:key, secret:secret,
    apiKey:key, apiSecret:secret,
    client_id:key, client_secret:secret
  });
  let r;
  try { r = await fetch(base+path, {method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"}, body}); }
  catch(e){ return {error:true, status:502, text:"auth fetch failed: "+String(e)}; }
  const txt = await r.text();
  if(!r.ok) return {error:true, status:r.status, text:"AUTH FAILED at "+path+" -> "+txt};
  let d; try{ d=JSON.parse(txt); }catch(e){ return {error:true, status:502, text:"auth response not JSON: "+txt}; }
  const token = d.access_token || d.token || d.accessToken || (d.data&&(d.data.access_token||d.data.token)) || (d.result&&d.result.access_token);
  if(!token) return {error:true, status:502, text:"no token field in auth response: "+txt};
  return {token};
}

/* Build headers for the actual employee call */
async function resalHeaders(env){
  const mode = (env.RESAL_AUTH_MODE || "token").toLowerCase();
  const key = env.RESAL_API_KEY || "";
  const secret = env.RESAL_API_SECRET || "";
  const h = { "Accept":"application/json", "Content-Type":"application/json" };
  if(mode === "token"){
    const t = await getToken(env);
    if(t.error) return {error:t};
    h["Authorization"] = "Bearer " + t.token;
    return {headers:h};
  }
  if(mode === "bearer"){ h["Authorization"]="Bearer "+key; if(secret)h["X-API-Secret"]=secret; return {headers:h}; }
  if(mode === "basic"){ h["Authorization"]="Basic "+btoa(key+":"+secret); return {headers:h}; }
  /* keysecret */
  h["X-API-Key"]=key; h["X-API-Secret"]=secret; h["api-key"]=key; h["api-secret"]=secret;
  return {headers:h};
}

async function forward(env, fullUrl, method, bodyText){
  const hh = await resalHeaders(env);
  if(hh.error) return J({error:"resal auth error", detail:hh.error.text, status:hh.error.status}, hh.error.status||502);
  const init = { method, headers: hh.headers };
  if(bodyText && (method==="POST"||method==="PUT"||method==="PATCH")) init.body = bodyText;
  let up;
  try { up = await fetch(fullUrl, init); }
  catch(e){ return J({error:"upstream fetch failed", detail:String(e)}, 502); }
  const text = await up.text();
  return new Response(text, { status: up.status, headers: cors() });
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    const m = request.method;
    if(m === "OPTIONS") return new Response(null, { headers: cors() });
    const base = baseOf(env);

    if(url.pathname === "/resal/employees"){
      const target = base + collPath(env);
      if(m === "GET")  return forward(env, target, "GET");
      if(m === "POST") return forward(env, target, "POST", await request.text());
      return J({error:"Method not allowed"}, 405);
    }
    if(url.pathname.startsWith("/resal/employee/")){
      const id = decodeURIComponent(url.pathname.split("/resal/employee/")[1] || "");
      if(!id) return J({error:"missing id"}, 400);
      const target = base + onePath(env, id);
      if(m === "GET")    return forward(env, target, "GET");
      if(m === "POST")   return forward(env, target, "POST", await request.text());
      /* PUT/DELETE forwarded too, but note: Jisr Open API does not expose them */
      if(m === "PUT")    return forward(env, target, "PUT", await request.text());
      if(m === "DELETE") return forward(env, target, "DELETE");
      return J({error:"Method not allowed"}, 405);
    }

    /* ============================================================
       KEEP YOUR EXISTING AI-PROXY LOGIC BELOW (paste it here).
       Everything above is additive.
       ============================================================ */

    return J({error:"Not found"}, 404);
  }
};

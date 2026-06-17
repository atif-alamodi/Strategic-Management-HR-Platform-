/* ============================================================
   HR Strategic Proxy — Worker
   SECURE bridge to the Resal HR API with FULL data control (CRUD).
   Keys are read from encrypted environment Secrets (never in code,
   never sent to the browser).

   SECRETS (Cloudflare dashboard > Settings > Variables and Secrets):
     RESAL_BASE         e.g. https://api.resal.me   (base URL, NO trailing slash)
     RESAL_API_KEY      = HxesJSA3lJV08OKFRQuqjA
     RESAL_API_SECRET   = BvAjBTBBGmX5kef41Lj8dw
     RESAL_AUTH_MODE    = keysecret | bearer | basic   (default: keysecret)
     RESAL_EMP_PATH     (optional) collection path, default /employees
     RESAL_EMP_ONE_PATH (optional) single-record template, default <RESAL_EMP_PATH>/{id}

   Front-end routes:
     GET    <worker>/resal/employees        -> list
     POST   <worker>/resal/employees        -> create   (JSON body forwarded)
     GET    <worker>/resal/employee/{id}     -> get one
     PUT    <worker>/resal/employee/{id}     -> update   (JSON body forwarded)
     DELETE <worker>/resal/employee/{id}     -> delete
   ============================================================ */

const ALLOW_ORIGIN = "https://atif-alamodi.github.io";

function cors(extra){
  return Object.assign({
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  }, extra||{});
}

function resalHeaders(env){
  const key = env.RESAL_API_KEY || "";
  const secret = env.RESAL_API_SECRET || "";
  const mode = (env.RESAL_AUTH_MODE || "keysecret").toLowerCase();
  const h = { "Accept": "application/json", "Content-Type": "application/json" };
  if (mode === "bearer") {
    h["Authorization"] = "Bearer " + key;
    if (secret) h["X-API-Secret"] = secret;
  } else if (mode === "basic") {
    h["Authorization"] = "Basic " + btoa(key + ":" + secret);
  } else {
    h["X-API-Key"] = key;
    h["X-API-Secret"] = secret;
    h["api-key"] = key;
    h["api-secret"] = secret;
  }
  return h;
}

function collPath(env){ return env.RESAL_EMP_PATH || "/employees"; }
function onePath(env, id){
  const t = env.RESAL_EMP_ONE_PATH || (collPath(env) + "/{id}");
  return t.replace("{id}", encodeURIComponent(id));
}

/* Forward any method to Resal, pass through status + body verbatim */
async function forward(env, fullUrl, method, bodyText){
  const init = { method: method, headers: resalHeaders(env) };
  if (bodyText && (method === "POST" || method === "PUT" || method === "PATCH")) {
    init.body = bodyText;
  }
  let up;
  try { up = await fetch(fullUrl, init); }
  catch(e){ return new Response(JSON.stringify({error:"upstream fetch failed", detail:String(e)}), {status:502, headers:cors()}); }
  const text = await up.text();
  return new Response(text, { status: up.status, headers: cors() });
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    const m = request.method;

    if (m === "OPTIONS") return new Response(null, { headers: cors() });

    const base = (env.RESAL_BASE || "").replace(/\/+$/,"");

    /* ---- Collection: list + create ---- */
    if (url.pathname === "/resal/employees") {
      if (!base) return new Response(JSON.stringify({error:"RESAL_BASE secret is not set"}), {status:500, headers:cors()});
      const target = base + collPath(env);
      if (m === "GET")  return forward(env, target, "GET");
      if (m === "POST") return forward(env, target, "POST", await request.text());
      return new Response(JSON.stringify({error:"Method not allowed"}), {status:405, headers:cors()});
    }

    /* ---- Single record: get / update / delete ---- */
    if (url.pathname.startsWith("/resal/employee/")) {
      if (!base) return new Response(JSON.stringify({error:"RESAL_BASE secret is not set"}), {status:500, headers:cors()});
      const id = decodeURIComponent(url.pathname.split("/resal/employee/")[1] || "");
      if (!id) return new Response(JSON.stringify({error:"missing id"}), {status:400, headers:cors()});
      const target = base + onePath(env, id);
      if (m === "GET")    return forward(env, target, "GET");
      if (m === "PUT")    return forward(env, target, "PUT", await request.text());
      if (m === "PATCH")  return forward(env, target, "PATCH", await request.text());
      if (m === "DELETE") return forward(env, target, "DELETE");
      return new Response(JSON.stringify({error:"Method not allowed"}), {status:405, headers:cors()});
    }

    /* ============================================================
       KEEP YOUR EXISTING AI-PROXY LOGIC BELOW.
       Paste the body of your current default fetch handler here
       (the part that forwards chat requests to the AI model).
       Everything above is additive and does not affect it.
       ============================================================ */

    return new Response(JSON.stringify({error:"Not found"}), { status:404, headers:cors() });
  }
};

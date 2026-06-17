/* ============================================================
   HR Strategic Proxy — Worker
   Adds a SECURE bridge to the Resal HR API.
   Keys are read from encrypted environment Secrets (never in code,
   never sent to the browser).

   SECRETS to set in Cloudflare dashboard (Settings > Variables > Add secret):
     RESAL_BASE        e.g. https://api.resal.me   (the API base URL, NO trailing slash)
     RESAL_API_KEY     = HxesJSA3lJV08OKFRQuqjA
     RESAL_API_SECRET  = BvAjBTBBGmX5kef41Lj8dw
     RESAL_AUTH_MODE   = one of: keysecret | bearer | basic   (default: keysecret)
     RESAL_EMP_PATH    (optional) e.g. /v1/employees   (default: /employees)

   The front-end calls:  GET  <worker>/resal/employees
   ============================================================ */

const ALLOW_ORIGIN = "https://atif-alamodi.github.io";

function cors(extra){
  return Object.assign({
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  }, extra||{});
}

/* Build auth headers for Resal based on the chosen mode */
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
  } else { /* keysecret (default) */
    h["X-API-Key"] = key;
    h["X-API-Secret"] = secret;
    h["api-key"] = key;        // some gateways use lowercase
    h["api-secret"] = secret;
  }
  return h;
}

async function handleResalEmployees(env){
  const base = (env.RESAL_BASE || "").replace(/\/+$/,"");
  if (!base) {
    return new Response(JSON.stringify({error:"RESAL_BASE secret is not set"}), {status:500, headers:cors()});
  }
  const path = env.RESAL_EMP_PATH || "/employees";
  const url = base + path;
  let upstream;
  try {
    upstream = await fetch(url, { method:"GET", headers: resalHeaders(env) });
  } catch(e) {
    return new Response(JSON.stringify({error:"upstream fetch failed", detail:String(e)}), {status:502, headers:cors()});
  }
  const text = await upstream.text();
  /* Pass through status + body so the front-end can normalize or show the exact error */
  return new Response(text, { status: upstream.status, headers: cors() });
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    /* ---- Resal bridge route ---- */
    if (url.pathname === "/resal/employees") {
      return handleResalEmployees(env);
    }

    /* ============================================================
       KEEP YOUR EXISTING AI-PROXY LOGIC BELOW.
       If your current Worker already has a default fetch handler,
       paste its body here (the part that forwards to the AI model).
       Everything above is additive and does not change it.
       ============================================================ */

    return new Response(JSON.stringify({error:"Not found"}), { status:404, headers:cors() });
  }
};

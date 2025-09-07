// js/api.js (file:// でも動く非モジュール版)
(function(global){
  const CFG = global.APP_CONFIG || {};

  function withTimeout(promise, ms){
    ms = ms || CFG.TIMEOUT_MS || 10000;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      promise.then(v => { clearTimeout(t); resolve(v); },
                   e => { clearTimeout(t); reject(e); });
    });
  }

  // 将来用：例) const cats = await apiGet('/cats');
  async function apiGet(path){
    const base = CFG.API_BASE_URL || "";
    const url = base + path;
    const res = await withTimeout(fetch(url, { credentials: "include" }));
    if(!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function apiPost(path, body){
    const base = CFG.API_BASE_URL || "";
    const url = base + path;
    const res = await withTimeout(fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    }));
    if(!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // グローバル公開（windowにぶら下げ）
  global.apiGet  = apiGet;
  global.apiPost = apiPost;
})(window);

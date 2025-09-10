// js/gemini_client.js
// ブラウザから Gemini を呼ぶための小さなクライアント（UMD）
// - APIキーは "x-goog-api-key" ヘッダーで送信（CORS安定）
// - ping(): 軽い接続テスト（"OK" 応答確認）
// - generate(prompt, opt): 本文生成（詳細エラーを返す）
(function(root){
  const CFG = root.APP_CONFIG || {};
  const BASE = "https://generativelanguage.googleapis.com/v1beta";

  function withTimeout(promise, ms){
    return new Promise((resolve, reject)=>{
      const t = setTimeout(()=>reject(new Error("timeout")), ms|| (CFG.TIMEOUT_MS||15000));
      promise.then(v=>{clearTimeout(t); resolve(v);}, e=>{clearTimeout(t); reject(e);});
    });
  }

  async function call(model, body, {signal}={}){
    const key = (CFG.GEMINI && CFG.GEMINI.API_KEY) || CFG.GEMINI_API_KEY || "";
    if(!key) throw Object.assign(new Error("NO_API_KEY"), {code:"NO_API_KEY"});
    const url = `${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    const res = await withTimeout(fetch(url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify(body),
      signal
    }), CFG.TIMEOUT_MS||15000);
    if(!res.ok){
      const text = await res.text().catch(()=> "");
      let reason = `HTTP ${res.status}`;
      try{
        const j = JSON.parse(text||"{}");
        reason = (j.error && (j.error.message || j.error.status)) || reason;
      }catch(_){}
      const err = new Error(reason);
      err.code = "HTTP_"+res.status;
      err.detail = text;
      throw err;
    }
    return res.json();
  }

  async function ping(){
    const model = (CFG.GEMINI && CFG.GEMINI.MODEL) || "gemini-1.5-flash";
    const body = {
      contents: [{ role: "user", parts: [{ text: "返事はOKだけ" }]}],
      generationConfig: { maxOutputTokens: 2, temperature: 0 }
    };
    const ctl = new AbortController();
    const j = await call(model, body, {signal: ctl.signal});
    const txt = (j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")||"").trim();
    return /(^|\s)OK(\s|$)/i.test(txt);
  }

  async function generate(prompt, opt={}){
    const model = (CFG.GEMINI && CFG.GEMINI.MODEL) || "gemini-1.5-flash";
    const generationConfig = {
      temperature: opt.temperature ?? (CFG.GEMINI && CFG.GEMINI.TEMPERATURE) ?? 1.0,
      maxOutputTokens: opt.maxTokens ?? (CFG.GEMINI && CFG.GEMINI.MAX_TOKENS) ?? 400,
      topK: 40, topP: 0.95
    };
    const body = { contents: [{ role: "user", parts:[{ text: prompt }]}], generationConfig };
    // 簡易リトライ（429/5xx/timeout）: 最大2回
    let lastErr = null;
    for(let i=0;i<3;i++){
      try{
        const j = await call(model, body, {});
        const txt = (j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("")||"").trim();
        if(txt) return { ok:true, text:txt };
        lastErr = Object.assign(new Error("EMPTY"), {code:"EMPTY"});
      }catch(e){
        lastErr = e;
        if(!/^(HTTP_429|HTTP_5|timeout)/.test(String(e.code||e.message))) break;
        await new Promise(r=> setTimeout(r, 600*(i+1)));
      }
    }
    return { ok:false, error:lastErr };
  }

  const api = { ping, generate };
  if(typeof module !== "undefined" && module.exports){ module.exports = api; }
  else{ root.GeminiClient = api; }
})(typeof window!=="undefined" ? window : globalThis);

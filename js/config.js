// js/config.js — 環境とAI設定（DeepSeek / GAS経由、POSTのみ）
(function (global) {
  const UNIFIED_NS = "necotubu_v1";

  // ★あなたの最新の GAS WebアプリURL（/exec）
  const GAS_PROXY_URL =
    "https://script.google.com/macros/s/AKfycbxdeol8qw53KTQtUMz1DqvGZjSqmszXOb5VqKQS0-LqAsMoPRycT026N7G_21qM9cCD/exec";

  // 画面側キーは使わない（GASで保持）→ダミー
  const DEFAULT_GEMINI_API_KEY = "via-gas";

  const ENVS = {
    dev:  { NAME:"dev",  API_BASE_URL:GAS_PROXY_URL, TIMEOUT_MS:12000,
      FEATURE_FLAGS:{ diaryAutoSave:true }, STORAGE_NS:UNIFIED_NS,
      FIREBASE:{ apiKey:"",authDomain:"",projectId:"",storageBucket:"",messagingSenderId:"",appId:"" },
      ALLOWLIST_EMAILS:[], BETA_PASSCODE:"nekotubu-beta",
      GEMINI:{ API_KEY:DEFAULT_GEMINI_API_KEY, MODEL:"deepseek-chat", MAX_TOKENS:240, TEMPERATURE:1.05 }
    },
    stg:  { NAME:"stg",  API_BASE_URL:GAS_PROXY_URL, TIMEOUT_MS:12000,
      FEATURE_FLAGS:{ diaryAutoSave:true }, STORAGE_NS:UNIFIED_NS,
      FIREBASE:{ apiKey:"",authDomain:"",projectId:"",storageBucket:"",messagingSenderId:"",appId:"" },
      ALLOWLIST_EMAILS:["syonn@mac.com","syonn3@gmail.com"], BETA_PASSCODE:"nekotubu-beta",
      GEMINI:{ API_KEY:"", MODEL:"deepseek-chat", MAX_TOKENS:240, TEMPERATURE:1.05 }
    },
    prod: { NAME:"prod", API_BASE_URL:GAS_PROXY_URL, TIMEOUT_MS:12000,
      FEATURE_FLAGS:{ diaryAutoSave:true }, STORAGE_NS:UNIFIED_NS,
      FIREBASE:{ apiKey:"",authDomain:"",projectId:"",storageBucket:"",messagingSenderId:"",appId:"" },
      ALLOWLIST_EMAILS:[], BETA_PASSCODE:"",
      GEMINI:{ API_KEY:DEFAULT_GEMINI_API_KEY, MODEL:"deepseek-chat", MAX_TOKENS:240, TEMPERATURE:1.05 }
    }
  };

  function detectEnv(){
    try{
      const q=(new URLSearchParams(location.search||"").get("env")||"").toLowerCase();
      if(q && ENVS[q]) return q;
      const h=(location.hostname||"").toLowerCase();
      if (h==="localhost"||h==="127.0.0.1"||h==="0.0.0.0"||location.protocol==="file:") return "dev";
      if (h.includes("-stg")||h.startsWith("stg.")||h.startsWith("beta.")) return "stg";
      return "prod";
    }catch(_){ return "prod"; }
  }

  const ENV = ENVS[detectEnv()];

  global.APP_CONFIG = {
    ENV: ENV.NAME,
    API_BASE_URL: ENV.API_BASE_URL,
    TIMEOUT_MS: ENV.TIMEOUT_MS,
    FEATURE_FLAGS: ENV.FEATURE_FLAGS,
    STORAGE_NS: ENV.STORAGE_NS,
    FIREBASE: ENV.FIREBASE,
    ALLOWLIST_EMAILS: ENV.ALLOWLIST_EMAILS,
    BETA_PASSCODE: ENV.BETA_PASSCODE,
    GEMINI: ENV.GEMINI
  };

  // 旧コード互換
  global.APP_CONFIG.GEMINI_API_KEY = ENV.GEMINI.API_KEY || "";
  global.APP_CONFIG.GEMINI_MODEL   = ENV.GEMINI.MODEL   || "deepseek-chat";
})(window);

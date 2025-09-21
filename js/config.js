// js/config.js — 環境切り替え＋招待制ベータ＋AI設定（GAS経由 DeepSeek 用）
(function (global) {
  const UNIFIED_NS = "necotubu_v1"; // 写真やデータを環境間で共通化

  // ★ ここにあなたの GAS Web アプリ URL（※ 末尾に /exec は付けない）
  //    例: https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXXXXXX
  const GAS_PROXY_URL = "https://script.google.com/macros/s/AKfycbyhPOO5mLoVXMV1Zgds9MfFVkaWZ3SUFy-_ER690RTlUNHRnUHh9gQX3LIAkJrGIa0h";

  // ★ ダミー値（画面側のキー→必ず GAS を経由するため実際の鍵は GAS 側）
  const DEFAULT_GEMINI_API_KEY = "via-gas";

  const ENVS = {
    dev: {
      NAME: "dev",
      // ← 開発用に別の GAS を使うならここに（※ /exec を付けない）
      API_BASE_URL: "https://script.google.com/macros/s/AKfycbxdeol8qw53KTQtUMz1DqvGZjSqmszXOb5VqKQS0-LqAsMoPRycT026N7G_21qM9cCD",
      TIMEOUT_MS: 15000,
      FEATURE_FLAGS: { diaryAutoSave: true },
      STORAGE_NS: UNIFIED_NS,
      FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
      ALLOWLIST_EMAILS: [],
      BETA_PASSCODE: "nekotubu-beta",
      GEMINI: {
        API_KEY: DEFAULT_GEMINI_API_KEY, // ※ 実際の呼び出しは GAS 経由
        MODEL: "deepseek-chat",          // DeepSeek 側のモデル名
        MAX_TOKENS: 400,
        TEMPERATURE: 1.05
      }
    },
    stg: {
      NAME: "stg",
      // ベータ運用：共通の GAS を利用（※ /exec を付けない）
      API_BASE_URL: GAS_PROXY_URL,
      TIMEOUT_MS: 15000,
      FEATURE_FLAGS: { diaryAutoSave: true },
      STORAGE_NS: UNIFIED_NS,
      FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
      ALLOWLIST_EMAILS: ["syonn@mac.com","syonn3@gmail.com"],
      BETA_PASSCODE: "nekotubu-beta",
      GEMINI: {
        API_KEY: "",                 // （空＝フロント直叩き無効。GAS経由のみ）
        MODEL: "deepseek-chat",
        MAX_TOKENS: 400,
        TEMPERATURE: 1.05
      }
    },
    prod: {
      NAME: "prod",
      // 本番：共通の GAS を利用（※ /exec を付けない）
      API_BASE_URL: GAS_PROXY_URL,
      TIMEOUT_MS: 15000,
      FEATURE_FLAGS: { diaryAutoSave: true },
      STORAGE_NS: UNIFIED_NS,
      FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
      ALLOWLIST_EMAILS: [],
      BETA_PASSCODE: "",
      GEMINI: {
        API_KEY: DEFAULT_GEMINI_API_KEY, // フロント直叩きは行わず、GAS経由のダミー
        MODEL: "deepseek-chat",
        MAX_TOKENS: 400,
        TEMPERATURE: 1.05
      }
    },
  };

  function detectEnv() {
    try {
      const params = new URLSearchParams(location.search || "");
      const q = (params.get("env") || "").toLowerCase();
      if (q && ENVS[q]) return q;

      const h = (location.hostname || "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || location.protocol === "file:") return "dev";
      if (h.includes("-stg") || h.startsWith("stg.") || h.startsWith("beta.")) return "stg";
      return "prod"; // GitHub Pages は通常こちら
    } catch (e) {
      return "prod";
    }
  }

  const ENV_NAME = detectEnv();
  const ENV = ENVS[ENV_NAME];

  // ここから外に出す（ブラウザからは APP_CONFIG のみ見える）
  global.APP_CONFIG = {
    ENV: ENV.NAME,
    API_BASE_URL: ENV.API_BASE_URL, // ※ 末尾に /exec は含まない
    TIMEOUT_MS: ENV.TIMEOUT_MS,
    FEATURE_FLAGS: ENV.FEATURE_FLAGS,
    STORAGE_NS: ENV.STORAGE_NS,
    FIREBASE: ENV.FIREBASE,
    ALLOWLIST_EMAILS: ENV.ALLOWLIST_EMAILS,
    BETA_PASSCODE: ENV.BETA_PASSCODE,
    GEMINI: ENV.GEMINI
  };

  // 既存コードとの両対応用エイリアス
  global.APP_CONFIG.GEMINI_API_KEY = (global.APP_CONFIG.GEMINI && global.APP_CONFIG.GEMINI.API_KEY) || "";
  global.APP_CONFIG.GEMINI_MODEL   = (global.APP_CONFIG.GEMINI && global.APP_CONFIG.GEMINI.MODEL)   || "deepseek-chat";

})(window);

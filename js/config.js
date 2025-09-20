// js/config.js — 環境切り替え＋招待制ベータ＋AI設定（GAS経由 DeepSeek 用）

(function (global) {
  const UNIFIED_NS = "necotubu_v1"; // 写真やデータを環境間で共通化

  // ★ ここにあなたの GAS Webアプリ URL を入れてください（例： https://script.google.com/macros/s/XXXX/exec ）
  const GAS_PROXY_URL = "https://script.google.com/macros/s/AKfycbySkia8sw6eDqT4HjVIet5I7eMvjTsf5vgHvyniP389AF93shdjSmqdrp7W5oYhlrjF/exec";

  // ★ ダミー値（画面側の“キー必須ガード”を通すため）。実際の鍵は GAS 側にあります
  const DEFAULT_GEMINI_API_KEY = "via-gas";

  const ENVS = {
    dev: {
      NAME: "dev",
      API_BASE_URL: https://script.google.com/macros/s/AKfycbyeouSzRziHF0Pu-UU4oQR7vQ7lyMozBkcw3D1bWKvMkqTxMY8oUE9jNvyOuEZmyMBW/exec,
      TIMEOUT_MS: 15000,
      FEATURE_FLAGS: { diaryAutoSave: true },
      STORAGE_NS: UNIFIED_NS,
      FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
      ALLOWLIST_EMAILS: [],
      BETA_PASSCODE: "nekotubu-beta",
      GEMINI: {
        API_KEY: DEFAULT_GEMINI_API_KEY,   // ← 実際は使われません（GASに隠蔽）
        MODEL: "deepseek-chat",            // ← DeepSeek 側のモデル名に合わせる
        MAX_TOKENS: 400,
        TEMPERATURE: 1.05
      }
    },
    stg: {
      NAME: "stg",
      API_BASE_URL: GAS_PROXY_URL,
      TIMEOUT_MS: 15000,
      FEATURE_FLAGS: { diaryAutoSave: true },
      STORAGE_NS: UNIFIED_NS,
      FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
      ALLOWLIST_EMAILS: ["syonn@mac.com","syonn3@gmail.com"],
      BETA_PASSCODE: "nekotubu-beta",
      GEMINI: {
        API_KEY: DEFAULT_GEMINI_API_KEY,   // ← ダミー
        MODEL: "deepseek-chat",
        MAX_TOKENS: 400,
        TEMPERATURE: 1.05
      }
    },
    prod: {
      NAME: "prod",
      API_BASE_URL: GAS_PROXY_URL,
      TIMEOUT_MS: 15000,
      FEATURE_FLAGS: { diaryAutoSave: true },
      STORAGE_NS: UNIFIED_NS,
      FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
      ALLOWLIST_EMAILS: [],
      BETA_PASSCODE: "",
      GEMINI: {
        API_KEY: DEFAULT_GEMINI_API_KEY,   // ← ダミー
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
      // 127.0.0.1 / 0.0.0.0 / file: は dev 扱い
      if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || location.protocol === "file:") return "dev";
      if (h.includes("-stg") || h.startsWith("stg.") || h.startsWith("beta.")) return "stg";
      return "prod"; // GitHub Pages などは通常こちら
    } catch (e) {
      return "prod";
    }
  }

  const ENV_NAME = detectEnv();
  const ENV = ENVS[ENV_NAME];

  // ここから外に出す（ブラウザからは APP_CONFIG のみ見える）
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

  // 既存コードとの互換：別名も用意
  global.APP_CONFIG.GEMINI_API_KEY = (global.APP_CONFIG.GEMINI && global.APP_CONFIG.GEMINI.API_KEY) || "";
  global.APP_CONFIG.GEMINI_MODEL   = (global.APP_CONFIG.GEMINI && global.APP_CONFIG.GEMINI.MODEL)   || "deepseek-chat";

})(window);

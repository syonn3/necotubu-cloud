// js/config.js — 環境切り替え＋招待制ベータ＋Gemini API 設定（完成版）
(function (global) {
  const UNIFIED_NS = "necotubu_v1"; // ← どの環境でも同じにして写真などが消えないよう統一

  const ENVS = {
    dev: {
      NAME: "dev",
      API_BASE_URL: "",
      TIMEOUT_MS: 15000,
      FEATURE_FLAGS: { diaryAutoSave: true },
      STORAGE_NS: UNIFIED_NS,
      FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
      ALLOWLIST_EMAILS: [],
      BETA_PASSCODE: "nekotubu-beta",
      GEMINI: {
        // ★ご提供いただいたキー（ローカル検証用）
        API_KEY: "AIzaSyC2R3Bi2AFbAfkbHzn0nrAz-GJ_BHTaQTI",
        MODEL: "gemini-1.5-flash",
        MAX_TOKENS: 400,
        TEMPERATURE: 1.05
      }
    },
    stg: {
      NAME: "stg",
      API_BASE_URL: "",
      TIMEOUT_MS: 15000,
      FEATURE_FLAGS: { diaryAutoSave: true },
      STORAGE_NS: UNIFIED_NS,
      FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
      ALLOWLIST_EMAILS: [
        "syonn@mac.com",
        "syonn3@gmail.com"
      ],
      BETA_PASSCODE: "nekotubu-beta",
      GEMINI: {
        API_KEY: "", // ← ベータ用に分けたい場合はここに入れてください
        MODEL: "gemini-1.5-flash",
        MAX_TOKENS: 400,
        TEMPERATURE: 1.05
      }
    },
    prod: {
      NAME: "prod",
      API_BASE_URL: "",
      TIMEOUT_MS: 15000,
      FEATURE_FLAGS: { diaryAutoSave: true },
      STORAGE_NS: UNIFIED_NS,
      FIREBASE: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
      ALLOWLIST_EMAILS: [],
      BETA_PASSCODE: "",
      GEMINI: {
        // 本番でも同じキーで検証できるよう暫定で投入（分けるなら空にして後で差し替え）
        API_KEY: "AIzaSyC2R3Bi2AFbAfkbHzn0nrAz-GJ_BHTaQTI",
        MODEL: "gemini-1.5-flash",
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
      // ★ 127.0.0.1 / 0.0.0.0 / file: でも dev 判定にする
      if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || location.protocol === "file:") return "dev";
      if (h.includes("-stg") || h.startsWith("stg.") || h.startsWith("beta.")) return "stg";
      return "prod";
    } catch (e) {
      return "prod";
    }
  }

  const ENV_NAME = detectEnv();
  const ENV = ENVS[ENV_NAME];

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
})(window);

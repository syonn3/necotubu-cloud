// js/local_generator.js
// ------------------------------------------------------------
// necotubu: Transformers.js local (on-device) text generation
// - Safe by default: No API keys here
// - Works on old devices (CPU fallback) and new (WebGPU)
// - Model is configurable via window.NECOTUBU_LOCAL_MODEL
// ------------------------------------------------------------

let _pipeline = null;
let _loading = null;

/**
 * 内部：Transformers.js を動的読み込み
 * CDN読み込みに失敗した場合は例外を投げます（→フォールバックへ）
 */
async function loadTransformers() {
  // すでに読み込み済みならスキップ
  if (globalThis.transformers) return globalThis.transformers;
  // CDN から動的 import（バージョンは固定推奨／必要に応じて上げてください）
  const module = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@3.0.0');
  globalThis.transformers = module;
  return module;
}

/**
 * 内部：テキスト生成パイプラインを初期化
 * - 1度だけロードし、以降は再利用
 * - モデルは軽量＆多言語寄りの instruct をデフォルトに
 *   ※ 端末性能に応じて変更可（失敗時はフォールバックへ）
 */
async function getPipeline() {
  if (_pipeline) return _pipeline;
  if (_loading) return _loading;

  _loading = (async () => {
    const { pipeline, env } = await loadTransformers();

    // 実行環境のチューニング（古い端末でも無理なく動かすため）
    // - Wasmのスレッド数は自動。必要なら下のコメントアウトを有効化してください。
    // env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency ? Math.min(4, navigator.hardwareConcurrency) : 2;

    // モデルを選択（必要なら window.NECOTUBU_LOCAL_MODEL で上書き）
    const model =
      (typeof window !== 'undefined' && window.NECOTUBU_LOCAL_MODEL) ||
      // 既定：小さめ instruct 系（将来差し替え可）
      // 失敗したらフォールバックAPIに委譲されます
      'Xenova/Qwen2.5-0.5B-Instruct';

    // パイプライン準備（初回はモデルを自動DL）
    // ※ モデルサイズにより初回時間がかかることがあります
    const pipe = await pipeline('text-generation', model, {
      quantized: true, // メモリ節約
    });

    _pipeline = pipe;
    return pipe;
  })();

  return _loading;
}

/**
 * 端末内生成（短文つぶやき用に最適化）
 * @param {string} prompt - 生成の指示文（例：「猫になりきって30文字前後で一言」）
 * @param {object} [options]
 * @param {number} [options.maxNewTokens=60]
 * @param {number} [options.temperature=0.9]
 * @param {number} [options.timeoutMs=12000] - ローカル生成のタイムアウト（ms）
 * @returns {Promise<string>} 生成されたテキスト
 * @throws ローカル実行が失敗/タイムアウトした場合
 */
export async function generateLocally(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required');
  }

  const {
    maxNewTokens = 60,
    temperature = 0.9,
    timeoutMs = 12000,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('local-timeout'), timeoutMs);

  try {
    const pipe = await getPipeline();

    // システムメッセージ風に猫つぶやきのスタイルを誘導（短く、やさしい日本語）
    const systemHint =
      'あなたは愛らしい猫です。やさしい日本語で、短く、ポジティブにつぶやいてください。絵文字は1つまで。';

    const input = `${systemHint}\n\nユーザーの指示: ${prompt}\n\n出力:`;

    const out = await pipe(input, {
      max_new_tokens: maxNewTokens,
      temperature,
      top_p: 0.95,
      // repetition_penalty: 1.1, // 必要に応じて
      // do_sample: true,         // transformers.jsは自動で適切に設定
      signal: controller.signal,
    });

    // 出力整形：最初の候補を取り出し、1行の短文化
    let text = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text || String(out || '');
    if (!text) {
      throw new Error('empty-local-output');
    }

    // 余分なプロンプト部分を削る
    const splitIdx = text.lastIndexOf('出力:');
    if (splitIdx >= 0) {
      text = text.slice(splitIdx + '出力:'.length).trim();
    }

    // 1行30〜60文字に収める軽い整形
    text = text.split('\n').map(s => s.trim()).filter(Boolean).join(' ');
    if (text.length > 80) {
      text = text.slice(0, 80).trim() + '…';
    }

    return text;
  } catch (err) {
    if (err?.name === 'AbortError' || String(err).includes('local-timeout')) {
      throw new Error('local-timeout');
    }
    // ここで投げる → 呼び出し側がフォールバックAPIへ
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

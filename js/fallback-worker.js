// server/fallback-worker.js
// ------------------------------------------------------------
// necotubu: Cloudflare Worker (fallback generation API)
// - This endpoint accepts { prompt } and returns { text }.
// - It calls Replicate's predictions API using environment secrets.
//   Required secrets:
//     REPLICATE_API_TOKEN : string
//     REPLICATE_VERSION   : string (model version ID)
//   Optional:
//     STYLE_HINT          : string (system風スタイル誘導)
//     MAX_NEW_TOKENS      : number (default 60)
//     TEMPERATURE         : number (default 0.9)
// ------------------------------------------------------------

export default {
  /**
   * Cloudflare Worker entry
   * - Mount as /api/necotubu-fallback (via Pages Functions or Routes)
   */
  async fetch(request, env, ctx) {
    try {
      if (request.method !== 'POST') {
        return json({ error: 'method-not-allowed' }, 405);
      }

      const { prompt } = await request.json().catch(() => ({}));
      if (!prompt || typeof prompt !== 'string') {
        return json({ error: 'invalid-prompt' }, 400);
      }

      // env から安全に取得（wrangler secret で登録してください）
      const token = env.REPLICATE_API_TOKEN;
      const version = env.REPLICATE_VERSION; // 例: 'a1b2c3d4...'(モデルのversion ID)
      if (!token || !version) {
        return json({ error: 'missing-secrets', details: 'Set REPLICATE_API_TOKEN and REPLICATE_VERSION' }, 500);
      }

      const style =
        env.STYLE_HINT ||
        'あなたは愛らしい猫です。やさしい日本語で、短く、ポジティブにつぶやいてください。絵文字は1つまで。';

      const inputText = `${style}\n\nユーザーの指示: ${prompt}\n\n出力:`;

      const maxNew = parseNum(env.MAX_NEW_TOKENS, 60);
      const temperature = parseNum(env.TEMPERATURE, 0.9);

      // Replicate Predictions API
      // Docs: https://replicate.com/docs/reference/http#predictions.create
      const predRes = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          version, // モデルの "version" ID（必須）
          input: {
            // モデルによりプロパティ名は異なります。
            // 多くの text-generation モデルは "prompt" または "input" を受けます。
            prompt: inputText,
            max_new_tokens: maxNew,
            temperature,
          },
        }),
      });

      if (!predRes.ok) {
        const msg = await predRes.text().catch(() => '');
        return json({ error: 'replicate-bad-status', status: predRes.status, message: msg }, 502);
      }

      const pred = await predRes.json();

      // Synchronous-style: 一部モデル/ホストでは非同期。完了までpollが必要な場合あり。
      // ここでは簡易化のため、完了状態or出力を判定。必要に応じて /v1/predictions/{id} でpollしてください。
      // 出力の取り出し（モデルにより 'output' の形が異なります）
      const text = extractTextFromReplicateOutput(pred);
      if (!text) {
        // 非同期ならIDを返す実装も可能（今回は簡易化）
        return json({ error: 'replicate-empty-output', prediction: pred }, 502);
      }

      // 軽い整形：1行化＆80字でトリム
      const oneLine = String(text).split('\n').map(s => s.trim()).filter(Boolean).join(' ');
      const trimmed = oneLine.length > 80 ? oneLine.slice(0, 80).trim() + '…' : oneLine;

      return json({ text: trimmed });
    } catch (err) {
      return json({ error: 'unhandled', message: String(err?.message || err) }, 500);
    }
  },
};

// ----------------- helpers -----------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function parseNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Replicateの応答からテキストを頑張って取り出す汎用ヘルパ
 * モデルにより output が string / array / object とバラつくため、段階的に探します
 */
function extractTextFromReplicateOutput(pred) {
  if (!pred) return '';
  // 直接 'output' に文字列
  if (typeof pred.output === 'string') return pred.output;

  // 配列 → 最後 or 最初の要素をテキスト化
  if (Array.isArray(pred.output)) {
    const arr = pred.output.flat().filter(Boolean);
    const last = arr[arr.length - 1];
    if (typeof last === 'string') return last;
    if (last && typeof last.text === 'string') return last.text;
    const first = arr[0];
    if (typeof first === 'string') return first;
    if (first && typeof first.text === 'string') return first.text;
  }

  // オブジェクト → よくあるフィールドを総当たり
  const cands = [
    pred.output?.text,
    pred.output?.content,
    pred.data?.text,
    pred.data?.output,
    pred?.text,
  ].filter(Boolean);
  if (cands.length) return String(cands[0]);

  return '';
}

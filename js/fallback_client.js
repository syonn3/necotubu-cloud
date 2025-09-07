// js/fallback_client.js
// ------------------------------------------------------------
// necotubu: Fallback client
// - Calls Cloudflare Worker endpoint without exposing any keys
// ------------------------------------------------------------

const DEFAULT_ENDPOINT = '/api/necotubu-fallback';
const DEFAULT_TIMEOUT_MS = 12000;

/**
 * フォールバックAPIで生成（サーバー側でReplicate等を呼ぶ）
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.endpoint] - 例: '/api/necotubu-fallback'
 * @param {number} [options.timeoutMs=12000]
 * @returns {Promise<string>}
 * @throws 通信失敗・サーバーエラー時
 */
export async function generateViaApi(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required');
  }
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort('fallback-timeout'), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`fallback-bad-status: ${res.status} ${text}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!data || typeof data.text !== 'string') {
      throw new Error('fallback-invalid-response');
    }
    return data.text;
  } catch (err) {
    if (err?.name === 'AbortError' || String(err).includes('fallback-timeout')) {
      throw new Error('fallback-timeout');
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

// js/snaps.js
// ・写真は常に1枚（置き換え確認）／1枚ある間は「写真を選ぶ」を無効化
// ・編集モーダル：プレビュー全体表示、キャプションは白余白に中央表示
// ・フォント選択：手書き風(Yomogi) / 丸文字(Kosugi Maru) / 明朝風(Sawarabi Mincho) / Noto Sans JP / 端末既定
//   - プルダウンは「キャプション入力フォームの下」に配置
//   - Google Fonts を自動読込（1回だけ）→ 読込完了後にキャンバス描画
//   - フォント選択はスナップごとに保存
// ・スタンプ：6カテゴリをプルダウン＋省スペースグリッド、最後に選んだものを連続貼付
//   - 個別スケール変更／ドラッグ移動／選択削除／全部消す
// ・一覧はポラロイド表示（全体が見える）＋編集／削除
// ・SNS向け API: hasSnaps(), latestFile()
// ───────────────────────────────────────────────────────────────────
// v1.1 つぶやきページ仕様対応：当日分のみ表示（カレンダーは全履歴保持）
//   - 旧ストレージ KEY_PREFIX("necotubu_snaps:") は後方互換のため自動移行
//   - カレンダー用:  KEY_CAL_PREFIX   = "necotubu_snaps_calendar:"
//   - つぶやき用:    KEY_TODAY_PREFIX = "necotubu_snaps_today:"
//   - TODAY は { date: "YYYY-MM-DD", items: Snap[] } 形式
//   - CALENDAR は { "YYYY-MM-DD": Snap[] } 形式
//   - 当日は TODAY の items を表示／編集し、保存時は CALENDAR[today] へも反映
// ───────────────────────────────────────────────────────────────────

(function (global) {
  const LEGACY_KEY_PREFIX = "necotubu_snaps:";               // 旧：配列のみ
  const KEY_CAL_PREFIX    = "necotubu_snaps_calendar:";      // 新：全履歴（カレンダー）
  const KEY_TODAY_PREFIX  = "necotubu_snaps_today:";         // 新：つぶやき（当日のみ）

  /* ====== 日付ユーティリティ（JST） ====== */
  function nowJST() {
    const now = new Date();
    return new Date(now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  }
  function ymdJST(d = nowJST()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  /* ====== Storage 共通 ====== */
  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
    catch { return fallback; }
  }
  function saveJSON(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  /* === 追加：安全保存（容量超過のとき段階的に縮小・間引きして再試行） === */
  function trySaveWithRelief(key, value, options) {
    // options: { catId, isCalendar, isToday, shrinkHook }
    try {
      saveJSON(key, value);
      return true;
    } catch (e) {
      if (!(e && (e.name === 'QuotaExceededError' || String(e).includes('QuotaExceededError')))) {
        console.warn('[snaps] save failed:', e);
        return false;
      }
    }

    const opt = options || {};
    const catId = opt.catId || '';

    // 1) カレンダーの間引き（最新優先）
    if (opt.isCalendar && catId) {
      let cal = value || {};
      const keys = Object.keys(cal).sort(); // 昇順（古い→新しい）
      const limits = [90, 60, 30, 14];
      for (let li = 0; li < limits.length; li++) {
        const keep = limits[li];
        if (keys.length > keep) {
          const newer = keys.slice(-keep);
          const trimmed = {};
          newer.forEach(k => trimmed[k] = cal[k]);
          try {
            saveJSON(KEY_CAL_PREFIX + catId, trimmed);
            return true;
          } catch (e2) {
            if (!(e2 && (e2.name === 'QuotaExceededError' || String(e2).includes('QuotaExceededError')))) break;
            cal = trimmed; // 次のループでさらに削る
          }
        }
      }
    }

    // 2) 画像の再圧縮（当日ボックス or カレンダーの当日配列）
    const shrinkTargets = [];
    if (opt.isToday && value && Array.isArray(value.items)) shrinkTargets.push({ arr: value.items });
    if (opt.isCalendar && value) {
      const today = ymdJST();
      if (Array.isArray(value[today])) shrinkTargets.push({ arr: value[today] });
    }

    const steps = [
      { side: 960, q: 0.82 },
      { side: 800, q: 0.78 }
    ];

    for (let s = 0; s < steps.length; s++) {
      const { side, q } = steps[s];
      let changed = false;
      for (const t of shrinkTargets) {
        for (let i = 0; i < t.arr.length; i++) {
          const it = t.arr[i];
          if (!it || !it.data || typeof it.data !== 'string') continue;
          const smaller = recompressDataURL(it.data, side, q);
          if (smaller && smaller.length < it.data.length) {
            it.data = smaller;
            changed = true;
          }
        }
      }
      if (changed) {
        try {
          saveJSON(key, value);
          return true;
        } catch (e3) {
          if (!(e3 && (e3.name === 'QuotaExceededError' || String(e3).includes('QuotaExceededError')))) {
            console.warn('[snaps] save failed after shrink:', e3);
            break;
          }
        }
      }
    }

    // 3) 最終手段：当日の items をメタのみ（data を空）にして保存
    for (const t of shrinkTargets) {
      for (let i = 0; i < t.arr.length; i++) {
        const it = t.arr[i];
        if (it && it.data) { it.data = ''; }
      }
    }
    try {
      saveJSON(key, value);
      console.warn('[snaps] saved with metadata-only fallback');
      return true;
    } catch (e4) {
      console.warn('[snaps] final save failed:', e4);
      return false;
    }
  }

  // DataURL をキャンバス経由で再圧縮・縮小
  function recompressDataURL(dataURL, maxSide, quality) {
    try {
      const img = document.createElement('img');
      return syncReencode(img, dataURL, maxSide, quality);
    } catch { return null; }
  }
  function syncReencode(img, src, maxSide, quality) {
    // 同期的に扱うために警戒（実体は即時 onload 実行されない限り同期にはならない）
    // ここでは try/catch 内で失敗時 null を返す運用
    let out = null;
    img.onload = function() {
      try {
        const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * s));
        const h = Math.max(1, Math.round(img.naturalHeight * s));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        out = c.toDataURL('image/jpeg', quality);
      } catch { out = null; }
    };
    img.onerror = function(){ out = null; };
    img.src = src;
    return out;
  }

  /* ====== 旧データ → 新形式へ移行（必要時のみ） ====== */
  function migrateLegacyIfNeeded(catId) {
    const legacyArr = loadJSON(LEGACY_KEY_PREFIX + catId, null);
    const hasLegacy = Array.isArray(legacyArr) && legacyArr.length > 0;
    if (!hasLegacy) return;

    // 旧配列は日付情報を持たないため、損失回避のため「今日」の箱へ格納
    const today = ymdJST();
    const calKey = KEY_CAL_PREFIX + catId;
    const todayKey = KEY_TODAY_PREFIX + catId;

    const calendar = loadJSON(calKey, {});
    calendar[today] = (calendar[today] || []).concat(legacyArr.map(x => ({
      ...x,
      ts: x?.ts || Date.now()
    })));

    // カレンダー保存（容量対策付き）
    trySaveWithRelief(calKey, calendar, { catId, isCalendar: true });

    // TODAY を同期（容量対策付き）
    const todayBox = { date: today, items: calendar[today] };
    trySaveWithRelief(todayKey, todayBox, { catId, isToday: true });

    // 旧キーは「メタデータのみ」でミラー（画像 data は持たない）
    const flat = [];
    Object.values(calendar).forEach(arr => {
      if (Array.isArray(arr)) arr.forEach(x => {
        const m = { ts: x?.ts || Date.now(), caption: x?.caption || '', captionFontKey: x?.captionFontKey || 'system' };
        flat.push(m);
      });
    });
    try {
      saveJSON(LEGACY_KEY_PREFIX + catId, flat);
    } catch (e) {
      // ここは互換用なので失敗してもアプリ本体を止めない
      console.warn('[snaps] legacy mirror save failed:', e);
    }
  }

  /* ====== 新形式（カレンダー／当日） ====== */
  function loadCalendar(catId) {
    return loadJSON(KEY_CAL_PREFIX + catId, {}); // { ymd: Snap[] }
  }
  function saveCalendar(catId, calendarObj) {
    // 容量対策付き保存
    if (!trySaveWithRelief(KEY_CAL_PREFIX + catId, calendarObj, { catId, isCalendar: true })) {
      console.warn('[snaps] saveCalendar failed (even after relief)');
    }
  }
  function loadTodayBox(catId) {
    return loadJSON(KEY_TODAY_PREFIX + catId, null); // { date, items }
  }
  function saveTodayBox(catId, todayBox) {
    if (!trySaveWithRelief(KEY_TODAY_PREFIX + catId, todayBox, { catId, isToday: true })) {
      console.warn('[snaps] saveTodayBox failed (even after relief)');
    }
  }
  function ensureTodayMirror(catId) {
    const today = ymdJST();
    const calendar = loadCalendar(catId);
    const todayItems = calendar[today] || [];
    saveTodayBox(catId, { date: today, items: todayItems });
  }

  /* ====== つぶやきページ用：当日スナップの読み書き ====== */
  function loadTodaySnaps(catId) {
    const box = loadTodayBox(catId);
    const today = ymdJST();
    if (!box || box.date !== today) {
      // 日付が変わっていたら当日分へ同期（＝表示は空 or 当日分のみ）
      ensureTodayMirror(catId);
      const again = loadTodayBox(catId);
      return (again && again.items) ? again.items : [];
    }
    return Array.isArray(box.items) ? box.items : [];
  }
  function saveTodaySnaps(catId, todayArr) {
    const today = ymdJST();
    // TODAY を更新
    saveTodayBox(catId, { date: today, items: todayArr });
    // CALENDAR にも反映
    const calendar = loadCalendar(catId);
    calendar[today] = todayArr.slice();
    saveCalendar(catId, calendar);
    // 旧キー（レガシー）はメタのみでミラー（data は持たない）
    try {
      const flat = [];
      Object.values(calendar).forEach(arr => { if (Array.isArray(arr)) arr.forEach(x => flat.push({ ts: x?.ts || Date.now(), caption: x?.caption || '', captionFontKey: x?.captionFontKey || 'system' })); });
      saveJSON(LEGACY_KEY_PREFIX + catId, flat);
    } catch (e) {
      console.warn('[snaps] legacy mirror update failed:', e);
    }
  }

  /* ====== 画像ユーティリティ ====== */
  function shrinkImage(file, maxSide) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        // 品質を少し下げて容量節約
        resolve(c.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  function dataURLtoBlob(dataURL) {
    const p = dataURL.split(","), b = atob(p[1]);
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return new Blob([u], { type: "image/jpeg" });
  }

  /* ====== Styles (once) ====== */
  (function () {
    if (document.getElementById("snaps-style")) return;
    const css = `
    .snap-polaroid{background:#fff;border-radius:12px;box-shadow:0 6px 16px rgba(0,0,0,.35);overflow:hidden;border:1px solid rgba(0,0,0,.15)}
    .snap-polaroid .ph-wrap{position:relative;width:100%;padding-top:75%;background:#000;overflow:hidden}
    .snap-polaroid .ph-wrap img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center}
    .snap-actions{display:flex;gap:8px;padding:8px}
    .snap-actions .btn{background:#a3c586;border:1px solid rgba(0,0,0,.2);color:#1c1a17;border-radius:10px;padding:6px 10px;cursor:pointer}
    .snap-actions .btn.danger{background:#8d3a3a;color:#fff}

    .snap-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999}
    .snap-panel{width:min(980px,95vw);max-height:90vh;overflow-y:auto;background:#2a211b;color:#f5f1e6;border:1px solid #53473f;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
    .snap-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 12px;background:#3b3128;border-bottom:1px solid #53473f;position:sticky;top:0;z-index:4}
    .label{font-size:12px;color:#cbae82}

    /* 省スペース：スタンプパネル */
    .stk-compact{display:flex;gap:10px;align-items:center;background:#3b3128;padding:10px 12px;border-bottom:1px solid #53473f;position:sticky;top:44px;z-index:3;flex-wrap:wrap}
    .stk-select{appearance:none;padding:8px 28px 8px 10px;border-radius:10px;border:1px solid #53473f;background:#2a211b;color:#f5f1e6;cursor:pointer}
    .stk-grid-wrap{max-height:120px;overflow:auto;border-top:1px solid #53473f;border-bottom:1px solid #53473f;background:#2a211b}
    .stk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:8px;padding:10px 12px}
    .stk-item{min-width:44px;height:44px;border-radius:10px;border:1px solid #53473f;background:#2a211b;color:#f5f1e6;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center}
    .stk-hint{font-size:12px;color:#cbae82}

    .snap-polaroid-preview{background:#fff;border-radius:12px;box-shadow:0 6px 16px rgba(0,0,0,.35);margin:12px;padding:18px;display:flex;flex-direction:column;gap:14px}
    .stage-box{display:flex;justify-content:center}
    .snap-stage{position:relative;background:#000;border:1px solid rgba(0,0,0,.15);overflow:hidden}
    .snap-stage img.preview{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center}
    .cap-live{min-height:72px;color:#222;font-size:18px;line-height:1.7;white-space:pre-wrap;text-align:center;padding:4px 8px}

    .sticker{position:absolute;cursor:pointer;font-size:48px;user-select:none;touch-action:none;transform-origin:center center;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
    .sticker.active{outline:2px dashed #ff7f32;outline-offset:2px}

    .snap-footer{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;padding:10px 12px;background:#3b3128;border-top:1px solid #53473f;position:sticky;bottom:0;z-index:5;flex-wrap:wrap}
    .btn-snap{padding:8px 12px;border-radius:10px;border:1px solid #53473f;background:#a3c586;color:#1c1a17;cursor:pointer}
    .btn-snap.secondary{background:#e7d7be}
    .btn-snap.danger{background:#8d3a3a;color:#fff}
    input[type="text"].snap-input{padding:8px 10px;border-radius:10px;border:1px solid #53473f;background:#2a211b;color:#f5f1e6;min-width:260px;width:100%}

    /* フォント選択（キャプション入力の下に表示） */
    .font-row{display:flex;gap:10px;align-items:center;margin-top:8px}
    .font-select{appearance:none;padding:8px 28px 8px 10px;border-radius:10px;border:1px solid #53473f;background:#2a211b;color:#f5f1e6;cursor:pointer}

    /* ラベルの無効化表示 */
    label.disabled{opacity:.45;filter:grayscale(60%);cursor:not-allowed}
    `;
    const s = document.createElement("style"); s.id = "snaps-style"; s.textContent = css; document.head.appendChild(s);
  })();

  /* ====== Web Fonts（Google Fonts） ====== */
  const FONT_OPTIONS = [
    { key: "system",   label: "デフォルト（端末）",         css: '"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI","Meiryo",sans-serif',                 google: null },
    { key: "yomogi",   label: "手書き風（Yomogi）",         css: '"Yomogi","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif',                                google: "Yomogi" },
    { key: "kosugi",   label: "丸文字（Kosugi Maru）",      css: '"Kosugi Maru","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif',                           google: "Kosugi+Maru" },
    { key: "sawarabi", label: "明朝風（Sawarabi Mincho）",  css: '"Sawarabi Mincho","Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif',                    google: "Sawarabi+Mincho" },
    { key: "noto",     label: "すっきり（Noto Sans JP）",   css: '"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo",sans-serif',                 google: "Noto+Sans+JP:wght@400;700" }
  ];
  let fontsInjected = false;
  function ensureFontsLinkInjected() {
    if (fontsInjected) return;
    const fam = FONT_OPTIONS.map(f => f.google).filter(Boolean).join("&family=");
    if (!fam) { fontsInjected = true; return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
    document.head.appendChild(link);
    fontsInjected = true;
  }
  async function waitFontLoaded(cssFamily, timeoutMs = 3000) {
    if (!document.fonts || !cssFamily) return;
    try {
      const first = cssFamily.split(",")[0].trim().replace(/^"+|"+$/g, "");
      const p = document.fonts.load(`28px "${first}"`);
      const to = new Promise((_, rej) => setTimeout(() => rej(new Error("font timeout")), timeoutMs));
      await Promise.race([p, to]);
      await document.fonts.ready;
    } catch (_) { /* 既定フォントで描画 */ }
  }

  /* ====== Stickers: 6 Categories ====== */
  const STICKER_CATS = [
    { title: "感情・ハート", items: ["💖","✨","😂","😍","😎","🥳","👍","❤️","😂","😅","🤣","😇","😉","😊","🙂","😄","😁","😋","😌","😘","🥰","😗","😙","😚","🤗","🤫","🤔","🤩","🥳","🤯","😭","😥","😰","😱","😳","🥺","😲"] },
    { title: "動物・生き物", items: ["🐱","🐾","🐶","🐻","🐰","🌸","🐟","🦋","🐼","🐨","🐯","🦁","🐸","🐒","🐔","🐧","🐦","🐌","🐢","🐍","🐘","🦒","🦓","🦌","🐉"] },
    { title: "食べ物・飲み物", items: ["🍣","🍖","🍦","🍓","🧀","☕️","🍺","🍰","🍕","🍔","🍟","🌭","🍿","🍙","🍚","🍜","🍛","🍝","🥖","🥐","🧇","🥞","🍳","🥓","🍗","🍞","🥚","🍩","🍪","🍫","🍬","🍭","🍯","🍧","🍨","🥧","🧁","🍮","🍵","🥤","🥛","🍷","🥂","🥃","🍸","🍹","🍶"] },
    { title: "自然・天気", items: ["☀️","💧","❄️","☔️","🌪️","🎃","🎄","🎁","🎈","🌤️","⛅️","☁️","🌦️","🌧️","⛈️","🌩️","💦","☃️","⛄️","🌬️","🌈","🔥","⭐","🌟","💫","⚡️","🌙","🌊","🍂","🍁","🍄","🌿","🌱","🌲","🌳","🌵","🌴"] },
    { title: "乗り物・おもちゃ", items: ["🚗","🚌","✈️","🚀","🚢","🧸","🧶","🎮","🕹️","🎲","🧩","🚲","🏍️","🛴","🚂","🛸","🚁","⛵️","⚓️"] },
    { title: "生活・イベント", items: ["🏠","🛋️","🛌","🛁","🚽","🎁","🎈","🎊","🎉","🎂","💍","💎","👑","💰","💵","💴","💶","💷","🎶","🎵","🎷","🎸","🎹","🏫","🎓","✏️","📚","📏","🏥","🏦","🏪","🛣️","🚦","🚧","🔔","💡","✉️","✂️","📎","🔗","📞","💻","📱","🖨️","⌨️","⚾️","🏀","⚽️","🎾","🏂"] }
  ];

  /* ====== Editor Modal ====== */
  function openEditor({ baseSrc, onSave, onCancel, defaultCaption = "", defaultStickers = [], defaultFrame = null, defaultFontKey = "system" }) {
    ensureFontsLinkInjected();

    const modal = document.createElement("div");
    modal.className = "snap-modal";
    modal.innerHTML = `
      <div class="snap-panel">
        <div class="snap-toolbar">
          <span class="label">スタンプを選ぶ → 写真をクリックで貼付（連続OK）</span>
          <div class="right" style="display:flex;gap:10px;align-items:center">
            <label class="label">サイズ</label>
            <input type="range" id="snap-stk-scale" min="0.5" max="2.5" step="0.1" value="1" style="width:160px">
            <span id="sel-info" class="label">選択中：なし</span>
          </div>
        </div>

        <!-- 省スペース：カテゴリ選択＋スクロールグリッド（フォント選択はキャプションの下に移動） -->
        <div class="stk-compact">
          <select id="stk-select" class="stk-select" aria-label="スタンプカテゴリ">
            ${STICKER_CATS.map((c, i) => `<option value="${i}">${c.title}</option>`).join("")}
          </select>
          <span class="stk-hint">（スクロール可）</span>
        </div>
        <div class="stk-grid-wrap">
          <div id="stk-grid" class="stk-grid"></div>
        </div>

        <div class="snap-polaroid-preview">
          <div class="stage-box">
            <div class="snap-stage" id="snap-stage">
              <img id="snap-preview" class="preview" alt="preview">
            </div>
          </div>
          <div id="cap-live" class="cap-live"></div>
        </div>

        <div class="snap-footer">
          <!-- 左：入力とフォント選択（フォントはキャプションの下） -->
          <div style="flex:1;min-width:260px">
            <input id="snap-cap" class="snap-input" type="text" placeholder="キャプション（下の白い枠に表示／中央）">
            <div class="font-row">
              <span class="label">フォント</span>
              <select id="font-select" class="font-select" aria-label="フォント選択">
                ${FONT_OPTIONS.map(f => `<option value="${f.key}">${f.label}</option>`).join("")}
              </select>
            </div>
          </div>

          <!-- 右：操作ボタン -->
          <div class="right" style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn-snap secondary" id="snap-clear">選択解除</button>
            <button class="btn-snap danger" id="snap-del">選択スタンプ削除</button>
            <button class="btn-snap danger" id="snap-clear-all">スタンプぜんぶ消す</button>
            <button class="btn-snap" id="snap-cancel">やめる</button>
            <button class="btn-snap" id="snap-save">保存する</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const stage    = modal.querySelector("#snap-stage");
    const preview  = modal.querySelector("#snap-preview");
    const capInput = modal.querySelector("#snap-cap");
    const capLive  = modal.querySelector("#cap-live");
    const scale    = modal.querySelector("#snap-stk-scale");
    const selInfo  = modal.querySelector("#sel-info");
    const sel      = modal.querySelector("#stk-select");
    const grid     = modal.querySelector("#stk-grid");
    const fontSel  = modal.querySelector("#font-select");

    // 初期フォント
    fontSel.value = defaultFontKey || "system";
    const getFontCSS = () => (FONT_OPTIONS.find(f => f.key === fontSel.value) || FONT_OPTIONS[0]).css;
    function applyPreviewFont() { capLive.style.fontFamily = getFontCSS(); }

    capInput.value = defaultCaption || ""; capLive.textContent = capInput.value; applyPreviewFont();
    capInput.addEventListener("input", () => capLive.textContent = capInput.value);
    fontSel.addEventListener("change", applyPreviewFont);

    // カテゴリ → グリッド再描画
    function renderGrid(catIndex) {
      const items = STICKER_CATS[catIndex]?.items || [];
      grid.innerHTML = items.map(it => `<button type="button" class="stk-item" data-stk="${it}">${it}</button>`).join("");
      grid.querySelectorAll("[data-stk]").forEach(btn => {
        btn.addEventListener("click", () => { current = btn.dataset.stk; selInfo.textContent = `選択中：${current}`; });
      });
    }
    sel.addEventListener("change", () => renderGrid(Number(sel.value)));
    sel.value = "0"; renderGrid(0);

    const baseImg = new Image();
    baseImg.onload = () => {
      // 画面に必ず収まるプレビュー
      const iw = baseImg.naturalWidth || 3, ih = baseImg.naturalHeight || 4, ar = ih / iw;
      const MAX_W = Math.min(840, Math.floor(window.innerWidth * 0.85));
      const MAX_H = Math.floor(window.innerHeight * 0.60);
      let w, h;
      if (ar >= 1) { h = Math.min(MAX_H, Math.round(MAX_W * ar)); w = Math.min(MAX_W, Math.round(h / ar)); h = Math.min(MAX_H, Math.round(w * ar)); }
      else { w = Math.min(MAX_W, Math.round(MAX_H / ar)); h = Math.min(MAX_H, Math.round(w * ar)); }
      stage.style.width = w + "px"; stage.style.height = h + "px";
      preview.src = baseSrc;
      restore(defaultStickers, defaultFrame);
    };
    baseImg.src = baseSrc;

    const stickers = []; let active = null; let current = null;

    // ステージクリックで貼付（連続OK）
    stage.addEventListener("click", e => {
      if (!current) return;
      const r = stage.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const st = addSticker(current, x, y, parseFloat(scale.value));
      setActive(st);
    });

    function restore(arr, frame) {
      const r = stage.getBoundingClientRect();
      const sx = frame && frame.w ? r.width / frame.w : 1;
      const sy = frame && frame.h ? r.height / frame.h : 1;
      (arr || []).forEach(st => addSticker(st.text, st.x * sx, st.y * sy, st.scale));
    }
    function addSticker(text, x, y, sc = 1) {
      const el = document.createElement("div");
      el.className = "sticker"; el.textContent = text; stage.appendChild(el);
      const st = { el, x, y, scale: sc, text, id: 's' + Math.random().toString(36).slice(2, 8) };
      stickers.push(st); place(st); interact(st); return st;
    }
    function place(st) {
      Object.assign(st.el.style, { left: st.x + "px", top: st.y + "px", transform: `translate(-50%,-50%) scale(${st.scale})` });
    }
    function setActive(st) {
      if (active && active.el) active.el.classList.remove('active');
      active = st || null;
      if (active) active.el.classList.add('active');
      selInfo.textContent = current ? `選択中：${current}` : (active ? `選択中：${active.text}` : '選択中：なし');
      if (active) scale.value = String(active.scale);
    }
    function interact(st) {
      st.el.addEventListener("click", e => { e.stopPropagation(); setActive(st); });
      let drag = false, sx = 0, sy = 0;
      st.el.addEventListener("pointerdown", e => {
        e.preventDefault(); setActive(st); drag = true;
        const r = stage.getBoundingClientRect();
        sx = e.clientX - (r.left + st.x); sy = e.clientY - (r.top + st.y);
        st.el.setPointerCapture(e.pointerId);
      });
      window.addEventListener("pointermove", e => {
        if (!drag) return;
        const r = stage.getBoundingClientRect();
        st.x = e.clientX - r.left - sx; st.y = e.clientY - r.top - sy; place(st);
      });
      window.addEventListener("pointerup", () => drag = false);
    }

    // 操作ボタン
    modal.querySelector("#snap-clear").addEventListener("click", () => setActive(null));
    modal.querySelector("#snap-del").addEventListener("click", () => {
      if (!active) return;
      const i = stickers.findIndex(s => s.id === active.id);
      if (i >= 0) { stickers[i].el.remove(); stickers.splice(i, 1); }
      setActive(null);
    });
    modal.querySelector("#snap-clear-all").addEventListener("click", () => {
      stickers.splice(0).forEach(s => s.el.remove()); setActive(null);
    });
    scale.addEventListener("input", e => {
      if (!active) return; active.scale = parseFloat(e.target.value); place(active);
    });

    modal.querySelector("#snap-cancel").addEventListener("click", () => {
      modal.remove(); onCancel && onCancel();
    });
    modal.querySelector("#snap-save").addEventListener("click", async () => {
      // フォント読み込み完了を待ってから描画
      const cssFamily = getFontCSS();
      await waitFontLoaded(cssFamily, 3500);

      const rect = stage.getBoundingClientRect();
      compose(baseImg, capInput.value, stickers, { w: rect.width, h: rect.height }, cssFamily).then(dataURL => {
        modal.remove();
        onSave && onSave({
          data: dataURL, base: baseSrc, caption: capInput.value || "",
          captionFontKey: fontSel.value,
          stickers: stickers.map(s => ({ text: s.text, x: s.x, y: s.y, scale: s.scale })),
          frame: { w: rect.width, h: rect.height }
        });
      });
    });
  }

  // 合成：白いポラロイド、下キャプション中央（選択フォントで描画）
  function compose(baseImg, caption, stickers, frame, captionFontCSS) {
    return new Promise((resolve) => {
      const W = 900, H = 1200, M = 40, CAP = 160, PW = W - M * 2, PH = H - M * 2 - CAP;
      const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);

      const img = new Image();
      img.onload = () => {
        const ir = img.width / img.height, fr = PW / PH;
        let dw, dh, dx, dy;
        if (ir > fr) { dw = PW; dh = dw / ir; dx = (W - dw) / 2; dy = M + (PH - dh) / 2; }
        else { dh = PH; dw = dh * ir; dx = (W - dw) / 2; dy = M + (PH - dh) / 2; }

        g.save(); g.shadowColor = "rgba(0,0,0,.18)"; g.shadowBlur = 16; g.shadowOffsetY = 8;
        g.drawImage(img, dx, dy, dw, dh); g.restore();

        const fw = Math.max(1, frame?.w || PW), fh = Math.max(1, frame?.h || PH);
        stickers.forEach(st => {
          const px = dx + (st.x / fw) * dw, py = dy + (st.y / fh) * dh;
          g.save();
          g.font = `${Math.round(64 * st.scale)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
          g.textAlign = "center"; g.textBaseline = "middle";
          g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 6; g.shadowOffsetY = 3;
          g.fillText(st.text, px, py);
          g.restore();
        });

        g.fillStyle = "#222";
        const fontCSS = captionFontCSS || '"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI","Meiryo",sans-serif';
        g.font = `28px ${fontCSS}`;
        g.textAlign = "center"; g.textBaseline = "top";
        wrapCenter(g, caption || "", W / 2, M + PH + 18, W - M * 2, 34);

        resolve(c.toDataURL("image/jpeg", 0.92));
      };
      img.src = baseImg.src || baseImg;
    });
  }
  function wrapCenter(g, text, cx, y, maxW, lh) {
    const cs = (text || "").split("");
    let line = "", yy = y;
    for (let i = 0; i < cs.length; i++) {
      const t = line + cs[i];
      if (g.measureText(t).width > maxW && i > 0) { g.fillText(line, cx, yy); line = cs[i]; yy += lh; }
      else { line = t; }
    }
    g.fillText(line, cx, yy);
  }

  /* ====== List/Card ====== */
  function card(item, idx, onEdit, onDelete) {
    const div = document.createElement("div"); div.className = "snap-polaroid";
    div.innerHTML = `<div class="ph-wrap"><img src="${item.data}" alt="snap"></div>
      <div class="snap-actions">
        <button class="btn" data-edit>編集</button>
        <button class="btn danger" data-del>削除</button>
      </div>`;
    div.querySelector("[data-edit]").addEventListener("click", () => onEdit(idx));
    div.querySelector("[data-del]").addEventListener("click", () => onDelete(idx));
    return div;
  }

  /* ====== Main Init（当日表示） ====== */
  function init({ catId, fileInputId, gridId, maxSide = 1200, single = true, onRender }) {
    const file = document.getElementById(fileInputId);
    const grid = document.getElementById(gridId);
    if (!catId || !file || !grid) {
      console.warn("[snaps] init 引数不足", { catId, fileInputId, gridId });
      return { hasSnaps: () => false, latestFile: async () => null, onChange: () => { }, reload: () => { } };
    }

    // 旧データがあれば一度だけ移行
    migrateLegacyIfNeeded(catId);
    // 当日ボックスを現在日に同期（別日のデータは自動的に非表示）
    ensureTodayMirror(catId);

    // ラベル（HTMLは触らず、JSで文言統一＆無効化表示）
    const label = document.querySelector(`label[for="${fileInputId}"]`);
    function setPickEnabled(enabled) {
      if (!label) return;
      if (enabled) {
        label.classList.remove("disabled");
        label.textContent = "写真を選ぶ";
        file.disabled = false;
      } else {
        label.classList.add("disabled");
        label.textContent = "写真は1枚だけ（削除で変更）";
        file.disabled = true;
      }
    }
    if (label) label.textContent = "写真を選ぶ";

    let listeners = []; const emit = () => listeners.forEach(fn => { try { fn(); } catch { } });

    function normalize(arr) {
      if (!single) return arr;
      if (arr.length <= 1) return arr;
      const only = [arr[0]];
      saveTodaySnaps(catId, only);
      return only;
    }

    function render() {
      const arr = normalize(loadTodaySnaps(catId));
      grid.innerHTML = "";
      (single ? arr.slice(0, 1) : arr).forEach((it, i) => grid.appendChild(card(it, i, edit, del)));
      setPickEnabled((single ? arr.slice(0, 1) : arr).length === 0);
      if (typeof onRender === "function") onRender((single ? arr.slice(0, 1) : arr).length >= 1);
    }

    function edit(idx) {
      const arr = normalize(loadTodaySnaps(catId));
      const it = arr[idx]; const base = it.base || it.data;
      openEditor({
        baseSrc: base,
        defaultCaption: it.caption || "",
        defaultStickers: it.base ? (it.stickers || []) : [],
        defaultFrame: it.frame || null,
        defaultFontKey: it.captionFontKey || "system",
        onSave: (res) => {
          const newArr = normalize(loadTodaySnaps(catId));
          newArr[idx] = { ...it, ...res, base, ts: Date.now() };
          saveTodaySnaps(catId, newArr);
          render(); emit();
        }
      });
    }

    function del(idx) {
      const arr = normalize(loadTodaySnaps(catId));
      arr.splice(idx, 1);
      saveTodaySnaps(catId, arr);
      render(); emit();
    }

    file.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const base = await shrinkImage(f, maxSide);
      if (!base) { alert("画像の読み込みに失敗しました。"); e.target.value = ""; return; }

      const currentArr = normalize(loadTodaySnaps(catId));
      if (single && currentArr.length >= 1) {
        const ok = confirm("いまの写真を新しい写真で置き換えますか？");
        if (!ok) { e.target.value = ""; return; }
      }

      openEditor({
        baseSrc: base,
        onSave: (res) => {
          const newItem = { ...res, ts: Date.now() };
          const arrNow = normalize(loadTodaySnaps(catId));
          const newArr = single ? [newItem] : [newItem, ...arrNow];
          // 当日保存 + カレンダー同期
          saveTodaySnaps(catId, newArr);
          render(); emit();
        }
      });

      e.target.value = "";
    });

    render();

    const api = {
      hasSnaps: () => normalize(loadTodaySnaps(catId)).length > 0,
      latestBlob: () => { const arr = normalize(loadTodaySnaps(catId)); if (!arr.length) return null; return dataURLtoBlob(arr[0].data); },
      latestFile: async (type = "image/jpeg", name = "snap.jpg") => { const b = api.latestBlob(); return b ? new File([b], name, { type }) : null; },
      onChange: (fn) => { if (typeof fn === "function") listeners.push(fn); },
      reload: render
    };
    return api;
  }

  global.Snaps = { init };
})(window);

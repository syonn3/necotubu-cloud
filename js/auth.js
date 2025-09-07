// js/auth.js — べータ招待制ログイン（Firebase未設定でも使える）
(function(global){
  const CFG = global.APP_CONFIG || {};
  const NS = (CFG.STORAGE_NS || "necotubu_v1") + ":beta";

  function inAllowlist(email){
    const list = (CFG.ALLOWLIST_EMAILS || []).map(s => String(s||"").trim().toLowerCase());
    return list.includes(String(email||"").trim().toLowerCase());
  }

  function signInLocal(email, passcode){
    return new Promise((resolve, reject)=>{
      if(!email) return reject(new Error("メールアドレスを入力してください。"));
      if(!inAllowlist(email)) return reject(new Error("このメールは招待されていません。"));
      const needPass = !!(CFG.BETA_PASSCODE || "");
      if(needPass && passcode !== CFG.BETA_PASSCODE){
        return reject(new Error("合言葉が違います。"));
      }
      const sess = { email: String(email).trim(), t: Date.now(), mode: "local" };
      try{
        sessionStorage.setItem(NS + ":auth", JSON.stringify(sess));
      }catch(e){}
      resolve(sess);
    });
  }

  function signOut(){
    try{ sessionStorage.removeItem(NS + ":auth"); }catch(e){}
  }
  function currentUser(){
    try{ return JSON.parse(sessionStorage.getItem(NS + ":auth") || "null"); }catch(e){ return null; }
  }
  function requireAuth(){
    return !!currentUser();
  }

  // ここでは Firebase を使わず“簡易ベータ鍵”だけ。
  // 将来、CFG.FIREBASE に鍵を入れたら Firebase Auth 版にも切替できます。

  global.APP_AUTH = { signInLocal, signOut, currentUser, requireAuth, inAllowlist };
})(window);

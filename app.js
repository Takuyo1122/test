// -------- Firebase SDK をESMで読み込み --------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// 🔧 あなたのFirebaseプロジェクト設定に置き換えてください
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// -------- ユーティリティ --------
const el = (id) => document.getElementById(id);
const showCreate = () => { el('create').classList.remove('hidden'); el('view').classList.add('hidden'); };
const showView   = () => { el('view').classList.remove('hidden');  el('create').classList.add('hidden'); };

function shortId(len=10){
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

// -------- WebCrypto (AES-GCM + PBKDF2) --------
async function deriveKeyFromPassphrase(passphrase, salt){
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), {name:"PBKDF2"}, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt","decrypt"]
  );
}

async function encryptJson(obj, passphrase){
  const enc = new TextEncoder();
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key  = await deriveKeyFromPassphrase(passphrase, salt);
  const pt   = enc.encode(JSON.stringify(obj));
  const ct   = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, pt);
  return {
    iv:   btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
    data: btoa(String.fromCharCode(...new Uint8Array(ct)))
  };
}

async function decryptJson(pkg, passphrase){
  const dec = new TextDecoder();
  const iv   = Uint8Array.from(atob(pkg.iv),   c => c.charCodeAt(0));
  const salt = Uint8Array.from(atob(pkg.salt), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(pkg.data), c => c.charCodeAt(0));
  const key  = await deriveKeyFromPassphrase(passphrase, salt);
  const pt   = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, data);
  return JSON.parse(dec.decode(pt));
}

// -------- 作成: 暗号化してFirestoreへ保存 --------
el('make').addEventListener('click', async () => {
  const title = el('title').value.trim();
  const body  = el('body').value.trim();
  const passphrase = el('passphrase').value;
  const unlockAt = el('unlockAt').value ? new Date(el('unlockAt').value).toISOString() : null;

  if (!title || !body) return alert('タイトルと本文を入力してください');
  if (!passphrase) return alert('合言葉を入力してください');

  const plaintext = { t: title, b: body }; // タイトルも本文も暗号化対象

  try {
    const encPkg = await encryptJson(plaintext, passphrase);
    const id = shortId(10);

    // Firestoreには暗号文とメタデータのみ保存（合言葉は保存しない）
    await setDoc(doc(db, "letters", id), {
      ...encPkg,
      u: unlockAt,    // ISO8601 or null
      c: Date.now()   // createdAt (ms)
    });

    const url = location.origin + location.pathname + "#id=" + id;
    el('shareUrl').value = url;
    el('result').classList.remove('hidden');
  } catch (e) {
    console.error(e);
    alert('保存中にエラーが発生しました');
  }
});

// クリップボード
el('copy').addEventListener('click', async ()=>{
  try{
    await navigator.clipboard.writeText(el('shareUrl').value);
    const btn = el('copy');
    const old = btn.textContent; btn.textContent = 'コピー済み✔️';
    setTimeout(()=>btn.textContent = old, 1200);
  }catch{ alert('コピーできませんでした'); }
});

// サンプル
el('demo').addEventListener('click', ()=>{
  el('title').value = '落ち込んだときに開けて';
  el('body').value = 'いつも頑張ってるね。今日は深呼吸して、好きな音楽を1曲だけ聴こう。\n大丈夫、ちゃんと前に進んでるよ。';
  el('passphrase').value = 'さくら2025';
});

// 新規作成に戻る
el('makeNew')?.addEventListener('click', ()=>{ location.hash=''; location.reload(); });

// -------- 閲覧: Firestoreから取得→合言葉で復号 --------
async function loadAndShowById(id){
  try{
    const ref = doc(db, "letters", id);
    const snap = await getDoc(ref);
    if (!snap.exists()){
      alert('手紙が見つかりません');
      showCreate();
      return;
    }
    const data = snap.data();

    // 時刻制限
    if (data.u){
      const unlockTs = Date.parse(data.u);
      if (Date.now() < unlockTs){
        showView();
        el('vtitle').textContent = '⏳ まだ開封できません';
        const j = new Intl.DateTimeFormat('ja-JP',{dateStyle:'full',timeStyle:'short'}).format(new Date(unlockTs));
        el('lockinfo').textContent = `開封可能: ${j}`;
        el('pwWrap').classList.add('hidden'); // まだ解錠させない
        return;
      }
    }

    // 合言葉入力→復号
    showView();
    el('vtitle').textContent = '🔒 合言葉で開封';
    el('lockinfo').textContent = '合言葉を入力してください。';
    el('pwWrap').classList.remove('hidden');

    el('open').onclick = async ()=>{
      const pass = el('viewPw').value;
      if (!pass) return alert('合言葉を入力してください');
      try{
        const plain = await decryptJson({iv:data.iv, salt:data.salt, data:data.data}, pass);
        el('ltitle').textContent = plain.t;
        el('lbody').textContent  = plain.b;
        el('gate').classList.add('hidden');
        el('letter').classList.remove('hidden');
      }catch(e){
        alert('合言葉が違うかデータが壊れています');
      }
    };
  }catch(e){
    console.error(e);
    alert('読み込みに失敗しました');
    showCreate();
  }
}

// 起動時ルーティング
(function init(){
  if (location.hash.startsWith('#id=')){
    const id = location.hash.slice(4);
    loadAndShowById(id);
  } else {
    showCreate();
  }
})();

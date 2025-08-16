import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// 🔧 Firebase設定（自分のプロジェクトの値に変更）
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

// URL作成
$("#make").onclick = async () => {
  const title = $("#title").value.trim();
  const body = $("#body").value.trim();
  const unlockAt = $("#unlockAt").value ? new Date($("#unlockAt").value).toISOString() : null;
  const pw = $("#password").value;

  if (!title || !body) return alert("タイトルと本文を入力してください");

  const data = { t:title, b:body, u:unlockAt, c:Date.now(), p:pw || null };

  const id = Math.random().toString(36).slice(2,10);
  await setDoc(doc(db,"letters",id), data);

  const url = location.origin + location.pathname + "#id=" + id;
  $("#shareUrl").value = url;
  $("#result").classList.remove("hidden");
};

// 手紙を読む
async function readLetter(id){
  const ref = doc(db,"letters",id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return alert("手紙が見つかりません");
  const data = snap.data();

  if (data.p){
    const inputPw = prompt("パスワードを入力してください");
    if (inputPw !== data.p) return alert("パスワードが違います");
  }
  if (data.u && Date.now() < Date.parse(data.u)){
    return alert("⏳ まだ開封できません: " + new Date(data.u).toLocaleString());
  }

  $("#ltitle").textContent = data.t;
  $("#lbody").textContent = data.b;
  $("#view").classList.remove("hidden");
  $("#create").classList.add("hidden");
}

// 起動時に #id= があれば読み込み
window.addEventListener("DOMContentLoaded",()=>{
  if (location.hash.startsWith("#id=")){
    const id = location.hash.replace("#id=","");
    readLetter(id);
  }
});

// サンプルボタン
$("#demo").onclick = ()=>{
  $("#title").value="落ち込んだときに開けて";
  $("#body").value="いつも頑張ってるね！大丈夫、ちゃんと前に進んでるよ。";
};
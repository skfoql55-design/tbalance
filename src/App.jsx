import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

/* ═══════════════════════════════════════════════════════
   GLOBAL HELPERS — Firebase Firestore 기반
═══════════════════════════════════════════════════════ */
const COLL = "storage";

/* ── IndexedDB 헬퍼 (디자인툴 대용량 저장용) ── */
const _IDB_NAME = "tbalance_design";
const _IDB_VER  = 1;
const _idbOpen  = () => new Promise((res, rej) => {
  const req = indexedDB.open(_IDB_NAME, _IDB_VER);
  req.onupgradeneeded = e => e.target.result.createObjectStore("kv");
  req.onsuccess  = e => res(e.target.result);
  req.onerror    = e => rej(e.target.error);
});
const idbSet = async (key, value) => {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
  });
};
const idbGet = async (key) => {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = e => res(e.target.result ?? null);
    req.onerror   = e => rej(e.target.error);
  });
};
const idbDel = async (key) => {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
  });
};
const idbKeys = async (prefix) => {
  const db = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").getAllKeys();
    req.onsuccess = e => res((e.target.result||[]).filter(k=>k.startsWith(prefix)));
    req.onerror   = e => rej(e.target.error);
  });
};

const sv = async (k, v) => {
  try {
    await setDoc(doc(db, COLL, k.replace(/[:/]/g, "_")), { value: JSON.stringify(v) });
  } catch(e) { console.error("sv error", e); }
};
const ld = async (k, d) => {
  try {
    const snap = await getDoc(doc(db, COLL, k.replace(/[:/]/g, "_")));
    if (snap.exists()) return JSON.parse(snap.data().value);
    return d;
  } catch(e) { return d; }
};

// Firebase Storage 이미지 업로드
const uploadImage = async (file, path) => {
  try {
    if(file.size > 20 * 1024 * 1024) throw new Error("20MB 초과");
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  } catch(e) {
    console.error("uploadImage error", e);
    // Storage 실패 시 base64 fallback
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = ev => res(ev.target.result);
      r.readAsDataURL(file);
    });
  }
};

const gid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const td  = () => new Date().toISOString().slice(0,10);
const fmt = n => Number(n||0).toLocaleString("ko-KR");
const won = n => fmt(n)+"원";

// CSV 내보내기
const exportCSV = (filename, headers, rows) => {
  const BOM = "\uFEFF";
  const lines = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c??"-").replace(/"/g,'""')}"`).join(","))];
  const blob = new Blob([BOM + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
};

/* ═══════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════ */
const NAV_ITEMS = [
  { id:"grouporders",icon:"🚚", label:"단체복 주문 현황" },
  { id:"calendar",  icon:"📅", label:"납기일 캘린더" },
  { id:"design",    icon:"🎨", label:"등판 시안 제작" },
  { id:"inventory", icon:"📦", label:"재고 관리" },
  { id:"sales",     icon:"📊", label:"매출 관리" },
  { id:"orders",    icon:"📋", label:"주문·명단 관리" },
  { id:"crm",       icon:"🏢", label:"거래처 관리" },
  { id:"payments",  icon:"💳", label:"입금 확인" },
  { id:"invoices",  icon:"🧾", label:"세금계산서" },
  { id:"messages",  icon:"💬", label:"메시지 템플릿" },
];
const SIZES = ["75","80","85","90","95","100","105","110","115","120"];
const EQUIP_CATS = ["라켓","러버","공","가방","의류","기타용품"];
const PAY_METHODS = ["계좌이체","카드","현금","카카오페이","네이버페이","기타"];
const CUST_TYPES  = ["동호회","개인","대리점","학교/기관","기타"];
const REGIONS     = ["서울","경기","인천","부산","대구","대전","광주","울산","강원","충북","충남","전북","전남","경북","경남","제주","기타"];
const MONTHS      = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const STATUS_FLOW = [
  { key:"consulting", label:"상담중",   color:"#64748b", bg:"#1e293b" },
  { key:"confirmed",  label:"시안확정", color:"#f59e0b", bg:"#78350f" },
  { key:"roster",     label:"명단접수", color:"#3b82f6", bg:"#1e3a5f" },
  { key:"producing",  label:"제작중",   color:"#8b5cf6", bg:"#3b0764" },
  { key:"shipping",   label:"배송중",   color:"#06b6d4", bg:"#164e63" },
  { key:"done",       label:"완료",     color:"#10b981", bg:"#064e3b" },
];
const DEFAULT_TPLS = [
  { id:"t1", title:"배송 지연 안내",    category:"배송", body:"안녕하세요, {거래처}님!\n주문하신 상품이 {날짜}까지 배송이 지연될 예정입니다.\n불편을 드려 진심으로 사과드립니다. 감사합니다. 🏓" },
  { id:"t2", title:"재고 품절 안내",    category:"재고", body:"안녕하세요, {거래처}님!\n주문하신 상품이 일시 품절 상태입니다.\n입고 예정일 {날짜}에 즉시 연락드리겠습니다. 감사합니다." },
  { id:"t3", title:"배송 완료 안내",    category:"배송", body:"안녕하세요, {거래처}님!\n주문하신 상품이 발송되었습니다.\n송장번호: {송장번호}\n감사합니다! 🏓" },
  { id:"t4", title:"입금 확인 요청",    category:"결제", body:"안녕하세요, {거래처}님!\n주문 금액 {금액}원의 입금이 아직 확인되지 않았습니다.\n확인 부탁드립니다. 감사합니다." },
  { id:"t5", title:"제작 완료·출고",    category:"제작", body:"안녕하세요, {거래처}님!\n등판 제작이 완료되어 오늘 출고 예정입니다.\n총 금액: {금액}원 감사합니다! 🏓" },
  { id:"t6", title:"이벤트·신상품 안내",category:"공지", body:"안녕하세요, {거래처}님!\n신규 유니폼 출시 소식을 알려드립니다.\n{내용}\n문의는 언제든지 연락 주세요. 감사합니다! 🏓" },
];
const BUILTIN_FONTS = [
  { name:"나눔고딕 Bold",  value:"'Nanum Gothic',sans-serif", weight:"800" },
  { name:"Impact",         value:"Impact,'Arial Black'",      weight:"400" },
  { name:"Arial Black",    value:"'Arial Black',sans-serif",  weight:"900" },
  { name:"Georgia",        value:"Georgia,serif",             weight:"400" },
];

/* ═══════════════════════════════════════════════════════
   MOBILE HELPERS
═══════════════════════════════════════════════════════ */
function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mob;
}

// inject global mobile CSS once
if (!document.getElementById("tb-mobile-css")) {
  const s = document.createElement("style");
  s.id = "tb-mobile-css";
  s.textContent = `
    * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
    input, select, textarea { font-size: 16px !important; }
    ::-webkit-scrollbar { width: 3px; height: 3px; }
    .tb-scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    @media (max-width: 767px) {
      .tb-hide-mobile { display: none !important; }
      .tb-full-modal { width: 100vw !important; max-width: 100vw !important; height: 100vh !important; max-height: 100vh !important; border-radius: 0 !important; }
    }
    @media (min-width: 768px) {
      .tb-hide-desktop { display: none !important; }
    }
    @keyframes tibot-bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-6px);opacity:1} }
    @keyframes tibot-fadein { from{opacity:0;transform:translateY(10px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
    @keyframes tibot-msgslide { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes tibot-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
    @keyframes tibot-fab-pop { 0%{transform:scale(.8);opacity:0} 100%{transform:scale(1);opacity:1} }
    .tibot-window { animation: tibot-fadein .22s cubic-bezier(.34,1.56,.64,1); }
    .tibot-msg    { animation: tibot-msgslide .2s ease; }
    .tibot-fab    { animation: tibot-fab-pop .3s cubic-bezier(.34,1.56,.64,1); }
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════════ */
export default function App() {
  const [user, setUser]   = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await ld("auth:user", null);
      setUser(u); setReady(true);
    })();
  }, []);

  const login  = async (u) => { setUser(u); await sv("auth:user", u); };
  const logout = async ()  => { setUser(null); await sv("auth:user", null); };

  if (!ready) return <Loading />;
  if (!user)  return <LoginScreen onLogin={login} />;
  return <MainApp user={user} onLogout={logout} />;
}

/* ═══════════════════════════════════════════════════════
   LOADING
═══════════════════════════════════════════════════════ */
function Loading() {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0b0f1a",color:"#64748b",gap:12}}>
      <div style={{fontSize:32}}>🏓</div>
      <div style={{fontSize:14}}>로딩 중...</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LOGIN SCREEN  (카카오 실제 연동)
═══════════════════════════════════════════════════════ */

// 카카오 SDK 동적 로드
const KAKAO_JS_KEY = "349e73eae2fbba62ebfd4369f85b7c2b";
function loadKakaoSDK() {
  return new Promise((resolve, reject) => {
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
      resolve(); return;
    }
    const s = document.createElement("script");
    s.src = "https://developers.kakao.com/sdk/js/kakao.js";
    s.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
      resolve();
    };
    s.onerror = () => reject(new Error("SDK load failed"));
    document.head.appendChild(s);
  });
}

function LoginScreen({ onLogin }) {
  const [step, setStep]       = useState("main");
  const [phone, setPhone]     = useState("");
  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const mockCode = "1234";

  // SDK 미리 로드
  useEffect(() => { loadKakaoSDK(); }, []);

  const sendCode = () => {
    if (!phone.trim()) { setErr("전화번호를 입력해주세요."); return; }
    setLoading(true); setErr("");
    setTimeout(() => { setLoading(false); setStep("code"); }, 1200);
  };

  const verify = () => {
    if (code !== mockCode) { setErr("인증번호가 올바르지 않습니다. (데모: 1234)"); return; }
    setLoading(true);
    setTimeout(() => {
      onLogin({ name:"직원", phone, loginAt: new Date().toISOString(), avatar:"👤" });
      setLoading(false);
    }, 800);
  };

  const kakaoLogin = async () => {
    setLoading(true); setErr("");
    try {
      await loadKakaoSDK();
      window.Kakao.Auth.login({
        success: async (authObj) => {
          try {
            // 사용자 정보 요청
            window.Kakao.API.request({
              url: "/v2/user/me",
              success: (res) => {
                const profile = res.kakao_account?.profile;
                const name = profile?.nickname || "카카오 사용자";
                const avatar = profile?.profile_image_url || "🟡";
                onLogin({
                  name,
                  avatar,
                  phone: "",
                  loginAt: new Date().toISOString(),
                  provider: "kakao",
                  kakaoId: res.id,
                });
                setLoading(false);
              },
              fail: () => {
                // 프로필 못가져와도 로그인은 허용
                onLogin({
                  name: "카카오 사용자",
                  avatar: "🟡",
                  phone: "",
                  loginAt: new Date().toISOString(),
                  provider: "kakao",
                });
                setLoading(false);
              }
            });
          } catch(e) {
            setErr("사용자 정보를 가져오지 못했습니다."); setLoading(false);
          }
        },
        fail: (err) => {
          console.error(err);
          setErr("카카오 로그인에 실패했습니다. 다시 시도해주세요.");
          setLoading(false);
        }
      });
    } catch(e) {
      setErr("카카오 SDK 로드 실패. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  };

  return (
    <div style={LS.bg}>
      <div style={LS.card}>
        {/* LOGO */}
        <div style={LS.logoArea}>
          <div style={LS.logoIcon}>🏓</div>
          <div style={LS.logoText}>티밸런스 관리 시스템</div>
          <div style={LS.logoSub}>단체복 주문 · 재고 · 매출 · 거래처 통합 관리</div>
        </div>

        {step === "main" && (
          <div style={LS.form}>
            {/* KAKAO LOGIN */}
            <button onClick={kakaoLogin} disabled={loading} style={LS.kakaoBtn}>
              {loading ? <span>로그인 중...</span> : (
                <>
                  <span style={LS.kakaoBtnIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="black">
                      <path d="M12 3C6.477 3 2 6.477 2 10.667c0 2.67 1.577 5.022 3.957 6.445L4.9 20.7a.5.5 0 00.73.553L9.5 18.96A12.26 12.26 0 0012 19.333c5.523 0 10-3.477 10-7.666C22 6.477 17.523 3 12 3z"/>
                    </svg>
                  </span>
                  카카오로 시작하기
                </>
              )}
            </button>

            {err && <div style={LS.err}>{err}</div>}

            <div style={LS.divider}><span>또는</span></div>

            {/* PHONE LOGIN */}
            <button onClick={()=>setStep("phone")} style={LS.phoneBtn}>📱 전화번호로 로그인</button>
          </div>
        )}

        {step === "phone" && (
          <div style={LS.form}>
            <div style={LS.stepTitle}>전화번호 입력</div>
            <input style={LS.inp} placeholder="010-0000-0000" value={phone}
              onChange={e=>{ setPhone(e.target.value); setErr(""); }}
              onKeyDown={e=>e.key==="Enter"&&sendCode()} autoFocus />
            {err && <div style={LS.err}>{err}</div>}
            <button onClick={sendCode} disabled={loading} style={LS.submitBtn}>
              {loading ? "발송 중..." : "인증번호 발송"}
            </button>
            <button onClick={()=>{setStep("main");setErr("");}} style={LS.backBtn}>← 돌아가기</button>
          </div>
        )}

        {step === "code" && (
          <div style={LS.form}>
            <div style={LS.stepTitle}>인증번호 입력</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:10,textAlign:"center"}}>{phone}으로 발송된 4자리를 입력하세요<br/><span style={{color:"#f59e0b"}}>(데모 인증번호: 1234)</span></div>
            <input style={{...LS.inp,textAlign:"center",fontSize:24,letterSpacing:12,fontWeight:700}} placeholder="0000"
              maxLength={4} value={code} onChange={e=>{ setCode(e.target.value); setErr(""); }}
              onKeyDown={e=>e.key==="Enter"&&verify()} autoFocus />
            {err && <div style={LS.err}>{err}</div>}
            <button onClick={verify} disabled={loading} style={LS.submitBtn}>
              {loading ? "확인 중..." : "확인"}
            </button>
            <button onClick={()=>{setStep("phone");setCode("");setErr("");}} style={LS.backBtn}>← 다시 발송</button>
          </div>
        )}
      </div>
    </div>
  );
}
const LS = {
  bg:       { display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"linear-gradient(135deg,#0b0f1a 0%,#111827 50%,#0b0f1a 100%)",fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif" },
  card:     { background:"#111827",border:"1px solid #1e293b",borderRadius:20,padding:"40px 36px",width:"min(380px,90vw)",boxShadow:"0 25px 60px rgba(0,0,0,0.6)" },
  logoArea: { textAlign:"center",marginBottom:32 },
  logoIcon: { fontSize:52,marginBottom:10 },
  logoText: { fontSize:18,fontWeight:700,color:"#f1f5f9",letterSpacing:"-0.5px" },
  logoSub:  { fontSize:11,color:"#64748b",marginTop:5,lineHeight:1.5 },
  form:     { display:"flex",flexDirection:"column",gap:10 },
  kakaoBtn: { display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#FEE500",color:"#000",border:"none",borderRadius:10,padding:"13px",fontWeight:700,fontSize:14,cursor:"pointer",width:"100%",transition:"all 0.15s" },
  kakaoBtnIcon:{ display:"flex",alignItems:"center" },
  phoneBtn: { background:"#1e293b",color:"#e2e8f0",border:"1px solid #334155",borderRadius:10,padding:"13px",fontWeight:500,fontSize:14,cursor:"pointer",width:"100%",transition:"all 0.15s" },
  divider:  { display:"flex",alignItems:"center",gap:10,color:"#334155",fontSize:12, "& span":{background:"#111827",padding:"0 8px"} },
  stepTitle:{ fontSize:15,fontWeight:600,color:"#f1f5f9",textAlign:"center",marginBottom:4 },
  inp:      { background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"12px 14px",color:"#f1f5f9",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box" },
  submitBtn:{ background:"#3b82f6",color:"white",border:"none",borderRadius:8,padding:"13px",fontWeight:600,fontSize:14,cursor:"pointer",width:"100%",transition:"all 0.15s" },
  backBtn:  { background:"none",color:"#64748b",border:"none",padding:"8px",cursor:"pointer",fontSize:13,width:"100%",textAlign:"center" },
  err:      { color:"#f87171",fontSize:12,textAlign:"center" },
  notice:   { fontSize:10,color:"#334155",textAlign:"center",lineHeight:1.6,marginTop:8 },
  spinner:  { fontSize:16 },
};

/* ═══════════════════════════════════════════════════════
   MAIN APP — SHELL (모바일 대응)
═══════════════════════════════════════════════════════ */
function MainApp({ user, onLogout }) {
  const [page, setPage]       = useState(() => {
    const hash = window.location.hash.replace("#","");
    return NAV_ITEMS.find(n=>n.id===hash) ? hash : "grouporders";
  });
  const [sideOpen, setSide]   = useState(true);
  const [drawerOpen, setDrw]  = useState(false);
  const [toast, setToast]     = useState(null);
  const [botOpen, setBotOpen] = useState(false);
  const isMobile              = useIsMobile();

  // 페이지 변경 시 URL 해시 업데이트
  useEffect(() => { window.location.hash = page; }, [page]);

  // ── GLOBAL DATA STATE ──
  const [uniforms,  setU]  = useState([]);
  const [equips,    setE]  = useState([]);
  const [invHist,   setIH] = useState([]);
  const [agencies,  setAg] = useState([]);
  const [uSales,    setUS] = useState([]);
  const [eSales,    setES] = useState([]);
  const [orders,    setOr] = useState([]);
  const [customers, setC]  = useState([]);
  const [payments,  setP]  = useState([]);
  const [invoices,  setIn] = useState([]);
  const [templates, setT]  = useState(DEFAULT_TPLS);
  const [groupOrders, setGO] = useState([]);
  const [dbReady,   setDbR]= useState(false);

  useEffect(() => {
    (async () => {
      const [u,e,ih,ag,us,es,or,c,p,inv,t,go] = await Promise.all([
        ld("inv:uniforms",[]), ld("inv:equips",[]), ld("inv:history",[]), ld("inv:agencies",[]),
        ld("sales:uniform",[]), ld("sales:equip",[]),
        ld("orders:list",[]),
        ld("crm:customers",[]), ld("crm:payments",[]), ld("crm:invoices",[]), ld("crm:templates",DEFAULT_TPLS),
        ld("go:list",[]),
      ]);
      setU(u);setE(e);setIH(ih);setAg(ag);setUS(us);setES(es);setOr(or);setC(c);setP(p);setIn(inv);setT(t);setGO(go);
      setDbR(true);
    })();
  }, []);

  const toast_ = (msg,ok=true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),2800); };

  const su  = async n => { setU(n);  await sv("inv:uniforms",n); };
  const se  = async n => { setE(n);  await sv("inv:equips",n); };
  const sih = async n => { setIH(n); await sv("inv:history",n); };
  const sag = async n => { setAg(n); await sv("inv:agencies",n); };
  const sus = async n => { setUS(n); await sv("sales:uniform",n); };
  const ses = async n => { setES(n); await sv("sales:equip",n); };
  const sor = async n => { setOr(n); await sv("orders:list",n); };
  const sc  = async n => { setC(n);  await sv("crm:customers",n); };
  const sp  = async n => { setP(n);  await sv("crm:payments",n); };
  const si  = async n => { setIn(n); await sv("crm:invoices",n); };
  const st  = async n => { setT(n);  await sv("crm:templates",n); };
  const sgo = async n => { setGO(n); await sv("go:list",n); };

  const unpaidCount = payments.filter(p=>!p.paid).length;
  const db = { uniforms,equips,invHist,agencies,uSales,eSales,orders,customers,payments,invoices,templates,groupOrders,
    su,se,sih,sag,sus,ses,sor,sc,sp,si,st,sgo,toast_ };

  const goPage = (id) => { setPage(id); setDrw(false); };

  if (!dbReady) return <Loading />;

  // ── BOTTOM NAV items (모바일: 자주쓰는 5개 + 더보기) ──
  const BOT_NAV = [
    { id:"grouporders", icon:"🚚", label:"주문현황" },
    { id:"calendar",    icon:"📅", label:"캘린더" },
    { id:"payments",    icon:"💳", label:"입금확인" },
    { id:"sales",       icon:"📊", label:"매출" },
    { id:"__more__",    icon:"☰",  label:"더보기" },
  ];

  const curItem = NAV_ITEMS.find(n=>n.id===page);

  return (
    <div style={{ display:"flex", height:"100vh", background:"#0b0f1a", color:"#e2e8f0",
      fontFamily:"'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif",
      overflow:"hidden", flexDirection: isMobile ? "column" : "row" }}>

      {/* ── PC SIDEBAR ── */}
      {!isMobile && (
        <div style={{ width:sideOpen?220:56, background:"#0d1117", borderRight:"1px solid #1e293b",
          display:"flex", flexDirection:"column", transition:"width 0.2s", flexShrink:0, overflow:"hidden" }}>
          <div style={{ padding:"14px 12px", borderBottom:"1px solid #1e293b" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:sideOpen?10:0 }}>
              {sideOpen && <span style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", whiteSpace:"nowrap" }}>🏓 티밸런스</span>}
              <button style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:12, padding:4, borderRadius:4 }}
                onClick={()=>setSide(p=>!p)}>{sideOpen?"◀":"▶"}</button>
            </div>
            {sideOpen && <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0" }}>
              <span style={{ fontSize:18 }}>{user.avatar||"👤"}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:"#f1f5f9" }}>{user.name}</div>
                <div style={{ fontSize:10, color:"#64748b" }}>{user.phone||"카카오 로그인"}</div>
              </div>
            </div>}
          </div>
          <nav style={{ flex:1, padding:"8px 6px", overflowY:"auto", display:"flex", flexDirection:"column", gap:2 }}>
            {NAV_ITEMS.map(item=>(
              <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:8,
                cursor:"pointer", transition:"all 0.15s",
                background:page===item.id?"#1e293b":"transparent",
                color:page===item.id?"#f1f5f9":"#64748b",
                borderLeft:page===item.id?"3px solid #3b82f6":"3px solid transparent" }}
                onClick={()=>setPage(item.id)} title={item.label}>
                <span style={{ fontSize:16, flexShrink:0, width:20, textAlign:"center" }}>{item.icon}</span>
                {sideOpen && <span style={{ fontSize:12, fontWeight:500, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6 }}>
                  {item.label}
                  {item.id==="payments"&&unpaidCount>0&&<span style={{ background:"#ef4444", color:"white", borderRadius:10, padding:"1px 5px", fontSize:10, fontWeight:700 }}>{unpaidCount}</span>}
                </span>}
              </div>
            ))}
          </nav>
          {sideOpen && <div style={{ padding:"12px", borderTop:"1px solid #1e293b" }}>
            <button style={{ background:"none", border:"1px solid #334155", color:"#64748b", borderRadius:7, padding:"7px 12px", cursor:"pointer", fontSize:12, width:"100%" }}
              onClick={onLogout}>🚪 로그아웃</button>
          </div>}
        </div>
      )}

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {isMobile && drawerOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:300, display:"flex" }}>
          {/* backdrop */}
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.7)" }} onClick={()=>setDrw(false)}/>
          {/* drawer panel */}
          <div style={{ position:"relative", width:260, background:"#0d1117", borderRight:"1px solid #1e293b",
            display:"flex", flexDirection:"column", height:"100%", zIndex:1 }}>
            <div style={{ padding:"16px 14px", borderBottom:"1px solid #1e293b", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:22 }}>{user.avatar||"👤"}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9" }}>{user.name}</div>
                  <div style={{ fontSize:11, color:"#64748b" }}>{user.phone||"카카오 로그인"}</div>
                </div>
              </div>
              <button style={{ background:"none", border:"none", color:"#64748b", fontSize:20, cursor:"pointer" }} onClick={()=>setDrw(false)}>✕</button>
            </div>
            <nav style={{ flex:1, padding:"10px 8px", overflowY:"auto", display:"flex", flexDirection:"column", gap:2 }}>
              {NAV_ITEMS.map(item=>(
                <div key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 12px", borderRadius:10,
                  cursor:"pointer",
                  background:page===item.id?"#1e293b":"transparent",
                  color:page===item.id?"#f1f5f9":"#94a3b8",
                  borderLeft:page===item.id?"3px solid #3b82f6":"3px solid transparent" }}
                  onClick={()=>goPage(item.id)}>
                  <span style={{ fontSize:18 }}>{item.icon}</span>
                  <span style={{ fontSize:14, fontWeight:page===item.id?600:400 }}>
                    {item.label}
                    {item.id==="payments"&&unpaidCount>0&&<span style={{ background:"#ef4444", color:"white", borderRadius:10, padding:"1px 6px", fontSize:11, fontWeight:700, marginLeft:6 }}>{unpaidCount}</span>}
                  </span>
                </div>
              ))}
            </nav>
            <div style={{ padding:"14px", borderTop:"1px solid #1e293b" }}>
              <button style={{ background:"#1e293b", border:"1px solid #334155", color:"#94a3b8", borderRadius:8, padding:"10px", cursor:"pointer", fontSize:13, width:"100%" }}
                onClick={()=>{ onLogout(); setDrw(false); }}>🚪 로그아웃</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        {/* TOP BAR */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding: isMobile ? "10px 14px" : "12px 20px",
          background:"#0d1117", borderBottom:"1px solid #1e293b", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {isMobile && (
              <button style={{ background:"none", border:"none", color:"#94a3b8", fontSize:20, cursor:"pointer", padding:"2px 4px", lineHeight:1 }}
                onClick={()=>setDrw(true)}>☰</button>
            )}
            <div style={{ fontSize: isMobile?14:16, fontWeight:600, color:"#f1f5f9" }}>
              {curItem?.icon} {curItem?.label}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {/* 알림 벨 */}
            <NotifBell payments={payments} groupOrders={groupOrders} onGoPage={goPage}/>
            <div style={{ fontSize:11, color:"#64748b" }}>
              {new Date().toLocaleDateString("ko-KR",{month:"short",day:"numeric",weekday:"short"})}
            </div>
          </div>
        </div>

        {/* PAGE CONTENT */}
        {/* DesignTool: 탭 이탈 시에도 상태 유지를 위해 항상 마운트, display:none으로 숨김 */}
        <div style={{ flex:1, overflowY:"auto", padding: isMobile ? 12 : 20,
          paddingBottom: isMobile ? 80 : 20, display: page==="design" ? "block" : "none" }}>
          <DesignTool isMobile={isMobile}/>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding: isMobile ? 12 : 20,
          paddingBottom: isMobile ? 80 : 20, display: page!=="design" ? "block" : "none" }}>
          {page==="grouporders"&& <GroupOrdersPage db={db} isMobile={isMobile}/>}
          {page==="calendar"   && <CalendarPage db={db} isMobile={isMobile}/>}
          {page==="inventory" && <InventoryPage db={db} isMobile={isMobile}/>}
          {page==="sales"     && <SalesPage db={db} isMobile={isMobile}/>}
          {page==="orders"    && <OrdersPage db={db} isMobile={isMobile}/>}
          {page==="crm"       && <CRMPage db={db} isMobile={isMobile}/>}
          {page==="payments"  && <PaymentsPage db={db} isMobile={isMobile}/>}
          {page==="invoices"  && <InvoicesPage db={db} isMobile={isMobile}/>}
          {page==="messages"  && <MessagesPage db={db} isMobile={isMobile}/>}
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      {isMobile && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:200,
          background:"#0d1117", borderTop:"1px solid #1e293b",
          display:"flex", alignItems:"stretch",
          paddingBottom:"env(safe-area-inset-bottom,0px)" }}>
          {BOT_NAV.map(item=>{
            const isActive = item.id==="__more__" ? false : page===item.id;
            const isMore   = item.id==="__more__";
            return (
              <div key={item.id} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center", padding:"8px 4px 6px",
                cursor:"pointer", position:"relative",
                color: isActive?"#3b82f6":"#64748b",
                borderTop: isActive?"2px solid #3b82f6":"2px solid transparent" }}
                onClick={()=>isMore ? setDrw(true) : goPage(item.id)}>
                <span style={{ fontSize:18, lineHeight:1 }}>{item.icon}</span>
                <span style={{ fontSize:10, marginTop:3, fontWeight:isActive?600:400 }}>{item.label}</span>
                {item.id==="payments" && unpaidCount>0 && (
                  <span style={{ position:"absolute", top:4, right:"calc(50% - 18px)",
                    background:"#ef4444", color:"white", borderRadius:10,
                    padding:"0px 4px", fontSize:9, fontWeight:700, minWidth:14, textAlign:"center" }}>{unpaidCount}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && <div style={{ position:"fixed", bottom: isMobile?76:24, left:"50%", transform:"translateX(-50%)",
        padding:"10px 26px", borderRadius:10, color:"white", fontSize:13, fontWeight:500,
        zIndex:999, boxShadow:"0 4px 24px rgba(0,0,0,0.5)", whiteSpace:"nowrap",
        background:toast.ok?"#064e3b":"#7f1d1d" }}>{toast.msg}</div>}

      {/* ── 티봇 AI 챗봇 ── */}
      <TiBotFloat open={botOpen} onToggle={()=>setBotOpen(p=>!p)} isMobile={isMobile}/>
    </div>
  );
}
const A = {
  root:        { display:"flex",height:"100vh",background:"#0b0f1a",color:"#e2e8f0",fontFamily:"'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif",overflow:"hidden" },
  sidebar:     { width:220,background:"#0d1117",borderRight:"1px solid #1e293b",display:"flex",flexDirection:"column",transition:"width 0.2s",flexShrink:0,overflow:"hidden" },
  sidebarClosed:{ width:56 },
  sideTop:     { padding:"14px 12px",borderBottom:"1px solid #1e293b" },
  sideLogoRow: { display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 },
  sideLogo:    { fontSize:13,fontWeight:700,color:"#f1f5f9",whiteSpace:"nowrap" },
  sideToggle:  { background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:12,padding:4,borderRadius:4,flexShrink:0 },
  sideUser:    { display:"flex",alignItems:"center",gap:8,padding:"6px 0" },
  nav:         { flex:1,padding:"8px 6px",overflowY:"auto",display:"flex",flexDirection:"column",gap:2 },
  navItem:     { display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:8,cursor:"pointer",transition:"all 0.15s",color:"#64748b" },
  navItemA:    { background:"#1e293b",color:"#f1f5f9",borderLeft:"3px solid #3b82f6" },
  navIcon:     { fontSize:16,flexShrink:0,width:20,textAlign:"center" },
  navLabel:    { fontSize:12,fontWeight:500,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6 },
  navBadge:    { background:"#ef4444",color:"white",borderRadius:10,padding:"1px 5px",fontSize:10,fontWeight:700 },
  sideBottom:  { padding:"12px",borderTop:"1px solid #1e293b" },
  logoutBtn:   { background:"none",border:"1px solid #334155",color:"#64748b",borderRadius:7,padding:"7px 12px",cursor:"pointer",fontSize:12,width:"100%",transition:"all 0.15s" },
  main:        { flex:1,display:"flex",flexDirection:"column",overflow:"hidden" },
  topBar:      { display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px",background:"#0d1117",borderBottom:"1px solid #1e293b",flexShrink:0 },
  pageTitle:   { fontSize:16,fontWeight:600,color:"#f1f5f9" },
  pageContent: { flex:1,overflowY:"auto",padding:20 },
  toast:       { position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",padding:"10px 26px",borderRadius:10,color:"white",fontSize:13,fontWeight:500,zIndex:999,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",whiteSpace:"nowrap" },
};

/* ═══════════════════════════════════════════════════════
   MODULE 1 — DESIGN TOOL
═══════════════════════════════════════════════════════ */
const PW=720, PH=450;
let _lid=0; const nid=()=>`L${++_lid}_${Date.now()}`;
const COLORS=["#ffffff","#000000","#ffdd00","#ff3333","#3399ff","#00cc66","#ff6600","#cc33ff","#ff99cc","#99ccff"];

function DesignTool() {
  const [mockup, setMockup]   = useState(null);
  const [mockupLib, setLib]   = useState([]);    // {name,src}[] 등록된 목업 라이브러리
  const [selLib, setSelLib]   = useState("");    // 드롭다운 선택값
  const [libDrag, setLibDrag] = useState(false); // 라이브러리 드래그오버
  const [upProg, setUpProg]   = useState(null);  // {current,total,name} 업로드 진행상태
  const [fontProg, setFontProg] = useState(null); // {current,total,name,pct} 폰트 업로드 진행
  const [layers, setLayers]   = useState([]);
  const [sel, setSel]         = useState(null);
  const [fonts, setFonts]       = useState(BUILTIN_FONTS);
  const fontLoadedRef           = useRef(false); // 폰트 초기 로드 여부
  const [custName, setCN]     = useState("");
  const [saves, setSaves]     = useState([]);
  const [rTab, setRTab]       = useState("props");
  const [toast_, setToast]    = useState(null);
  const [drag, setDrag]       = useState(false);
  const dragRef = useRef(null);
  const prevRef = useRef(null);
  const mkRef=useRef(), lgRef=useRef(), fnRef=useRef(), libRef=useRef();
  const upd = (id,p) => setLayers(l=>l.map(x=>x.id===id?{...x,...p}:x));
  const selL = layers.find(l=>l.id===sel)||null;
  const toast = (m,ok=true) => { setToast({m,ok}); setTimeout(()=>setToast(null),2200); };

  // ── 초기 로드
  const libLoadedRef = useRef(false); // 초기 로드 여부 추적
  useEffect(()=>{ (async()=>{
    // 거래처 저장 목록 로드 (Firestore)
    try{ const list=await ld("ds:__saves",[]); setSaves(list); }catch{}
    // 목업 이미지 라이브러리 로드 (Firestore: URL 목록)
    try{
      const lib=await ld("ds:__mklib",[]);
      if(lib?.length) setLib(lib);
    }catch(e){ console.error("라이브러리 로드 실패",e); }
    finally{ libLoadedRef.current=true; }
    // ── 커스텀 폰트 복원: IndexedDB 우선(빠름/CORS없음), 없으면 Firebase URL fallback
    try{
      const saved = await ld("ds:__fonts",[]);
      if(saved?.length){
        const loaded=[];
        for(const f of saved){
          try{
            // 1) IndexedDB 캐시에서 ArrayBuffer 읽기
            let buf = await idbGet("font:"+f.name);
            // 2) 없으면 Firebase Storage URL로 fetch (다른 컴퓨터)
            if(!buf && f.url){
              try{
                const res = await fetch(f.url);
                buf = await res.arrayBuffer();
                await idbSet("font:"+f.name, buf); // 로컬에 캐시
              }catch(fe){ console.warn("폰트 URL fetch 실패:",f.name,fe); }
            }
            if(!buf) continue;
            const ff = new FontFace(f.name, buf, {weight:f.weight||"400"});
            await ff.load();
            document.fonts.add(ff);
            loaded.push(f);
          }catch(e){ console.warn("폰트 복원 실패:",f.name,e); }
        }
        if(loaded.length) setFonts(p=>[...BUILTIN_FONTS,...loaded]);
      }
    }catch(e){ console.error("폰트 목록 로드 실패",e); }
    finally{ fontLoadedRef.current=true; }
  })(); },[]);

  // ── mockupLib 변경될 때마다 Firestore에 자동 저장
  useEffect(()=>{
    if(!libLoadedRef.current) return;
    const toSave = mockupLib.filter(x=>x.url?.startsWith("https://"));
    sv("ds:__mklib", toSave).catch(console.error);
  },[mockupLib]);

  // ── fonts 변경될 때마다 Firestore에 자동 저장 (BUILTIN 제외, URL 있는 것만)
  useEffect(()=>{
    if(!fontLoadedRef.current) return;
    const builtinNames = new Set(BUILTIN_FONTS.map(f=>f.name));
    const toSave = fonts.filter(f=>!builtinNames.has(f.name) && f.url);
    sv("ds:__fonts", toSave).catch(console.error);
  },[fonts]);

  const addText = (preset) => {
    const id=nid();
    // 현재 등록된 폰트 중 마지막(가장 최근) 폰트 사용
    const lastFont = fonts[fonts.length-1];
    const fontFamily = lastFont?.value || lastFont?.name || "'Arial Black',sans-serif";
    const fontWeight = lastFont?.weight || "900";
    setLayers(p=>[...p,{ id,type:"text",text:preset,x:PW/2,y:PH/2-25,fontSize:52,fontFamily,fontWeight,color:"#ffffff",strokeColor:"#000000",strokeWidth:3,italic:false,letterSpacing:2,textAlign:"center" }]);
    setSel(id); setRTab("props");
  };

  // ── 등판 레이아웃 템플릿 ──
  // 캔버스(720×450) 기준: 등판 중심 x≈540(오른쪽 패널 중앙), y≈265
  // 이미지 기준: 등판 텍스트 위치 (캔버스 720x450) — 실측값 x=553, y=115
  const BACK_X = 553;
  const BACK_Y = 115;

  // 현재 폰트 목록에서 사용할 폰트 결정 (커스텀 폰트 우선, 없으면 빌트인 마지막)
  const getActiveFont = () => {
    const builtinNames = new Set(BUILTIN_FONTS.map(f=>f.name));
    const custom = fonts.filter(f=>!builtinNames.has(f.name));
    const target = custom.length ? custom[custom.length-1] : fonts[fonts.length-1];
    return { family: target?.value||target?.name||"'Arial Black',sans-serif", weight: target?.weight||"400" };
  };

  // 등판 1줄: 영문명 한 줄 — 등판 중앙 배치, 크기 25, 현재 폰트
  const addBackPanel1 = () => {
    const id = nid();
    const {family, weight} = getActiveFont();
    setLayers(p=>[...p,{
      id, type:"text", text:"YU NA RAE",
      x:BACK_X, y:BACK_Y,
      fontSize:25, fontFamily:family, fontWeight:weight,
      color:"#ffffff", strokeColor:"#000000", strokeWidth:0,
      italic:false, letterSpacing:0, textAlign:"center", scaleX:1,
    }]);
    setSel(id); setRTab("props");
  };

  // 등판 2줄: 한글명(위) + 영문명(아래) 두 줄 — 등판 중앙 배치
  const addBackPanel2 = () => {
    const id1=nid(), id2=nid();
    const {family, weight} = getActiveFont();
    const base = { type:"text", x:BACK_X, fontFamily:family, fontWeight:weight,
      color:"#ffffff", strokeColor:"#000000", strokeWidth:0,
      italic:false, letterSpacing:0, textAlign:"center", scaleX:1 };
    setLayers(p=>[...p,
      {...base, id:id1, text:"홍길동",    fontSize:22, y:BACK_Y-16},
      {...base, id:id2, text:"YU NA RAE", fontSize:18, y:BACK_Y+14},
    ]);
    setSel(id1); setRTab("props");
    toast("등판 2줄 레이아웃 추가!");
  };

  // 스폰 등판: 스폰서 로고 위치용 텍스트 플레이스홀더 (추후 로고 레이어로 확장 예정)
  const addSponBack = () => {
    const id = nid();
    const {family, weight} = getActiveFont();
    setLayers(p=>[...p,{
      id, type:"text", text:"SPONSOR",
      x:BACK_X, y:Math.round(PH*0.32),
      fontSize:14, fontFamily:family, fontWeight:weight,
      color:"#ffffff", strokeColor:"#000000", strokeWidth:0,
      italic:false, letterSpacing:0, textAlign:"center", scaleX:1,
    }]);
    setSel(id); setRTab("props");
    toast("스폰 등판 플레이스홀더 추가!");
  };
  // ── 목업 라이브러리: 여러 파일 추가
const addToLib = async (files) => {
  const arr = Array.from(files).filter(f=>f.type.startsWith("image/"));
  if(!arr.length) return;
  const total = arr.length;
  let savedCount=0;
  const newItems=[];
  for(let i=0; i<arr.length; i++){
    const file = arr[i];
    const name = file.name.replace(/\.[^/.]+$/,"");
    setUpProg({current:i+1, total, name});
    try{
      const path = `mockup_lib/${name}_${Date.now()}`;
      const url  = await uploadImage(file, path);
      newItems.push({name, url});
      savedCount++;
    }catch(e){ console.warn(`업로드 실패: ${file.name}`, e); }
  }
  setUpProg(null);
  if(!newItems.length){ toast("업로드 실패", false); return; }
  // setState 순수하게: sv 호출은 mockupLib useEffect가 자동 처리
  setLib(prev => {
    const map = Object.fromEntries(prev.map(x=>[x.name,x]));
    newItems.forEach(x=>{ map[x.name]=x; });
    return Object.values(map);
  });
  toast(`${savedCount}개 이미지 등록 완료!`);
};
const removeFromLib = async (name) => {
  // Firebase Storage 파일 삭제 시도 (URL에서 경로 추출)
  const item = mockupLib.find(x=>x.name===name);
  if(item?.url && item.url.startsWith("https://")){
    try{
      const storageRef = ref(storage, decodeURIComponent(item.url.split("/o/")[1]?.split("?")[0]||""));
      await deleteObject(storageRef);
    }catch{}
  }
  // setState 순수하게: sv 호출은 mockupLib useEffect가 자동 처리
  setLib(prev => prev.filter(x=>x.name!==name));
  if(selLib===name) setSelLib("");
};
const selectFromLib = (name) => {
  setSelLib(name);
  const item = mockupLib.find(x=>x.name===name);
  if(item) setMockup(item.url || item.src);
};

const addLogo = (file) => {
    if(!file)return; const r=new FileReader(); r.onload=e=>{
      const img=new Image(); img.onload=()=>{
        const ratio=img.width/img.height; const w=Math.min(150,img.width); const h=w/ratio;
        const id=nid(); setLayers(p=>[...p,{id,type:"logo",src:e.target.result,x:PW/2-w/2,y:PH/2-h/2,width:w,height:h}]);
        setSel(id); setRTab("props");
      }; img.src=e.target.result;
    }; r.readAsDataURL(file);
  };
  // ── 폰트 다중 등록: IndexedDB(로컬캐시) + Firebase Storage(다른기기) + 로딩바
  const loadFonts = async(files) => {
    const arr = Array.from(files).filter(f=>/\.(ttf|otf|woff|woff2)$/i.test(f.name));
    if(!arr.length) return;
    fontLoadedRef.current = true; // 로드 전에 true로 설정해 저장 useEffect 활성화
    const total = arr.length;
    let successCount = 0;
    const newFonts = [];
    for(let i=0; i<arr.length; i++){
      const file = arr[i];
      const name = file.name.replace(/\.[^/.]+$/,"");
      setFontProg({current:i+1, total, name, pct:0});
      try{
        // 1) ArrayBuffer 읽기
        const buf = await file.arrayBuffer();
        // 2) IndexedDB에 바이너리 저장 (새로고침 복원용 - CORS 없음)
        await idbSet("font:"+name, buf);
        // 3) FontFace 즉시 적용
        const ff = new FontFace(name, buf, {weight:"400"});
        await ff.load();
        document.fonts.add(ff);
        setFontProg({current:i+1, total, name, pct:60});
        // 4) Firebase Storage 업로드 (다른 기기 공유용)
        let url = "";
        try{
          const sRef = ref(storage, `fonts/${name}_${Date.now()}.${file.name.split(".").pop()}`);
          await uploadBytes(sRef, file);
          url = await getDownloadURL(sRef);
          setFontProg({current:i+1, total, name, pct:100});
        }catch(e){ console.warn("폰트 Firebase 업로드 실패 (로컬은 유지됨):",e); }
        newFonts.push({name, value:name, weight:"400", url});
        successCount++;
      }catch(e){
        console.error("폰트 로드 실패:",file.name,e);
      }
    }
    setFontProg(null);
    if(!newFonts.length){ toast("폰트 등록 실패", false); return; }
    setFonts(prev=>{
      const existing = new Set(prev.map(f=>f.name));
      const added = newFonts.filter(f=>!existing.has(f.name));
      return [...prev, ...added];
    });
    toast(`폰트 ${successCount}개 등록 완료!${newFonts.some(f=>f.url)?" ☁️":" 💾"}`);
  };

  const onLayerMD = (e,id,mode="move") => {
    e.preventDefault(); e.stopPropagation(); setSel(id);
    const layer=layers.find(l=>l.id===id); const rect=prevRef.current.getBoundingClientRect();
    dragRef.current={ id,mode,sx:e.clientX-rect.left,sy:e.clientY-rect.top,ox:layer.x,oy:layer.y,ow:layer.width||0,oh:layer.height||0 };
  };
  const onMM = useCallback((e) => {
    if(!dragRef.current||!prevRef.current)return;
    const rect=prevRef.current.getBoundingClientRect();
    const cx=e.clientX-rect.left,cy=e.clientY-rect.top;
    const dx=cx-dragRef.current.sx,dy=cy-dragRef.current.sy;
    if(dragRef.current.mode==="move") upd(dragRef.current.id,{x:dragRef.current.ox+dx,y:dragRef.current.oy+dy});
    else upd(dragRef.current.id,{width:Math.max(30,dragRef.current.ow+dx),height:Math.max(30,dragRef.current.oh+dy)});
  },[]);
  const onMU = useCallback(()=>{ dragRef.current=null; },[]);
  useEffect(()=>{ window.addEventListener("mousemove",onMM); window.addEventListener("mouseup",onMU); return()=>{ window.removeEventListener("mousemove",onMM); window.removeEventListener("mouseup",onMU); }; },[onMM,onMU]);

  const renderCanvas = async(scale=2) => {
    const cv=document.createElement("canvas"); cv.width=PW*scale; cv.height=PH*scale;
    const ctx=cv.getContext("2d");
    if(mockup){ const img=new Image(); img.src=mockup; await new Promise(r=>{img.onload=r;img.onerror=r;}); ctx.drawImage(img,0,0,cv.width,cv.height); }
    else{ ctx.fillStyle="#1a1a2e"; ctx.fillRect(0,0,cv.width,cv.height); }
    for(const l of layers){
      if(l.type==="text"){
        const fs=l.fontSize*scale; const style=l.italic?"italic ":"";
        ctx.font=`${style}${l.fontWeight||"bold"} ${fs}px ${l.fontFamily}`;
        ctx.textBaseline="top"; ctx.textAlign=l.textAlign||"left"; ctx.letterSpacing=((l.letterSpacing||0)*scale)+"px";
        if(l.strokeWidth>0){ ctx.strokeStyle=l.strokeColor; ctx.lineWidth=l.strokeWidth*scale*2; ctx.lineJoin="round"; ctx.strokeText(l.text,l.x*scale,l.y*scale); }
        ctx.fillStyle=l.color; ctx.fillText(l.text,l.x*scale,l.y*scale);
      } else if(l.type==="logo"){
        const img=new Image(); img.src=l.src; await new Promise(r=>{img.onload=r;img.onerror=r;});
        ctx.drawImage(img,l.x*scale,l.y*scale,l.width*scale,l.height*scale);
      }
    }
    return cv;
  };
  const download = async()=>{ const cv=await renderCanvas(2); const a=document.createElement("a"); a.href=cv.toDataURL("image/png"); a.download=`${custName||"등판시안"}.png`; a.click(); toast("다운로드 완료!"); };
  const copy = async()=>{ try{ const cv=await renderCanvas(2); cv.toBlob(async b=>{ await navigator.clipboard.write([new ClipboardItem({"image/png":b})]); toast("클립보드 복사 완료!"); }); }catch{ toast("복사 실패",false); } };
  const saveCust = async()=>{ if(!custName.trim()){ toast("거래처명 입력 필요",false); return; } const k=custName.trim(); const list=await ld("ds:__saves",[]); const next=[...new Set([...list,k])]; await sv("ds:__saves",next); await sv(`ds:cust:${k}`,{mockup,layers}); setSaves(next); toast(`"${custName}" 저장 완료!`); };
  const loadCust = async(k)=>{ try{ const d=await ld(`ds:cust:${k}`,null); if(!d)return; setMockup(d.mockup||null); setLayers(d.layers||[]); setCN(k); setSel(null); toast(`불러오기 완료!`); }catch(e){ console.error(e); } };
  const delCust  = async(k)=>{ const list=await ld("ds:__saves",[]); const next=list.filter(x=>x!==k); await sv("ds:__saves",next); setSaves(next); };
  const delLayer = id=>{ setLayers(p=>p.filter(l=>l.id!==id)); if(sel===id)setSel(null); };

  return (
    <div style={{display:"flex",gap:16,height:"calc(100vh - 110px)"}}>
      {/* LEFT */}
      <div style={D.left}>
        <Sec title="📁 목업 이미지">
  {/* 다중 파일 드래그&드롭 존 */}
  <div
    onDragOver={e=>{e.preventDefault();if(!upProg)setLibDrag(true);}}
    onDragLeave={()=>setLibDrag(false)}
    onDrop={e=>{e.preventDefault();setLibDrag(false);if(!upProg)addToLib(e.dataTransfer.files);}}
    onClick={()=>{ if(!upProg) libRef.current.click(); }}
    style={{
      border:`2px dashed ${upProg?"#3b82f6":libDrag?"#60a5fa":"#334155"}`,
      borderRadius:8, padding:"12px 8px", textAlign:"center",
      cursor:upProg?"default":"pointer",
      background:upProg?"rgba(59,130,246,0.06)":libDrag?"rgba(59,130,246,0.08)":"#0b0f1a",
      transition:"all 0.15s", marginBottom:8,
    }}>
    {upProg ? (
      /* ── 업로드 진행 중 표시 ── */
      <div style={{padding:"4px 0"}}>
        <div style={{fontSize:14,marginBottom:6}}>☁️</div>
        <div style={{fontSize:11,color:"#60a5fa",fontWeight:600,marginBottom:4,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>
          {upProg.name}
        </div>
        {/* 로딩바 */}
        <div style={{background:"#1e293b",borderRadius:99,height:6,overflow:"hidden",marginBottom:4}}>
          <div style={{
            height:"100%", borderRadius:99,
            background:"linear-gradient(90deg,#3b82f6,#60a5fa)",
            width:`${Math.round((upProg.current/upProg.total)*100)}%`,
            transition:"width 0.3s ease",
            boxShadow:"0 0 6px rgba(96,165,250,0.6)",
          }}/>
        </div>
        <div style={{fontSize:10,color:"#64748b"}}>
          {upProg.current} / {upProg.total}개 업로드 중...
        </div>
      </div>
    ) : (
      <>
        <div style={{fontSize:20,marginBottom:4}}>🖼</div>
        <div style={{fontSize:11,color:libDrag?"#60a5fa":"#64748b",lineHeight:1.4}}>
          이미지를 드래그하거나<br/>클릭해서 등록
        </div>
        <div style={{fontSize:10,color:"#374151",marginTop:3}}>여러 파일 동시 등록 가능</div>
      </>
    )}
  </div>
  <input type="file" accept="image/*" multiple ref={libRef} style={{display:"none"}}
    onChange={e=>addToLib(e.target.files)} />

  {/* 등록된 이미지 드롭다운 선택 */}
  {mockupLib.length>0 && <>
    <select
      value={selLib}
      onChange={e=>selectFromLib(e.target.value)}
      style={{
        width:"100%", background:"#1e293b", border:"1px solid #334155",
        borderRadius:7, color:"#f1f5f9", fontSize:12, padding:"6px 8px",
        marginBottom:6, outline:"none", cursor:"pointer",
      }}>
      <option value="">— 이미지 선택 ({mockupLib.length}개) —</option>
      {mockupLib.map(x=>(
        <option key={x.name} value={x.name}>{x.name}</option>
      ))}
    </select>

    {/* 현재 선택된 이미지 미리보기 + 삭제 */}
    {selLib && (()=>{
      const item=mockupLib.find(x=>x.name===selLib);
      return item ? (
        <div style={{position:"relative",marginBottom:6}}>
          <img src={item.url||item.src} style={{width:"100%",borderRadius:6,display:"block"}} alt=""/>
          <button onClick={e=>{e.stopPropagation();removeFromLib(selLib);}}
            style={{position:"absolute",top:4,right:4,width:20,height:20,borderRadius:4,
              background:"rgba(127,29,29,0.9)",border:"none",color:"white",cursor:"pointer",fontSize:11,lineHeight:1}}>✕</button>
        </div>
      ) : null;
    })()}

    {/* 등록된 이미지 썸네일 목록 */}
    <div style={{display:"flex",flexWrap:"wrap",gap:4,maxHeight:90,overflowY:"auto"}}>
      {mockupLib.map(x=>(
        <div key={x.name} title={x.name}
          onClick={()=>selectFromLib(x.name)}
          style={{
            width:44,height:44,borderRadius:5,overflow:"hidden",cursor:"pointer",flexShrink:0,
            border:`2px solid ${selLib===x.name?"#3b82f6":"#1e293b"}`,
            transition:"border-color 0.15s",
          }}>
          <img src={x.url||x.src} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={x.name}/>
        </div>
      ))}
    </div>
  </>}
</Sec>
        <Sec title="✏️ 텍스트 추가">
          {["동호회명","한글명","영문명","번호","기타"].map(t=>(
            <SBtn key={t} full onClick={()=>addText(t)} style={{marginBottom:4}}>{t}</SBtn>
          ))}
        </Sec>
        <Sec title="👕 등판 레이아웃">
          <div style={{fontSize:10,color:"#64748b",marginBottom:5}}>현재 폰트·크기·위치 자동 적용</div>
          <SBtn full onClick={addBackPanel1} color="#1d4ed8" style={{marginBottom:4}}>등판 1줄</SBtn>
          <SBtn full onClick={addBackPanel2} color="#065f46" style={{marginBottom:4}}>등판 2줄</SBtn>
          <SBtn full onClick={addSponBack}   color="#4c1d95" style={{marginBottom:4}}>스폰 등판</SBtn>
        </Sec>
        <Sec title="🖼 로고">
          <input type="file" accept="image/*" ref={lgRef} style={{display:"none"}} onChange={e=>addLogo(e.target.files[0])} />
          <SBtn full onClick={()=>lgRef.current.click()}>📂 로고 불러오기</SBtn>
          <a href="https://www.remove.bg" target="_blank" rel="noreferrer" style={{display:"block",background:"#f97316",color:"white",padding:"6px 0",borderRadius:6,textAlign:"center",fontSize:12,textDecoration:"none",marginTop:5}}>🖼 배경 제거 (remove.bg)</a>
        </Sec>
        {(()=>{
          const builtinNames = new Set(BUILTIN_FONTS.map(f=>f.name));
          const customFonts  = fonts.filter(f=>!builtinNames.has(f.name));
          const removeFont   = async(fname) => {
            const item = fonts.find(x=>x.name===fname);
            // Firebase Storage 삭제
            if(item?.url?.startsWith("https://")){
              try{
                const sRef=ref(storage,decodeURIComponent(item.url.split("/o/")[1]?.split("?")[0]||""));
                await deleteObject(sRef);
              }catch{}
            }
            // IndexedDB 캐시 삭제
            try{ await idbDel("font:"+fname); }catch{}
            setFonts(p=>p.filter(x=>x.name!==fname));
          };
          return (
            <Sec title="🔤 폰트">
              <input type="file" accept=".ttf,.otf,.woff,.woff2" ref={fnRef} style={{display:"none"}} multiple onChange={e=>loadFonts(e.target.files)} />
              <SBtn full onClick={()=>fnRef.current.click()} disabled={!!fontProg}>
                {fontProg ? `⏳ 폰트 등록 중... (${fontProg.current}/${fontProg.total})` : "📂 폰트 불러오기"}
              </SBtn>
              {/* 폰트 업로드 로딩바 */}
              {fontProg&&(
                <div style={{marginTop:6,background:"#0f172a",borderRadius:7,padding:"8px 10px",border:"1px solid #1e3a5f"}}>
                  <div style={{fontSize:10,color:"#93c5fd",marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    📝 {fontProg.name}
                  </div>
                  <div style={{background:"#1e293b",borderRadius:4,height:6,overflow:"hidden"}}>
                    <div style={{
                      height:"100%",borderRadius:4,transition:"width 0.3s ease",
                      width:`${fontProg.pct||0}%`,
                      background:"linear-gradient(90deg,#3b82f6,#8b5cf6)",
                      boxShadow:"0 0 6px #3b82f6aa"
                    }}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                    <span style={{fontSize:9,color:"#475569"}}>{fontProg.current}/{fontProg.total}개 처리 중</span>
                    <span style={{fontSize:9,color:"#3b82f6"}}>{fontProg.pct||0}%</span>
                  </div>
                </div>
              )}
              {customFonts.length>0&&(
                <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:3}}>
                  <div style={{fontSize:10,color:"#64748b",marginBottom:2}}>등록된 폰트 ({customFonts.length}개)</div>
                  {customFonts.map(f=>(
                    <div key={f.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      background:"#1e293b",borderRadius:6,padding:"4px 8px",border:"1px solid #334155"}}>
                      <span style={{fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",
                        whiteSpace:"nowrap",maxWidth:"80%",fontFamily:f.value||f.name}}>
                        {f.url?"☁️ ":"💾 "}{f.name}
                      </span>
                      <button onClick={()=>removeFont(f.name)}
                        style={{background:"#7f1d1d",border:"none",color:"white",borderRadius:4,
                          width:18,height:18,cursor:"pointer",fontSize:10,flexShrink:0,lineHeight:1}}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </Sec>
          );
        })()}
      </div>

      {/* CENTER */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",overflowY:"auto"}}>
        <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
          <input style={D.cInput} placeholder="거래처명..." value={custName} onChange={e=>setCN(e.target.value)} />
          <SBtn onClick={saveCust} color="#3b82f6">💾 저장</SBtn>
          <SBtn onClick={download} color="#10b981">⬇ 다운로드</SBtn>
          <SBtn onClick={copy} color="#8b5cf6">📋 복사</SBtn>
        </div>
        <div ref={prevRef} style={{...D.preview,...(drag?{border:"2px dashed #3b82f6"}:{})}} onClick={()=>setSel(null)}
          onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f?.type.startsWith("image/")){const r=new FileReader();r.onload=ev=>setMockup(ev.target.result);r.readAsDataURL(f);}}}>
          {mockup ? <img src={mockup} style={{width:"100%",height:"100%",objectFit:"cover",userSelect:"none",pointerEvents:"none"}} alt="" draggable={false} /> : <div style={D.drop}>🖼 목업 이미지를 드래그하거나 좌측에서 등록</div>}
          {layers.map(l=>l.type==="text"
            ? <TextLayerEl key={l.id} layer={l} sel={sel===l.id} onMD={e=>onLayerMD(e,l.id)} onClick={e=>{e.stopPropagation();setSel(l.id);setRTab("props");}} />
            : <LogoLayerEl key={l.id} layer={l} sel={sel===l.id} onMD={e=>onLayerMD(e,l.id)} onRMD={e=>onLayerMD(e,l.id,"resize")} onClick={e=>{e.stopPropagation();setSel(l.id);setRTab("props");}} />
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div style={D.right}>
        <div style={D.rTabs}>
          {[["props","⚙️ 속성"],["layers","📋 레이어"],["saves","📂 저장"]].map(([k,l])=>(
            <div key={k} style={{...D.rTab,...(rTab===k?D.rTabA:{})}} onClick={()=>setRTab(k)}>{l}</div>
          ))}
        </div>
        <div style={{overflowY:"auto",flex:1,padding:10}}>
          {rTab==="props" && selL?.type==="text" && (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <FRow label="텍스트"><input style={SI.inp} value={selL.text} onChange={e=>upd(sel,{text:e.target.value})} /></FRow>
              <FRow label="폰트">
                <select style={SI.inp} value={selL.fontFamily} onChange={e=>upd(sel,{fontFamily:e.target.value})}>
                  {fonts.map(f=><option key={f.name} value={f.value}>{f.name}</option>)}
                </select>
              </FRow>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <FRow label="크기"><input type="number" style={SI.inp} min={8} max={200} value={selL.fontSize} onChange={e=>upd(sel,{fontSize:Number(e.target.value)})} /></FRow>
                <FRow label="자간"><input type="number" style={SI.inp} min={-10} max={30} value={selL.letterSpacing||0} onChange={e=>upd(sel,{letterSpacing:Number(e.target.value)})} /></FRow>
              </div>
              <FRow label="가로 비율">
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input type="range" min={30} max={200} step={1} style={{flex:1,accentColor:"#3b82f6"}}
                    value={Math.round((selL.scaleX||1)*100)}
                    onChange={e=>upd(sel,{scaleX:Number(e.target.value)/100})} />
                  <span style={{fontSize:11,color:"#f59e0b",minWidth:34,textAlign:"right",fontWeight:600}}>
                    {Math.round((selL.scaleX||1)*100)}%
                  </span>
                </div>
                <div style={{display:"flex",gap:4,marginTop:4}}>
                  {[50,75,100,125,150].map(v=>(
                    <div key={v} onClick={()=>upd(sel,{scaleX:v/100})}
                      style={{...SI.chip,padding:"2px 6px",fontSize:10,
                        ...(Math.round((selL.scaleX||1)*100)===v?SI.chipA:{})}}>
                      {v}%
                    </div>
                  ))}
                </div>
              </FRow>
              <FRow label="색상">
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:4}}>{COLORS.map(c=><div key={c} onClick={()=>upd(sel,{color:c})} style={{width:20,height:20,borderRadius:3,background:c,cursor:"pointer",border:selL.color===c?"2px solid #3b82f6":"2px solid transparent"}} />)}</div>
                <input type="color" style={{...SI.inp,height:28}} value={selL.color} onChange={e=>upd(sel,{color:e.target.value})} />
              </FRow>
              <FRow label="외곽선">
                {/* 없음 버튼 */}
                <div style={{marginBottom:4}}>
                  <div onClick={()=>upd(sel,{strokeWidth:0})}
                    style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:5,fontSize:11,cursor:"pointer",
                      background:selL.strokeWidth===0?"#1d4ed8":"#1e293b",
                      border:selL.strokeWidth===0?"1px solid #3b82f6":"1px solid #334155",
                      color:selL.strokeWidth===0?"white":"#94a3b8",fontWeight:selL.strokeWidth===0?700:400}}>
                    없음
                  </div>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:4,opacity:selL.strokeWidth===0?0.35:1}}>
                  {COLORS.map(c=><div key={c} onClick={()=>upd(sel,{strokeColor:c,strokeWidth:selL.strokeWidth===0?2:selL.strokeWidth})}
                    style={{width:20,height:20,borderRadius:3,background:c,cursor:"pointer",border:selL.strokeColor===c?"2px solid #3b82f6":"2px solid transparent"}} />)}
                </div>
                <input type="color" style={{...SI.inp,height:28,opacity:selL.strokeWidth===0?0.35:1}}
                  value={selL.strokeColor} onChange={e=>upd(sel,{strokeColor:e.target.value,strokeWidth:selL.strokeWidth===0?2:selL.strokeWidth})} />
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                  <input type="range" min={0} max={10} step={0.5} style={{flex:1,accentColor:"#3b82f6"}}
                    value={selL.strokeWidth} onChange={e=>upd(sel,{strokeWidth:Number(e.target.value)})} />
                  <span style={{fontSize:10,color:"#64748b",minWidth:20,textAlign:"right"}}>{selL.strokeWidth}</span>
                </div>
              </FRow>
              <FRow label="정렬">
                <div style={{display:"flex",gap:5}}>
                  {[["left","←"],["center","⬛"],["right","→"]].map(([v,l])=>(
                    <div key={v} style={{...SI.chip,...((selL.textAlign||"center")===v?SI.chipA:{})}} onClick={()=>upd(sel,{textAlign:v})}>{l}</div>
                  ))}
                </div>
              </FRow>
              <div style={{display:"flex",gap:5}}>
                <div style={{...SI.chip,...(selL.italic?SI.chipA:{})}} onClick={()=>upd(sel,{italic:!selL.italic})}>이탤릭</div>
              </div>
              {/* ── X/Y 좌표 조정 ── */}
              <FRow label="위치 (X / Y)">
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <div>
                    <div style={{fontSize:9,color:"#64748b",marginBottom:2}}>X (좌우)</div>
                    <div style={{display:"flex",alignItems:"center",gap:3}}>
                      <button onClick={()=>upd(sel,{x:Math.round(selL.x-1)})}
                        style={{width:20,height:24,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",borderRadius:4,cursor:"pointer",fontSize:12,lineHeight:1,flexShrink:0}}>‹</button>
                      <input type="number" style={{...SI.inp,textAlign:"center",padding:"3px 2px",fontSize:11}}
                        value={Math.round(selL.x)} onChange={e=>upd(sel,{x:Number(e.target.value)})}/>
                      <button onClick={()=>upd(sel,{x:Math.round(selL.x+1)})}
                        style={{width:20,height:24,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",borderRadius:4,cursor:"pointer",fontSize:12,lineHeight:1,flexShrink:0}}>›</button>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:"#64748b",marginBottom:2}}>Y (상하)</div>
                    <div style={{display:"flex",alignItems:"center",gap:3}}>
                      <button onClick={()=>upd(sel,{y:Math.round(selL.y-1)})}
                        style={{width:20,height:24,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",borderRadius:4,cursor:"pointer",fontSize:12,lineHeight:1,flexShrink:0}}>‹</button>
                      <input type="number" style={{...SI.inp,textAlign:"center",padding:"3px 2px",fontSize:11}}
                        value={Math.round(selL.y)} onChange={e=>upd(sel,{y:Number(e.target.value)})}/>
                      <button onClick={()=>upd(sel,{y:Math.round(selL.y+1)})}
                        style={{width:20,height:24,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",borderRadius:4,cursor:"pointer",fontSize:12,lineHeight:1,flexShrink:0}}>›</button>
                    </div>
                  </div>
                </div>
              </FRow>
              <SBtn full onClick={()=>delLayer(sel)} color="#7f1d1d">🗑 삭제</SBtn>
            </div>
          )}
          {rTab==="props" && selL?.type==="logo" && (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <FRow label="너비"><input type="number" style={SI.inp} value={Math.round(selL.width)} onChange={e=>upd(sel,{width:Number(e.target.value)})} /></FRow>
                <FRow label="높이"><input type="number" style={SI.inp} value={Math.round(selL.height)} onChange={e=>upd(sel,{height:Number(e.target.value)})} /></FRow>
              </div>
              <SBtn full onClick={()=>delLayer(sel)} color="#7f1d1d">🗑 삭제</SBtn>
            </div>
          )}
          {rTab==="props" && !selL && <div style={{color:"#4b5563",fontSize:12,textAlign:"center",paddingTop:30}}>레이어를 선택하세요</div>}
          {rTab==="layers" && (
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {layers.length===0&&<div style={{color:"#4b5563",fontSize:12,textAlign:"center",paddingTop:20}}>레이어 없음</div>}
              {[...layers].reverse().map(l=>(
                <div key={l.id} style={{...SI.layerRow,...(sel===l.id?{border:"1px solid #3b82f6",background:"#1e3a5f"}:{})}} onClick={()=>{setSel(l.id);setRTab("props");}}>
                  <span>{l.type==="text"?"✏️":"🖼"}</span>
                  <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12}}>{l.type==="text"?l.text:"로고"}</span>
                  <button onClick={e=>{e.stopPropagation();delLayer(l.id);}} style={{background:"#7f1d1d",border:"none",color:"white",borderRadius:3,cursor:"pointer",fontSize:10,padding:"1px 5px"}}>✕</button>
                </div>
              ))}
            </div>
          )}
          {rTab==="saves" && (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>거래처명 입력 후 [저장] 버튼</div>
              {saves.length===0&&<div style={{color:"#4b5563",fontSize:12,textAlign:"center",paddingTop:20}}>저장된 시안 없음</div>}
              {saves.map(k=>(
                <div key={k} style={{display:"flex",gap:5,alignItems:"center",background:"#1e293b",borderRadius:6,padding:"7px 8px"}}>
                  <span style={{flex:1,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k.replace("ds:","")}</span>
                  <SBtn onClick={()=>loadCust(k)} color="#1e3a5f">열기</SBtn>
                  <SBtn onClick={()=>delCust(k)} color="#7f1d1d">삭제</SBtn>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {toast_ && <div style={{...A.toast,background:toast_.ok?"#064e3b":"#7f1d1d",zIndex:999}}>{toast_.m}</div>}
    </div>
  );
}
function TextLayerEl({layer,sel,onMD,onClick}){
  const t={left:"translateX(0)",center:"translateX(-50%)",right:"translateX(-100%)"}[layer.textAlign||"center"];
  const sx = layer.scaleX||1;
  const transformStr = `${t} scaleX(${sx})`;
  return <div onMouseDown={onMD} onClick={onClick} style={{position:"absolute",left:layer.x,top:layer.y,transform:transformStr,cursor:"move",userSelect:"none",outline:sel?"2px solid #3b82f6":"2px solid transparent",outlineOffset:3,borderRadius:2,padding:"0 2px",whiteSpace:"nowrap",fontSize:layer.fontSize,fontFamily:layer.fontFamily,fontWeight:layer.fontWeight||"bold",fontStyle:layer.italic?"italic":"normal",color:layer.color,letterSpacing:(layer.letterSpacing||0)+"px",WebkitTextStroke:layer.strokeWidth>0?`${layer.strokeWidth}px ${layer.strokeColor}`:"0px transparent",paintOrder:"stroke fill",lineHeight:1.1}}>
    {layer.text}{sel&&<Handles/>}
  </div>;
}
function LogoLayerEl({layer,sel,onMD,onRMD,onClick}){
  return <div style={{position:"absolute",left:layer.x,top:layer.y,width:layer.width,height:layer.height,outline:sel?"2px solid #3b82f6":"2px solid transparent",outlineOffset:2,cursor:"move",userSelect:"none"}} onMouseDown={onMD} onClick={onClick}>
    <img src={layer.src} style={{width:"100%",height:"100%",objectFit:"contain",display:"block",pointerEvents:"none"}} alt="" draggable={false} />
    {sel&&<><Handles/><div onMouseDown={e=>{e.stopPropagation();onRMD(e);}} style={{position:"absolute",bottom:-6,right:-6,width:14,height:14,background:"#3b82f6",borderRadius:3,cursor:"se-resize",border:"2px solid white",boxSizing:"border-box"}} /></>}
  </div>;
}
function Handles(){
  return [{top:-5,left:-5},{top:-5,right:-5},{bottom:-5,left:-5},{bottom:-5,right:-5}].map((p,i)=>(
    <div key={i} style={{position:"absolute",width:8,height:8,background:"white",border:"1.5px solid #3b82f6",borderRadius:2,pointerEvents:"none",...p}} />
  ));
}
const D = {
  left:    { width:168,background:"#0d1117",borderRadius:10,padding:10,display:"flex",flexDirection:"column",gap:12,overflowY:"auto",flexShrink:0 },
  cInput:  { background:"#1e293b",border:"1px solid #334155",borderRadius:7,padding:"6px 10px",color:"#f1f5f9",fontSize:12,outline:"none",width:140 },
  preview: { position:"relative",width:PW,height:PH,background:"#1a1a2e",borderRadius:10,overflow:"hidden",border:"2px solid #1e293b",flexShrink:0 },
  drop:    { position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",color:"#4b5563",fontSize:14 },
  right:   { width:210,background:"#0d1117",borderRadius:10,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden" },
  rTabs:   { display:"flex",borderBottom:"1px solid #1e293b" },
  rTab:    { flex:1,padding:"8px 2px",textAlign:"center",fontSize:10,color:"#64748b",cursor:"pointer",transition:"all 0.15s" },
  rTabA:   { color:"#3b82f6",borderBottom:"2px solid #3b82f6",background:"#1e293b" },
};
const SI = {
  inp:      { background:"#1e293b",border:"1px solid #334155",borderRadius:5,padding:"5px 7px",color:"#f1f5f9",fontSize:12,outline:"none",width:"100%",boxSizing:"border-box" },
  chip:     { padding:"3px 8px",borderRadius:5,background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",cursor:"pointer",fontSize:11,fontWeight:500,userSelect:"none" },
  chipA:    { background:"#1d4ed8",border:"1px solid #3b82f6",color:"white" },
  layerRow: { display:"flex",alignItems:"center",gap:6,padding:"6px 8px",borderRadius:6,cursor:"pointer",background:"#1e293b",border:"1px solid #1e293b" },
};

/* ═══════════════════════════════════════════════════════
   SHARED UI PRIMITIVES
═══════════════════════════════════════════════════════ */
function SBtn({children,onClick,color="#374151",full=false,style={}}){
  const [h,setH]=useState(false);
  return <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    style={{background:h?color+"cc":color,border:"none",color:"white",padding:"6px 11px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:500,width:full?"100%":"auto",transition:"all 0.15s",whiteSpace:"nowrap",...style}}>{children}</button>;
}
function MBtn({children,onClick,red=false}){
  return <button onClick={onClick} style={{background:red?"#7f1d1d":"#1e293b",border:"1px solid "+(red?"#ef4444":"#334155"),color:"white",padding:"3px 8px",borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:500,whiteSpace:"nowrap"}}>{children}</button>;
}
function Sec({title,children}){ return <div><div style={{fontSize:10,fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>{title}</div>{children}</div>; }
function FRow({label,children}){ return <div style={{marginBottom:6}}><div style={{fontSize:10,color:"#94a3b8",marginBottom:3}}>{label}</div>{children}</div>; }
function Chip({children,active,onClick,green,red}){
  const bg=active?(green?"#064e3b":red?"#7f1d1d":"#1d4ed8"):"#1e293b";
  const bc=active?(green?"#10b981":red?"#ef4444":"#3b82f6"):"#334155";
  const cl=active?(green?"#6ee7b7":red?"#fca5a5":"white"):"#94a3b8";
  return <div onClick={onClick} style={{padding:"4px 9px",borderRadius:6,background:bg,border:`1px solid ${bc}`,color:cl,cursor:"pointer",fontSize:11,fontWeight:500,userSelect:"none",whiteSpace:"nowrap"}}>{children}</div>;
}
function Modal({title,onClose,children,wide=false}){
  const isMob = window.innerWidth < 768;
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:200,display:"flex",
    alignItems:isMob?"flex-end":"center",justifyContent:"center",backdropFilter:"blur(4px)"}}
    onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:"#111827",border:"1px solid #1e293b",
      borderRadius:isMob?"20px 20px 0 0":"14px",
      width:isMob?"100vw":wide?"min(700px,97vw)":"min(540px,97vw)",
      maxHeight:isMob?"92vh":"90vh",
      overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid #1e293b",flexShrink:0}}>
        <span style={{fontSize:15,fontWeight:600}}>{title}</span>
        <button style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px"}} onClick={onClose}>✕</button>
      </div>
      <div style={{padding:"16px 20px",overflowY:"auto",flex:1,WebkitOverflowScrolling:"touch"}}>{children}</div>
    </div>
  </div>;
}
function EmptyState({icon,msg,sub}){ return <div style={{textAlign:"center",padding:"50px 0",color:"#4b5563"}}><div style={{fontSize:40,marginBottom:8}}>{icon}</div><div style={{color:"#9ca3af",fontWeight:500}}>{msg}</div>{sub&&<div style={{fontSize:12,marginTop:4}}>{sub}</div>}</div>; }
function THead({cols,style={}}){ return <div style={{display:"grid",gap:6,padding:"8px 14px",background:"#0b0f1a",fontSize:10,fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.4px",...style}}>{cols.map((c,i)=><span key={i} style={{textAlign:c.align||"left"}}>{c.label}</span>)}</div>; }
function TypeBadge({type}){
  const m={동호회:"#1d4ed8",개인:"#374151",대리점:"#7c3aed","학교/기관":"#065f46",기타:"#374151"};
  return <span style={{background:m[type]||"#374151",color:"white",padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:600}}>{type}</span>;
}
function PayTag({method}){
  const bg={계좌이체:"#1e3a5f",카드:"#3b0764",현금:"#064e3b",카카오페이:"#78350f",네이버페이:"#14532d"}[method]||"#374151";
  return <span style={{background:bg,color:"white",padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:500}}>{method||"-"}</span>;
}
function PaidBtn({paid,onClick}){
  return <button onClick={onClick} style={{background:paid?"#064e3b":"#7f1d1d",color:paid?"#6ee7b7":"#fca5a5",border:"none",borderRadius:5,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{paid?"✓ 완료":"미수금"}</button>;
}
const GS = {
  page:    { display:"flex",flexDirection:"column",gap:0 },
  toolbar: { display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center" },
  sInp:    { background:"#1e293b",border:"1px solid #334155",borderRadius:7,padding:"7px 12px",color:"#f1f5f9",fontSize:14,outline:"none" },
  sSel:    { background:"#1e293b",border:"1px solid #334155",borderRadius:7,padding:"7px 10px",color:"#f1f5f9",fontSize:14,outline:"none",cursor:"pointer" },
  tbl:     { background:"#111827",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b" },
  tRow:    { display:"grid",gap:6,padding:"9px 14px",alignItems:"center",borderTop:"1px solid #1e293b",fontSize:12 },
  fRow:    { marginBottom:12 },
  fLabel:  { fontSize:12,color:"#94a3b8",fontWeight:500,marginBottom:5 },
  inp:     { background:"#1e293b",border:"1px solid #334155",borderRadius:7,padding:"10px 12px",color:"#f1f5f9",fontSize:16,outline:"none",width:"100%",boxSizing:"border-box" },
  mBtns:   { display:"flex",gap:8,marginTop:16 },
  fGrid:   { display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:4 },
  chips:   { display:"flex",flexWrap:"wrap",gap:5 },
};
function MFR({label,children}){ return <div style={GS.fRow}><div style={GS.fLabel}>{label}</div>{children}</div>; }
function SumPill({label,val,color}){ return <div style={{background:"#1e293b",border:"1px solid #334155",borderRadius:7,padding:"6px 12px",display:"flex",flexDirection:"column",alignItems:"center"}}><span style={{fontSize:10,color:"#64748b"}}>{label}</span><span style={{fontSize:13,fontWeight:600,color}}>{val}</span></div>; }
function StatBadge({label,val,color}){ return <div style={{background:"#1e293b",border:`1px solid ${color}33`,borderRadius:8,padding:"6px 12px",textAlign:"center"}}><div style={{fontSize:9,color:"#64748b"}}>{label}</div><div style={{fontSize:13,fontWeight:700,color,marginTop:1}}>{val}</div></div>; }

/* ═══════════════════════════════════════════════════════
   알림 벨 컴포넌트
═══════════════════════════════════════════════════════ */
function NotifBell({ payments, groupOrders, onGoPage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const unpaid = (payments||[]).filter(p => !p.paid);
  const overdue = (groupOrders||[]).filter(o => {
    if (o.status === "arrived" || !o.expectedAt) return false;
    return diffDays(o.expectedAt) < 0;
  });
  const soon = (groupOrders||[]).filter(o => {
    if (o.status === "arrived" || !o.expectedAt) return false;
    const d = diffDays(o.expectedAt);
    return d >= 0 && d <= 3;
  });

  const total = unpaid.length + overdue.length + soon.length;

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={() => setOpen(p => !p)} style={{
        background: total > 0 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${total > 0 ? "#ef4444" : "#334155"}`,
        borderRadius: 8, padding:"5px 10px", cursor:"pointer", position:"relative",
        color: total > 0 ? "#fca5a5" : "#64748b", fontSize:16, lineHeight:1
      }}>
        🔔
        {total > 0 && (
          <span style={{ position:"absolute", top:-6, right:-6, background:"#ef4444", color:"white",
            borderRadius:10, padding:"0 5px", fontSize:10, fontWeight:700, minWidth:16, textAlign:"center" }}>
            {total}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)", width:300,
          background:"#111827", border:"1px solid #1e293b", borderRadius:12, zIndex:500,
          boxShadow:"0 8px 32px rgba(0,0,0,0.5)", overflow:"hidden" }}>
          <div style={{ padding:"12px 14px", borderBottom:"1px solid #1e293b", fontWeight:600, fontSize:13 }}>
            🔔 알림 {total > 0 ? `(${total})` : ""}
          </div>
          <div style={{ maxHeight:380, overflowY:"auto" }}>
            {total === 0 && (
              <div style={{ padding:"24px", textAlign:"center", color:"#64748b", fontSize:13 }}>
                ✅ 알림이 없습니다
              </div>
            )}
            {overdue.length > 0 && (
              <div>
                <div style={{ padding:"8px 14px", fontSize:10, fontWeight:700, color:"#ef4444",
                  background:"rgba(239,68,68,0.08)", textTransform:"uppercase" }}>🚨 납기 초과</div>
                {overdue.map(o => (
                  <div key={o.id} onClick={() => { onGoPage("grouporders"); setOpen(false); }}
                    style={{ padding:"10px 14px", borderBottom:"1px solid #1e293b", cursor:"pointer",
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}
                    onMouseEnter={e=>e.currentTarget.style.background="#1e293b"}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{o.customer}</div>
                      <div style={{ fontSize:11, color:"#94a3b8" }}>{o.uniformName} · 납기 {o.expectedAt}</div>
                    </div>
                    <span style={{ color:"#ef4444", fontWeight:700, fontSize:12 }}>
                      D+{Math.abs(diffDays(o.expectedAt))}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {soon.length > 0 && (
              <div>
                <div style={{ padding:"8px 14px", fontSize:10, fontWeight:700, color:"#f59e0b",
                  background:"rgba(245,158,11,0.08)", textTransform:"uppercase" }}>⚠️ 3일 이내 납기</div>
                {soon.map(o => (
                  <div key={o.id} onClick={() => { onGoPage("grouporders"); setOpen(false); }}
                    style={{ padding:"10px 14px", borderBottom:"1px solid #1e293b", cursor:"pointer",
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}
                    onMouseEnter={e=>e.currentTarget.style.background="#1e293b"}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{o.customer}</div>
                      <div style={{ fontSize:11, color:"#94a3b8" }}>{o.uniformName}</div>
                    </div>
                    <span style={{ color:"#f59e0b", fontWeight:700, fontSize:12 }}>
                      D-{diffDays(o.expectedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {unpaid.length > 0 && (
              <div>
                <div style={{ padding:"8px 14px", fontSize:10, fontWeight:700, color:"#a78bfa",
                  background:"rgba(167,139,250,0.08)", textTransform:"uppercase" }}>💳 미수금</div>
                {unpaid.slice(0, 5).map(p => (
                  <div key={p.id} onClick={() => { onGoPage("payments"); setOpen(false); }}
                    style={{ padding:"10px 14px", borderBottom:"1px solid #1e293b", cursor:"pointer",
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}
                    onMouseEnter={e=>e.currentTarget.style.background="#1e293b"}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{p.customerName}</div>
                      <div style={{ fontSize:11, color:"#94a3b8" }}>{p.detail||"-"}</div>
                    </div>
                    <span style={{ color:"#ef4444", fontWeight:700, fontSize:12 }}>{won(p.amount)}</span>
                  </div>
                ))}
                {unpaid.length > 5 && (
                  <div style={{ padding:"8px 14px", fontSize:11, color:"#64748b", textAlign:"center" }}>
                    외 {unpaid.length - 5}건 더보기
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   📅 캘린더 뷰 페이지
═══════════════════════════════════════════════════════ */
function CalendarPage({ db, isMobile }) {
  const { groupOrders } = db;
  const today = new Date();
  const [yr, setYr] = useState(today.getFullYear());
  const [mo, setMo] = useState(today.getMonth()); // 0-indexed
  const [sel, setSel] = useState(null);

  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const todayStr = td();

  // 이번 달 날짜별 주문 맵
  const orderMap = useMemo(() => {
    const map = {};
    (groupOrders || []).forEach(o => {
      if (!o.expectedAt) return;
      const [oy, om] = o.expectedAt.split("-").map(Number);
      if (oy === yr && om === mo + 1) {
        const day = parseInt(o.expectedAt.split("-")[2]);
        if (!map[day]) map[day] = [];
        map[day].push(o);
      }
    });
    return map;
  }, [groupOrders, yr, mo]);

  const prevMonth = () => { if (mo === 0) { setYr(y=>y-1); setMo(11); } else setMo(m=>m-1); setSel(null); };
  const nextMonth = () => { if (mo === 11) { setYr(y=>y+1); setMo(0); } else setMo(m=>m+1); setSel(null); };

  const selOrders = sel ? (orderMap[sel] || []) : [];
  const DAYS = ["일","월","화","수","목","금","토"];

  // 이번 달 전체 주문 요약
  const monthOrders = Object.values(orderMap).flat();
  const overdueInMonth = monthOrders.filter(o => o.status !== "arrived" && diffDays(o.expectedAt) < 0);

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <button onClick={prevMonth} style={{ background:"#1e293b", border:"1px solid #334155", color:"#f1f5f9",
          borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:16 }}>‹</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:18, fontWeight:700, color:"#f1f5f9" }}>{yr}년 {mo+1}월</div>
          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
            납기 {monthOrders.length}건 {overdueInMonth.length > 0 ? `· 초과 ${overdueInMonth.length}건` : ""}
          </div>
        </div>
        <button onClick={nextMonth} style={{ background:"#1e293b", border:"1px solid #334155", color:"#f1f5f9",
          borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:16 }}>›</button>
      </div>

      {/* 범례 */}
      <div style={{ display:"flex", gap:12, marginBottom:12, fontSize:11, color:"#94a3b8", flexWrap:"wrap" }}>
        <span>🔴 납기초과</span><span>🟡 3일이내</span><span>🔵 진행중</span><span>🟢 입고완료</span>
      </div>

      {/* 캘린더 그리드 */}
      <div style={{ background:"#111827", borderRadius:14, border:"1px solid #1e293b", overflow:"hidden" }}>
        {/* 요일 헤더 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:"#0b0f1a" }}>
          {DAYS.map((d,i) => (
            <div key={d} style={{ padding:"10px 0", textAlign:"center", fontSize:11, fontWeight:600,
              color: i===0?"#ef4444":i===6?"#3b82f6":"#64748b" }}>{d}</div>
          ))}
        </div>
        {/* 날짜 셀 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e${i}`} style={{ minHeight: isMobile?50:70, borderTop:"1px solid #1e293b" }}/>
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${yr}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const dayOrders = orderMap[day] || [];
            const isToday = dateStr === todayStr;
            const isSelected = sel === day;
            const dayOfWeek = (firstDay + i) % 7;

            const hasDone    = dayOrders.some(o => o.status === "arrived");
            const hasOverdue = dayOrders.some(o => o.status !== "arrived" && diffDays(o.expectedAt) < 0);
            const hasSoon    = dayOrders.some(o => o.status !== "arrived" && diffDays(o.expectedAt) >= 0 && diffDays(o.expectedAt) <= 3);
            const hasNormal  = dayOrders.some(o => o.status !== "arrived" && diffDays(o.expectedAt) > 3);

            return (
              <div key={day} onClick={() => setSel(sel === day ? null : day)}
                style={{
                  minHeight: isMobile?50:70, borderTop:"1px solid #1e293b",
                  borderLeft: (firstDay + i) % 7 !== 0 ? "1px solid #1e293b" : "none",
                  padding: isMobile?"4px":"6px", cursor: dayOrders.length > 0 ? "pointer" : "default",
                  background: isSelected ? "#1e293b" : isToday ? "rgba(59,130,246,0.08)" : "",
                  transition:"background 0.1s"
                }}>
                <div style={{
                  width:24, height:24, borderRadius:"50%", display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:12, fontWeight:isToday?700:400, marginBottom:2,
                  background: isToday ? "#3b82f6" : "transparent",
                  color: isToday ? "white" : dayOfWeek===0 ? "#ef4444" : dayOfWeek===6 ? "#3b82f6" : "#94a3b8"
                }}>{day}</div>
                {/* 주문 도트 */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:2, marginTop:2 }}>
                  {hasOverdue && <span style={{ width:7, height:7, borderRadius:"50%", background:"#ef4444", display:"block" }}/>}
                  {hasSoon    && <span style={{ width:7, height:7, borderRadius:"50%", background:"#f59e0b", display:"block" }}/>}
                  {hasNormal  && <span style={{ width:7, height:7, borderRadius:"50%", background:"#3b82f6", display:"block" }}/>}
                  {hasDone    && <span style={{ width:7, height:7, borderRadius:"50%", background:"#10b981", display:"block" }}/>}
                </div>
                {/* 모바일: 건수만 표시 */}
                {dayOrders.length > 0 && isMobile && (
                  <div style={{ fontSize:9, color:"#64748b", marginTop:1 }}>{dayOrders.length}건</div>
                )}
                {/* PC: 주문명 표시 */}
                {!isMobile && dayOrders.slice(0,2).map((o,idx) => {
                  const st = GO_STEPS.find(s=>s.key===o.status)||GO_STEPS[0];
                  const dl = diffDays(o.expectedAt);
                  const dotColor = o.status==="arrived"?"#10b981":dl<0?"#ef4444":dl<=3?"#f59e0b":"#3b82f6";
                  return (
                    <div key={idx} style={{ fontSize:9, color:"#e2e8f0", background: dotColor+"22",
                      borderLeft:`2px solid ${dotColor}`, borderRadius:"0 3px 3px 0",
                      padding:"1px 4px", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {o.customer}
                    </div>
                  );
                })}
                {!isMobile && dayOrders.length > 2 && (
                  <div style={{ fontSize:9, color:"#64748b", marginTop:1 }}>+{dayOrders.length-2}건</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 선택한 날 상세 */}
      {sel && selOrders.length > 0 && (
        <div style={{ marginTop:14 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:10, color:"#f1f5f9" }}>
            {mo+1}월 {sel}일 납기 주문 ({selOrders.length}건)
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {selOrders.map(o => {
              const dl = diffDays(o.expectedAt);
              const st = GO_STEPS.find(s=>s.key===o.status)||GO_STEPS[0];
              return (
                <div key={o.id} style={{ background:"#111827", borderRadius:10, padding:12,
                  border:`1px solid ${dl<0&&o.status!=="arrived"?"#ef4444":"#1e293b"}`,
                  display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{o.customer}</div>
                    <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>{o.uniformName} {o.qty?`· ${o.qty}벌`:""}</div>
                    <div style={{ marginTop:4 }}>
                      <span style={{ background:st.bg, border:`1px solid ${st.color}`, color:st.color,
                        borderRadius:5, padding:"2px 7px", fontSize:11, fontWeight:600 }}>{st.label}</span>
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    {o.status === "arrived"
                      ? <div style={{ color:"#10b981", fontWeight:700 }}>✅ 입고완료</div>
                      : <div style={{ fontWeight:800, fontSize:18,
                          color: dl<0?"#ef4444":dl===0?"#f97316":dl<=3?"#f59e0b":"#64748b" }}>
                          {dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`}
                        </div>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {sel && selOrders.length === 0 && (
        <div style={{ marginTop:14, textAlign:"center", color:"#4b5563", padding:20 }}>이 날은 납기 주문이 없습니다</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MODULE 2 — INVENTORY
═══════════════════════════════════════════════════════ */
function InventoryPage({db}){
  const {uniforms,equips,invHist,agencies,su,se,sih,sag,toast_}=db;
  const [tab,setTab]=useState("uniform");
  const [uMod,setUM]=useState(null);
  const [eMod,setEM]=useState(null);
  const [ioMod,setIO]=useState(null);
  const [agMod,setAM]=useState(null);

  const addU = async d=>{ const n=[{...d,id:gid()},...uniforms]; await su(n); toast_("유니폼 등록!"); };
  const updU = async d=>{ await su(uniforms.map(u=>u.id===d.id?{...u,...d}:u)); toast_("수정 완료!"); };
  const delU = async id=>{ await su(uniforms.filter(u=>u.id!==id)); toast_("삭제"); };
  const addE = async d=>{ const n=[{...d,id:gid()},...equips]; await se(n); toast_("용품 등록!"); };
  const delE = async id=>{ await se(equips.filter(e=>e.id!==id)); toast_("삭제"); };
  const addAg= async d=>{ const n=[{...d,id:gid()},...agencies]; await sag(n); toast_("대리점 등록!"); };
  const delAg= async id=>{ await sag(agencies.filter(a=>a.id!==id)); toast_("삭제"); };
  const doIO = async({type,itemId,mode,qty,sizeKey,agencyId,memo,date})=>{
    const n=Number(qty); if(!n||n<=0)return;
    let nu=uniforms,ne=equips;
    if(type==="uniform"){ nu=uniforms.map(u=>{ if(u.id!==itemId)return u; const sz={...(u.sizes||{})}; sz[sizeKey]=Math.max(0,Number(sz[sizeKey]||0)+(mode==="in"?n:-n)); return{...u,sizes:sz}; }); await su(nu); }
    else{ ne=equips.map(e=>{ if(e.id!==itemId)return e; const s=Math.max(0,Number(e.stock||0)+(mode==="in"?n:-n)); return{...e,stock:s}; }); await se(ne); }
    const item=(type==="uniform"?uniforms:equips).find(x=>x.id===itemId);
    const ag=agencies.find(a=>a.id===agencyId);
    const nh=[{id:gid(),type,mode,itemId,itemName:item?.name||"",sizeKey:sizeKey||"",agencyId:agencyId||"",agencyName:ag?.name||"",qty:n,memo:memo||"",date:date||td()},...invHist];
    await sih(nh); toast_(mode==="in"?`입고 +${n}`:`출고 -${n}`);
  };

  // ── CSV 파싱 헬퍼 ──
  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(",").map(h=>h.replace(/^"|"$/g,"").trim());
    return lines.slice(1).filter(l=>l.trim()).map(line=>{
      // 쉼표 파싱 (따옴표 안 쉼표 보호)
      const cols = []; let cur="", inQ=false;
      for(const c of line){ if(c==='"'){inQ=!inQ;}else if(c===","&&!inQ){cols.push(cur.trim());cur="";}else{cur+=c;} }
      cols.push(cur.trim());
      const row={};
      headers.forEach((h,i)=>{ row[h]=(cols[i]||"").replace(/^"|"$/g,"").trim(); });
      return row;
    });
  };

  // ── CSV 임포트 처리 ──
  const [importMod, setImportMod] = useState(null); // {rows, type}
  const [dragOver, setDragOver] = useState(false);

  const handleCSVFile = (file) => {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseCSV(e.target.result);
        if(!rows.length){ toast_("데이터가 없습니다", false); return; }
        // 유니폼 시트인지 용품 시트인지 판별
        const keys = Object.keys(rows[0]);
        const isUniform = keys.includes("유니폼명") || keys.includes("이름");
        const isEquip   = keys.includes("카테고리") || keys.includes("제품명");
        const type = isUniform ? "uniform" : isEquip ? "equip" : "uniform";
        setImportMod({ rows, type, filename: file.name });
      } catch(err) { toast_("CSV 파싱 오류: "+err.message, false); }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if(file && (file.name.endsWith(".csv") || file.name.endsWith(".xlsx"))){
      handleCSVFile(file);
    } else { toast_("CSV 파일만 지원합니다", false); }
  };

  // ── 구글시트 템플릿 다운로드 ──
  const downloadUniTemplate = () => {
    exportCSV("티밸런스_유니폼재고_템플릿.csv",
      ["유니폼명","연도","대리점가","용품점가","인터넷최저가","지인가","매입단가","75","80","85","90","95","100","105","110","115","120"],
      [
        ["y25-01_스카이웨이브(블루)","2025","42000","45000","38000","35000","28000","0","5","10","15","12","8","5","3","1","0","0"],
        ["y25-02_그라비티(레드&블루)","2025","40000","43000","36000","33000","27000","0","3","7","10","8","5","3","1","0","0","0"],
      ]
    );
    toast_("유니폼 템플릿 다운로드!");
  };
  const downloadEquipTemplate = () => {
    exportCSV("티밸런스_용품재고_템플릿.csv",
      ["카테고리","제품명","색상/규격","그립","재고수량","메모"],
      [
        ["라켓","티바 샘소노프 올라운드","기본","FL","5",""],
        ["러버","테너지05","레드","","10",""],
        ["공","니타쿠 3스타","흰색","","24","1박스=24개"],
      ]
    );
    toast_("용품 템플릿 다운로드!");
  };

  const totalU=uniforms.reduce((s,u)=>s+Object.values(u.sizes||{}).reduce((a,v)=>a+Number(v||0),0),0);
  const totalE=equips.reduce((s,e)=>s+Number(e.stock||0),0);
  const lowU=uniforms.filter(u=>Object.values(u.sizes||{}).some(v=>Number(v||0)>0&&Number(v||0)<=3));
  const zeroE=equips.filter(e=>Number(e.stock||0)===0);

  return(
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <StatBadge label="유니폼 총재고" val={totalU+"벌"} color="#3b82f6"/>
        <StatBadge label="용품 총재고" val={totalE+"개"} color="#10b981"/>
        <StatBadge label="재고부족 유니폼" val={lowU.length+"종"} color="#f59e0b"/>
        <StatBadge label="품절 용품" val={zeroE.length+"종"} color="#ef4444"/>
      </div>

      {/* ── 구글시트 연동 안내 박스 ── */}
      <div style={{background:"#0d1117",border:"1px solid #1e3a5f",borderRadius:12,padding:"12px 16px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:16}}>📊</span>
          <span style={{fontWeight:600,fontSize:13,color:"#93c5fd"}}>구글시트 연동 가이드</span>
        </div>
        <div style={{fontSize:12,color:"#64748b",lineHeight:1.8,marginBottom:10}}>
          1. 아래 <b style={{color:"#f1f5f9"}}>템플릿 다운로드</b> → 구글 드라이브에 업로드<br/>
          2. 구글 시트에서 데이터 입력<br/>
          3. <b style={{color:"#f1f5f9"}}>파일 → 다운로드 → CSV</b> 로 저장<br/>
          4. 아래 <b style={{color:"#f1f5f9"}}>드래그&드롭 영역</b>에 파일을 올리면 자동 등록!
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <SBtn onClick={downloadUniTemplate} color="#1d4ed8">📥 유니폼 템플릿</SBtn>
          <SBtn onClick={downloadEquipTemplate} color="#065f46">📥 용품 템플릿</SBtn>
        </div>
      </div>

      {/* ── CSV 드래그&드롭 영역 ── */}
      <div
        onDrop={handleDrop}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        style={{
          border:`2px dashed ${dragOver?"#3b82f6":"#334155"}`,
          borderRadius:12, padding:"20px 16px", textAlign:"center",
          marginBottom:16, cursor:"pointer", transition:"all 0.2s",
          background: dragOver?"rgba(59,130,246,0.08)":"transparent"
        }}
        onClick={()=>{ const inp=document.createElement("input"); inp.type="file"; inp.accept=".csv"; inp.onchange=e=>handleCSVFile(e.target.files[0]); inp.click(); }}
      >
        <div style={{fontSize:28,marginBottom:6}}>{dragOver?"⬇️":"📂"}</div>
        <div style={{fontSize:13,fontWeight:600,color:dragOver?"#93c5fd":"#64748b"}}>
          {dragOver?"파일을 놓으세요!":"CSV 파일을 여기에 드래그하거나 클릭해서 선택"}
        </div>
        <div style={{fontSize:11,color:"#475569",marginTop:4}}>
          구글시트에서 내보낸 .csv 파일 지원
        </div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["uniform","👕 유니폼"],["equip","🏓 용품"],["history","📋 입출고"],["agency","🏪 대리점"]].map(([k,l])=>(
          <div key={k} style={{padding:"7px 14px",borderRadius:8,background:tab===k?"#1e293b":"transparent",border:tab===k?"1px solid #3b82f6":"1px solid #334155",color:tab===k?"#f1f5f9":"#64748b",cursor:"pointer",fontSize:12,fontWeight:500}} onClick={()=>setTab(k)}>{l}</div>
        ))}
      </div>
      {tab==="uniform"&&<>
        {lowU.length>0&&<div style={{background:"rgba(245,158,11,0.1)",border:"1px solid #f59e0b",borderRadius:8,padding:"8px 14px",marginBottom:12,color:"#fcd34d",fontSize:12}}>⚠️ 재고 부족: {lowU.map(u=>u.name).join(", ")}</div>}
        <UniformListView uniforms={uniforms} onEdit={u=>setUM({mode:"edit",data:u})} onDel={delU} onIO={setIO} onAdd={()=>setUM("add")}/>
      </>}
      {tab==="equip"&&<>
        {zeroE.length>0&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid #ef4444",borderRadius:8,padding:"8px 14px",marginBottom:12,color:"#fca5a5",fontSize:12}}>🚫 품절: {zeroE.map(e=>e.name).join(", ")}</div>}
        <div style={GS.toolbar}><div style={{fontWeight:600}}>용품 목록</div><SBtn onClick={()=>setEM("add")} color="#10b981" style={{marginLeft:"auto"}}>+ 용품 등록</SBtn></div>
        {equips.length===0?<EmptyState icon="🏓" msg="등록된 용품 없음"/>:
          <div style={GS.tbl}>
            <div style={{...GS.tRow,gridTemplateColumns:"90px 1fr 100px 70px 70px 130px",background:"#0b0f1a",borderTop:"none",fontSize:10,fontWeight:600,color:"#64748b"}}>
              <span>카테고리</span><span>제품명</span><span>세부정보</span><span style={{textAlign:"center"}}>재고</span><span></span><span style={{textAlign:"center"}}>관리</span>
            </div>
            {equips.map(e=>{ const s=Number(e.stock||0); return(
              <div key={e.id} style={{...GS.tRow,gridTemplateColumns:"90px 1fr 100px 70px 70px 130px"}}>
                <span style={{background:"#1e293b",color:"#94a3b8",padding:"2px 6px",borderRadius:4,fontSize:10,textAlign:"center"}}>{e.category}</span>
                <span style={{fontWeight:500}}>{e.name}</span>
                <span style={{fontSize:11,color:"#64748b"}}>{[e.grip,e.color].filter(Boolean).join("·")}</span>
                <span style={{textAlign:"center",fontWeight:700,color:s===0?"#ef4444":s<=3?"#f59e0b":"#10b981"}}>{s===0?"품절":s}</span>
                <span></span>
                <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                  <SBtn onClick={()=>setIO({type:"equip",item:e,mode:"in"})} color="#1d4ed8">입고</SBtn>
                  <SBtn onClick={()=>setIO({type:"equip",item:e,mode:"out"})} color="#374151">출고</SBtn>
                  <SBtn onClick={()=>delE(e.id)} color="#7f1d1d">🗑</SBtn>
                </div>
              </div>
            );})}
          </div>
        }
      </>}
      {tab==="history"&&<>
        {invHist.length===0?<EmptyState icon="📋" msg="내역 없음"/>:
          <div style={GS.tbl}>
            <div style={{...GS.tRow,gridTemplateColumns:"90px 60px 1fr 80px 60px 90px 1fr",background:"#0b0f1a",borderTop:"none",fontSize:10,fontWeight:600,color:"#64748b"}}>
              <span>날짜</span><span>구분</span><span>제품명</span><span>사이즈</span><span>수량</span><span>거래처</span><span>메모</span>
            </div>
            {invHist.slice(0,100).map(h=>(
              <div key={h.id} style={{...GS.tRow,gridTemplateColumns:"90px 60px 1fr 80px 60px 90px 1fr"}}>
                <span style={{fontSize:11,color:"#94a3b8"}}>{h.date}</span>
                <span style={{background:h.mode==="in"?"#1d4ed8":"#374151",color:"white",padding:"1px 6px",borderRadius:4,fontSize:10,textAlign:"center"}}>{h.mode==="in"?"입고":"출고"}</span>
                <span style={{fontWeight:500}}>{h.itemName}</span>
                <span style={{fontSize:11,color:"#64748b"}}>{h.sizeKey||"-"}</span>
                <span style={{fontWeight:700,color:h.mode==="in"?"#3b82f6":"#f87171"}}>{h.mode==="in"?"+":"-"}{h.qty}</span>
                <span style={{fontSize:11,color:"#64748b"}}>{h.agencyName||"-"}</span>
                <span style={{fontSize:11,color:"#64748b"}}>{h.memo||"-"}</span>
              </div>
            ))}
          </div>
        }
      </>}
      {tab==="agency"&&<>
        <div style={GS.toolbar}><div style={{fontWeight:600}}>대리점 목록</div><SBtn onClick={()=>setAM(true)} color="#8b5cf6" style={{marginLeft:"auto"}}>+ 대리점 등록</SBtn></div>
        {agencies.length===0?<EmptyState icon="🏪" msg="등록된 대리점 없음"/>:
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
            {agencies.map(a=>(
              <div key={a.id} style={{background:"#111827",border:"1px solid #1e293b",borderRadius:10,padding:14}}>
                <div style={{fontWeight:600,fontSize:14,marginBottom:6}}>{a.name}</div>
                {a.phone&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:3}}>📞 {a.phone}</div>}
                {a.address&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:3}}>📍 {a.address}</div>}
                {a.manager&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:3}}>👤 {a.manager}</div>}
                <div style={{marginTop:8}}><SBtn onClick={()=>delAg(a.id)} color="#7f1d1d">삭제</SBtn></div>
              </div>
            ))}
          </div>
        }
      </>}

      {uMod==="add"&&<UniformModal onClose={()=>setUM(null)} onSave={d=>{addU(d);setUM(null);}}/>}
      {uMod?.mode==="edit"&&<UniformModal initial={uMod.data} onClose={()=>setUM(null)} onSave={d=>{updU({...uMod.data,...d});setUM(null);}}/>}
      {eMod==="add"&&<EquipModal onClose={()=>setEM(null)} onSave={d=>{addE(d);setEM(null);}}/>}
      {agMod&&<AgencyModal onClose={()=>setAM(null)} onSave={d=>{addAg(d);setAM(null);}}/>}
      {ioMod&&<IOModal modal={ioMod} agencies={agencies} onClose={()=>setIO(null)} onSave={d=>{doIO(d);setIO(null);}}/>}
      {importMod&&<CSVImportModal modal={importMod} uniforms={uniforms} equips={equips}
        onClose={()=>setImportMod(null)}
        onSaveUniforms={async(arr)=>{ await su([...arr,...uniforms]); toast_(`유니폼 ${arr.length}종 가져오기 완료!`); setImportMod(null); }}
        onSaveEquips={async(arr)=>{ await se([...arr,...equips]); toast_(`용품 ${arr.length}종 가져오기 완료!`); setImportMod(null); }}
      />}
    </div>
  );
}
function UniformListView({ uniforms, onEdit, onDel, onIO, onAdd }) {
  const years = useMemo(() => {
    const ys = [...new Set(uniforms.map(u => u.year).filter(Boolean))].sort((a,b) => b-a);
    return ["전체", ...ys];
  }, [uniforms]);

  const [selYear, setSelYear] = useState("전체");
  const [sortMode, setSortMode] = useState("default"); // default | nostock | lowstock
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = uniforms.filter(u => {
      const yearOk = selYear === "전체" || String(u.year) === String(selYear);
      const searchOk = !search || u.name.includes(search);
      return yearOk && searchOk;
    });
    if (sortMode === "nostock") {
      list = [...list].sort((a, b) => {
        const totA = Object.values(a.sizes||{}).reduce((s,v)=>s+Number(v||0),0);
        const totB = Object.values(b.sizes||{}).reduce((s,v)=>s+Number(v||0),0);
        return totA - totB;
      });
    } else if (sortMode === "lowstock") {
      list = [...list].sort((a, b) => {
        const zeroA = Object.values(a.sizes||{}).filter(v=>Number(v||0)===0).length;
        const zeroB = Object.values(b.sizes||{}).filter(v=>Number(v||0)===0).length;
        return zeroB - zeroA;
      });
    }
    return list;
  }, [uniforms, selYear, sortMode, search]);

  const isBarMode = sortMode === "nostock" || sortMode === "lowstock";

  return (
    <div>
      {/* 툴바 */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input style={{...GS.sInp,flex:1,minWidth:120,maxWidth:200}} placeholder="유니폼 검색..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <SBtn onClick={onAdd} color="#3b82f6" style={{marginLeft:"auto"}}>+ 유니폼 등록</SBtn>
      </div>

      {/* 년도 필터 */}
      <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:11,color:"#64748b",marginRight:2}}>년도</span>
        {years.map(y => (
          <div key={y} onClick={()=>setSelYear(y)} style={{
            padding:"4px 12px", borderRadius:20, cursor:"pointer", fontSize:11, fontWeight:500,
            background: selYear===y ? "#78350f" : "#1e293b",
            border: selYear===y ? "1px solid #f59e0b" : "1px solid #334155",
            color: selYear===y ? "#fcd34d" : "#94a3b8",
          }}>{y}{y!=="전체"?"년":""}</div>
        ))}
      </div>

      {/* 정렬 방식 */}
      <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:11,color:"#64748b",marginRight:2}}>정렬</span>
        {[
          ["default","기본순"],
          ["nostock","재고 없는 순 📊"],
          ["lowstock","품절 사이즈 많은 순"],
        ].map(([k,l]) => (
          <div key={k} onClick={()=>setSortMode(k)} style={{
            padding:"4px 12px", borderRadius:20, cursor:"pointer", fontSize:11, fontWeight:500,
            background: sortMode===k ? "#1e3a5f" : "#1e293b",
            border: sortMode===k ? "1px solid #3b82f6" : "1px solid #334155",
            color: sortMode===k ? "#93c5fd" : "#94a3b8",
          }}>{l}</div>
        ))}
      </div>

      <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>
        {filtered.length}종 {isBarMode && <span style={{color:"#f59e0b"}}>· 🔴 품절 사이즈</span>}
      </div>

      {filtered.length === 0 ? <EmptyState icon="👕" msg="해당 조건의 유니폼 없음"/> :

        /* ── 바 뷰 (재고 없는 순) ── */
        isBarMode ? (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {filtered.map(u => {
              const sizes = u.sizes || {};
              const sizeEntries = Object.entries(sizes);
              const tot = sizeEntries.reduce((a,[,v])=>a+Number(v||0),0);
              const maxQty = Math.max(...sizeEntries.map(([,v])=>Number(v||0)), 1);
              const zeroCnt = sizeEntries.filter(([,v])=>Number(v||0)===0).length;
              const low = tot > 0 && tot <= 5;
              return (
                <div key={u.id} style={{
                  background:"#111827", borderRadius:12,
                  border:`1px solid ${tot===0?"#ef4444":zeroCnt>0?"#f59e0b":"#1e293b"}`,
                  padding:"12px 14px"
                }}>
                  {/* 헤더 */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div>
                      <span style={{fontWeight:700,fontSize:14}}>{u.name}</span>
                      <span style={{fontSize:11,color:"#64748b",marginLeft:8}}>{u.year}년도</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{
                        fontWeight:800, fontSize:16,
                        color: tot===0?"#ef4444":low?"#f59e0b":"#10b981"
                      }}>총 {tot}벌</span>
                      {zeroCnt>0 && <span style={{background:"rgba(239,68,68,0.15)",border:"1px solid #ef4444",color:"#fca5a5",borderRadius:5,padding:"1px 7px",fontSize:10}}>품절 {zeroCnt}사이즈</span>}
                    </div>
                  </div>

                  {/* 사이즈별 재고 바 */}
                  {sizeEntries.length > 0 ? (
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {sizeEntries.map(([sz, qty]) => {
                        const q = Number(qty||0);
                        const pct = Math.round((q/maxQty)*100);
                        const isEmpty = q === 0;
                        const isLow = q > 0 && q <= 3;
                        const barColor = isEmpty ? "#ef4444" : isLow ? "#f59e0b" : "#3b82f6";
                        return (
                          <div key={sz} style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{
                              width:36, textAlign:"right", fontSize:11, fontWeight:600,
                              color: isEmpty ? "#ef4444" : isLow ? "#f59e0b" : "#94a3b8",
                              flexShrink:0
                            }}>{sz}</div>
                            <div style={{flex:1,height:18,background:"#1e293b",borderRadius:4,overflow:"hidden",position:"relative"}}>
                              {isEmpty
                                ? <div style={{height:"100%",width:"100%",background:"rgba(239,68,68,0.2)",
                                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                                    <span style={{fontSize:9,color:"#ef4444",fontWeight:700,letterSpacing:1}}>품절</span>
                                  </div>
                                : <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:4,
                                    minWidth:4,transition:"width 0.3s ease"}}/>
                              }
                            </div>
                            <div style={{
                              width:28, textAlign:"right", fontSize:12, fontWeight:700,
                              color: isEmpty ? "#ef4444" : isLow ? "#f59e0b" : "#f1f5f9",
                              flexShrink:0
                            }}>{isEmpty ? "0" : q}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{fontSize:12,color:"#475569",textAlign:"center",padding:"8px 0"}}>사이즈 정보 없음</div>
                  )}

                  {/* 액션 버튼 */}
                  <div style={{display:"flex",gap:5,marginTop:12,flexWrap:"wrap"}}>
                    <SBtn onClick={()=>onEdit(u)} color="#374151">✏️ 수정</SBtn>
                    <SBtn onClick={()=>onIO({type:"uniform",item:u,mode:"in"})} color="#1d4ed8">입고</SBtn>
                    <SBtn onClick={()=>onIO({type:"uniform",item:u,mode:"out"})} color="#374151">출고</SBtn>
                    <SBtn onClick={()=>onDel(u.id)} color="#7f1d1d">🗑</SBtn>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (

        /* ── 카드 뷰 (기본) ── */
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12}}>
          {filtered.map(u => {
            const tot = Object.values(u.sizes||{}).reduce((a,v)=>a+Number(v||0),0);
            const low = Object.values(u.sizes||{}).some(v=>Number(v||0)>0&&Number(v||0)<=3);
            return (
              <div key={u.id} style={{background:"#111827",border:`1px solid ${tot===0?"#ef4444":low?"#f59e0b":"#1e293b"}`,borderRadius:10,overflow:"hidden"}}>
                <div style={{height:140,background:"#0d1117",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                  {u.imgSrc ? <img src={u.imgSrc} style={{height:"100%",width:"100%",objectFit:"contain",padding:"8px"}} alt=""/> : <span style={{fontSize:36,color:"#1e293b"}}>👕</span>}
                </div>
                <div style={{padding:"10px 12px"}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</div>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>{u.year}년도</div>
                  <div style={{display:"flex",justifyContent:"space-between",background:"#0b0f1a",borderRadius:5,padding:"5px 8px",marginBottom:8}}>
                    <span style={{fontSize:11,color:"#64748b"}}>총 재고</span>
                    <span style={{fontWeight:700,color:tot===0?"#ef4444":low?"#f59e0b":"#10b981"}}>{tot}벌</span>
                  </div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    <SBtn onClick={()=>onEdit(u)} color="#374151">✏️ 수정</SBtn>
                    <SBtn onClick={()=>onIO({type:"uniform",item:u,mode:"in"})} color="#1d4ed8">입고</SBtn>
                    <SBtn onClick={()=>onIO({type:"uniform",item:u,mode:"out"})} color="#374151">출고</SBtn>
                    <SBtn onClick={()=>onDel(u.id)} color="#7f1d1d">🗑</SBtn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function UniformModal({onClose,onSave,initial}){
  const isEdit = !!initial;
  const [name,setName]=useState(initial?.name||"");
  const [year,setYear]=useState(initial?.year||String(new Date().getFullYear()));
  const [imgSrc,setImg]=useState(initial?.imgSrc||null);
  const [sizes,setSizes]=useState(initial?.sizes||{});
  const [agencyPrice, setAgencyPrice] = useState(initial?.agencyPrice||"");  // 대리점가
  const [shopPrice,   setShopPrice]   = useState(initial?.shopPrice||"");    // 용품점가
  const [netPrice,    setNetPrice]    = useState(initial?.netPrice||"");     // 인터넷최저가
  const [friendPrice, setFriendPrice] = useState(initial?.friendPrice||""); // 지인가
  const [costPrice,   setCostPrice]   = useState(initial?.costPrice||"");   // 매입단가
  const [cs,setCS]=useState("");
  const [uploading,setUploading]=useState(false);
  const imgRef=useRef();
  const toggleSz=sz=>setSizes(p=>p[sz]!==undefined?(()=>{const n={...p};delete n[sz];return n;})():{...p,[sz]:0});
  const addCustom=()=>{if(cs.trim()&&sizes[cs.trim()]===undefined){setSizes(p=>({...p,[cs.trim()]:0}));setCS("");}};

  const handleImageFile = async (file) => {
    if(!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, `uniforms/${gid()}_${file.name}`);
      setImg(url);
    } catch(e) { console.error(e); }
    setUploading(false);
  };

  return <Modal title={isEdit?"✏️ 유니폼 수정":"유니폼 등록"} onClose={onClose}>
    <input type="file" accept="image/*" ref={imgRef} style={{display:"none"}} onChange={e=>handleImageFile(e.target.files[0])} />
    <MFR label="유니폼명 *"><input style={GS.inp} value={name} onChange={e=>setName(e.target.value)} placeholder="예) y25-01 스카이웨이브 블루"/></MFR>
    <div style={GS.fGrid}>
      <MFR label="연도"><input style={GS.inp} value={year} onChange={e=>setYear(e.target.value)}/></MFR>
      <MFR label="이미지">
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <SBtn onClick={()=>imgRef.current.click()} color="#374151" disabled={uploading}>
            {uploading?"⏳ 업로드 중...":"📂 선택"}
          </SBtn>
          {imgSrc&&<>
            <img src={imgSrc} style={{height:36,borderRadius:4}} alt=""/>
            <SBtn onClick={()=>setImg(null)} color="#7f1d1d">✕</SBtn>
          </>}
        </div>
        {uploading&&<div style={{fontSize:11,color:"#f59e0b",marginTop:4}}>☁️ Firebase Storage에 업로드 중...</div>}
      </MFR>
    </div>
    {/* ── 단가 정보 ── */}
    <div style={{marginBottom:8}}>
      <div style={{fontSize:12,color:"#94a3b8",fontWeight:600,marginBottom:6}}>💰 판매단가</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        <MFR label="대리점가 (원)">
          <input type="number" style={GS.inp} value={agencyPrice} onChange={e=>setAgencyPrice(e.target.value)} placeholder="예) 42000"/>
        </MFR>
        <MFR label="용품점가 (원)">
          <input type="number" style={GS.inp} value={shopPrice} onChange={e=>setShopPrice(e.target.value)} placeholder="예) 45000"/>
        </MFR>
        <MFR label="인터넷최저가 (원)">
          <input type="number" style={GS.inp} value={netPrice} onChange={e=>setNetPrice(e.target.value)} placeholder="예) 38000"/>
        </MFR>
        <MFR label="지인가 (원)">
          <input type="number" style={GS.inp} value={friendPrice} onChange={e=>setFriendPrice(e.target.value)} placeholder="예) 35000"/>
        </MFR>
      </div>
      <div style={{fontSize:10,color:"#64748b",marginTop:3}}>단품 매출 등록 시 단가 유형을 선택해서 자동계산</div>
    </div>
    <div style={GS.fGrid}>
      <MFR label="매입단가 (원)">
        <input type="number" style={GS.inp} value={costPrice} onChange={e=>setCostPrice(e.target.value)} placeholder="예) 28000"/>
        <div style={{fontSize:10,color:"#64748b",marginTop:3}}>수입원가 자동계산</div>
      </MFR>
    </div>
    <MFR label="사이즈 선택">
      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{SIZES.map(sz=><div key={sz} style={{...SI.chip,...(sizes[sz]!==undefined?SI.chipA:{})}} onClick={()=>toggleSz(sz)}>{sz}</div>)}</div>
      <div style={{display:"flex",gap:5}}><input style={{...GS.inp,flex:1}} placeholder="직접입력" value={cs} onChange={e=>setCS(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustom()}/><SBtn onClick={addCustom} color="#374151">추가</SBtn></div>
    </MFR>
    {Object.keys(sizes).length>0&&(
      <MFR label={isEdit?"사이즈별 수량 수정":"초기 수량"}>
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {Object.entries(sizes).map(([sz,qty])=>(
            <div key={sz} style={{display:"flex",alignItems:"center",gap:4,background:"#1e293b",padding:"5px 8px",borderRadius:7,border:"1px solid #334155"}}>
              <span style={{fontSize:12,color:"#94a3b8",minWidth:32,fontWeight:600}}>{sz}</span>
              <button style={{width:24,height:24,borderRadius:5,background:"#0b0f1a",border:"1px solid #334155",color:"white",cursor:"pointer",fontSize:14,lineHeight:1}} onClick={()=>setSizes(p=>({...p,[sz]:Math.max(0,Number(p[sz]||0)-1)}))}>−</button>
              <input type="number" min={0} style={{...GS.inp,width:52,padding:"2px 5px",fontSize:13,textAlign:"center"}} value={qty} onChange={e=>setSizes(p=>({...p,[sz]:Number(e.target.value)}))}/>
              <button style={{width:24,height:24,borderRadius:5,background:"#0b0f1a",border:"1px solid #334155",color:"white",cursor:"pointer",fontSize:14,lineHeight:1}} onClick={()=>setSizes(p=>({...p,[sz]:Number(p[sz]||0)+1}))}>+</button>
              <button style={{width:20,height:20,borderRadius:4,background:"#7f1d1d",border:"none",color:"white",cursor:"pointer",fontSize:10,marginLeft:2}} onClick={()=>setSizes(p=>{const n={...p};delete n[sz];return n;})}>✕</button>
            </div>
          ))}
        </div>
        <div style={{fontSize:11,color:"#64748b",marginTop:6}}>
          총 재고: <span style={{color:"#f1f5f9",fontWeight:600}}>{Object.values(sizes).reduce((a,v)=>a+Number(v||0),0)}벌</span>
        </div>
      </MFR>
    )}
    <div style={GS.mBtns}>
      <SBtn onClick={()=>{if(!name.trim()||uploading)return;onSave({name,year,imgSrc,sizes,agencyPrice:Number(agencyPrice)||0,shopPrice:Number(shopPrice)||0,netPrice:Number(netPrice)||0,friendPrice:Number(friendPrice)||0,costPrice:Number(costPrice)||0});}} color={isEdit?"#10b981":"#3b82f6"} full disabled={uploading}>
        {uploading?"⏳ 이미지 업로드 중...":(isEdit?"✅ 수정 완료":"등록")}
      </SBtn>
      <SBtn onClick={onClose} color="#374151" full>취소</SBtn>
    </div>
  </Modal>;
}function EquipModal({onClose,onSave}){
  const [name,setName]=useState(""); const [cat,setCat]=useState("라켓"); const [stock,setStock]=useState(0); const [grip,setGrip]=useState(""); const [color,setColor]=useState(""); const [memo,setMemo]=useState("");
  return <Modal title="용품 등록" onClose={onClose}>
    <MFR label="카테고리"><div style={GS.chips}>{EQUIP_CATS.map(c=><div key={c} style={{...SI.chip,...(cat===c?SI.chipA:{})}} onClick={()=>setCat(c)}>{c}</div>)}</div></MFR>
    <MFR label="제품명 *"><input style={GS.inp} value={name} onChange={e=>setName(e.target.value)} placeholder="예) 테너지05 레드"/></MFR>
    {cat==="라켓"&&<MFR label="그립"><div style={GS.chips}>{["FL","ST","중펜","AN"].map(g=><div key={g} style={{...SI.chip,...(grip===g?SI.chipA:{})}} onClick={()=>setGrip(p=>p===g?"":g)}>{g}</div>)}</div></MFR>}
    <div style={GS.fGrid}>
      <MFR label="색상/규격"><input style={GS.inp} value={color} onChange={e=>setColor(e.target.value)} placeholder="레드, 블랙"/></MFR>
      <MFR label="초기 재고"><input type="number" style={GS.inp} min={0} value={stock} onChange={e=>setStock(e.target.value)}/></MFR>
    </div>
    <MFR label="메모"><input style={GS.inp} value={memo} onChange={e=>setMemo(e.target.value)}/></MFR>
    <div style={GS.mBtns}><SBtn onClick={()=>{if(!name.trim())return;onSave({name,category:cat,stock:Number(stock),grip,color,memo});}} color="#10b981" full>등록</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}
function AgencyModal({onClose,onSave}){
  const [f,setF]=useState({name:"",phone:"",address:"",manager:"",memo:""});
  return <Modal title="대리점 등록" onClose={onClose}>
    <div style={GS.fGrid}>
      <MFR label="대리점명 *"><input style={GS.inp} value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/></MFR>
      <MFR label="전화번호 *"><input style={GS.inp} value={f.phone} onChange={e=>setF(p=>({...p,phone:e.target.value}))}/></MFR>
      <MFR label="담당자"><input style={GS.inp} value={f.manager} onChange={e=>setF(p=>({...p,manager:e.target.value}))}/></MFR>
    </div>
    <MFR label="주소"><input style={GS.inp} value={f.address} onChange={e=>setF(p=>({...p,address:e.target.value}))}/></MFR>
    <MFR label="메모"><input style={GS.inp} value={f.memo} onChange={e=>setF(p=>({...p,memo:e.target.value}))}/></MFR>
    <div style={GS.mBtns}><SBtn onClick={()=>{if(!f.name.trim())return;onSave(f);}} color="#8b5cf6" full>등록</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}
function IOModal({modal,agencies,onClose,onSave}){
  const {type,item,mode}=modal;
  const [sizeKey,setSK]=useState(type==="uniform"?Object.keys(item.sizes||{})[0]||"":"");
  const [qty,setQty]=useState(1); const [agencyId,setAg]=useState(""); const [memo,setMemo]=useState(""); const [date,setDate]=useState(td());
  const mc=mode==="in"?"#3b82f6":"#f87171";
  return <Modal title={`${item.name} — ${mode==="in"?"📥 입고":"📤 출고"}`} onClose={onClose}>
    <MFR label="날짜"><input type="date" style={GS.inp} value={date} onChange={e=>setDate(e.target.value)}/></MFR>
    {type==="uniform"&&<MFR label="사이즈"><div style={GS.chips}>{Object.keys(item.sizes||{}).map(sz=><div key={sz} style={{...SI.chip,...(sizeKey===sz?SI.chipA:{})}} onClick={()=>setSK(sz)}>{sz} <span style={{color:"#64748b",fontSize:10}}>({item.sizes[sz]})</span></div>)}</div></MFR>}
    <MFR label="수량"><div style={{display:"flex",alignItems:"center",gap:8}}><button style={{width:34,height:34,borderRadius:7,background:"#1e293b",border:"1px solid #334155",color:"white",cursor:"pointer",fontSize:16}} onClick={()=>setQty(p=>Math.max(1,Number(p)-1))}>−</button><input type="number" style={{...GS.inp,width:70,textAlign:"center",fontSize:18,fontWeight:700}} min={1} value={qty} onChange={e=>setQty(e.target.value)}/><button style={{width:34,height:34,borderRadius:7,background:"#1e293b",border:"1px solid #334155",color:"white",cursor:"pointer",fontSize:16}} onClick={()=>setQty(p=>Number(p)+1)}>+</button></div></MFR>
    {mode==="out"&&<MFR label="거래처(대리점)"><select style={GS.inp} value={agencyId} onChange={e=>setAg(e.target.value)}><option value="">— 선택 안 함 —</option>{agencies.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></MFR>}
    <MFR label="메모"><input style={GS.inp} value={memo} onChange={e=>setMemo(e.target.value)} placeholder="특이사항"/></MFR>
    <div style={GS.mBtns}><SBtn onClick={()=>onSave({type,itemId:item.id,mode,qty,sizeKey,agencyId,memo,date})} color={mc} full>{mode==="in"?"📥 입고":"📤 출고"} 처리</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}

function CSVImportModal({ modal, uniforms, equips, onClose, onSaveUniforms, onSaveEquips }) {
  const { rows, filename } = modal;
  const keys = Object.keys(rows[0] || {});

  // 타입 자동 감지
  const isUniform = keys.some(k => ["유니폼명","이름","name"].includes(k));
  const [type, setType] = useState(isUniform ? "uniform" : "equip");

  // 유니폼 파싱
  const parsedUniforms = useMemo(() => {
    if(type !== "uniform") return [];
    return rows.map(row => {
      const name = row["유니폼명"] || row["이름"] || row["name"] || "";
      const year = row["연도"] || row["year"] || String(new Date().getFullYear());
      // 단가 컬럼 파싱
      const PRICE_META = ["유니폼명","이름","name","연도","year","대리점가","용품점가","인터넷최저가","지인가","매입단가","agencyPrice","shopPrice","netPrice","friendPrice","costPrice"];
      const agencyPrice  = Number(row["대리점가"]  || row["agencyPrice"]  || 0);
      const shopPrice    = Number(row["용품점가"]  || row["shopPrice"]    || 0);
      const netPrice     = Number(row["인터넷최저가"]|| row["netPrice"]    || 0);
      const friendPrice  = Number(row["지인가"]    || row["friendPrice"]  || 0);
      const costPrice    = Number(row["매입단가"]  || row["costPrice"]    || 0);
      // 나머지 컬럼은 사이즈로 처리
      const sizeKeys = Object.keys(row).filter(k => !PRICE_META.includes(k));
      const sizes = {};
      sizeKeys.forEach(sz => {
        const v = Number(row[sz]);
        if(!isNaN(v) && v > 0) sizes[sz] = v;
      });
      return { id: gid(), name, year, imgSrc: null, sizes, agencyPrice, shopPrice, netPrice, friendPrice, costPrice };
    }).filter(u => u.name);
  }, [rows, type]);

  // 용품 파싱
  const parsedEquips = useMemo(() => {
    if(type !== "equip") return [];
    return rows.map(row => ({
      id: gid(),
      category: row["카테고리"] || "기타용품",
      name: row["제품명"] || row["이름"] || row["name"] || "",
      color: row["색상/규격"] || row["색상"] || "",
      grip: row["그립"] || "",
      stock: Number(row["재고수량"] || row["재고"] || row["stock"] || 0),
      memo: row["메모"] || "",
    })).filter(e => e.name);
  }, [rows, type]);

  const preview = type === "uniform" ? parsedUniforms : parsedEquips;
  const dupUniforms = parsedUniforms.filter(p => uniforms.some(u => u.name === p.name));
  const dupEquips   = parsedEquips.filter(p => equips.some(e => e.name === p.name));
  const dups = type === "uniform" ? dupUniforms : dupEquips;

  return (
    <Modal title="📊 구글시트 CSV 가져오기" onClose={onClose} wide>
      {/* 파일명 */}
      <div style={{background:"#1e293b",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#94a3b8"}}>
        📄 {filename} · {rows.length}행 감지
      </div>

      {/* 타입 선택 */}
      <MFR label="가져올 종류">
        <div style={GS.chips}>
          <Chip active={type==="uniform"} onClick={()=>setType("uniform")}>👕 유니폼</Chip>
          <Chip active={type==="equip"}   onClick={()=>setType("equip")}>🏓 용품</Chip>
        </div>
      </MFR>

      {/* 중복 경고 */}
      {dups.length > 0 && (
        <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid #f59e0b",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#fcd34d"}}>
          ⚠️ 이미 등록된 항목 {dups.length}개: {dups.map(d=>d.name).join(", ")} — 중복 추가됩니다
        </div>
      )}

      {/* 미리보기 */}
      <MFR label={`미리보기 (${preview.length}개)`}>
        <div style={{maxHeight:260,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
          {preview.length === 0 && (
            <div style={{color:"#ef4444",fontSize:12,padding:8}}>⚠️ 파싱된 데이터가 없습니다. 템플릿 형식을 확인해주세요.</div>
          )}
          {type === "uniform" && parsedUniforms.map((u,i) => (
            <div key={i} style={{background:"#1e293b",borderRadius:8,padding:"8px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div>
                  <div style={{fontWeight:600,fontSize:13}}>{u.name}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{u.year}년도</div>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"flex-end",maxWidth:"55%"}}>
                  {Object.entries(u.sizes).map(([sz,v])=>(
                    <span key={sz} style={{background:"#0b0f1a",border:"1px solid #334155",borderRadius:4,padding:"1px 6px",fontSize:10,color:"#94a3b8"}}>{sz}:{v}</span>
                  ))}
                  {Object.keys(u.sizes).length === 0 && <span style={{fontSize:11,color:"#475569"}}>수량 없음</span>}
                </div>
              </div>
              {/* 단가 정보 표시 */}
              {(u.agencyPrice>0||u.shopPrice>0||u.netPrice>0||u.friendPrice>0||u.costPrice>0)&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:4,paddingTop:4,borderTop:"1px solid #334155"}}>
                  {u.agencyPrice>0&&<span style={{fontSize:10,background:"rgba(59,130,246,0.15)",border:"1px solid #3b82f6",borderRadius:4,padding:"1px 6px",color:"#93c5fd"}}>대리점 {u.agencyPrice.toLocaleString()}원</span>}
                  {u.shopPrice>0&&<span style={{fontSize:10,background:"rgba(245,158,11,0.15)",border:"1px solid #f59e0b",borderRadius:4,padding:"1px 6px",color:"#fcd34d"}}>용품점 {u.shopPrice.toLocaleString()}원</span>}
                  {u.netPrice>0&&<span style={{fontSize:10,background:"rgba(16,185,129,0.15)",border:"1px solid #10b981",borderRadius:4,padding:"1px 6px",color:"#6ee7b7"}}>인터넷 {u.netPrice.toLocaleString()}원</span>}
                  {u.friendPrice>0&&<span style={{fontSize:10,background:"rgba(139,92,246,0.15)",border:"1px solid #8b5cf6",borderRadius:4,padding:"1px 6px",color:"#c4b5fd"}}>지인 {u.friendPrice.toLocaleString()}원</span>}
                  {u.costPrice>0&&<span style={{fontSize:10,background:"rgba(100,116,139,0.15)",border:"1px solid #475569",borderRadius:4,padding:"1px 6px",color:"#94a3b8"}}>매입 {u.costPrice.toLocaleString()}원</span>}
                </div>
              )}
            </div>
          ))}
          {type === "equip" && parsedEquips.map((e,i) => (
            <div key={i} style={{background:"#1e293b",borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <span style={{background:"#374151",color:"#94a3b8",padding:"1px 6px",borderRadius:4,fontSize:10,marginRight:6}}>{e.category}</span>
                <span style={{fontWeight:600,fontSize:13}}>{e.name}</span>
                {e.color && <span style={{fontSize:11,color:"#64748b",marginLeft:6}}>{e.color}</span>}
              </div>
              <span style={{fontWeight:700,color:e.stock>0?"#10b981":"#ef4444",fontSize:13}}>{e.stock}개</span>
            </div>
          ))}
        </div>
      </MFR>

      <div style={GS.mBtns}>
        <SBtn onClick={()=>{ if(type==="uniform") onSaveUniforms(parsedUniforms); else onSaveEquips(parsedEquips); }}
          color="#3b82f6" full disabled={preview.length===0}>
          ✅ {preview.length}개 가져오기
        </SBtn>
        <SBtn onClick={onClose} color="#374151" full>취소</SBtn>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   MODULE 3 — SALES
═══════════════════════════════════════════════════════ */
function SalesPage({db}){
  const {uSales,eSales,customers,templates,sus,ses,toast_,groupOrders,uniforms}=db;
  const [tab,setTab]=useState("dashboard");
  const [addMod,setAdd]=useState(null);
  const [editMod,setEdit]=useState(null);
  const [msgMod,setMsg]=useState(null);

  const addSale=async(type,d)=>{ if(type==="uniform"){const n=[{...d,id:gid()},...uSales];await sus(n);}else{const n=[{...d,id:gid()},...eSales];await ses(n);} toast_("매출 등록!"); };
  const updSale=async(type,upd)=>{ if(type==="uniform"){await sus(uSales.map(s=>s.id===upd.id?upd:s));}else{await ses(eSales.map(s=>s.id===upd.id?upd:s));} toast_("수정!"); };
  const delSale=async(type,id)=>{ if(type==="uniform"){await sus(uSales.filter(s=>s.id!==id));}else{await ses(eSales.filter(s=>s.id!==id));} toast_("삭제"); };
  const togPaid=async(type,id)=>{ if(type==="uniform"){await sus(uSales.map(s=>s.id===id?{...s,paid:!s.paid}:s));}else{await ses(eSales.map(s=>s.id===id?{...s,paid:!s.paid}:s));} };

  const allSales=[...uSales,...eSales];
  const unpaidTotal=allSales.filter(s=>!s.paid).reduce((a,s)=>a+Number(s.sales||0),0);

  const exportSales = () => {
    exportCSV(`매출_${td()}.csv`,
      ["날짜","구분","거래처","상품명","매출","원가","순이익","결제수단","입금"],
      allSales.map(s=>[s.date,s.type==="uniform"?"유니폼":"용품",s.customer||"-",s.itemName||"-",s.sales||0,s.cost||0,(s.sales||0)-(s.cost||0),s.payMethod||"-",s.paid?"완료":"미수금"])
    );
    toast_("엑셀 파일 저장!");
  };

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <SBtn onClick={()=>setAdd("uniform")} color="#f59e0b">+ 유니폼 매출</SBtn>
        <SBtn onClick={()=>setAdd("equip")} color="#10b981">+ 용품 매출</SBtn>
        <SBtn onClick={()=>setMsg(true)} color="#6366f1">💬 문자 발송</SBtn>
        <SBtn onClick={exportSales} color="#0f766e">📊 엑셀 내보내기</SBtn>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <StatBadge label="미수금" val={won(unpaidTotal)} color={unpaidTotal>0?"#ef4444":"#10b981"}/>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["dashboard","📈 대시보드"],["uniform","👕 유니폼"],["equip","🏓 용품"],["unpaid","⚠️ 미수금"]].map(([k,l])=>(
          <div key={k} style={{padding:"7px 14px",borderRadius:8,background:tab===k?"#1e293b":"transparent",border:tab===k?"1px solid #f59e0b":"1px solid #334155",color:tab===k?"#f1f5f9":"#64748b",cursor:"pointer",fontSize:12,fontWeight:500}} onClick={()=>setTab(k)}>{l}</div>
        ))}
      </div>
      {tab==="dashboard"&&<SalesDashboard uSales={uSales} eSales={eSales} groupOrders={groupOrders||[]}/>}
      {tab==="uniform"&&<SalesTable type="uniform" sales={uSales} onEdit={r=>setEdit({type:"uniform",data:r})} onDel={id=>delSale("uniform",id)} onToggle={id=>togPaid("uniform",id)}/>}
      {tab==="equip"&&<SalesTable type="equip" sales={eSales} onEdit={r=>setEdit({type:"equip",data:r})} onDel={id=>delSale("equip",id)} onToggle={id=>togPaid("equip",id)}/>}
      {tab==="unpaid"&&<UnpaidTab uSales={uSales} eSales={eSales} onToggle={togPaid}/>}
      {addMod&&<SaleMod type={addMod} uniforms={uniforms||[]} onClose={()=>setAdd(null)} onSave={d=>{addSale(addMod,d);setAdd(null);}}/>}
      {editMod&&<SaleMod type={editMod.type} uniforms={uniforms||[]} initial={editMod.data} onClose={()=>setEdit(null)} onSave={d=>{updSale(editMod.type,{...editMod.data,...d});setEdit(null);}}/>}
      {msgMod&&<SendMsgModal targets={customers} templates={templates} onClose={()=>setMsg(null)}/>}
    </div>
  );
}
function SalesDashboard({uSales,eSales,groupOrders}){
  const [yr,setYr]=useState(new Date().getFullYear());
  const [rankTab,setRankTab]=useState("year"); // year | month
  const [rankMo,setRankMo]=useState(new Date().getMonth()+1);
  const all=[...uSales,...eSales];
  const mData=MONTHS.map((m,i)=>{
    const mo=String(i+1).padStart(2,"0");
    const rows=all.filter(s=>s.date?.startsWith(`${yr}-${mo}`));
    const uRows=uSales.filter(s=>s.date?.startsWith(`${yr}-${mo}`));
    const eRows=eSales.filter(s=>s.date?.startsWith(`${yr}-${mo}`));
    const sales=rows.reduce((a,s)=>a+Number(s.sales||0),0);
    const cost=rows.reduce((a,s)=>a+Number(s.cost||0),0);
    return{name:m,매출:sales,순이익:sales-cost,유니폼:uRows.reduce((a,s)=>a+Number(s.sales||0),0),용품:eRows.reduce((a,s)=>a+Number(s.sales||0),0)};
  });
  const totSales=mData.reduce((a,m)=>a+m.매출,0);
  const totProfit=mData.reduce((a,m)=>a+m.순이익,0);
  const years=[...new Set(all.map(s=>s.date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b-a);
  if(!years.includes(String(yr)))years.unshift(String(yr));

  // ── 인기 유니폼 랭킹 계산 ──
  // 소스: uSales(매출) + groupOrders(주문수량) 합산
  const calcRanking = (filterFn) => {
    const map = {};
    // 매출 데이터
    uSales.filter(filterFn).forEach(s => {
      const name = s.itemName || s.detail || "기타";
      if(!map[name]) map[name] = { name, salesCnt:0, salesAmt:0, orderQty:0 };
      map[name].salesCnt += 1;
      map[name].salesAmt += Number(s.sales||0);
    });
    // 단체복 주문 데이터
    (groupOrders||[]).filter(o=>o.status==="arrived").filter(filterFn2(filterFn)).forEach(o => {
      const name = o.uniformName || "기타";
      if(!map[name]) map[name] = { name, salesCnt:0, salesAmt:0, orderQty:0 };
      map[name].orderQty += Number(o.qty||0);
    });
    return Object.values(map).sort((a,b)=>(b.salesAmt+b.orderQty*1000)-(a.salesAmt+a.orderQty*1000));
  };

  // groupOrders용 필터 변환
  const filterFn2 = (fn) => (o) => {
    const d = o.arrivedAt || o.createdAt || "";
    const fakeS = { date: d };
    return fn(fakeS);
  };

  const yearFilter  = s => s.date?.startsWith(String(yr));
  const monthFilter = s => s.date?.startsWith(`${yr}-${String(rankMo).padStart(2,"0")}`);
  const ranking = calcRanking(rankTab==="year" ? yearFilter : monthFilter);

  // 메달 색상
  const medalColors = ["#f59e0b","#94a3b8","#b45309","#3b82f6","#64748b"];
  const medalEmoji  = ["🥇","🥈","🥉","4위","5위"];

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {years.map(y=><div key={y} style={{padding:"5px 12px",borderRadius:20,background:String(yr)===y?"#78350f":"#1e293b",border:String(yr)===y?"1px solid #f59e0b":"1px solid #334155",color:String(yr)===y?"#fcd34d":"#94a3b8",cursor:"pointer",fontSize:12}} onClick={()=>setYr(Number(y))}>{y}년</div>)}
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <SumPill label="연 매출" val={won(totSales)} color="#f59e0b"/>
          <SumPill label="연 순이익" val={won(totProfit)} color="#10b981"/>
        </div>
      </div>

      {/* ── 🏆 인기 유니폼 랭킹 ── */}
      <div style={{background:"#111827",border:"1px solid #1e293b",borderRadius:12,padding:"16px 18px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:13,fontWeight:600,color:"#f1f5f9"}}>🏆 인기 유니폼 랭킹</div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:0,border:"1px solid #334155",borderRadius:8,overflow:"hidden"}}>
              <div onClick={()=>setRankTab("year")} style={{padding:"5px 14px",fontSize:11,cursor:"pointer",
                background:rankTab==="year"?"#1e3a5f":"transparent",
                color:rankTab==="year"?"#93c5fd":"#64748b",fontWeight:rankTab==="year"?600:400}}>연간</div>
              <div onClick={()=>setRankTab("month")} style={{padding:"5px 14px",fontSize:11,cursor:"pointer",
                background:rankTab==="month"?"#1e3a5f":"transparent",
                color:rankTab==="month"?"#93c5fd":"#64748b",fontWeight:rankTab==="month"?600:400}}>월간</div>
            </div>
            {rankTab==="month" && (
              <select value={rankMo} onChange={e=>setRankMo(Number(e.target.value))}
                style={{...GS.sSel,padding:"4px 8px",fontSize:11}}>
                {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
            )}
          </div>
        </div>

        {ranking.length === 0
          ? <div style={{textAlign:"center",padding:"24px 0",color:"#4b5563",fontSize:13}}>
              📊 {rankTab==="year"?`${yr}년`:`${yr}년 ${rankMo}월`} 매출 데이터가 없습니다
            </div>
          : <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {ranking.slice(0,10).map((item,i)=>{
                const maxScore = (ranking[0]?.salesAmt||0) + (ranking[0]?.orderQty||0)*1000 || 1;
                const score    = item.salesAmt + item.orderQty*1000;
                const pct      = Math.round((score/maxScore)*100);
                const color    = medalColors[i] || "#334155";
                return (
                  <div key={item.name} style={{display:"flex",alignItems:"center",gap:10}}>
                    {/* 순위 */}
                    <div style={{width:32,textAlign:"center",fontSize:i<3?18:12,fontWeight:700,
                      color:medalColors[i]||"#64748b",flexShrink:0}}>
                      {medalEmoji[i]||`${i+1}위`}
                    </div>
                    {/* 이름 + 바 */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <span style={{fontSize:13,fontWeight:600,color:"#f1f5f9",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"60%"}}>{item.name}</span>
                        <div style={{display:"flex",gap:8,fontSize:11,color:"#94a3b8",flexShrink:0}}>
                          {item.salesAmt>0 && <span style={{color:"#f59e0b"}}>{won(item.salesAmt)}</span>}
                          {item.salesCnt>0 && <span>{item.salesCnt}건</span>}
                          {item.orderQty>0 && <span style={{color:"#3b82f6"}}>{item.orderQty}벌</span>}
                        </div>
                      </div>
                      <div style={{height:6,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,
                          transition:"width 0.5s ease"}}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
        }

        {ranking.length > 0 && (
          <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #1e293b",
            fontSize:11,color:"#475569",display:"flex",gap:16,flexWrap:"wrap"}}>
            <span>📊 매출금액 기준</span>
            <span>🔵 벌 수 = 단체복 주문 입고 수량</span>
            <span>총 {ranking.length}종 집계</span>
          </div>
        )}
      </div>

      <div style={{background:"#111827",border:"1px solid #1e293b",borderRadius:12,padding:"16px 20px",marginBottom:14}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>{yr}년 월별 매출 & 순이익</div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={mData} margin={{top:5,right:10,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
            <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>v>=10000?Math.round(v/10000)+"만":v} tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip formatter={(v,n)=>[won(v),n]} contentStyle={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,color:"#f1f5f9",fontSize:11}}/>
            <Legend wrapperStyle={{fontSize:11,color:"#94a3b8"}}/>
            <Bar dataKey="매출" fill="#f59e0b" radius={[3,3,0,0]} maxBarSize={36}/>
            <Bar dataKey="순이익" fill="#10b981" radius={[3,3,0,0]} maxBarSize={36}/>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{background:"#111827",border:"1px solid #1e293b",borderRadius:12,padding:"14px 18px"}}>
          <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>유니폼 vs 용품</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={mData} margin={{top:0,right:5,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
              <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>v>=10000?Math.round(v/10000)+"만":v} tick={{fill:"#64748b",fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v,n)=>[won(v),n]} contentStyle={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,color:"#f1f5f9",fontSize:10}}/>
              <Legend wrapperStyle={{fontSize:10,color:"#94a3b8"}}/>
              <Bar dataKey="유니폼" fill="#3b82f6" radius={[2,2,0,0]} maxBarSize={22}/>
              <Bar dataKey="용품" fill="#8b5cf6" radius={[2,2,0,0]} maxBarSize={22}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:"#111827",border:"1px solid #1e293b",borderRadius:12,padding:"14px 18px"}}>
          <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>순이익 추이</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={mData} margin={{top:0,right:5,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
              <XAxis dataKey="name" tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>v>=10000?Math.round(v/10000)+"만":v} tick={{fill:"#64748b",fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v,n)=>[won(v),n]} contentStyle={{background:"#1e293b",border:"1px solid #334155",borderRadius:8,color:"#f1f5f9",fontSize:10}}/>
              <Line type="monotone" dataKey="순이익" stroke="#10b981" strokeWidth={2} dot={{fill:"#10b981",r:2}} activeDot={{r:4}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
function SalesTable({type,sales,onEdit,onDel,onToggle}){
  const [yr,setYr]=useState(new Date().getFullYear()); const [mo,setMo]=useState(""); const [q,setQ]=useState("");
  const fil=useMemo(()=>sales.filter(s=>{
    const y=s.date?.startsWith(String(yr));
    const m=mo?s.date?.startsWith(`${yr}-${String(mo).padStart(2,"0")}`):y;
    const sq=!q||(s.customer||"").includes(q)||(s.detail||"").includes(q);
    return m&&sq;
  }),[sales,yr,mo,q]);
  const totS=fil.reduce((a,s)=>a+Number(s.sales||0),0),totC=fil.reduce((a,s)=>a+Number(s.cost||0),0);
  const gc={gridTemplateColumns:"88px 110px 90px 1fr 85px 75px 85px 75px 65px 90px 90px"};
  return(
    <div>
      <div style={GS.toolbar}>
        <select style={GS.sSel} value={yr} onChange={e=>setYr(Number(e.target.value))}>{[2023,2024,2025,2026].map(y=><option key={y} value={y}>{y}년</option>)}</select>
        <select style={GS.sSel} value={mo} onChange={e=>setMo(e.target.value)}><option value="">전체</option>{MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}</select>
        <input style={{...GS.sInp,flex:1,maxWidth:200}} placeholder="거래처·내역 검색..." value={q} onChange={e=>setQ(e.target.value)}/>
        <SumPill label="매출" val={won(totS)} color="#f59e0b"/>
        <SumPill label="순이익" val={won(totS-totC)} color="#10b981"/>
        <SumPill label="건수" val={fil.length+"건"} color="#3b82f6"/>
      </div>
      {fil.length===0?<EmptyState icon="📊" msg="매출 내역 없음"/>:
        <div style={GS.tbl}>
          <div style={{...GS.tRow,...gc,background:"#0b0f1a",borderTop:"none",fontSize:10,fontWeight:600,color:"#64748b"}}>
            <span>날짜</span><span>거래처</span><span>유형</span><span>내역</span><span style={{textAlign:"right"}}>매출</span><span style={{textAlign:"right"}}>원가</span><span style={{textAlign:"right"}}>순이익</span><span style={{textAlign:"center"}}>결제</span><span style={{textAlign:"center"}}>입금</span><span>송장</span><span style={{textAlign:"center"}}>관리</span>
          </div>
          {fil.map(s=>{
            const prof=Number(s.sales||0)-Number(s.cost||0);
            return <div key={s.id} style={{...GS.tRow,...gc,...(!s.paid?{background:"rgba(239,68,68,0.03)"}:{})}}>
              <span style={{fontSize:11,color:"#94a3b8"}}>{s.date}</span>
              <span style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.customer||"-"}</span>
              <span style={{fontSize:10}}><span style={{background:"#1d4ed8",color:"white",padding:"1px 5px",borderRadius:3}}>{s.orderType||"-"}</span></span>
              <span style={{fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.detail||"-"}</span>
              <span style={{textAlign:"right",fontWeight:600,color:"#f59e0b",fontSize:12}}>{fmt(s.sales)}</span>
              <span style={{textAlign:"right",color:"#64748b",fontSize:12}}>{fmt(s.cost)}</span>
              <span style={{textAlign:"right",fontWeight:600,color:prof>=0?"#10b981":"#ef4444",fontSize:12}}>{fmt(prof)}</span>
              <span style={{textAlign:"center"}}><PayTag method={s.payMethod}/></span>
              <span style={{textAlign:"center"}}><PaidBtn paid={s.paid} onClick={()=>onToggle(s.id)}/></span>
              <span style={{fontSize:10,color:"#64748b"}}>{s.tracking||"-"}</span>
              <div style={{display:"flex",gap:3,justifyContent:"center"}}><MBtn onClick={()=>onEdit(s)}>수정</MBtn><MBtn red onClick={()=>onDel(s.id)}>삭제</MBtn></div>
            </div>;
          })}
        </div>
      }
    </div>
  );
}
function UnpaidTab({uSales,eSales,onToggle}){
  const rows=useMemo(()=>[...uSales.filter(s=>!s.paid).map(s=>({...s,_t:"uniform"})),...eSales.filter(s=>!s.paid).map(s=>({...s,_t:"equip"}))].sort((a,b)=>a.date>b.date?-1:1),[uSales,eSales]);
  const total=rows.reduce((a,s)=>a+Number(s.sales||0),0);
  const gc={gridTemplateColumns:"90px 70px 130px 1fr 100px 80px 100px"};
  return <div>
    <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center"}}>
      <div style={{fontWeight:600}}>미수금 목록</div>
      <div style={{background:"rgba(239,68,68,0.15)",border:"1px solid #ef4444",borderRadius:8,padding:"4px 12px",color:"#fca5a5",fontSize:12,fontWeight:600}}>총 {won(total)}</div>
    </div>
    {rows.length===0?<EmptyState icon="✅" msg="미수금 없음" sub="모든 입금 확인됨"/>:
      <div style={GS.tbl}>
        <div style={{...GS.tRow,...gc,background:"#0b0f1a",borderTop:"none",fontSize:10,fontWeight:600,color:"#64748b"}}><span>날짜</span><span>구분</span><span>거래처</span><span>내역</span><span style={{textAlign:"right"}}>금액</span><span>결제</span><span style={{textAlign:"center"}}>처리</span></div>
        {rows.map(s=><div key={s.id} style={{...GS.tRow,...gc}}>
          <span style={{fontSize:11,color:"#94a3b8"}}>{s.date}</span>
          <span style={{background:s._t==="uniform"?"#1d4ed8":"#064e3b",color:"white",padding:"1px 6px",borderRadius:3,fontSize:10}}>{s._t==="uniform"?"유니폼":"용품"}</span>
          <span style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.customer||"-"}</span>
          <span style={{fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.detail||"-"}</span>
          <span style={{textAlign:"right",fontWeight:700,color:"#ef4444"}}>{fmt(s.sales)}</span>
          <span><PayTag method={s.payMethod}/></span>
          <div style={{textAlign:"center"}}><MBtn onClick={()=>onToggle(s._t,s.id)}>✓ 입금확인</MBtn></div>
        </div>)}
      </div>
    }
  </div>;
}
function SaleMod({type,initial,onClose,onSave,uniforms=[]}){
  const iU=type==="uniform";
  const [f,setF]=useState({date:td(),customer:"",orderType:iU?"단품판매":"라켓",detail:"",sales:"",cost:"",payMethod:"계좌이체",paid:false,tracking:"",memo:"",itemName:"",...(initial||{})});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const profit=Number(f.sales||0)-Number(f.cost||0);

  // ── 유니폼 선택 상태
  const [selUniId,setSelUniId]=useState(()=>{
    if(!iU||!initial?.itemName) return "";
    return uniforms.find(u=>u.name===initial.itemName)?.id||"";
  });

  // ── 단품판매: 사이즈별 수량
  const [sizeQtys,setSizeQtys]=useState(initial?.sizeQtys||{});

  // ── 단체복: 이전 방식 사이즈 멀티선택
  const [bulkSizeQtys,setBulkSizeQtys]=useState(initial?.sizeQtys||{});

  const selUni=uniforms.find(u=>u.id===selUniId)||null;
  const isSingle=f.orderType==="단품판매";

  // 단품: 사이즈 하나씩 선택
  const [selSize,setSelSize]=useState(initial?.selSize||"");
  const [selQty,setSelQty]=useState(initial?.selQty||1);
  const [priceType,setPriceType]=useState(initial?.priceType||"shopPrice"); // 단가 유형

  const pickUni=(id)=>{
    setSelUniId(id);
    setSizeQtys({}); setBulkSizeQtys({});
    setSelSize(""); setSelQty(1);
    const u=uniforms.find(x=>x.id===id);
    if(u){ s("itemName",u.name); s("detail",u.name); s("sales",""); s("cost",""); }
    else { s("itemName",""); s("detail",""); s("sales",""); s("cost",""); }
  };

  // 단품판매: 사이즈·수량 변경 → 자동계산
  const handleSingleChange=(sz,qty)=>{
    const newSz = sz !== undefined ? sz : selSize;
    const newQty = qty !== undefined ? Math.max(1, Number(qty)||1) : selQty;
    const maxStk = Number(selUni?.sizes?.[newSz]||0);
    const safeQty = Math.min(newQty, maxStk);

    setSelSize(newSz);
    setSelQty(safeQty);

    if(selUni && newSz){
      const sp = Number(selUni[priceType]||0);
      const cp = Number(selUni.costPrice||0);
      if(sp>0) s("sales", sp * safeQty);
      if(cp>0) s("cost",  cp * safeQty);
      s("detail", `${selUni.name} ${newSz} ${safeQty}벌`);
      setSizeQtys(newSz ? {[newSz]: safeQty} : {});
    }
  };

  // 단체복: 사이즈별 수량
  const setBulkSzQ=(sz,val)=>{
    const max=Number(selUni?.sizes?.[sz]||0);
    const v=Math.max(0,Math.min(Number(val)||0,max));
    setBulkSizeQtys(p=>{const n={...p};if(v===0)delete n[sz];else n[sz]=v;return n;});
  };
  const bulkTotal=Object.values(bulkSizeQtys).reduce((a,v)=>a+v,0);

  const handleSave=()=>{
    let payload={...f};
    if(iU && isSingle && selUni && selSize){
      payload.sizeQtys={[selSize]:selQty};
      payload.selSize=selSize; payload.selQty=selQty;
    } else if(iU && !isSingle && selUni && bulkTotal>0){
      payload.sizeQtys=bulkSizeQtys;
      if(!f.detail||f.detail===selUni?.name){
        const str=Object.entries(bulkSizeQtys).map(([sz,q])=>`${sz}×${q}`).join(", ");
        payload.detail=`${selUni.name} ${bulkTotal}벌 (${str})`;
      }
    }
    onSave(payload);
  };

  const SIZES_ORDER=["75","80","85","90","95","100","105","110","115","120"];
  const sortedSizes=(obj)=>Object.keys(obj||{}).sort((a,b)=>{
    const ia=SIZES_ORDER.indexOf(a),ib=SIZES_ORDER.indexOf(b);
    if(ia>=0&&ib>=0)return ia-ib; if(ia>=0)return -1; if(ib>=0)return 1; return a.localeCompare(b);
  });

  return <Modal title={`${iU?"👕 유니폼":"🏓 용품"} 매출 ${initial?"수정":"등록"}`} onClose={onClose}>
    <div style={GS.fGrid}>
      <MFR label="날짜"><input type="date" style={GS.inp} value={f.date} onChange={e=>s("date",e.target.value)}/></MFR>
      <MFR label="거래처명"><input style={GS.inp} value={f.customer} onChange={e=>s("customer",e.target.value)} placeholder="동호회명"/></MFR>
    </div>
    <MFR label="주문유형"><div style={GS.chips}>{(iU?["단품판매","단체복 등판 제작","기타"]:["라켓","러버","공","가방","기타용품"]).map(t=><Chip key={t} active={f.orderType===t} onClick={()=>{s("orderType",t);setSelSize("");setSelQty(1);setSizeQtys({});setBulkSizeQtys({});if(selUni){s("sales","");s("cost","");s("detail",selUni.name);}}}>{t}</Chip>)}</div></MFR>

    {/* ── 유니폼 선택 (유니폼 매출 공통) ── */}
    {iU&&<MFR label="유니폼 선택">
      <select style={GS.inp} value={selUniId} onChange={e=>pickUni(e.target.value)}>
        <option value="">— 유니폼을 선택하세요 —</option>
        {[...uniforms].sort((a,b)=>(b.year||0)-(a.year||0)).map(u=>{
          const tot=Object.values(u.sizes||{}).reduce((a,v)=>a+Number(v||0),0);
          return <option key={u.id} value={u.id}>{u.name} ({u.year}년 · 재고 {tot}벌)</option>;
        })}
      </select>
    </MFR>}

    {/* ══ 단품판매 — 사이즈 + 수량 선택 ══ */}
    {iU && isSingle && selUni && (
      <MFR label="사이즈 & 수량 선택">
        <div style={{background:"#0b0f1a",borderRadius:10,border:"1px solid #1e293b",padding:"12px 14px"}}>
          {/* 유니폼 정보 */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,paddingBottom:10,borderBottom:"1px solid #1e293b"}}>
            {selUni.imgSrc
              ?<img src={selUni.imgSrc} style={{width:40,height:40,objectFit:"cover",borderRadius:6,border:"1px solid #1e293b"}} alt=""/>
              :<div style={{width:40,height:40,borderRadius:6,background:"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>👕</div>
            }
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:13,color:"#f1f5f9"}}>{selUni.name}</div>
              {/* 단가 유형 선택 탭 */}
              <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                {[["agencyPrice","대리점가"],["shopPrice","용품점가"],["netPrice","인터넷최저가"],["friendPrice","지인가"]].map(([key,label])=>{
                  const price=Number(selUni[key]||0);
                  const isActive=priceType===key;
                  return <button key={key} onClick={()=>{
                    setPriceType(key);
                    const sp=price; const cp=Number(selUni.costPrice||0);
                    if(sp>0&&selSize){ s("sales",sp*selQty); if(cp>0)s("cost",cp*selQty); }
                  }} style={{
                    padding:"3px 8px",borderRadius:6,fontSize:10,cursor:"pointer",
                    border:`1px solid ${isActive?"#f59e0b":price>0?"#334155":"#1e293b"}`,
                    background:isActive?"rgba(245,158,11,0.15)":price>0?"#1e293b":"#0b0f1a",
                    color:isActive?"#fcd34d":price>0?"#94a3b8":"#374151",fontWeight:isActive?700:400,
                  }}>
                    {label}{price>0?` ${won(price)}`:" —"}
                  </button>;
                })}
              </div>
              {!["agencyPrice","shopPrice","netPrice","friendPrice"].some(k=>selUni[k]>0)&&
                <span style={{fontSize:10,color:"#ef4444",display:"block",marginTop:4}}>⚠ 재고관리에서 단가를 입력해주세요</span>}
            </div>
          </div>

          {/* 사이즈 선택 버튼 */}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:"#64748b",marginBottom:6,fontWeight:600}}>사이즈 선택</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {sortedSizes(selUni.sizes).map(sz=>{
                const stk=Number(selUni.sizes[sz]||0);
                const isSel=selSize===sz;
                const isEmpty=stk===0;
                return <button key={sz} disabled={isEmpty} onClick={()=>handleSingleChange(sz, selQty)}
                  style={{
                    padding:"6px 12px",borderRadius:7,border:`1px solid ${isSel?"#f59e0b":isEmpty?"#1e293b":"#334155"}`,
                    background:isSel?"rgba(245,158,11,0.15)":isEmpty?"#0b0f1a":"#1e293b",
                    color:isSel?"#fcd34d":isEmpty?"#374151":"#94a3b8",
                    cursor:isEmpty?"default":"pointer",fontWeight:isSel?700:400,
                    fontSize:12,transition:"all 0.15s",position:"relative",
                  }}>
                  {sz}
                  <span style={{
                    display:"block",fontSize:9,marginTop:1,
                    color:isEmpty?"#ef4444":stk<=3?"#f59e0b":"#10b981"
                  }}>{isEmpty?"품절":`${stk}개`}</span>
                </button>;
              })}
            </div>
          </div>

          {/* 수량 입력 (사이즈 선택 후) */}
          {selSize&&(
            <div style={{display:"flex",alignItems:"center",gap:10,paddingTop:10,borderTop:"1px solid #1e293b"}}>
              <div style={{fontSize:12,color:"#94a3b8"}}>
                <span style={{color:"#f59e0b",fontWeight:700}}>{selSize}</span> 수량
                <span style={{fontSize:10,color:"#64748b",marginLeft:4}}>(재고 {Number(selUni.sizes[selSize]||0)}개)</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                <button onClick={()=>handleSingleChange(undefined, selQty-1)} disabled={selQty<=1}
                  style={{width:28,height:28,borderRadius:7,background:selQty<=1?"#0b0f1a":"#1e293b",border:"1px solid #334155",color:selQty<=1?"#374151":"white",cursor:selQty<=1?"default":"pointer",fontSize:16,lineHeight:1,padding:0}}>−</button>
                <input type="number" min={1} max={Number(selUni.sizes[selSize]||0)}
                  value={selQty}
                  onChange={e=>handleSingleChange(undefined, e.target.value)}
                  style={{...GS.inp,width:54,textAlign:"center",fontWeight:700,fontSize:14,color:"#fcd34d",padding:"4px 6px"}}/>
                <button onClick={()=>handleSingleChange(undefined, selQty+1)} disabled={selQty>=Number(selUni.sizes[selSize]||0)}
                  style={{width:28,height:28,borderRadius:7,background:selQty>=Number(selUni.sizes[selSize]||0)?"#0b0f1a":"#1e293b",border:"1px solid #334155",color:selQty>=Number(selUni.sizes[selSize]||0)?"#374151":"white",cursor:selQty>=Number(selUni.sizes[selSize]||0)?"default":"pointer",fontSize:16,lineHeight:1,padding:0}}>+</button>
              </div>
            </div>
          )}

          {/* 자동계산 결과 미리보기 */}
          {selSize && Number(selUni[priceType]||0)>0 && (
            <div style={{marginTop:10,background:"#0f172a",borderRadius:7,padding:"8px 12px",border:"1px solid #1e3a5f"}}>{(()=>{
              const sp=Number(selUni[priceType]||0); const cp=Number(selUni.costPrice||0);
              const ptLabel={agencyPrice:"대리점가",shopPrice:"용품점가",netPrice:"인터넷최저가",friendPrice:"지인가"}[priceType];
              return <>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,color:"#64748b"}}>매출액 ({ptLabel} {won(sp)} × {selQty}벌)</span>
                  <span style={{fontWeight:700,color:"#f59e0b",fontSize:13}}>{won(sp*selQty)}</span>
                </div>
                {cp>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,color:"#64748b"}}>수입원가 ({won(cp)} × {selQty}벌)</span>
                  <span style={{fontWeight:700,color:"#94a3b8",fontSize:13}}>{won(cp*selQty)}</span>
                </div>}
                {cp>0&&<div style={{display:"flex",justifyContent:"space-between",paddingTop:5,borderTop:"1px solid #1e293b"}}>
                  <span style={{fontSize:11,color:"#64748b"}}>예상 순이익</span>
                  <span style={{fontWeight:700,color:"#10b981",fontSize:13}}>{won((sp-cp)*selQty)}</span>
                </div>}
              </>;
            })()}
            </div>
          )}
        </div>
      </MFR>
    )}

    {/* ══ 단체복/기타 — 사이즈별 멀티 수량 ══ */}
    {iU && !isSingle && selUni && (
      <MFR label="사이즈별 수량 (단체복)">
        <div style={{background:"#0b0f1a",borderRadius:10,border:"1px solid #1e293b",padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,paddingBottom:8,borderBottom:"1px solid #1e293b"}}>
            {selUni.imgSrc
              ?<img src={selUni.imgSrc} style={{width:36,height:36,objectFit:"cover",borderRadius:5}} alt=""/>
              :<div style={{width:36,height:36,borderRadius:5,background:"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👕</div>
            }
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:12,color:"#f1f5f9"}}>{selUni.name}</div>
              <div style={{fontSize:10,color:"#64748b",marginTop:1}}>{selUni.year}년도</div>
            </div>
            {bulkTotal>0&&<div style={{background:"rgba(245,158,11,0.15)",border:"1px solid #f59e0b",borderRadius:6,padding:"3px 9px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"#f59e0b"}}>선택</div>
              <div style={{fontSize:14,fontWeight:800,color:"#fcd34d"}}>{bulkTotal}벌</div>
            </div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"44px 1fr 44px 90px",gap:5,fontSize:10,color:"#64748b",fontWeight:600,marginBottom:6,paddingLeft:2}}>
            <span>사이즈</span><span>재고 현황</span><span style={{textAlign:"center"}}>재고</span><span style={{textAlign:"center"}}>판매수량</span>
          </div>
          {sortedSizes(selUni.sizes).map(sz=>{
            const stk=Number(selUni.sizes[sz]||0);
            const sel=bulkSizeQtys[sz]||0;
            const maxStk=Math.max(...Object.values(selUni.sizes).map(v=>Number(v||0)),1);
            const empty=stk===0;
            return <div key={sz} style={{display:"grid",gridTemplateColumns:"44px 1fr 44px 90px",gap:5,alignItems:"center",marginBottom:5,opacity:empty?0.45:1}}>
              <span style={{fontSize:12,fontWeight:700,color:empty?"#4b5563":sel>0?"#f59e0b":"#94a3b8",textAlign:"center"}}>{sz}</span>
              <div style={{position:"relative",height:14,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
                {empty
                  ?<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:9,color:"#ef4444",fontWeight:700}}>품절</span></div>
                  :<>
                    <div style={{position:"absolute",top:0,left:0,height:"100%",width:`${Math.round((stk/maxStk)*100)}%`,background:"#1e3a5f",borderRadius:3}}/>
                    {sel>0&&<div style={{position:"absolute",top:0,left:0,height:"100%",width:`${Math.round((sel/stk)*100)}%`,background:"#f59e0b",borderRadius:3,transition:"width 0.2s"}}/>}
                  </>
                }
              </div>
              <span style={{fontSize:12,fontWeight:600,textAlign:"center",color:empty?"#ef4444":stk<=3?"#f59e0b":"#10b981"}}>{stk}</span>
              <div style={{display:"flex",alignItems:"center",gap:2,justifyContent:"center"}}>
                <button disabled={empty||sel<=0} onClick={()=>setBulkSzQ(sz,sel-1)}
                  style={{width:20,height:20,borderRadius:4,background:empty||sel<=0?"#0b0f1a":"#1e293b",border:"1px solid #334155",color:empty||sel<=0?"#374151":"white",cursor:empty||sel<=0?"default":"pointer",fontSize:13,padding:0}}>−</button>
                <input type="number" min={0} max={stk} disabled={empty}
                  value={bulkSizeQtys[sz]||""}
                  onChange={e=>setBulkSzQ(sz,e.target.value)}
                  placeholder="0"
                  style={{...GS.inp,width:32,padding:"2px 3px",fontSize:12,textAlign:"center",color:sel>0?"#fcd34d":"#64748b",fontWeight:sel>0?700:400}}/>
                <button disabled={empty||sel>=stk} onClick={()=>setBulkSzQ(sz,sel+1)}
                  style={{width:20,height:20,borderRadius:4,background:empty||sel>=stk?"#0b0f1a":"#1e293b",border:"1px solid #334155",color:empty||sel>=stk?"#374151":"white",cursor:empty||sel>=stk?"default":"pointer",fontSize:13,padding:0}}>+</button>
              </div>
            </div>;
          })}
          <div style={{display:"flex",gap:5,marginTop:6,paddingTop:8,borderTop:"1px solid #1e293b"}}>
            <SBtn onClick={()=>{const n={};sortedSizes(selUni.sizes).forEach(sz=>{if(Number(selUni.sizes[sz])>0)n[sz]=Number(selUni.sizes[sz]);});setBulkSizeQtys(n);}} color="#374151">전체 선택</SBtn>
            <SBtn onClick={()=>setBulkSizeQtys({})} color="#7f1d1d">초기화</SBtn>
            {bulkTotal>0&&<span style={{fontSize:11,color:"#f59e0b",alignSelf:"center",marginLeft:4}}>총 {bulkTotal}벌</span>}
          </div>
        </div>
      </MFR>
    )}

    <MFR label="거래내역"><textarea style={{...GS.inp,height:54,resize:"vertical"}} value={f.detail} onChange={e=>s("detail",e.target.value)} placeholder="예) 올가 단체복 38벌"/></MFR>
    <div style={GS.fGrid}>
      <MFR label="매출액"><input type="number" style={GS.inp} value={f.sales} onChange={e=>s("sales",e.target.value)}/></MFR>
      <MFR label="수입원가"><input type="number" style={GS.inp} value={f.cost} onChange={e=>s("cost",e.target.value)}/></MFR>
    </div>
    {(f.sales||f.cost)&&<div style={{display:"flex",justifyContent:"space-between",background:"#0b0f1a",borderRadius:6,padding:"7px 12px",marginBottom:10}}><span style={{fontSize:11,color:"#94a3b8"}}>순이익</span><span style={{fontWeight:700,color:profit>=0?"#10b981":"#ef4444"}}>{won(profit)}</span></div>}
    <div style={GS.fGrid}>
      <MFR label="결제수단"><select style={GS.inp} value={f.payMethod} onChange={e=>s("payMethod",e.target.value)}>{PAY_METHODS.map(m=><option key={m}>{m}</option>)}</select></MFR>
      <MFR label="입금여부"><div style={GS.chips}><Chip active={f.paid} onClick={()=>s("paid",true)} green>✓ 입금완료</Chip><Chip active={!f.paid} onClick={()=>s("paid",false)} red>미수금</Chip></div></MFR>
    </div>
    <MFR label="송장번호"><input style={GS.inp} value={f.tracking} onChange={e=>s("tracking",e.target.value)} placeholder="택배 송장번호"/></MFR>
    <div style={GS.mBtns}><SBtn onClick={handleSave} color={iU?"#f59e0b":"#10b981"} full>{initial?"수정":"등록"}</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}
/* ═══════════════════════════════════════════════════════
   MODULE 4 — ORDERS
═══════════════════════════════════════════════════════ */
function OrdersPage({db}){
  const {orders,sor,toast_}=db;
  const [tab,setTab]=useState("list");
  const [addMod,setAdd]=useState(false);
  const [detId,setDet]=useState(null);
  const [printId,setPrint]=useState(null);
  const [search,setSearch]=useState("");
  const [sf,setSF]=useState("all");

  const addOrder=async d=>{ await sor([{...d,id:gid(),createdAt:td()},...orders]); toast_("주문 등록!"); };
  const updOrder=async(id,patch)=>{ await sor(orders.map(o=>o.id===id?{...o,...patch}:o)); };
  const delOrder=async id=>{ await sor(orders.filter(o=>o.id!==id)); toast_("삭제"); };

  const fil=orders.filter(o=>{
    const ms=sf==="all"||o.status===sf;
    const mq=!search||(o.customer||"").includes(search)||(o.uniformName||"").includes(search);
    return ms&&mq;
  });
  const detOrder=orders.find(o=>o.id===detId);
  const printOrder=orders.find(o=>o.id===printId);

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <input style={{...GS.sInp,width:200}} placeholder="거래처·유니폼 검색..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:"flex",background:"#1e293b",borderRadius:8,overflow:"hidden",border:"1px solid #334155"}}>
          <div style={{padding:"6px 12px",fontSize:12,color:tab==="list"?"#f1f5f9":"#64748b",cursor:"pointer",background:tab==="list"?"#334155":""}} onClick={()=>setTab("list")}>📃 목록</div>
          <div style={{padding:"6px 12px",fontSize:12,color:tab==="kanban"?"#f1f5f9":"#64748b",cursor:"pointer",background:tab==="kanban"?"#334155":""}} onClick={()=>setTab("kanban")}>🗂 칸반</div>
        </div>
        <SBtn onClick={()=>setAdd(true)} color="#f59e0b" style={{marginLeft:"auto"}}>+ 주문 등록</SBtn>
      </div>
      <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{...GS.sSel,padding:"5px 10px",borderRadius:20,cursor:"pointer",background:sf==="all"?"#1d4ed8":"#1e293b",border:sf==="all"?"1px solid #3b82f6":"1px solid #334155",color:sf==="all"?"white":"#94a3b8",fontSize:12,outline:"none"}} onClick={()=>setSF("all")}>전체 {orders.length}</div>
        {STATUS_FLOW.map(s=><div key={s.key} style={{padding:"5px 10px",borderRadius:20,cursor:"pointer",background:sf===s.key?s.bg:"#1e293b",border:sf===s.key?`1px solid ${s.color}`:"1px solid #334155",color:sf===s.key?s.color:"#94a3b8",fontSize:12}} onClick={()=>setSF(s.key)}>{s.label} {orders.filter(o=>o.status===s.key).length}</div>)}
      </div>
      {tab==="list"&&(fil.length===0?<EmptyState icon="📋" msg="주문 없음"/>:
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {fil.map(o=><OrderCard key={o.id} order={o} onDetail={()=>setDet(o.id)} onPrint={()=>setPrint(o.id)} onStatus={k=>updOrder(o.id,{status:k})} onDelete={()=>delOrder(o.id)}/>)}
        </div>
      )}
      {tab==="kanban"&&<KanbanView orders={orders} onDetail={id=>setDet(id)} onStatus={(id,k)=>updOrder(id,{status:k})} onPrint={id=>setPrint(id)}/>}
      {addMod&&<OrderModal onClose={()=>setAdd(false)} onSave={d=>{addOrder(d);setAdd(false);}}/>}
      {detOrder&&<DetailModal order={detOrder} onClose={()=>setDet(null)} onUpdate={p=>updOrder(detId,p)} onPrint={()=>{setDet(null);setPrint(detId);}}/>}
      {printOrder&&<PrintModal order={printOrder} onClose={()=>setPrint(null)}/>}
    </div>
  );
}
function OrderCard({order,onDetail,onPrint,onStatus,onDelete}){
  const st=STATUS_FLOW.find(s=>s.key===order.status)||STATUS_FLOW[0];
  const tot=[...(order.topRoster||[]),...(order.botRoster||[])].reduce((a,r)=>a+Number(r.qty||1),0);
  const dl=order.dueDate?Math.ceil((new Date(order.dueDate)-new Date())/86400000):null;
  return <div style={{background:"#111827",border:"1px solid #1e293b",borderRadius:12,padding:14}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
      <span style={{background:st.bg,color:st.color,border:`1px solid ${st.color}`,padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600}}>{st.label}</span>
      <span style={{fontWeight:600,fontSize:13,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{order.customer||"-"}</span>
      {dl!=null&&<span style={{fontSize:11,fontWeight:700,color:dl<0?"#ef4444":dl<=3?"#f59e0b":"#64748b"}}>{dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`}</span>}
    </div>
    <div style={{fontSize:12,color:"#94a3b8",marginBottom:8}}>{order.uniformName||"-"}</div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
      {[["👕",`${tot}벌`],order.dueDate&&["📅",order.dueDate],order.amount&&["💰",won(order.amount)]].filter(Boolean).map((m,i)=><span key={i} style={{background:"#1e293b",borderRadius:5,padding:"2px 7px",fontSize:11,color:"#94a3b8"}}>{m[0]} {m[1]}</span>)}
    </div>
    <div style={{display:"flex",alignItems:"center",marginBottom:4}}>
      {STATUS_FLOW.map((s,i)=><><div key={s.key} style={{width:10,height:10,borderRadius:"50%",background:order.status===s.key?s.color:STATUS_FLOW.findIndex(x=>x.key===order.status)>i?s.color+"44":"#1e293b",border:`1.5px solid ${order.status===s.key?s.color:"#334155"}`,cursor:"pointer",flexShrink:0}} onClick={()=>onStatus(s.key)} title={s.label}/>{i<STATUS_FLOW.length-1&&<div key={`l${i}`} style={{flex:1,height:1.5,background:"#1e293b"}}/>}</>)}
    </div>
    <div style={{display:"flex",gap:5,marginTop:8,flexWrap:"wrap"}}>
      <SBtn onClick={onDetail} color="#1e3a5f">📋 명단</SBtn>
      <SBtn onClick={onPrint} color="#374151">🖨 출력</SBtn>
      <SBtn onClick={onDelete} color="#7f1d1d">🗑</SBtn>
    </div>
  </div>;
}
function KanbanView({orders,onDetail,onStatus,onPrint}){
  return <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,minWidth:900,overflowX:"auto"}}>
    {STATUS_FLOW.map(st=>{
      const cols=orders.filter(o=>o.status===st.key);
      return <div key={st.key} style={{background:"#111827",borderRadius:10,border:"1px solid #1e293b",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 10px",borderBottom:`2px solid ${st.color}`}}>
          <span style={{color:st.color,fontWeight:600,fontSize:12}}>{st.label}</span>
          <span style={{background:st.bg,color:st.color,borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:600}}>{cols.length}</span>
        </div>
        <div style={{padding:"8px 8px",display:"flex",flexDirection:"column",gap:6,minHeight:200}}>
          {cols.map(o=><div key={o.id} style={{background:"#1e293b",borderRadius:7,padding:8,border:"1px solid #334155"}}>
            <div style={{fontWeight:600,fontSize:12,marginBottom:3}}>{o.customer||"-"}</div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:5}}>{o.uniformName||"-"}</div>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              <SBtn onClick={()=>onDetail(o.id)} color="#1e3a5f">명단</SBtn>
              <SBtn onClick={()=>onPrint(o.id)} color="#374151">출력</SBtn>
              <select style={{background:"#0b0f1a",border:"1px solid #334155",borderRadius:4,padding:"3px 4px",color:"#f1f5f9",fontSize:10,cursor:"pointer"}} value={o.status} onChange={e=>onStatus(o.id,e.target.value)}>
                {STATUS_FLOW.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>)}
        </div>
      </div>;
    })}
  </div>;
}
function OrderModal({onClose,onSave}){
  const add14=(d)=>{ const dt=new Date(d||Date.now()); dt.setDate(dt.getDate()+14); return dt.toISOString().slice(0,10); };
  const [f,setF]=useState({customer:"",contact:"",uniformName:"",dueDate:add14(),amount:"",status:"consulting",manager:"",memo:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return <Modal title="📦 주문 등록" onClose={onClose}>
    <div style={GS.fGrid}>
      <MFR label="거래처명 *"><input style={GS.inp} value={f.customer} onChange={e=>s("customer",e.target.value)} placeholder="동호회명"/></MFR>
      <MFR label="연락처"><input style={GS.inp} value={f.contact} onChange={e=>s("contact",e.target.value)} placeholder="010-0000-0000"/></MFR>
    </div>
    <MFR label="유니폼명"><input style={GS.inp} value={f.uniformName} onChange={e=>s("uniformName",e.target.value)} placeholder="예) y25-01 스카이웨이브"/></MFR>
    <div style={GS.fGrid}>
      <MFR label="납기일"><input type="date" style={GS.inp} value={f.dueDate} onChange={e=>s("dueDate",e.target.value)}/></MFR>
      <MFR label="금액"><input type="number" style={GS.inp} value={f.amount} onChange={e=>s("amount",e.target.value)}/></MFR>
      <MFR label="담당자"><input style={GS.inp} value={f.manager} onChange={e=>s("manager",e.target.value)}/></MFR>
      <MFR label="초기 상태"><select style={GS.inp} value={f.status} onChange={e=>s("status",e.target.value)}>{STATUS_FLOW.map(st=><option key={st.key} value={st.key}>{st.label}</option>)}</select></MFR>
    </div>
    <MFR label="메모"><textarea style={{...GS.inp,height:50,resize:"vertical"}} value={f.memo} onChange={e=>s("memo",e.target.value)}/></MFR>
    <div style={GS.mBtns}><SBtn onClick={()=>{if(!f.customer.trim())return;onSave(f);}} color="#f59e0b" full>등록</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}
function DetailModal({order,onClose,onUpdate,onPrint}){
  const [topR,setTop]=useState(order.topRoster||[]);
  const [botR,setBot]=useState(order.botRoster||[]);
  const [note,setNote]=useState(order.rosterNote||"");
  const [aR,setAR]=useState("top");
  const R=aR==="top"?topR:botR; const setR=aR==="top"?setTop:setBot;
  const addRow=()=>setR(p=>[...p,{id:gid(),name:"",backName:"",backNum:"",size:"100",qty:1}]);
  const updR=(id,k,v)=>setR(p=>p.map(r=>r.id===id?{...r,[k]:v}:r));
  const delR=id=>setR(p=>p.filter(r=>r.id!==id));
  return <Modal title="📋 명단 관리" onClose={onClose} wide>
    <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>{order.customer} · {order.uniformName}</div>
    <div style={{display:"flex",borderBottom:"1px solid #1e293b",marginBottom:12}}>
      {[["top",`상의 (${topR.reduce((a,r)=>a+Number(r.qty||1),0)}벌)`],["bot",`하의 (${botR.reduce((a,r)=>a+Number(r.qty||1),0)}벌)`]].map(([k,l])=>(
        <div key={k} style={{padding:"8px 16px",fontSize:12,fontWeight:500,color:aR===k?"#f59e0b":"#64748b",cursor:"pointer",borderBottom:aR===k?"2px solid #f59e0b":"2px solid transparent"}} onClick={()=>setAR(k)}>{l}</div>
      ))}
      <div style={{marginLeft:"auto",alignSelf:"center"}}><SBtn onClick={onPrint} color="#374151">🖨 출력</SBtn></div>
    </div>
    <div style={{border:"1px solid #1e293b",borderRadius:8,overflow:"hidden",marginBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:"32px 1fr 1.8fr 1fr 1fr 60px 26px",gap:4,padding:"5px 8px",background:"#0b0f1a",fontSize:10,fontWeight:600,color:"#64748b"}}>
        <span style={{textAlign:"center"}}>번</span><span>성명</span><span>등이름</span><span>등번호</span><span>사이즈</span><span style={{textAlign:"center"}}>수량</span><span></span>
      </div>
      {R.map((r,i)=>(
        <div key={r.id} style={{display:"grid",gridTemplateColumns:"32px 1fr 1.8fr 1fr 1fr 60px 26px",gap:4,padding:"4px 8px",borderTop:"1px solid #1e293b",alignItems:"center"}}>
          <span style={{textAlign:"center",fontSize:11,color:"#64748b"}}>{i+1}</span>
          <input style={{...GS.inp,padding:"4px 6px",fontSize:12}} placeholder="홍길동" value={r.name} onChange={e=>updR(r.id,"name",e.target.value)}/>
          <input style={{...GS.inp,padding:"4px 6px",fontSize:12}} placeholder="HONG.G.D" value={r.backName} onChange={e=>updR(r.id,"backName",e.target.value)}/>
          <input style={{...GS.inp,padding:"4px 6px",fontSize:12}} placeholder="10" value={r.backNum} onChange={e=>updR(r.id,"backNum",e.target.value)}/>
          <select style={{...GS.inp,padding:"4px 6px",fontSize:12,cursor:"pointer"}} value={r.size} onChange={e=>updR(r.id,"size",e.target.value)}>{SIZES.map(sz=><option key={sz}>{sz}</option>)}</select>
          <input type="number" min={1} style={{...GS.inp,padding:"4px 6px",fontSize:12,textAlign:"center"}} value={r.qty} onChange={e=>updR(r.id,"qty",e.target.value)}/>
          <button onClick={()=>delR(r.id)} style={{background:"#7f1d1d",border:"none",borderRadius:3,color:"white",cursor:"pointer",fontSize:10,padding:"2px 4px"}}>✕</button>
        </div>
      ))}
    </div>
    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
      <SBtn onClick={addRow} color="#1e3a5f">+ 행 추가</SBtn>
      <span style={{fontSize:11,color:"#64748b"}}>{R.length}명 / {R.reduce((a,r)=>a+Number(r.qty||1),0)}벌</span>
    </div>
    <MFR label="비고"><textarea style={{...GS.inp,height:50,resize:"vertical"}} value={note} onChange={e=>setNote(e.target.value)} placeholder="등판 내용 보내드리겠습니다. 확인 후 작업 부탁드립니다."/></MFR>
    <div style={GS.mBtns}><SBtn onClick={()=>{onUpdate({topRoster:topR,botRoster:botR,rosterNote:note});onClose();}} color="#f59e0b" full>💾 저장</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}
function PrintModal({order,onClose}){
  const ref=useRef();
  const hp=()=>{
    const s=document.createElement("style"); s.textContent=`@media print{body>*:not(#pp){display:none!important}#pp{display:block!important;position:fixed;top:0;left:0;width:100%;z-index:9999;background:white}@page{margin:10mm;size:A4 landscape;}}`;
    document.head.appendChild(s); ref.current.id="pp"; window.print(); document.head.removeChild(s);
  };
  const top=order.topRoster||[],bot=order.botRoster||[];
  const maxR=Math.max(top.length,bot.length,18);
  const rows=Array.from({length:maxR},(_,i)=>({top:top[i]||null,bot:bot[i]||null}));
  const dp=order.dueDate?order.dueDate.split("-"):[];
  const dsp=dp.length===3?`${parseInt(dp[1])}월 ${parseInt(dp[2])}일`:order.dueDate;
  return <Modal title="🖨 주문서 미리보기" onClose={onClose} wide>
    <div style={{textAlign:"right",marginBottom:10}}><SBtn onClick={hp} color="#f59e0b">🖨 인쇄 / PDF 저장</SBtn></div>
    <div style={{overflowX:"auto",background:"#e5e7eb",padding:16,borderRadius:8}}>
      <div ref={ref} style={{background:"white",color:"black",padding:"14px 18px",fontFamily:"'Malgun Gothic','Apple SD Gothic Neo',sans-serif",minWidth:860}}>
        <table style={{width:"100%",borderCollapse:"collapse",border:"2px solid #000",marginBottom:0}}>
          <tbody>
            <tr>
              <td rowSpan={3} style={{border:"1px solid #999",padding:"6px 10px",width:160,verticalAlign:"middle",textAlign:"center",borderRight:"2px solid #000"}}>
                <div style={{fontSize:20,fontWeight:700,letterSpacing:"-1px"}}>유니폼주문서</div>
              </td>
              <td style={{border:"1px solid #999",padding:"5px 8px",borderBottom:"1px solid #ccc"}}>
                <span style={{fontSize:11,color:"#444",fontWeight:600}}>유니폼 제목: </span>
                <span style={{fontSize:12,fontWeight:700}}>{order.uniformName||""}</span>
              </td>
              <td rowSpan={3} style={{border:"1px solid #999",padding:"6px 8px",width:100,verticalAlign:"middle",textAlign:"center",borderLeft:"2px solid #000"}}>
                <div style={{fontSize:11,color:"#444",fontWeight:600}}>납기일</div>
                <div style={{fontSize:15,fontWeight:700,marginTop:4}}>{dsp}</div>
              </td>
            </tr>
            <tr>
              <td style={{border:"1px solid #999",padding:"6px 10px",verticalAlign:"middle"}}>
                <span style={{fontSize:11,fontWeight:600,color:"#444",marginRight:8}}>비 고</span>
                <span style={{color:"#cc0000",fontWeight:700,fontSize:12}}>{order.rosterNote||"등판 내용 보내드리겠습니다. 확인 후 작업 부탁드립니다."}</span>
              </td>
            </tr>
            <tr>
              <td style={{border:"1px solid #999",padding:"4px 8px",fontSize:11}}>
                거래처: {order.customer||""}　연락처: {order.contact||""}　총: {[...top,...bot].reduce((a,r)=>a+Number(r.qty||1),0)}벌
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{background:"#222",color:"white",textAlign:"center",padding:"5px 0",fontSize:13,fontWeight:700,letterSpacing:4}}>선 수 명 단</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr>
              {["순번","성명","등이름","등번호","사이즈","수량"].map(h=><td key={h} style={{border:"1px solid #999",padding:"4px",background:"#404040",color:"white",textAlign:"center",fontWeight:600}}>{h}</td>)}
              <td style={{width:8,background:"white",border:"none"}}></td>
              {["순번","성명","번호","사이즈","비고"].map(h=><td key={h} style={{border:"1px solid #999",padding:"4px",background:"#808080",color:"white",textAlign:"center",fontWeight:600}}>{h}</td>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row,i)=><tr key={i}>
              <td style={{border:"1px solid #ddd",padding:"3px 4px",textAlign:"center",color:"#555",fontSize:10}}>{i+1}</td>
              <td style={{border:"1px solid #ddd",padding:"3px 5px"}}>{row.top?.name||""}</td>
              <td style={{border:"1px solid #ddd",padding:"3px 5px",fontWeight:row.top?.backName?600:400}}>{row.top?.backName||""}</td>
              <td style={{border:"1px solid #ddd",padding:"3px 5px",textAlign:"center"}}>{row.top?.backNum||""}</td>
              <td style={{border:"1px solid #ddd",padding:"3px 5px",textAlign:"center"}}>{row.top?.size||""}</td>
              <td style={{border:"1px solid #ddd",padding:"3px 5px",textAlign:"center"}}>{row.top?.qty!=null?row.top.qty:""}</td>
              <td style={{width:8,background:"white",border:"none"}}></td>
              <td style={{border:"1px solid #ddd",padding:"3px 4px",textAlign:"center",color:"#555",fontSize:10}}>{i+1}</td>
              <td style={{border:"1px solid #ddd",padding:"3px 5px"}}>{row.bot?.name||""}</td>
              <td style={{border:"1px solid #ddd",padding:"3px 5px",textAlign:"center"}}>{row.bot?.backNum||""}</td>
              <td style={{border:"1px solid #ddd",padding:"3px 5px",textAlign:"center"}}>{row.bot?.size||""}</td>
              <td style={{border:"1px solid #ddd",padding:"3px 5px"}}>{row.bot?.memo||""}</td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{border:"1px solid #999",padding:"4px",background:"#f0f0f0",textAlign:"right",fontSize:10}}>상의 합계</td>
              <td style={{border:"1px solid #999",padding:"4px",background:"#fef9c3",textAlign:"center",fontWeight:700}}>{top.reduce((a,r)=>a+Number(r.qty||1),0)}</td>
              <td style={{width:8,background:"white",border:"none"}}></td>
              <td colSpan={3} style={{border:"1px solid #999",padding:"4px",background:"#f0f0f0",textAlign:"right",fontSize:10}}>하의 합계</td>
              <td style={{border:"1px solid #999",padding:"4px",background:"#fef9c3",textAlign:"center",fontWeight:700}}>{bot.reduce((a,r)=>a+Number(r.qty||1),0)}</td>
              <td style={{border:"none"}}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </Modal>;
}

/* ═══════════════════════════════════════════════════════
   MODULE 5-8 — CRM / PAYMENTS / INVOICES / MESSAGES
═══════════════════════════════════════════════════════ */
function CRMPage({db}){
  const {customers,templates,sc,toast_}=db;
  const [addM,setAdd]=useState(false); const [editId,setEdit]=useState(null); const [msgId,setMsg]=useState(null); const [bulk,setBulk]=useState(false); const [selIds,setSel]=useState([]);
  const [search,setSearch]=useState(""); const [tf,setTF]=useState("전체"); const [rf,setRF]=useState("전체");
  const [dragOver,setDragOver]=useState(false); const [importMod,setImportMod]=useState(null);
  const fil=useMemo(()=>customers.filter(c=>{ const t=tf==="전체"||c.type===tf; const r=rf==="전체"||c.region===rf; const q=!search||(c.name||"").includes(search)||(c.contact||"").includes(search); return t&&r&&q; }),[customers,tf,rf,search]);
  const tog=id=>setSel(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const addC=async d=>{ await sc([{...d,id:gid(),createdAt:td()},...customers]); toast_("등록!"); };
  const updC=async(id,d)=>{ await sc(customers.map(c=>c.id===id?{...c,...d}:c)); toast_("수정!"); };
  const delC=async id=>{ await sc(customers.filter(c=>c.id!==id)); toast_("삭제"); };
  const editC=customers.find(c=>c.id===editId);
  const msgC=customers.find(c=>c.id===msgId);

  // 엑셀 내보내기
  const exportCRM = () => {
    exportCSV(`거래처목록_${td()}.csv`,
      ["거래처명","유형","연락처","이메일","지역","주소","사업자번호","메모"],
      customers.map(c=>[c.name,c.type||"-",c.contact||"-",c.email||"-",c.region||"-",c.address||"-",c.bizNum||"-",c.memo||"-"])
    );
    toast_("엑셀 파일 저장!");
  };

  // 템플릿 다운로드
  const downloadTemplate = () => {
    exportCSV("티밸런스_거래처_템플릿.csv",
      ["거래처명","유형","연락처","이메일","지역","주소","사업자번호","메모"],
      [
        ["서울탁구동호회","동호회","010-1234-5678","seoul@club.com","서울","서울시 강남구","","주 1회 정기모임"],
        ["강남중학교","학교/기관","02-1234-5678","","서울","서울시 강남구 대치동","","교복 주문"],
        ["김철수","개인","010-9876-5432","","경기","경기도 수원시","",""],
      ]
    );
    toast_("거래처 템플릿 다운로드!");
  };

  // CSV 파일 처리
  const parseCSV = (text) => {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(",").map(h=>h.replace(/^"|"$/g,"").trim());
    return lines.slice(1).filter(l=>l.trim()).map(line=>{
      const cols=[]; let cur="",inQ=false;
      for(const c of line){ if(c==='"'){inQ=!inQ;}else if(c===","&&!inQ){cols.push(cur.trim());cur="";}else{cur+=c;} }
      cols.push(cur.trim());
      const row={};
      headers.forEach((h,i)=>{ row[h]=(cols[i]||"").replace(/^"|"$/g,"").trim(); });
      return row;
    });
  };
  const handleCSVFile = (file) => {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseCSV(e.target.result);
        if(!rows.length){ toast_("데이터가 없습니다"); return; }
        setImportMod({ rows, filename: file.name });
      } catch(err) { toast_("CSV 파싱 오류: "+err.message); }
    };
    reader.readAsText(file, "UTF-8");
  };
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if(file && file.name.endsWith(".csv")) handleCSVFile(file);
    else toast_("CSV 파일만 지원합니다");
  };

  return <div>
    {/* 구글시트 연동 가이드 */}
    <div style={{background:"#0d1117",border:"1px solid #1e3a5f",borderRadius:12,padding:"12px 16px",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:16}}>📊</span>
        <span style={{fontWeight:600,fontSize:13,color:"#93c5fd"}}>구글시트 연동 가이드</span>
      </div>
      <div style={{fontSize:12,color:"#64748b",lineHeight:1.8,marginBottom:10}}>
        1. <b style={{color:"#f1f5f9"}}>템플릿 다운로드</b> → 구글 드라이브 업로드 → 거래처 입력<br/>
        2. <b style={{color:"#f1f5f9"}}>파일 → 다운로드 → CSV</b> 저장<br/>
        3. 아래 <b style={{color:"#f1f5f9"}}>드래그&드롭 영역</b>에 파일을 올리면 자동 등록!
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <SBtn onClick={downloadTemplate} color="#1d4ed8">📥 거래처 템플릿</SBtn>
        <SBtn onClick={exportCRM} color="#0f766e">📊 현재 목록 엑셀 내보내기</SBtn>
      </div>
    </div>

    {/* CSV 드래그&드롭 */}
    <div
      onDrop={handleDrop}
      onDragOver={e=>{e.preventDefault();setDragOver(true);}}
      onDragLeave={()=>setDragOver(false)}
      style={{border:`2px dashed ${dragOver?"#3b82f6":"#334155"}`,borderRadius:12,padding:"16px",textAlign:"center",marginBottom:14,cursor:"pointer",transition:"all 0.2s",background:dragOver?"rgba(59,130,246,0.08)":"transparent"}}
      onClick={()=>{ const inp=document.createElement("input"); inp.type="file"; inp.accept=".csv"; inp.onchange=e=>handleCSVFile(e.target.files[0]); inp.click(); }}
    >
      <div style={{fontSize:24,marginBottom:4}}>{dragOver?"⬇️":"📂"}</div>
      <div style={{fontSize:13,fontWeight:600,color:dragOver?"#93c5fd":"#64748b"}}>
        {dragOver?"파일을 놓으세요!":"CSV 파일을 드래그하거나 클릭해서 선택"}
      </div>
      <div style={{fontSize:11,color:"#475569",marginTop:3}}>구글시트에서 내보낸 .csv 파일 지원</div>
    </div>

    <div style={GS.toolbar}>
      <input style={{...GS.sInp,width:180}} placeholder="이름·연락처 검색..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <select style={GS.sSel} value={tf} onChange={e=>setTF(e.target.value)}><option value="전체">전체 유형</option>{CUST_TYPES.map(t=><option key={t}>{t}</option>)}</select>
      <select style={GS.sSel} value={rf} onChange={e=>setRF(e.target.value)}><option value="전체">전체 지역</option>{REGIONS.map(r=><option key={r}>{r}</option>)}</select>
      <div style={{marginLeft:"auto",display:"flex",gap:6}}>
        {selIds.length>0&&<SBtn onClick={()=>setBulk(true)} color="#6366f1">📨 단체문자({selIds.length}명)</SBtn>}
        <SBtn onClick={()=>setSel(selIds.length===fil.length?[]:fil.map(c=>c.id))} color="#374151">{selIds.length===fil.length?"전체해제":"전체선택"}</SBtn>
        <SBtn onClick={()=>setAdd(true)} color="#3b82f6">+ 거래처 등록</SBtn>
      </div>
    </div>
    {fil.length===0?<EmptyState icon="👥" msg="등록된 거래처 없음"/>:
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>
        {fil.map(c=><div key={c.id} style={{background:"#111827",border:`1px solid ${selIds.includes(c.id)?"#3b82f6":"#1e293b"}`,borderRadius:10,padding:12}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <input type="checkbox" checked={selIds.includes(c.id)} onChange={()=>tog(c.id)} style={{cursor:"pointer",accentColor:"#3b82f6"}}/>
            <TypeBadge type={c.type}/>
            {c.region&&<span style={{background:"#1e293b",borderRadius:4,padding:"1px 6px",fontSize:10,color:"#64748b"}}>{c.region}</span>}
          </div>
          <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>{c.name||"-"}</div>
          {c.contact&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:2}}>📞 {c.contact}</div>}
          {c.email&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:2}}>✉️ {c.email}</div>}
          {c.address&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:2}}>📍 {c.address}</div>}
          {c.bizNum&&<div style={{fontSize:11,color:"#64748b",marginBottom:2}}>🏢 {c.bizNum}</div>}
          {c.memo&&<div style={{fontSize:11,color:"#64748b",borderTop:"1px solid #1e293b",paddingTop:5,marginTop:5}}>📝 {c.memo}</div>}
          <div style={{display:"flex",gap:5,marginTop:8}}>
            <SBtn onClick={()=>setEdit(c.id)} color="#1e3a5f">수정</SBtn>
            <SBtn onClick={()=>setMsg(c.id)} color="#4c1d95">💬 문자</SBtn>
            <SBtn onClick={()=>delC(c.id)} color="#7f1d1d">삭제</SBtn>
          </div>
        </div>)}
      </div>
    }
    {addM&&<CustModal onClose={()=>setAdd(false)} onSave={d=>{addC(d);setAdd(false);}}/>}
    {editC&&<CustModal initial={editC} onClose={()=>setEdit(null)} onSave={d=>{updC(editId,d);setEdit(null);}}/>}
    {msgC&&<SendMsgModal targets={[msgC]} templates={templates} onClose={()=>setMsg(null)}/>}
    {bulk&&<SendMsgModal targets={customers.filter(c=>selIds.includes(c.id))} templates={templates} onClose={()=>setBulk(false)} isBulk/>}
    {importMod&&<CRMImportModal modal={importMod} customers={customers}
      onClose={()=>setImportMod(null)}
      onSave={async(arr)=>{ await sc([...arr,...customers]); toast_(`거래처 ${arr.length}개 가져오기 완료!`); setImportMod(null); }}
    />}
  </div>;
}
function CustModal({initial,onClose,onSave}){
  const [f,setF]=useState({name:"",type:"동호회",contact:"",email:"",region:"",address:"",bizNum:"",memo:"",...(initial||{})});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return <Modal title={initial?"거래처 수정":"거래처 등록"} onClose={onClose}>
    <div style={GS.fGrid}>
      <MFR label="거래처명 *"><input style={GS.inp} value={f.name} onChange={e=>s("name",e.target.value)} placeholder="동호회명"/></MFR>
      <MFR label="유형"><div style={GS.chips}>{CUST_TYPES.map(t=><Chip key={t} active={f.type===t} onClick={()=>s("type",t)}>{t}</Chip>)}</div></MFR>
      <MFR label="연락처"><input style={GS.inp} value={f.contact} onChange={e=>s("contact",e.target.value)} placeholder="010-0000-0000"/></MFR>
      <MFR label="이메일"><input style={GS.inp} value={f.email} onChange={e=>s("email",e.target.value)}/></MFR>
      <MFR label="지역"><select style={GS.inp} value={f.region} onChange={e=>s("region",e.target.value)}><option value="">선택</option>{REGIONS.map(r=><option key={r}>{r}</option>)}</select></MFR>
      <MFR label="사업자번호"><input style={GS.inp} value={f.bizNum} onChange={e=>s("bizNum",e.target.value)} placeholder="000-00-00000"/></MFR>
    </div>
    <MFR label="주소"><input style={GS.inp} value={f.address} onChange={e=>s("address",e.target.value)}/></MFR>
    <MFR label="메모"><textarea style={{...GS.inp,height:50,resize:"vertical"}} value={f.memo} onChange={e=>s("memo",e.target.value)}/></MFR>
    <div style={GS.mBtns}><SBtn onClick={()=>{if(!f.name.trim())return;onSave(f);}} color="#3b82f6" full>{initial?"수정":"등록"}</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}

function CRMImportModal({ modal, customers, onClose, onSave }) {
  const { rows, filename } = modal;

  const parsed = useMemo(() => rows.map(row => ({
    id: gid(), createdAt: td(),
    name:    row["거래처명"] || row["이름"] || row["name"] || "",
    type:    CUST_TYPES.includes(row["유형"]) ? row["유형"] : "동호회",
    contact: row["연락처"] || row["전화"] || row["phone"] || "",
    email:   row["이메일"] || row["email"] || "",
    region:  REGIONS.includes(row["지역"]) ? row["지역"] : "",
    address: row["주소"] || row["address"] || "",
    bizNum:  row["사업자번호"] || row["사업자"] || "",
    memo:    row["메모"] || row["memo"] || "",
  })).filter(c => c.name), [rows]);

  const dups = parsed.filter(p => customers.some(c => c.name === p.name));

  return (
    <Modal title="📊 거래처 CSV 가져오기" onClose={onClose} wide>
      <div style={{background:"#1e293b",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#94a3b8"}}>
        📄 {filename} · {rows.length}행 감지 · {parsed.length}개 거래처 파싱됨
      </div>

      {dups.length > 0 && (
        <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid #f59e0b",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#fcd34d"}}>
          ⚠️ 이미 등록된 거래처 {dups.length}개: {dups.map(d=>d.name).join(", ")} — 중복 추가됩니다
        </div>
      )}

      <MFR label={`미리보기 (${parsed.length}개)`}>
        <div style={{maxHeight:300,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
          {parsed.length === 0 && (
            <div style={{color:"#ef4444",fontSize:12,padding:8}}>⚠️ 파싱된 데이터가 없습니다. 템플릿 형식을 확인해주세요.</div>
          )}
          {parsed.map((c,i) => (
            <div key={i} style={{background:"#1e293b",borderRadius:8,padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{fontWeight:600,fontSize:13}}>{c.name}</span>
                  <TypeBadge type={c.type}/>
                  {c.region && <span style={{background:"#0b0f1a",borderRadius:4,padding:"1px 6px",fontSize:10,color:"#64748b"}}>{c.region}</span>}
                </div>
                <div style={{fontSize:11,color:"#64748b",display:"flex",gap:10,flexWrap:"wrap"}}>
                  {c.contact && <span>📞 {c.contact}</span>}
                  {c.email   && <span>✉️ {c.email}</span>}
                  {c.address && <span>📍 {c.address}</span>}
                </div>
              </div>
              {dups.some(d=>d.name===c.name) && (
                <span style={{background:"rgba(245,158,11,0.2)",border:"1px solid #f59e0b",color:"#fcd34d",borderRadius:5,padding:"1px 7px",fontSize:10,flexShrink:0}}>중복</span>
              )}
            </div>
          ))}
        </div>
      </MFR>

      <div style={GS.mBtns}>
        <SBtn onClick={()=>onSave(parsed)} color="#3b82f6" full disabled={parsed.length===0}>
          ✅ {parsed.length}개 거래처 가져오기
        </SBtn>
        <SBtn onClick={onClose} color="#374151" full>취소</SBtn>
      </div>
    </Modal>
  );
}

function PaymentsPage({db}){
  const {payments,customers,templates,sp,toast_}=db;
  const [addM,setAdd]=useState(false); const [filter,setFilter]=useState("전체"); const [search,setSearch]=useState("");
  const [msgTarget,setMsgTarget]=useState(null);
  const isMob = window.innerWidth < 768;
  const fil=useMemo(()=>payments.filter(p=>{ const f=filter==="전체"||(filter==="미수금"?!p.paid:p.paid); const q=!search||(p.customerName||"").includes(search)||(p.detail||"").includes(search); return f&&q; }),[payments,filter,search]);
  const unAmt=payments.filter(p=>!p.paid).reduce((a,p)=>a+Number(p.amount||0),0);
  const pAmt=payments.filter(p=>p.paid).reduce((a,p)=>a+Number(p.amount||0),0);
  const tog=async id=>{ await sp(payments.map(p=>p.id===id?{...p,paid:!p.paid,paidAt:!p.paid?td():null}:p)); };
  const del=async id=>{ await sp(payments.filter(p=>p.id!==id)); toast_("삭제"); };
  const add=async d=>{ await sp([{...d,id:gid(),createdAt:td()},...payments]); toast_("등록!"); };
  const exportPayments = () => {
    exportCSV(`입금내역_${td()}.csv`,
      ["날짜","거래처","내역","금액","결제수단","입금여부","입금일"],
      payments.map(p=>[p.date,p.customerName||"-",p.detail||"-",p.amount||0,p.payMethod||"-",p.paid?"완료":"미수금",p.paidAt||"-"])
    );
    toast_("엑셀 파일 저장!");
  };
  // 미수금 문자용 템플릿 자동 선택
  const unpaidTpl = templates?.find(t=>t.category==="결제") || templates?.[0];
  const gc={gridTemplateColumns:"95px 120px 1fr 100px 80px 75px 100px 100px"};
  return <div>
    {payments.filter(p=>!p.paid).length>0&&<div style={{display:"flex",gap:10,alignItems:"center",background:"rgba(239,68,68,0.1)",border:"1px solid #ef4444",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
      <span style={{fontSize:20}}>⚠️</span><div><div style={{fontWeight:600,color:"#fca5a5"}}>미수금 알림</div><div style={{fontSize:12,color:"#f87171"}}>{payments.filter(p=>!p.paid).length}건 · 총 {won(unAmt)}</div></div>
    </div>}
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <SumPill label="미수금" val={won(unAmt)} color="#ef4444"/>
      <SumPill label="입금완료" val={won(pAmt)} color="#10b981"/>
      <SumPill label="전체" val={payments.length+"건"} color="#3b82f6"/>
    </div>
    <div style={GS.toolbar}>
      <div style={GS.chips}>{["전체","미수금","입금완료"].map(f=><div key={f} style={{...SI.chip,...(filter===f?{...SI.chipA,...(f==="미수금"?{background:"#7f1d1d",borderColor:"#ef4444",color:"#fca5a5"}:{})}:{})}} onClick={()=>setFilter(f)}>{f}</div>)}</div>
      <input style={{...GS.sInp,flex:1,maxWidth:isMob?undefined:200}} placeholder="거래처·내역 검색..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <SBtn onClick={exportPayments} color="#0f766e">📊 엑셀</SBtn>
      <SBtn onClick={()=>setAdd(true)} color="#3b82f6">+ 등록</SBtn>
    </div>
    {fil.length===0?<EmptyState icon="💳" msg="내역 없음"/>:
      isMob
      ? <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {fil.map(p=><div key={p.id} style={{background:"#111827",borderRadius:12,border:`1px solid ${p.paid?"#1e293b":"#ef4444"}`,padding:14,...(!p.paid?{background:"rgba(239,68,68,0.04)"}:{})}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{p.customerName||"-"}</div>
                <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{p.detail||"-"}</div>
              </div>
              <div style={{fontWeight:800,fontSize:17,color:p.paid?"#10b981":"#ef4444"}}>{won(p.amount)}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#64748b"}}>{p.date}</span>
              <PayTag method={p.payMethod}/>
              {p.paid&&<span style={{fontSize:11,color:"#64748b"}}>입금 {p.paidAt}</span>}
              <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                {!p.paid && <SBtn onClick={()=>setMsgTarget(p)} color="#4c1d95">💬 문자</SBtn>}
                <PaidBtn paid={p.paid} onClick={()=>tog(p.id)}/>
                <SBtn onClick={()=>del(p.id)} color="#7f1d1d">🗑</SBtn>
              </div>
            </div>
          </div>)}
        </div>
      : <div style={GS.tbl}>
          <div style={{...GS.tRow,...gc,background:"#0b0f1a",borderTop:"none",fontSize:10,fontWeight:600,color:"#64748b"}}><span>날짜</span><span>거래처</span><span>내역</span><span style={{textAlign:"right"}}>금액</span><span style={{textAlign:"center"}}>결제</span><span style={{textAlign:"center"}}>입금</span><span style={{textAlign:"center"}}>입금일</span><span style={{textAlign:"center"}}>관리</span></div>
          {fil.map(p=><div key={p.id} style={{...GS.tRow,...gc,...(!p.paid?{background:"rgba(239,68,68,0.04)"}:{})}}>
            <span style={{fontSize:11,color:"#94a3b8"}}>{p.date}</span>
            <span style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.customerName||"-"}</span>
            <span style={{fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.detail||"-"}</span>
            <span style={{textAlign:"right",fontWeight:700,color:p.paid?"#10b981":"#ef4444"}}>{won(p.amount)}</span>
            <span style={{textAlign:"center"}}><PayTag method={p.payMethod}/></span>
            <span style={{textAlign:"center"}}><PaidBtn paid={p.paid} onClick={()=>tog(p.id)}/></span>
            <span style={{textAlign:"center",fontSize:11,color:"#64748b"}}>{p.paidAt||"-"}</span>
            <div style={{textAlign:"center",display:"flex",gap:3,justifyContent:"center"}}>
              {!p.paid && <MBtn onClick={()=>setMsgTarget(p)}>💬문자</MBtn>}
              <MBtn red onClick={()=>del(p.id)}>삭제</MBtn>
            </div>
          </div>)}
        </div>
    }
    {addM&&<PayModal customers={customers} onClose={()=>setAdd(false)} onSave={d=>{add(d);setAdd(false);}}/>}
    {msgTarget&&<UnpaidMsgModal payment={msgTarget} templates={templates} onClose={()=>setMsgTarget(null)}/>}
  </div>;
}
function PayModal({customers,onClose,onSave}){
  const [f,setF]=useState({date:td(),customerName:"",detail:"",amount:"",payMethod:"계좌이체",paid:false,memo:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return <Modal title="입금 내역 등록" onClose={onClose}>
    <div style={GS.fGrid}>
      <MFR label="날짜"><input type="date" style={GS.inp} value={f.date} onChange={e=>s("date",e.target.value)}/></MFR>
      <MFR label="거래처명"><input style={GS.inp} value={f.customerName} onChange={e=>s("customerName",e.target.value)} placeholder="직접입력" list="pl"/><datalist id="pl">{customers.map(c=><option key={c.id} value={c.name}/>)}</datalist></MFR>
      <MFR label="금액"><input type="number" style={GS.inp} value={f.amount} onChange={e=>s("amount",e.target.value)}/></MFR>
      <MFR label="결제수단"><select style={GS.inp} value={f.payMethod} onChange={e=>s("payMethod",e.target.value)}>{PAY_METHODS.map(m=><option key={m}>{m}</option>)}</select></MFR>
    </div>
    <MFR label="내역"><input style={GS.inp} value={f.detail} onChange={e=>s("detail",e.target.value)} placeholder="예) 단체복 38벌 등판 제작비"/></MFR>
    <MFR label="입금여부"><div style={GS.chips}><Chip active={f.paid} onClick={()=>s("paid",true)} green>✓ 입금완료</Chip><Chip active={!f.paid} onClick={()=>s("paid",false)} red>미수금</Chip></div></MFR>
    <div style={GS.mBtns}><SBtn onClick={()=>onSave(f)} color="#3b82f6" full>등록</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}

function UnpaidMsgModal({ payment, templates, onClose }) {
  const defMsg = `안녕하세요, ${payment.customerName||"고객"}님!\n주문 금액 ${won(payment.amount)}의 입금이 아직 확인되지 않았습니다.\n${payment.detail ? `내역: ${payment.detail}\n` : ""}확인 후 입금 부탁드립니다.\n감사합니다. 🏓 티밸런스`;
  const [body, setBody] = useState(defMsg);
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const send = () => {
    window.open(`sms:${phone}?body=${encodeURIComponent(body)}`, "_blank");
    setSent(true);
  };
  return <Modal title="💬 미수금 문자 발송" onClose={onClose}>
    <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid #ef4444",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
      <div style={{fontSize:12,color:"#fca5a5",fontWeight:600}}>{payment.customerName} · {won(payment.amount)}</div>
      <div style={{fontSize:11,color:"#f87171",marginTop:2}}>{payment.detail||"-"} · {payment.date}</div>
    </div>
    <MFR label="수신 번호"><input style={GS.inp} placeholder="010-0000-0000" value={phone} onChange={e=>setPhone(e.target.value)}/></MFR>
    <MFR label="메시지 (수정 가능)">
      <textarea style={{...GS.inp,height:160,resize:"vertical",lineHeight:1.7}} value={body} onChange={e=>setBody(e.target.value)}/>
      <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{body.length}자</div>
    </MFR>
    {sent&&<div style={{background:"rgba(16,185,129,0.1)",border:"1px solid #10b981",borderRadius:6,padding:"7px 10px",color:"#6ee7b7",fontSize:12,marginBottom:6}}>✓ SMS 앱으로 연결됩니다. 앱에서 최종 발송해주세요.</div>}
    <div style={GS.mBtns}><SBtn onClick={send} color="#4c1d95" full>📱 문자 보내기</SBtn><SBtn onClick={onClose} color="#374151" full>닫기</SBtn></div>
  </Modal>;
}

function InvoicesPage({db}){
  const {invoices,customers,si,toast_}=db;
  const [addM,setAdd]=useState(false); const [prvId,setPrv]=useState(null); const [search,setSearch]=useState(""); const [yr,setYr]=useState(new Date().getFullYear());
  const fil=useMemo(()=>invoices.filter(i=>(!yr||i.issuedAt?.startsWith(String(yr)))&&(!search||(i.customerName||"").includes(search))),[invoices,yr,search]);
  const totAmt=fil.reduce((a,i)=>a+Number(i.totalAmount||0),0);
  const add=async d=>{ await si([{...d,id:gid(),issuedAt:td()},...invoices]); toast_("세금계산서 발행!"); };
  const del=async id=>{ await si(invoices.filter(i=>i.id!==id)); toast_("삭제"); };
  const prv=invoices.find(i=>i.id===prvId);
  const gc={gridTemplateColumns:"100px 80px 140px 1fr 110px 90px 90px 110px"};
  return <div>
    <div style={GS.toolbar}>
      <select style={GS.sSel} value={yr} onChange={e=>setYr(Number(e.target.value))}>{[2024,2025,2026].map(y=><option key={y}>{y}년</option>)}</select>
      <input style={{...GS.sInp,flex:1,maxWidth:200}} placeholder="거래처명 검색..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <SumPill label="합계금액" val={won(totAmt)} color="#f59e0b"/>
      <SBtn onClick={()=>setAdd(true)} color="#f59e0b" style={{marginLeft:"auto"}}>+ 세금계산서 발행</SBtn>
    </div>
    {fil.length===0?<EmptyState icon="🧾" msg="발행된 세금계산서 없음"/>:
      <div style={GS.tbl}>
        <div style={{...GS.tRow,...gc,background:"#0b0f1a",borderTop:"none",fontSize:10,fontWeight:600,color:"#64748b"}}><span>발행일</span><span>번호</span><span>거래처</span><span>품목</span><span style={{textAlign:"right"}}>공급가액</span><span style={{textAlign:"right"}}>세액</span><span style={{textAlign:"right"}}>합계</span><span style={{textAlign:"center"}}>관리</span></div>
        {fil.map(inv=><div key={inv.id} style={{...GS.tRow,...gc}}>
          <span style={{fontSize:11,color:"#94a3b8"}}>{inv.issuedAt}</span>
          <span style={{fontSize:11,color:"#6366f1",fontWeight:600}}>{inv.invoiceNum||"-"}</span>
          <span style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.customerName||"-"}</span>
          <span style={{fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(inv.items||[]).map(i=>i.name).join(", ")||"-"}</span>
          <span style={{textAlign:"right",fontWeight:600,color:"#f59e0b"}}>{won(inv.supplyAmount)}</span>
          <span style={{textAlign:"right",color:"#64748b"}}>{won(inv.tax)}</span>
          <span style={{textAlign:"right",fontWeight:700}}>{won(inv.totalAmount)}</span>
          <div style={{display:"flex",gap:3,justifyContent:"center"}}><MBtn onClick={()=>setPrv(inv.id)}>미리보기</MBtn><MBtn red onClick={()=>del(inv.id)}>삭제</MBtn></div>
        </div>)}
      </div>
    }
    {addM&&<InvModal customers={customers} invoices={invoices} onClose={()=>setAdd(false)} onSave={d=>{add(d);setAdd(false);}}/>}
    {prv&&<InvPrintModal invoice={prv} onClose={()=>setPrv(null)}/>}
  </div>;
}
function InvModal({customers,invoices,onClose,onSave}){
  const nn=`INV-${new Date().getFullYear()}-${String(invoices.length+1).padStart(4,"0")}`;
  const [f,setF]=useState({invoiceNum:nn,customerName:"",bizNum:"",address:"",items:[{id:gid(),name:"유니폼 단체복",qty:1,unitPrice:"",amount:""}],memo:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const addItem=()=>setF(p=>({...p,items:[...p.items,{id:gid(),name:"",qty:1,unitPrice:"",amount:""}]}));
  const updItem=(id,k,v)=>setF(p=>({...p,items:p.items.map(it=>{ if(it.id!==id)return it; const u={...it,[k]:v}; if(k==="qty"||k==="unitPrice")u.amount=Number(u.qty||0)*Number(u.unitPrice||0); return u; })}));
  const delItem=id=>setF(p=>({...p,items:p.items.filter(it=>it.id!==id)}));
  const supAmt=f.items.reduce((a,it)=>a+Number(it.amount||0),0);
  const tax=Math.round(supAmt*0.1); const totAmt=supAmt+tax;
  const fillC=name=>{ const c=customers.find(c=>c.name===name); if(c)setF(p=>({...p,customerName:c.name,bizNum:c.bizNum||"",address:c.address||""})); else s("customerName",name); };
  return <Modal title="세금계산서 발행" onClose={onClose} wide>
    <div style={GS.fGrid}>
      <MFR label="계산서번호"><input style={GS.inp} value={f.invoiceNum} onChange={e=>s("invoiceNum",e.target.value)}/></MFR>
      <MFR label="거래처명 *"><input style={GS.inp} value={f.customerName} onChange={e=>fillC(e.target.value)} list="ic"/><datalist id="ic">{customers.map(c=><option key={c.id} value={c.name}/>)}</datalist></MFR>
      <MFR label="사업자번호"><input style={GS.inp} value={f.bizNum} onChange={e=>s("bizNum",e.target.value)} placeholder="000-00-00000"/></MFR>
      <MFR label="주소"><input style={GS.inp} value={f.address} onChange={e=>s("address",e.target.value)}/></MFR>
    </div>
    <MFR label="품목">
      <div style={{border:"1px solid #334155",borderRadius:7,overflow:"hidden",marginBottom:6}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 55px 95px 95px 26px",gap:4,padding:"5px 8px",background:"#0b0f1a",fontSize:10,fontWeight:600,color:"#64748b"}}><span>품목명</span><span>수량</span><span>단가</span><span>금액</span><span></span></div>
        {f.items.map(it=><div key={it.id} style={{display:"grid",gridTemplateColumns:"1fr 55px 95px 95px 26px",gap:4,padding:"4px 8px",borderTop:"1px solid #1e293b",alignItems:"center"}}>
          <input style={{...GS.inp,padding:"4px 7px",fontSize:12}} value={it.name} onChange={e=>updItem(it.id,"name",e.target.value)} list="pitems" placeholder="품목명"/>
          <datalist id="pitems">{["유니폼 단체복","용품 라켓","용품 러버","배송비","기타"].map(t=><option key={t} value={t}/>)}</datalist>
          <input type="number" style={{...GS.inp,padding:"4px 6px",fontSize:12,textAlign:"center"}} value={it.qty} onChange={e=>updItem(it.id,"qty",e.target.value)}/>
          <input type="number" style={{...GS.inp,padding:"4px 6px",fontSize:12,textAlign:"right"}} value={it.unitPrice} onChange={e=>updItem(it.id,"unitPrice",e.target.value)}/>
          <span style={{textAlign:"right",fontSize:12,fontWeight:600,color:"#f59e0b"}}>{fmt(it.amount)}</span>
          <button onClick={()=>delItem(it.id)} style={{width:22,height:22,background:"#7f1d1d",border:"none",borderRadius:3,color:"white",cursor:"pointer",fontSize:10}}>✕</button>
        </div>)}
      </div>
      <SBtn onClick={addItem} color="#374151">+ 품목 추가</SBtn>
    </MFR>
    <div style={{background:"#0b0f1a",borderRadius:7,padding:"10px 12px",marginBottom:10}}>
      {[["공급가액",won(supAmt)],["세액(10%)",won(tax)]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12}}><span style={{color:"#94a3b8"}}>{l}</span><span>{v}</span></div>)}
      <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid #334155",paddingTop:6,marginTop:2}}><span style={{fontWeight:700}}>합계금액</span><span style={{fontWeight:700,color:"#f59e0b",fontSize:14}}>{won(totAmt)}</span></div>
    </div>
    <div style={GS.mBtns}><SBtn onClick={()=>{if(!f.customerName.trim())return;onSave({...f,supplyAmount:supAmt,tax,totalAmount:totAmt});}} color="#f59e0b" full>발행</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}
function InvPrintModal({invoice,onClose}){
  const ref=useRef();
  const hp=()=>{ const s=document.createElement("style"); s.textContent=`@media print{body>*:not(#invp){display:none!important}#invp{display:block!important;position:fixed;top:0;left:0;width:100%;z-index:9999;background:white}@page{margin:15mm;}}`; document.head.appendChild(s); ref.current.id="invp"; window.print(); document.head.removeChild(s); };
  const i=invoice;
  return <Modal title="🧾 세금계산서 미리보기" onClose={onClose} wide>
    <div style={{textAlign:"right",marginBottom:8}}><SBtn onClick={hp} color="#f59e0b">🖨 인쇄/PDF</SBtn></div>
    <div ref={ref} style={{background:"white",color:"black",padding:20,fontFamily:"'Malgun Gothic',sans-serif",border:"2px solid #000"}}>
      <div style={{textAlign:"center",fontSize:20,fontWeight:700,letterSpacing:4,marginBottom:14,borderBottom:"2px solid black",paddingBottom:7}}>세 금 계 산 서</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:10,fontSize:12}}>
        <div><div style={{fontWeight:600,marginBottom:4}}>공급받는자</div><div>상호: {i.customerName}</div><div>사업자번호: {i.bizNum||"-"}</div><div>주소: {i.address||"-"}</div></div>
        <div><div>계산서번호: {i.invoiceNum}</div><div>발행일: {i.issuedAt}</div></div>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:10}}>
        <thead><tr style={{background:"#f0f0f0"}}>{["품목","수량","단가","공급가액"].map(h=><td key={h} style={{border:"1px solid #999",padding:"4px 7px",fontWeight:600,textAlign:"center"}}>{h}</td>)}</tr></thead>
        <tbody>{(i.items||[]).map((it,idx)=><tr key={idx}><td style={{border:"1px solid #ddd",padding:"4px 7px"}}>{it.name}</td><td style={{border:"1px solid #ddd",padding:"4px 7px",textAlign:"center"}}>{it.qty}</td><td style={{border:"1px solid #ddd",padding:"4px 7px",textAlign:"right"}}>{fmt(it.unitPrice)}</td><td style={{border:"1px solid #ddd",padding:"4px 7px",textAlign:"right",fontWeight:600}}>{fmt(it.amount)}</td></tr>)}</tbody>
      </table>
      <div style={{textAlign:"right",fontSize:12}}><div>공급가액: {won(i.supplyAmount)}</div><div>세액(10%): {won(i.tax)}</div><div style={{fontWeight:700,fontSize:15,marginTop:4}}>합계금액: {won(i.totalAmount)}</div></div>
      {i.memo&&<div style={{marginTop:10,fontSize:11,color:"#666"}}>비고: {i.memo}</div>}
    </div>
  </Modal>;
}

function MessagesPage({db}){
  const {templates,customers,st,toast_}=db;
  const [addM,setAdd]=useState(false); const [editId,setEdit]=useState(null); const [sendId,setSend]=useState(null); const [cf,setCF]=useState("전체");
  const cats=["전체",...new Set(templates.map(t=>t.category||"기타"))];
  const fil=cf==="전체"?templates:templates.filter(t=>t.category===cf);
  const editT=templates.find(t=>t.id===editId);
  const sendT=templates.find(t=>t.id===sendId);
  const addT=async d=>{ await st([{...d,id:gid()},...templates]); toast_("템플릿 저장!"); };
  const updT=async(id,d)=>{ await st(templates.map(t=>t.id===id?{...t,...d}:t)); toast_("수정!"); };
  const delT=async id=>{ await st(templates.filter(t=>t.id!==id)); toast_("삭제"); };
  const catColors={배송:"#1e3a5f",재고:"#78350f",결제:"#064e3b",제작:"#3b0764",공지:"#1e293b",기타:"#374151"};
  return <div>
    <div style={GS.toolbar}>
      <div style={GS.chips}>{cats.map(c=><div key={c} style={{...SI.chip,...(cf===c?SI.chipA:{})}} onClick={()=>setCF(c)}>{c}</div>)}</div>
      <SBtn onClick={()=>setAdd(true)} color="#6366f1" style={{marginLeft:"auto"}}>+ 템플릿 추가</SBtn>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:12}}>
      {fil.map(t=><div key={t.id} style={{background:"#111827",border:"1px solid #1e293b",borderRadius:12,padding:14}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
          <span style={{background:catColors[t.category||"기타"]||"#374151",color:"white",padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:600}}>{t.category||"기타"}</span>
          <span style={{fontWeight:600,fontSize:13}}>{t.title}</span>
        </div>
        <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,whiteSpace:"pre-line",background:"#0b0f1a",borderRadius:6,padding:"7px 9px",maxHeight:80,overflow:"hidden",marginBottom:8}}>{t.body}</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
          {(t.body.match(/\{[^}]+\}/g)||[]).map(v=><span key={v} style={{background:"#1e3a5f",border:"1px solid #3b82f6",color:"#93c5fd",padding:"1px 6px",borderRadius:3,fontSize:10}}>{v}</span>)}
        </div>
        <div style={{display:"flex",gap:5}}>
          <SBtn onClick={()=>setSend(t.id)} color="#4c1d95">📱 발송</SBtn>
          <SBtn onClick={()=>setEdit(t.id)} color="#1e3a5f">수정</SBtn>
          <SBtn onClick={()=>delT(t.id)} color="#7f1d1d">삭제</SBtn>
        </div>
      </div>)}
    </div>
    {addM&&<TplModal onClose={()=>setAdd(false)} onSave={d=>{addT(d);setAdd(false);}}/>}
    {editT&&<TplModal initial={editT} onClose={()=>setEdit(null)} onSave={d=>{updT(editId,d);setEdit(null);}}/>}
    {sendT&&<SendMsgModal targets={customers} templates={templates} initTpl={sendT} onClose={()=>setSend(null)}/>}
  </div>;
}
function TplModal({initial,onClose,onSave}){
  const cats=["배송","재고","결제","제작","공지","기타"];
  const [f,setF]=useState({title:"",category:"공지",body:"",...(initial||{})});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const vars=(f.body.match(/\{[^}]+\}/g)||[]);
  return <Modal title={initial?"템플릿 수정":"템플릿 추가"} onClose={onClose}>
    <MFR label="카테고리"><div style={GS.chips}>{cats.map(c=><Chip key={c} active={f.category===c} onClick={()=>s("category",c)}>{c}</Chip>)}</div></MFR>
    <MFR label="제목 *"><input style={GS.inp} value={f.title} onChange={e=>s("title",e.target.value)} placeholder="예) 배송 지연 안내"/></MFR>
    <MFR label="메시지 내용">
      <textarea style={{...GS.inp,height:130,resize:"vertical",lineHeight:1.7}} value={f.body} onChange={e=>s("body",e.target.value)} placeholder="{거래처}, {날짜}, {금액} 등 변수 사용 가능"/>
      <div style={{fontSize:10,color:"#64748b",marginTop:3}}>💡 <span style={{color:"#93c5fd"}}>{"{거래처} {날짜} {금액} {송장번호} {내용}"}</span> — 발송 시 치환됩니다</div>
    </MFR>
    {vars.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{vars.map(v=><span key={v} style={{background:"#1e3a5f",border:"1px solid #3b82f6",color:"#93c5fd",padding:"2px 7px",borderRadius:3,fontSize:10}}>{v}</span>)}</div>}
    <div style={GS.mBtns}><SBtn onClick={()=>{if(!f.title.trim())return;onSave(f);}} color="#6366f1" full>{initial?"수정":"저장"}</SBtn><SBtn onClick={onClose} color="#374151" full>취소</SBtn></div>
  </Modal>;
}
function SendMsgModal({targets,templates,initTpl,onClose,isBulk=false}){
  const [selTpl,setSelTpl]=useState(initTpl?.id||templates[0]?.id||"");
  const [vars,setVars]=useState({});
  const [body,setBody]=useState("");
  const [phone,setPhone]=useState(!isBulk&&targets[0]?.contact||"");
  const [sent,setSent]=useState(false);
  useEffect(()=>{
    const tpl=templates.find(t=>t.id===selTpl); if(!tpl)return;
    let b=tpl.body; Object.entries(vars).forEach(([k,v])=>{ b=b.replace(new RegExp(`\\{${k}\\}`,"g"),v); }); setBody(b);
  },[selTpl,vars,templates]);
  const tplVars=(templates.find(t=>t.id===selTpl)?.body.match(/\{([^}]+)\}/g)||[]).map(v=>v.slice(1,-1));
  const send=()=>{ const nums=isBulk?targets.map(t=>t.contact).filter(Boolean).join(","):phone; window.open(`sms:${nums}?body=${encodeURIComponent(body)}`,"_blank"); setSent(true); };
  return <Modal title={isBulk?`📨 단체문자(${targets.length}명)`:"💬 문자 발송"} onClose={onClose}>
    {isBulk&&<div style={{background:"#1e293b",borderRadius:7,padding:"7px 10px",marginBottom:10,fontSize:11,color:"#94a3b8"}}>수신: {targets.slice(0,5).map(t=>t.name).join(", ")}{targets.length>5&&` 외 ${targets.length-5}명`}</div>}
    {!isBulk&&<MFR label="수신 번호"><input style={GS.inp} placeholder="010-0000-0000" value={phone} onChange={e=>setPhone(e.target.value)}/></MFR>}
    <MFR label="템플릿">
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {templates.map(t=><div key={t.id} style={{...SI.chip,...(selTpl===t.id?{background:"#312e81",border:"1px solid #6366f1",color:"#c7d2fe"}:{})}} onClick={()=>setSelTpl(t.id)}>{t.title}</div>)}
      </div>
    </MFR>
    {tplVars.length>0&&<MFR label="변수 치환"><div style={{display:"flex",flexDirection:"column",gap:5}}>{tplVars.map(v=><div key={v} style={{display:"flex",alignItems:"center",gap:7}}><span style={{background:"#1e3a5f",border:"1px solid #3b82f6",color:"#93c5fd",padding:"2px 6px",borderRadius:3,fontSize:10,minWidth:65}}>{`{${v}}`}</span><input style={{...GS.inp,flex:1}} placeholder={`${v} 입력`} value={vars[v]||""} onChange={e=>setVars(p=>({...p,[v]:e.target.value}))}/></div>)}</div></MFR>}
    <MFR label="메시지 (수정 가능)">
      <textarea style={{...GS.inp,height:140,resize:"vertical",lineHeight:1.7}} value={body} onChange={e=>setBody(e.target.value)}/>
      <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{body.length}자</div>
    </MFR>
    {sent&&<div style={{background:"rgba(16,185,129,0.1)",border:"1px solid #10b981",borderRadius:6,padding:"7px 10px",color:"#6ee7b7",fontSize:12,marginBottom:6}}>✓ SMS 앱으로 연결됩니다. 앱에서 최종 발송해주세요.</div>}
    <div style={GS.mBtns}><SBtn onClick={send} color="#6366f1" full>📱 {isBulk?"단체 ":""}문자 보내기</SBtn><SBtn onClick={onClose} color="#374151" full>닫기</SBtn></div>
  </Modal>;
}

/* ═══════════════════════════════════════════════════════
   MODULE 0 — 단체복 주문 현황 (GROUP ORDERS TRACKER)
═══════════════════════════════════════════════════════ */

const GO_STEPS = [
  { key:"consulting",  label:"상담중",      color:"#64748b", bg:"#1e293b" },
  { key:"design_sent", label:"시안발송",    color:"#a78bfa", bg:"#2e1065" },
  { key:"confirmed",   label:"주문확정",    color:"#f59e0b", bg:"#78350f" },
  { key:"ordered",     label:"발주완료",    color:"#3b82f6", bg:"#1e3a5f" },
  { key:"producing",   label:"제작중",      color:"#8b5cf6", bg:"#3b0764" },
  { key:"arrived",     label:"입고완료",    color:"#10b981", bg:"#064e3b" },
];

const addDaysStr = (dateStr, n) => {
  const d = new Date(dateStr || Date.now());
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const diffDays = (dateStr) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
};

function GroupOrdersPage({ db }) {
  const { groupOrders, customers, sgo, sus, uSales, toast_ } = db;
  const [viewTab, setViewTab]   = useState("pending");
  const [addMod, setAdd]        = useState(false);
  const [editId, setEditId]     = useState(null);
  const [search, setSearch]     = useState("");
  const [stepFilter, setSF]     = useState("all");
  const [autoSaleMod, setAutoSale] = useState(null); // 입고 완료 시 자동 매출 팝업

  const saveGO = async (next) => { await sgo(next); };

  const addGO = async (data) => {
    const next = [{ ...data, id: gid(), createdAt: td() }, ...groupOrders];
    await saveGO(next); toast_("주문 등록 완료!");
  };
  const updGO = async (id, patch) => {
    const next = groupOrders.map(o => o.id === id ? { ...o, ...patch } : o);
    await saveGO(next);
  };
  const delGO = async (id) => {
    await saveGO(groupOrders.filter(o => o.id !== id));
    toast_("삭제 완료");
  };
  const markArrived = async (id) => {
    await updGO(id, { status: "arrived", arrivedAt: td() });
    toast_("✅ 입고 완료!");
    // 자동 매출 등록 팝업 띄우기
    const order = groupOrders.find(o => o.id === id);
    if (order) setAutoSale(order);
  };
  const exportOrders = () => {
    exportCSV(`단체복주문_${td()}.csv`,
      ["거래처명","유니폼명","수량","발주일","예상납기","D-day","진행상태","입고일","메모"],
      groupOrders.map(o => {
        const dl = diffDays(o.expectedAt);
        const dStr = dl===null?"-":dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`;
        const st = GO_STEPS.find(s=>s.key===o.status)?.label||o.status;
        return [o.customer||"-",o.uniformName||"-",o.qty||"-",o.orderedAt||"-",o.expectedAt||"-",dStr,st,o.arrivedAt||"-",o.memo||"-"];
      })
    );
    toast_("엑셀 파일 저장!");
  };
  const markStep = async (id, key) => {
    const patch = { status: key };
    if (key === "ordered") {
      const cur = groupOrders.find(o=>o.id===id);
      if (!cur?.orderedAt) patch.orderedAt = td();
      if (!cur?.expectedAt) patch.expectedAt = addDaysStr(td(), 14);
    }
    if (key === "arrived") {
      patch.arrivedAt = td();
      await updGO(id, patch);
      toast_("✅ 입고 완료!");
      // 자동 매출 팝업
      const order = groupOrders.find(o => o.id === id);
      if (order) setAutoSale({ ...order, ...patch });
      return;
    }
    await updGO(id, patch);
    toast_(`${GO_STEPS.find(s=>s.key===key)?.label} 처리`);
  };

  // PENDING: not arrived, sorted by expectedAt asc (nulls last)
  const pending = useMemo(() => {
    return groupOrders
      .filter(o => o.status !== "arrived")
      .filter(o => {
        const ms = stepFilter === "all" || o.status === stepFilter;
        const mq = !search || (o.customer||"").includes(search) || (o.uniformName||"").includes(search);
        return ms && mq;
      })
      .sort((a, b) => {
        if (!a.expectedAt && !b.expectedAt) return 0;
        if (!a.expectedAt) return 1;
        if (!b.expectedAt) return -1;
        return a.expectedAt.localeCompare(b.expectedAt);
      });
  }, [groupOrders, stepFilter, search]);

  // ARRIVED: arrived, sorted by arrivedAt desc
  const arrived = useMemo(() => {
    return groupOrders
      .filter(o => o.status === "arrived")
      .filter(o => !search || (o.customer||"").includes(search) || (o.uniformName||"").includes(search))
      .sort((a, b) => (b.arrivedAt||"").localeCompare(a.arrivedAt||""));
  }, [groupOrders, search]);

  // D-day counts
  const overdueCount  = pending.filter(o => o.expectedAt && diffDays(o.expectedAt) < 0).length;
  const soonCount     = pending.filter(o => o.expectedAt && diffDays(o.expectedAt) >= 0 && diffDays(o.expectedAt) <= 3).length;

  const editOrder = groupOrders.find(o => o.id === editId);
  const isMob = window.innerWidth < 768;

  return (
    <div>
      {/* SUMMARY BANNER */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:14 }}>
        <StatBadge label="전체 미입고" val={groupOrders.filter(o=>o.status!=="arrived").length + "건"} color="#3b82f6"/>
        <StatBadge label="납기 초과" val={overdueCount + "건"} color="#ef4444"/>
        <StatBadge label="3일 이내" val={soonCount + "건"} color="#f59e0b"/>
        <StatBadge label="입고완료" val={groupOrders.filter(o=>o.status==="arrived").length + "건"} color="#10b981"/>
      </div>

      {/* OVERDUE ALERT */}
      {overdueCount > 0 && (
        <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid #ef4444", borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", gap:10, alignItems:"flex-start" }}>
          <span style={{ fontSize:18, flexShrink:0 }}>🚨</span>
          <div>
            <div style={{ fontWeight:600, color:"#fca5a5", fontSize:13 }}>납기 초과 주문!</div>
            <div style={{ fontSize:11, color:"#f87171", marginTop:2, lineHeight:1.6 }}>
              {pending.filter(o=>o.expectedAt&&diffDays(o.expectedAt)<0).map(o=>`${o.customer} (D+${Math.abs(diffDays(o.expectedAt))})`).join(" · ")}
            </div>
          </div>
        </div>
      )}

      {/* TOOLBAR */}
      <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center" }}>
        <input style={{ ...GS.sInp, flex:1, minWidth:0 }} placeholder="거래처명·유니폼명 검색..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <SBtn onClick={exportOrders} color="#0f766e">📊 엑셀</SBtn>
        <SBtn onClick={()=>setAdd(true)} color="#f59e0b">+ 등록</SBtn>
      </div>

      {/* VIEW TABS */}
      <div style={{ display:"flex", gap:0, marginBottom:0, borderBottom:"1px solid #1e293b" }}>
        {[["pending","📋 미입고",pending.length,"#f59e0b","#ef4444"],["arrived","✅ 입고완료",arrived.length,"#10b981","#10b981"]].map(([id,label,cnt,active,badge])=>(
          <div key={id} style={{ flex:1, padding:"10px 8px", fontSize:13, fontWeight:500, cursor:"pointer", textAlign:"center",
            color:viewTab===id?"#f1f5f9":"#64748b",
            borderBottom:viewTab===id?`2px solid ${active}`:"2px solid transparent",
            background:viewTab===id?"#1e293b":"transparent"
          }} onClick={()=>setViewTab(id)}>
            {label} <span style={{ background:badge, color:"white", borderRadius:10, padding:"1px 6px", fontSize:11, marginLeft:4, fontWeight:700 }}>{cnt}</span>
          </div>
        ))}
      </div>

      {/* PENDING */}
      {viewTab === "pending" && (
        <div style={{ marginTop:12 }}>
          {/* Step filter chips */}
          <div style={{ display:"flex", gap:5, marginBottom:12, flexWrap:"wrap" }}>
            <div style={{ ...SI.chip, ...(stepFilter==="all"?SI.chipA:{}) }} onClick={()=>setSF("all")}>전체</div>
            {GO_STEPS.filter(s=>s.key!=="arrived").map(s=>(
              <div key={s.key} style={{ ...SI.chip, ...(stepFilter===s.key?{ background:s.bg, border:`1px solid ${s.color}`, color:s.color }:{}) }}
                onClick={()=>setSF(s.key)}>{s.label} <span style={{ fontSize:10, opacity:0.7 }}>{groupOrders.filter(o=>o.status===s.key).length}</span></div>
            ))}
          </div>

          {pending.length === 0
            ? <EmptyState icon="🚚" msg="미입고 주문이 없습니다" sub="모든 단체복이 입고 완료되었습니다 🎉"/>
            : isMob
              /* ── 모바일 카드 뷰 ── */
              ? <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {pending.map(o => {
                    const dl = diffDays(o.expectedAt);
                    const st = GO_STEPS.find(s=>s.key===o.status)||GO_STEPS[0];
                    const overdue = dl !== null && dl < 0;
                    const soon    = dl !== null && dl >= 0 && dl <= 3;
                    return (
                      <div key={o.id} style={{ background:"#111827", borderRadius:12, border:`1px solid ${overdue?"#ef4444":soon?"#f59e0b":"#1e293b"}`,
                        padding:14, display:"flex", flexDirection:"column", gap:10 }}>
                        {/* row 1: 거래처 + D-day */}
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div>
                            <div style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>{o.customer||"-"}</div>
                            <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>{o.uniformName||"-"} {o.qty?`· ${o.qty}벌`:""}</div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontWeight:800, fontSize:20,
                              color:dl===null?"#334155":dl<0?"#ef4444":dl===0?"#f97316":dl<=3?"#f59e0b":"#64748b" }}>
                              {dl===null?"-":dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`}
                            </div>
                            <div style={{ fontSize:10, color:"#64748b" }}>{o.expectedAt||"납기 미정"}</div>
                          </div>
                        </div>
                        {/* row 2: 발주일 + 상태 */}
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <span style={{ fontSize:11, color:"#64748b" }}>발주 {o.orderedAt||"미정"}</span>
                          <select value={o.status} onChange={e=>markStep(o.id,e.target.value)}
                            style={{ background:st.bg, border:`1px solid ${st.color}`, color:st.color, borderRadius:6,
                              padding:"4px 8px", fontSize:12, fontWeight:600, cursor:"pointer", outline:"none", marginLeft:"auto" }}>
                            {GO_STEPS.filter(s=>s.key!=="arrived").map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </div>
                        {o.memo && <div style={{ fontSize:11, color:"#64748b", background:"#1e293b", borderRadius:6, padding:"5px 8px" }}>{o.memo}</div>}
                        {/* row 3: 버튼 */}
                        <div style={{ display:"flex", gap:8 }}>
                          <SBtn onClick={()=>setEditId(o.id)} color="#1e3a5f" full>수정</SBtn>
                          <SBtn onClick={()=>markArrived(o.id)} color="#064e3b" full>✅ 입고완료</SBtn>
                          <SBtn onClick={()=>delGO(o.id)} color="#7f1d1d">🗑</SBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              /* ── PC 테이블 뷰 ── */
              : <div style={GS.tbl}>
                  <div style={{ display:"grid", gridTemplateColumns:"120px 130px 1fr 80px 100px 100px 100px 90px 180px", gap:6, padding:"9px 14px", background:"#0b0f1a", fontSize:10, fontWeight:600, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.4px" }}>
                    <span>거래처명</span><span>유니폼명</span><span>메모</span>
                    <span style={{textAlign:"center"}}>수량</span><span style={{textAlign:"center"}}>발주일</span>
                    <span style={{textAlign:"center"}}>예상납기</span><span style={{textAlign:"center"}}>D-day</span>
                    <span style={{textAlign:"center"}}>상태</span><span style={{textAlign:"center"}}>관리</span>
                  </div>
                  {pending.map(o => {
                    const dl = diffDays(o.expectedAt);
                    const st = GO_STEPS.find(s=>s.key===o.status)||GO_STEPS[0];
                    return (
                      <div key={o.id} style={{ display:"grid", gridTemplateColumns:"120px 130px 1fr 80px 100px 100px 100px 90px 180px",
                        gap:6, padding:"10px 14px", borderTop:"1px solid #1e293b", alignItems:"center", fontSize:12,
                        background: dl !== null && dl < 0 ? "rgba(239,68,68,0.06)" : dl !== null && dl <= 3 ? "rgba(245,158,11,0.04)" : "" }}>
                        <span style={{ fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.customer||"-"}</span>
                        <span style={{ color:"#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.uniformName||"-"}</span>
                        <span style={{ fontSize:11, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.memo||"-"}</span>
                        <span style={{ textAlign:"center", fontWeight:600 }}>{o.qty||"-"}벌</span>
                        <span style={{ textAlign:"center", fontSize:11, color:"#94a3b8" }}>{o.orderedAt||"미발주"}</span>
                        <span style={{ textAlign:"center", fontSize:11, color:dl!==null&&dl<0?"#ef4444":dl!==null&&dl<=3?"#f59e0b":"#94a3b8" }}>{o.expectedAt||"-"}</span>
                        <span style={{ textAlign:"center", fontWeight:700, fontSize:13,
                          color:dl===null?"#334155":dl<0?"#ef4444":dl===0?"#f97316":dl<=3?"#f59e0b":"#64748b" }}>
                          {dl===null?"-":dl<0?`D+${Math.abs(dl)}`:dl===0?"D-Day":`D-${dl}`}
                        </span>
                        <span style={{ textAlign:"center" }}>
                          <select value={o.status} onChange={e=>markStep(o.id,e.target.value)}
                            style={{ background:st.bg, border:`1px solid ${st.color}`, color:st.color, borderRadius:6, padding:"3px 6px", fontSize:11, fontWeight:600, cursor:"pointer", outline:"none", maxWidth:90 }}>
                            {GO_STEPS.filter(s=>s.key!=="arrived").map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </span>
                        <div style={{ display:"flex", gap:4, justifyContent:"center", flexWrap:"wrap" }}>
                          <SBtn onClick={()=>setEditId(o.id)} color="#1e3a5f">수정</SBtn>
                          <SBtn onClick={()=>markArrived(o.id)} color="#064e3b">✅ 입고</SBtn>
                          <SBtn onClick={()=>delGO(o.id)} color="#7f1d1d">🗑</SBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
          }
        </div>
      )}

      {/* ARRIVED */}
      {viewTab === "arrived" && (
        <div style={{ marginTop:12 }}>
          {arrived.length === 0
            ? <EmptyState icon="📦" msg="입고완료 내역이 없습니다"/>
            : isMob
              /* 모바일 카드 */
              ? <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {arrived.map(o => {
                    const onTime = o.expectedAt && o.arrivedAt ? o.arrivedAt <= o.expectedAt : null;
                    return (
                      <div key={o.id} style={{ background:"rgba(16,185,129,0.04)", borderRadius:12, border:"1px solid #1e293b", padding:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <div>
                            <div style={{ fontWeight:700, fontSize:15 }}>{o.customer||"-"}</div>
                            <div style={{ fontSize:12, color:"#94a3b8" }}>{o.uniformName||"-"} {o.qty?`· ${o.qty}벌`:""}</div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontWeight:700, color:"#10b981", fontSize:14 }}>{o.arrivedAt||"-"}</div>
                            {onTime !== null && <div style={{ fontSize:10, color:onTime?"#6ee7b7":"#fca5a5" }}>{onTime?"✓ 정시입고":"⚠ 지연입고"}</div>}
                          </div>
                        </div>
                        <div style={{ fontSize:11, color:"#64748b", display:"flex", gap:12 }}>
                          <span>발주 {o.orderedAt||"-"}</span>
                          <span>납기예정 {o.expectedAt||"-"}</span>
                        </div>
                        <div style={{ marginTop:8, display:"flex", justifyContent:"flex-end" }}>
                          <SBtn onClick={()=>delGO(o.id)} color="#7f1d1d">🗑 삭제</SBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              /* PC 테이블 */
              : <div style={GS.tbl}>
                  <div style={{ display:"grid", gridTemplateColumns:"130px 150px 1fr 80px 110px 110px 110px 90px", gap:6, padding:"9px 14px", background:"#0b0f1a", fontSize:10, fontWeight:600, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.4px" }}>
                    <span>거래처명</span><span>유니폼명</span><span>메모</span><span style={{textAlign:"center"}}>수량</span>
                    <span style={{textAlign:"center"}}>발주일</span><span style={{textAlign:"center"}}>예상납기</span><span style={{textAlign:"center"}}>실제입고일</span><span style={{textAlign:"center"}}>관리</span>
                  </div>
                  {arrived.map(o => {
                    const onTime = o.expectedAt && o.arrivedAt ? o.arrivedAt <= o.expectedAt : null;
                    return (
                      <div key={o.id} style={{ display:"grid", gridTemplateColumns:"130px 150px 1fr 80px 110px 110px 110px 90px", gap:6, padding:"9px 14px", borderTop:"1px solid #1e293b", alignItems:"center", fontSize:12, background:"rgba(16,185,129,0.02)" }}>
                        <span style={{ fontWeight:600 }}>{o.customer||"-"}</span>
                        <span style={{ color:"#94a3b8" }}>{o.uniformName||"-"}</span>
                        <span style={{ fontSize:11, color:"#64748b" }}>{o.memo||"-"}</span>
                        <span style={{ textAlign:"center", fontWeight:600 }}>{o.qty||"-"}벌</span>
                        <span style={{ textAlign:"center", fontSize:11, color:"#64748b" }}>{o.orderedAt||"-"}</span>
                        <span style={{ textAlign:"center", fontSize:11, color:"#64748b" }}>{o.expectedAt||"-"}</span>
                        <span style={{ textAlign:"center" }}>
                          <span style={{ fontWeight:600, color:"#10b981" }}>{o.arrivedAt||"-"}</span>
                          {onTime !== null && <span style={{ marginLeft:5, fontSize:10, color:onTime?"#6ee7b7":"#fca5a5" }}>{onTime?"✓ 정시":"⚠ 지연"}</span>}
                        </span>
                        <div style={{ textAlign:"center" }}><SBtn onClick={()=>delGO(o.id)} color="#7f1d1d">🗑</SBtn></div>
                      </div>
                    );
                  })}
                </div>
          }
        </div>
      )}

      {/* MODALS */}
      {addMod && <GOModal customers={customers} onClose={()=>setAdd(false)} onSave={d=>{addGO(d);setAdd(false);}}/>}
      {editOrder && <GOModal initial={editOrder} customers={customers} onClose={()=>setEditId(null)}
        onSave={d=>{ updGO(editId,d); setEditId(null); toast_("수정 완료!"); }}/>}
      {autoSaleMod && (
        <AutoSaleModal
          order={autoSaleMod}
          onClose={()=>setAutoSale(null)}
          onSave={async(d)=>{
            await sus([{...d, id:gid()},...(uSales||[])]);
            toast_("🎉 매출 자동 등록 완료!");
            setAutoSale(null);
          }}
          onSkip={()=>setAutoSale(null)}
        />
      )}
    </div>
  );
}

function GOModal({ initial, customers, onClose, onSave }) {
  const [f, setF] = useState({
    customer:"", contact:"", uniformName:"", qty:"",
    status:"consulting", memo:"",
    orderedAt:"", expectedAt:"", arrivedAt:"",
    ...(initial||{})
  });
  const s = (k,v) => setF(p=>({...p,[k]:v}));

  // auto-calculate expectedAt when orderedAt changes
  const handleOrderedAt = (v) => {
    s("orderedAt", v);
    if (v && !initial?.expectedAt) s("expectedAt", addDaysStr(v, 14));
  };

  return (
    <Modal title={initial ? "주문 수정" : "단체복 주문 등록"} onClose={onClose}>
      <div style={GS.fGrid}>
        <MFR label="거래처명 *">
          <input style={GS.inp} value={f.customer} onChange={e=>s("customer",e.target.value)}
            list="go-custs" placeholder="동호회명"/>
          <datalist id="go-custs">{customers.map(c=><option key={c.id} value={c.name}/>)}</datalist>
        </MFR>
        <MFR label="연락처">
          <input style={GS.inp} value={f.contact} onChange={e=>s("contact",e.target.value)} placeholder="010-0000-0000"/>
        </MFR>
        <MFR label="유니폼명">
          <input style={GS.inp} value={f.uniformName} onChange={e=>s("uniformName",e.target.value)} placeholder="예) y25-01 스카이웨이브"/>
        </MFR>
        <MFR label="수량 (벌)">
          <input type="number" style={GS.inp} value={f.qty} onChange={e=>s("qty",e.target.value)} placeholder="0" min={1}/>
        </MFR>
      </div>
      <MFR label="진행 상태">
        <div style={GS.chips}>
          {GO_STEPS.map(st=>(
            <div key={st.key} style={{ padding:"4px 9px", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:500, userSelect:"none",
              background: f.status===st.key ? st.bg : "#1e293b",
              border: `1px solid ${f.status===st.key ? st.color : "#334155"}`,
              color: f.status===st.key ? st.color : "#94a3b8"
            }} onClick={()=>s("status",st.key)}>{st.label}</div>
          ))}
        </div>
      </MFR>
      <div style={GS.fGrid}>
        <MFR label="발주일">
          <input type="date" style={GS.inp} value={f.orderedAt} onChange={e=>handleOrderedAt(e.target.value)}/>
        </MFR>
        <MFR label="예상 납기일 (발주 후 14일 자동 계산)">
          <input type="date" style={GS.inp} value={f.expectedAt} onChange={e=>s("expectedAt",e.target.value)}/>
        </MFR>
        {initial && (
          <MFR label="실제 입고일">
            <input type="date" style={GS.inp} value={f.arrivedAt} onChange={e=>s("arrivedAt",e.target.value)}/>
          </MFR>
        )}
      </div>
      <MFR label="메모">
        <textarea style={{ ...GS.inp, height:56, resize:"vertical" }} value={f.memo}
          onChange={e=>s("memo",e.target.value)} placeholder="색상 옵션, 특이사항, 등판 내용 등"/>
      </MFR>
      <div style={GS.mBtns}>
        <SBtn onClick={()=>{ if(!f.customer.trim()) return; onSave(f); }} color="#f59e0b" full>{initial?"수정 저장":"등록"}</SBtn>
        <SBtn onClick={onClose} color="#374151" full>취소</SBtn>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   자동 매출 등록 팝업
═══════════════════════════════════════════════════════ */
function AutoSaleModal({ order, onClose, onSave, onSkip }) {
  const [f, setF] = useState({
    date:    td(),
    customer: order.customer || "",
    itemName: order.uniformName || "",
    orderType: "단체복 등판 제작",
    detail:  `${order.uniformName||""} ${order.qty||""}벌 입고완료`,
    sales:   order.amount ? String(order.amount) : "",
    cost:    "",
    payMethod: "계좌이체",
    paid:    false,
    memo:    order.memo || "",
    type:    "uniform",
  });
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  const profit = Number(f.sales||0) - Number(f.cost||0);

  return (
    <Modal title="🎉 입고 완료 — 매출 자동 등록" onClose={onSkip} wide>
      {/* 주문 요약 */}
      <div style={{background:"rgba(16,185,129,0.08)",border:"1px solid #10b981",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <span style={{fontSize:20}}>✅</span>
          <span style={{fontWeight:700,fontSize:14,color:"#6ee7b7"}}>입고 완료!</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:12,color:"#94a3b8"}}>
          <span>거래처: <b style={{color:"#f1f5f9"}}>{order.customer}</b></span>
          <span>유니폼: <b style={{color:"#f1f5f9"}}>{order.uniformName||"-"}</b></span>
          <span>수량: <b style={{color:"#f1f5f9"}}>{order.qty||"-"}벌</b></span>
          <span>입고일: <b style={{color:"#f1f5f9"}}>{td()}</b></span>
        </div>
      </div>

      <div style={{fontSize:12,color:"#94a3b8",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
        <span style={{fontSize:16}}>💡</span>
        매출 정보를 입력하고 <b style={{color:"#f1f5f9"}}>매출 등록</b>을 누르면 매출 관리에 자동 반영됩니다.
      </div>

      <div style={GS.fGrid}>
        <MFR label="날짜"><input type="date" style={GS.inp} value={f.date} onChange={e=>s("date",e.target.value)}/></MFR>
        <MFR label="거래처명"><input style={GS.inp} value={f.customer} onChange={e=>s("customer",e.target.value)}/></MFR>
      </div>
      <MFR label="거래내역">
        <input style={GS.inp} value={f.detail} onChange={e=>s("detail",e.target.value)}/>
      </MFR>
      <div style={GS.fGrid}>
        <MFR label="매출액 (원)">
          <input type="number" style={GS.inp} value={f.sales} onChange={e=>s("sales",e.target.value)} placeholder="0"/>
        </MFR>
        <MFR label="원가 (원)">
          <input type="number" style={GS.inp} value={f.cost} onChange={e=>s("cost",e.target.value)} placeholder="0"/>
        </MFR>
      </div>
      {(f.sales||f.cost) && (
        <div style={{display:"flex",justifyContent:"space-between",background:"#0b0f1a",borderRadius:8,padding:"8px 14px",marginBottom:10}}>
          <span style={{fontSize:12,color:"#64748b"}}>순이익</span>
          <span style={{fontWeight:700,fontSize:14,color:profit>=0?"#10b981":"#ef4444"}}>{won(profit)}</span>
        </div>
      )}
      <div style={GS.fGrid}>
        <MFR label="결제수단">
          <select style={GS.inp} value={f.payMethod} onChange={e=>s("payMethod",e.target.value)}>
            {PAY_METHODS.map(m=><option key={m}>{m}</option>)}
          </select>
        </MFR>
        <MFR label="입금여부">
          <div style={GS.chips}>
            <Chip active={f.paid} onClick={()=>s("paid",true)} green>✓ 입금완료</Chip>
            <Chip active={!f.paid} onClick={()=>s("paid",false)} red>미수금</Chip>
          </div>
        </MFR>
      </div>

      <div style={GS.mBtns}>
        <SBtn onClick={()=>onSave(f)} color="#10b981" full>✅ 매출 등록</SBtn>
        <SBtn onClick={onSkip} color="#374151" full>나중에 등록</SBtn>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   🏓 티봇(TiBot) — 플로팅 AI 사용가이드 챗봇
═══════════════════════════════════════════════════════ */
const TIBOT_SYSTEM = `당신은 "티봇(TiBot)" — 티밸런스 관리 시스템 전문 도우미입니다.
티밸런스는 탁구 단체복 주문·재고·매출·거래처를 통합 관리하는 웹앱입니다.

## 메뉴 및 기능

🚚 단체복 주문 현황: 상담중→시안발송→주문확정→발주완료→제작중→입고완료 단계 관리. 발주일 입력 시 납기일 자동 +14일. 입고완료 시 매출 자동 등록 팝업. D-day/엑셀 내보내기.

📅 납기일 캘린더: 월별 그리드, 🔴납기초과 🟡3일이내 🔵진행중 🟢완료 도트 표시. 날짜 클릭 시 상세.

🎨 등판 시안 제작: 목업 이미지 업로드+드래그&드롭, 텍스트/로고 레이어, 폰트 커스텀 업로드, PNG 다운로드/클립보드 복사, 거래처별 저장.

📦 재고 관리: 유니폼(년도 필터, 재고없는순/품절사이즈순, 바뷰) + 용품(카테고리별) + 입출고이력 + 대리점관리. 구글시트 CSV 드래그&드롭 임포트. Firebase Storage 이미지 저장. 유니폼 등록 시 판매단가/매입단가 입력 가능(매출 자동계산에 사용).

📊 매출 관리: 대시보드(월별 차트+인기 유니폼 랭킹 연간/월간), 유니폼/용품 매출 탭, 미수금 탭, 엑셀 내보내기. 단품판매 시 유니폼 선택→사이즈 선택→수량 입력하면 매출액/원가 자동계산.

📋 주문·명단 관리: 목록/칸반 뷰 전환, 주문서 등록, 상의/하의 별도 명단(성명·등이름·등번호·사이즈·수량), A4 가로 인쇄.

🏢 거래처 관리: 카드뷰(유형/지역 필터), 단체문자 발송, CSV 임포트/엑셀 내보내기, 거래처 템플릿.

💳 입금 확인: 미수금/입금완료 필터, 미수금 문자 자동작성(SMS 앱 연동), 엑셀 내보내기.

🧾 세금계산서: 거래처 자동완성, 품목 추가, 공급가액+세액(10%) 자동계산, PDF 인쇄.

💬 메시지 템플릿: 카테고리별 관리, {거래처}{날짜}{금액} 변수 치환, SMS 발송.

🔔 알림 벨: 납기초과·3일이내·미수금 실시간 알림, 클릭 시 해당 페이지 이동.

## 로그인
카카오 로그인 권장. 전화번호 로그인 가능(데모 인증번호: 1234).

## 공통
Firebase Firestore 영구저장. URL 해시로 새로고침 후 탭 유지(#inventory 등). 모바일 하단탭바. 다크테마.

## 답변 스타일
친근하고 실용적으로. 기능 위치는 메뉴명(이모지 포함)으로. 단계별 설명 시 번호 목록. 간결하게 핵심만.`;

const TIBOT_QUICK = [
  { icon:"🚚", text:"단체복 주문 등록 방법" },
  { icon:"📦", text:"재고 CSV 가져오는 방법" },
  { icon:"🎨", text:"등판 시안 만드는 방법" },
  { icon:"💳", text:"미수금 문자 보내는 방법" },
  { icon:"📊", text:"단품 매출 자동계산 방법" },
  { icon:"🧾", text:"세금계산서 발행 방법" },
];

function TiBotFloat({ open, onToggle, isMobile }) {
  const botBottom = isMobile ? 76 : 24;
  const winBottom = isMobile ? 76 : 90;
  return (
    <>
      {open && (
        <div className="tibot-window" style={{
          position:"fixed",
          bottom: winBottom,
          right: isMobile ? 0 : 24,
          width: isMobile ? "100vw" : 380,
          height: isMobile ? `calc(100vh - ${winBottom}px)` : 560,
          background:"#111827",
          border: isMobile ? "none" : "1px solid #1e293b",
          borderRadius: isMobile ? "20px 20px 0 0" : 18,
          display:"flex", flexDirection:"column",
          overflow:"hidden", zIndex:1000,
          boxShadow:"0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(59,130,246,0.1)",
        }}>
          <TiBotWindow onClose={onToggle}/>
        </div>
      )}
      <button className="tibot-fab" onClick={onToggle} style={{
        position:"fixed", bottom: botBottom, right: 24,
        width:52, height:52, borderRadius:"50%",
        background: open ? "linear-gradient(135deg,#374151,#1e293b)" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
        border:"none", cursor:"pointer",
        fontSize: open ? 20 : 26,
        display:"flex", alignItems:"center", justifyContent:"center",
        zIndex:1001,
        boxShadow: open ? "0 4px 16px rgba(0,0,0,0.4)" : "0 6px 24px rgba(37,99,235,0.55)",
        transition:"all 0.2s ease", color:"white",
      }} title={open ? "챗봇 닫기" : "티봇 — 사용가이드 AI"}>
        {open ? "✕" : "🏓"}
      </button>
      {!open && <TiBotTooltip />}
    </>
  );
}

function TiBotTooltip() {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const t = setTimeout(() => setVisible(false), 4000); return () => clearTimeout(t); }, []);
  if (!visible) return null;
  return (
    <div style={{
      position:"fixed", bottom:88, right:82,
      background:"#1e293b", border:"1px solid #3b82f6",
      borderRadius:10, padding:"8px 12px",
      fontSize:12, color:"#93c5fd", fontWeight:500,
      zIndex:1001, whiteSpace:"nowrap",
      boxShadow:"0 4px 16px rgba(0,0,0,0.4)", pointerEvents:"none",
      animation:"tibot-fadein 0.3s ease",
    }}>
      🏓 사용법이 궁금하면 물어보세요!
      <div style={{
        position:"absolute", bottom:-6, right:16,
        width:10, height:10, background:"#1e293b",
        border:"1px solid #3b82f6", borderTop:"none", borderLeft:"none",
        transform:"rotate(45deg)",
      }}/>
    </div>
  );
}

function TiBotWindow({ onClose }) {
  const [messages, setMessages] = useState([{
    role:"assistant",
    content:"안녕하세요! **티봇(TiBot)** 🏓입니다.\n티밸런스 사용법이라면 뭐든지 물어보세요!",
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, loading]);

  const send = useCallback(async (text) => {
    const t = (text || input).trim();
    if (!t || loading) return;
    setInput(""); setShowQuick(false);
    const next = [...messages, { role:"user", content:t }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          system: TIBOT_SYSTEM,
          messages: next.map(m=>({ role:m.role, content:m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "응답을 받지 못했습니다.";
      setMessages(p => [...p, { role:"assistant", content:reply }]);
    } catch {
      setMessages(p => [...p, { role:"assistant", content:"⚠️ 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [input, messages, loading]);

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const reset = () => {
    setMessages([{ role:"assistant", content:"안녕하세요! **티봇(TiBot)** 🏓입니다.\n티밸런스 사용법이라면 뭐든지 물어보세요!" }]);
    setShowQuick(true); setInput("");
  };

  return (
    <>
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"13px 16px", borderBottom:"1px solid #1e293b",
        background:"linear-gradient(135deg,#0d1117,#111827)", flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:"linear-gradient(135deg,#1d4ed8,#2563eb)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, boxShadow:"0 3px 10px rgba(37,99,235,0.45)" }}>🏓</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", letterSpacing:"-0.3px" }}>티봇 TiBot</div>
            <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:1 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 5px #10b981", animation:"tibot-pulse 2s infinite", display:"block" }}/>
              <span style={{ fontSize:10, color:"#64748b" }}>사용가이드 AI</span>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          <button onClick={reset} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid #334155", color:"#64748b", borderRadius:7, padding:"4px 9px", cursor:"pointer", fontSize:11 }}>↺</button>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid #334155", color:"#64748b", borderRadius:7, padding:"4px 9px", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 8px", display:"flex", flexDirection:"column", gap:10, scrollbarWidth:"thin", scrollbarColor:"#1e293b transparent" }}>
        {messages.map((m, i) => <TiBotBubble key={i} msg={m} />)}
        {loading && (
          <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
            <TiBotAvatar />
            <div style={{ background:"#1e293b", borderRadius:"4px 12px 12px 12px", border:"1px solid #334155", padding:"11px 14px", display:"flex", gap:4, alignItems:"center" }}>
              {[0,1,2].map(j => <span key={j} style={{ width:6, height:6, borderRadius:"50%", background:"#3b82f6", display:"block", animation:`tibot-bounce 1.2s ${j*0.2}s infinite` }}/>)}
            </div>
          </div>
        )}
        {showQuick && !loading && (
          <div style={{ marginTop:4 }}>
            <div style={{ fontSize:10, color:"#4b5563", textAlign:"center", marginBottom:7 }}>자주 묻는 질문</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
              {TIBOT_QUICK.map((q,i) => (
                <button key={i} onClick={()=>send(q.text)} style={{
                  background:"rgba(30,41,59,0.8)", border:"1px solid #334155", borderRadius:9,
                  padding:"8px 9px", color:"#94a3b8", fontSize:10, cursor:"pointer",
                  textAlign:"left", lineHeight:1.4, transition:"all 0.15s",
                  display:"flex", alignItems:"flex-start", gap:5,
                }}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(59,130,246,0.12)";e.currentTarget.style.borderColor="#3b82f6";e.currentTarget.style.color="#93c5fd";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(30,41,59,0.8)";e.currentTarget.style.borderColor="#334155";e.currentTarget.style.color="#94a3b8";}}
                >
                  <span style={{ fontSize:12, flexShrink:0 }}>{q.icon}</span>
                  <span>{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      <div style={{ padding:"10px 12px 14px", borderTop:"1px solid #1e293b", background:"#0d1117", flexShrink:0 }}>
        <div style={{ display:"flex", gap:7, alignItems:"flex-end", background:"#1e293b", border:"1px solid #334155", borderRadius:12, padding:"7px 7px 7px 12px" }}>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
            placeholder="사용법을 물어보세요... (Enter 전송)" disabled={loading} rows={1}
            style={{ flex:1, background:"transparent", border:"none", color:"#f1f5f9", fontSize:13, outline:"none", resize:"none", lineHeight:1.5, maxHeight:80, overflowY:"auto", fontFamily:"inherit" }}
            onInput={e=>{ e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,80)+"px"; }}
          />
          <button onClick={()=>send()} disabled={loading || !input.trim()} style={{
            width:32, height:32, borderRadius:9, border:"none",
            background: input.trim()&&!loading ? "linear-gradient(135deg,#2563eb,#1d4ed8)" : "#374151",
            color:"white", cursor:input.trim()&&!loading?"pointer":"default",
            fontSize:14, display:"flex", alignItems:"center", justifyContent:"center",
            flexShrink:0, transition:"all 0.15s",
            boxShadow: input.trim()&&!loading ? "0 3px 10px rgba(37,99,235,0.45)" : "none",
          }}>{loading?"⏳":"↑"}</button>
        </div>
        <div style={{ fontSize:10, color:"#374151", textAlign:"center", marginTop:6 }}>티밸런스 AI 가이드 · 답변은 참고용입니다</div>
      </div>
    </>
  );
}

function TiBotAvatar() {
  return (
    <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, background:"linear-gradient(135deg,#1d4ed8,#2563eb)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, boxShadow:"0 2px 8px rgba(37,99,235,0.35)" }}>🏓</div>
  );
}

function TiBotBubble({ msg }) {
  const isBot = msg.role === "assistant";
  const parseText = (text) => {
    const parts = [];
    text.split("\n").forEach((line, li) => {
      if (li > 0) parts.push(<br key={`br${li}`}/>);
      line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((seg, si) => {
        if (seg.startsWith("**") && seg.endsWith("**"))
          parts.push(<strong key={`${li}${si}`} style={{ color:"#f1f5f9", fontWeight:700 }}>{seg.slice(2,-2)}</strong>);
        else if (seg.startsWith("`") && seg.endsWith("`"))
          parts.push(<code key={`${li}${si}`} style={{ background:"#0b0f1a", borderRadius:4, padding:"1px 4px", fontSize:11, color:"#93c5fd", fontFamily:"monospace" }}>{seg.slice(1,-1)}</code>);
        else parts.push(seg);
      });
    });
    return parts;
  };
  return (
    <div className="tibot-msg" style={{ display:"flex", flexDirection:isBot?"row":"row-reverse", gap:7, alignItems:"flex-start" }}>
      {isBot && <TiBotAvatar />}
      <div style={{
        maxWidth:"80%",
        background: isBot ? "#1e293b" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
        borderRadius: isBot ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
        border: isBot ? "1px solid #334155" : "none",
        padding:"10px 13px", fontSize:12, color:isBot?"#cbd5e1":"white",
        lineHeight:1.65,
        boxShadow: isBot ? "none" : "0 3px 14px rgba(37,99,235,0.3)",
      }}>
        {parseText(msg.content)}
      </div>
      {!isBot && (
        <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, background:"#374151", border:"1px solid #4b5563", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>👤</div>
      )}
    </div>
  );
}

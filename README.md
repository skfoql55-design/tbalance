# 🏓 티밸런스 관리 시스템

단체복 주문 · 재고 · 매출 · 거래처 통합 관리 웹앱  
**Firebase 연동으로 여러 기기·여러 사람이 실시간 공유 가능**

---

## 📦 프로젝트 구조

```
tbalance/
├── index.html           ← 메인 HTML
├── vite.config.js       ← 빌드 설정
├── package.json         ← 패키지 정보
├── vercel.json          ← Vercel 배포 설정
└── src/
    ├── main.jsx         ← React 진입점 + Firebase Storage 연결
    ├── firebase.js      ← 🔥 Firebase 설정 (키 입력 필요!)
    └── App.jsx          ← 전체 앱 코드
```

---

## 🚀 전체 진행 순서

① Firebase 프로젝트 설정 → ② src/firebase.js 에 키 입력 → ③ GitHub 업로드 → ④ Vercel 배포

---

## 🔥 STEP 1. Firebase 설정

### 1-1. Firebase 콘솔 접속
https://console.firebase.google.com → Google 계정 로그인

### 1-2. 새 프로젝트 만들기
1. [프로젝트 추가] 클릭
2. 프로젝트 이름: tbalance
3. Google 애널리틱스: 사용 안 함
4. [프로젝트 만들기] → 완료 대기

### 1-3. 웹 앱 등록
1. 프로젝트 홈 → "</>" (웹) 아이콘 클릭
2. 앱 닉네임: tbalance-web 입력 → [앱 등록]
3. 아래처럼 생긴 firebaseConfig 코드 전체 복사!

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "tbalance-xxxxx.firebaseapp.com",
  projectId: "tbalance-xxxxx",
  storageBucket: "tbalance-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

4. 복사한 값을 src/firebase.js 파일에 붙여넣기

### 1-4. Firestore 데이터베이스 생성
1. 왼쪽 메뉴 → [빌드] → [Firestore Database]
2. [데이터베이스 만들기] 클릭
3. 위치: asia-northeast3 (서울) 선택
4. [프로덕션 모드로 시작] → [만들기]

### 1-5. 보안 규칙 설정
Firestore 콘솔 → [규칙] 탭 → 아래 내용으로 교체 후 [게시]:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /storage/{document=**} {
      allow read, write: if true;
    }
  }
}
```

---

## 💻 STEP 2. 로컬 테스트

```bash
npm install
npm run dev
```
→ http://localhost:5173

---

## 🌐 STEP 3. GitHub + Vercel 배포

```bash
git init
git add .
git commit -m "티밸런스 첫 배포"
git remote add origin https://github.com/본인아이디/tbalance.git
git push -u origin main
```

→ vercel.com 접속 → GitHub 연동 → tbalance 저장소 Import → Deploy

---

## ✅ 데이터 공유

| 상황 | 결과 |
|------|------|
| 집에서 등록한 데이터 | 회사에서 즉시 확인 ✅ |
| 여러 명 동시 사용 | 실시간 공유 ✅ |
| 브라우저 캐시 삭제 | Firebase에 안전 저장 ✅ |
| 비용 | 월 5만 건 읽기/쓰기 무료 ✅ |

---

## 🔄 코드 수정 후 재배포

```bash
git add .
git commit -m "수정 내용"
git push
```
GitHub push → Vercel 자동 재배포

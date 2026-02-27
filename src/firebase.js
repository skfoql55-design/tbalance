// ─────────────────────────────────────────────────────────────
//  🔥 Firebase 설정 파일
//  아래 firebaseConfig 안의 값들을 Firebase 콘솔에서 복사해서 넣어주세요.
//  (아래 README.md 의 "Firebase 설정 방법" 참고)
// ─────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "여기에_API_KEY_붙여넣기",
  authDomain:        "여기에_AUTH_DOMAIN_붙여넣기",
  projectId:         "여기에_PROJECT_ID_붙여넣기",
  storageBucket:     "여기에_STORAGE_BUCKET_붙여넣기",
  messagingSenderId: "여기에_MESSAGING_SENDER_ID_붙여넣기",
  appId:             "여기에_APP_ID_붙여넣기",
};

const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { db } from './firebase.js'
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
} from 'firebase/firestore'

// ─────────────────────────────────────────────────────────────
//  🔥 window.storage — Firestore 기반 구현
//  App.jsx 의 모든 sv() / ld() 호출이 이 API 를 통해
//  Firebase Firestore 에 실시간 저장됩니다.
//
//  Firestore 구조:
//    컬렉션: "storage"
//    문서 ID: key (슬래시를 "__"로 치환)
//    필드: { value: "JSON 문자열", key: "원본키" }
// ─────────────────────────────────────────────────────────────

const COL = 'storage'
const toDocId = (key) => key.replace(/\//g, '__')
const toKey   = (docId) => docId.replace(/__/g, '/')

window.storage = {
  /** 값 저장 */
  set: async (key, value) => {
    try {
      const docId  = toDocId(key)
      const strVal = typeof value === 'string' ? value : JSON.stringify(value)
      await setDoc(doc(db, COL, docId), { value: strVal, key })
      return { key, value: strVal, shared: false }
    } catch (e) {
      console.error('[storage.set]', e)
      return null
    }
  },

  /** 값 읽기 — 없으면 throw */
  get: async (key) => {
    try {
      const docId = toDocId(key)
      const snap  = await getDoc(doc(db, COL, docId))
      if (!snap.exists()) throw new Error('Not found: ' + key)
      const { value } = snap.data()
      return { key, value, shared: false }
    } catch (e) {
      throw e
    }
  },

  /** 삭제 */
  delete: async (key) => {
    try {
      await deleteDoc(doc(db, COL, toDocId(key)))
      return { key, deleted: true, shared: false }
    } catch (e) {
      return null
    }
  },

  /** prefix 로 시작하는 키 목록 반환 */
  list: async (prefix) => {
    try {
      const col  = collection(db, COL)
      const snap = await getDocs(col)
      const keys = []
      snap.forEach((d) => {
        const k = d.data().key || toKey(d.id)
        if (!prefix || k.startsWith(prefix)) keys.push(k)
      })
      return { keys, prefix, shared: false }
    } catch (e) {
      console.error('[storage.list]', e)
      return { keys: [] }
    }
  },
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

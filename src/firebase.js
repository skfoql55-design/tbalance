import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBXuTv3er7JIygCtuznFBLZ5AU1jDfEsTc",
  authDomain: "tbalance-2a8e6.firebaseapp.com",
  projectId: "tbalance-2a8e6",
  storageBucket: "tbalance-2a8e6.firebasestorage.app",
  messagingSenderId: "560070313991",
  appId: "1:560070313991:web:b7357895aeaf95fc8702a2",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
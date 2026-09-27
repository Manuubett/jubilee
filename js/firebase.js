import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB33DiSS3CnmNWLgSFpqnKYqgLApoCkaNU",
  authDomain: "jublee-9bd20.firebaseapp.com",
  projectId: "jublee-9bd20",
  storageBucket: "jublee-9bd20.firebasestorage.app",
  messagingSenderId: "15568524094",
  appId: "1:15568524094:web:85e466a5da98575d0b126f",
  measurementId: "G-QJKKS1V6H1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

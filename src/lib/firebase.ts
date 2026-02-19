
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";


// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyBmM3eJxNrPWHzbjbfY2wWlEMEJHFKcTCA",
  authDomain: "studio-3511865139-8f049.firebaseapp.com",
  projectId: "studio-3511865139-8f049",
  storageBucket: "studio-3511865139-8f049.firebasestorage.app",
  messagingSenderId: "259711668664",
  appId: "1:259711668664:web:e31d57597dc555df68bf4d",
  measurementId: "G-L5B9L3B033"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize App Check
if (typeof window !== "undefined") {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LdRuXAsAAAAAG14sq0FbcHahQ2Gnff0SzCBPDVZ'),
    isTokenAutoRefreshEnabled: true,
  });
}

// Export auth and db
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

// Export a callable function reference
export const sendPaymentReceipt = httpsCallable(functions, 'sendPaymentReceipt');
export const sendCustomEmail = httpsCallable(functions, 'sendCustomEmail');
export const checkAndSendLeaseReminders = httpsCallable(functions, 'checkAndSendLeaseReminders');

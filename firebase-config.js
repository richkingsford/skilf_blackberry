export const firebaseConfig = {
  // Firebase Console > Project settings > Your apps > Web app config.
  apiKey: "AIzaSyDU0tW1mgqrnpEciULEIY48gXMivTTq470",
  authDomain: "skilf-9f736.firebaseapp.com",
  projectId: "skilf-9f736",
  storageBucket: "skilf-9f736.firebasestorage.app",
  messagingSenderId: "781204415810",
  appId: "1:781204415810:web:4f1c6b81800afc7e8714db",
  measurementId: "G-YGVGHEPGT2",
};

export const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

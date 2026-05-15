import { firebaseConfig, firebaseReady } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const state = {
  ready: false,
  auth: null,
  db: null,
  user: null,
};

function authUiElements() {
  return [...document.querySelectorAll("[data-auth-ui]")].map((root) => ({
    root,
    status: root.querySelector("[data-auth-status]"),
    signIn: root.querySelector('[data-auth-action="sign-in"]'),
    signOut: root.querySelector('[data-auth-action="sign-out"]'),
  }));
}

function setAuthStatus(text) {
  for (const ui of authUiElements()) {
    if (ui.status) ui.status.textContent = text;
  }
}

function renderAuthState(user) {
  for (const ui of authUiElements()) {
    if (ui.status) {
      ui.status.textContent = user
        ? `Signed in as ${user.displayName || user.email}`
        : "Sign in to save student and panelist data.";
    }
    if (ui.signIn) ui.signIn.hidden = Boolean(user);
    if (ui.signOut) ui.signOut.hidden = !user;
  }
}

async function savePersonApplication(form) {
  if (!state.ready) return null;
  const data = Object.fromEntries(new FormData(form).entries());
  const user = state.user;
  return addDoc(collection(state.db, "people"), {
    role: data.role || "student",
    name: data.name || "",
    email: data.email || "",
    phone: data.phone || "",
    organization: data.organization || "",
    skilfInterest: data.skilf_interest || "",
    project: data.project || "",
    message: data.message || "",
    kind: data.kind || "demo-day",
    source: "skilf-site",
    authUid: user ? user.uid : null,
    authEmail: user ? user.email : null,
    createdAt: serverTimestamp(),
  });
}

function wireApplicationForm() {
  const form = document.querySelector("[data-skilf-application-form]");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    if (!state.ready || !state.user) return;
    event.preventDefault();
    const submit = form.querySelector("[type='submit']");
    const originalText = submit ? submit.textContent : "";
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Sending...";
    }
    try {
      await savePersonApplication(form);
    } catch (error) {
      console.error("Firebase save failed; continuing with Netlify form submit.", error);
    }
    if (submit) submit.textContent = originalText;
    HTMLFormElement.prototype.submit.call(form);
  });
}

function wireAuthButtons() {
  document.addEventListener("click", async (event) => {
    const signIn = event.target.closest('[data-auth-action="sign-in"]');
    const signOutButton = event.target.closest('[data-auth-action="sign-out"]');
    if (signIn) {
      if (!state.ready) {
        setAuthStatus("Firebase is not configured yet.");
        return;
      }
      await signInWithPopup(state.auth, new GoogleAuthProvider());
    }
    if (signOutButton && state.ready) {
      await signOut(state.auth);
    }
  });
}

wireAuthButtons();
wireApplicationForm();

if (!firebaseReady) {
  setAuthStatus("Firebase config needed for Google sign-in.");
} else {
  const app = initializeApp(firebaseConfig);
  state.auth = getAuth(app);
  state.db = getFirestore(app);
  state.ready = true;
  onAuthStateChanged(state.auth, (user) => {
    state.user = user;
    renderAuthState(user);
  });
}

window.skilfFirebase = {
  get ready() {
    return state.ready;
  },
  get user() {
    return state.user;
  },
  savePersonApplication,
};

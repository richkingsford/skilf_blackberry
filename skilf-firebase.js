import { firebaseConfig, firebaseReady } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getRedirectResult,
  GoogleAuthProvider,
  getAuth,
  getIdToken,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
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

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function authUiElements() {
  return [...document.querySelectorAll("[data-auth-ui]")].map((root) => ({
    root,
    profile: root.querySelector("[data-auth-profile]"),
    profileButton: root.querySelector('[data-auth-action="profile-menu"]'),
    menu: root.querySelector("[data-auth-menu]"),
    avatar: root.querySelector("[data-auth-avatar]"),
    initial: root.querySelector("[data-auth-initial]"),
    name: root.querySelector("[data-auth-name]"),
    status: root.querySelector("[data-auth-status]"),
    signIn: root.querySelector('[data-auth-action="sign-in"]'),
    signOut: root.querySelector('[data-auth-action="sign-out"]'),
  }));
}

function closeAuthMenus() {
  for (const ui of authUiElements()) {
    if (ui.menu) ui.menu.hidden = true;
    if (ui.profileButton) ui.profileButton.setAttribute("aria-expanded", "false");
  }
}

function setAuthStatus(text) {
  for (const ui of authUiElements()) {
    if (ui.status) {
      ui.status.textContent = text || "";
      ui.status.hidden = !text;
    }
  }
}

function displayNameFor(user) {
  const value = user.displayName || user.email || "Member";
  return value.split(/\s+/)[0].split("@")[0];
}

function renderAuthState(user) {
  for (const ui of authUiElements()) {
    if (ui.profile) ui.profile.hidden = !user;
    if (!user && ui.menu) ui.menu.hidden = true;
    if (ui.profileButton) ui.profileButton.setAttribute("aria-expanded", "false");
    if (ui.name) ui.name.textContent = user ? displayNameFor(user) : "";
    if (ui.avatar) {
      ui.avatar.hidden = !(user && user.photoURL);
      if (user && user.photoURL) ui.avatar.src = user.photoURL;
      else ui.avatar.removeAttribute("src");
    }
    if (ui.initial) {
      ui.initial.hidden = !user || Boolean(user.photoURL);
      ui.initial.textContent = user ? displayNameFor(user).charAt(0).toUpperCase() : "";
    }
    if (ui.status) {
      ui.status.textContent = "";
      ui.status.hidden = true;
    }
    if (ui.signIn) ui.signIn.hidden = Boolean(user);
    if (ui.signOut) ui.signOut.hidden = !user;
  }
}

function friendlyAuthMessage(error) {
  if (!error || !error.code) return "Google sign-in did not finish.";
  if (error.code === "auth/invalid-api-key" || error.code.includes("api-key-not-valid")) return "Firebase API key looks incorrect. Copy the web app config again from Firebase.";
  if (error.code === "auth/popup-closed-by-user") return "Google sign-in was closed before it finished.";
  if (error.code === "auth/unauthorized-domain") return "This domain is not authorized in Firebase Authentication.";
  if (error.code === "auth/account-exists-with-different-credential") return "This email already uses a different sign-in method.";
  return "Google sign-in needs attention. Check the browser console for details.";
}

async function signInWithGoogle() {
  setAuthStatus("Opening Google sign-in...");
  try {
    const result = await signInWithPopup(state.auth, googleProvider);
    state.user = result.user || state.auth.currentUser;
    renderAuthState(state.user);
    return state.user;
  } catch (error) {
    if (error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(state.auth, googleProvider);
      return null;
    }
    console.error("Google sign-in failed.", error);
    setAuthStatus(friendlyAuthMessage(error));
    return null;
  }
}

async function requireSignIn(message = "Sign in to continue.") {
  if (!state.ready) {
    setAuthStatus("Firebase is not configured yet.");
    return null;
  }
  if (state.user) return state.user;
  setAuthStatus(message);
  return signInWithGoogle();
}

async function savePersonApplication(form) {
  if (!state.ready) return null;
  const data = Object.fromEntries(new FormData(form).entries());
  const user = state.user;
  return addDoc(collection(state.db, "people"), {
    role: data.role || "intern",
    name: data.name || "",
    email: data.email || "",
    project: data.project || "",
    message: data.message || "",
    kind: data.kind || data.role || "intern",
    source: "skilf-site",
    authUid: user ? user.uid : null,
    authEmail: user ? user.email : null,
    createdAt: serverTimestamp(),
  });
}

async function saveCardMessage(payload) {
  const user = state.user || (state.auth ? state.auth.currentUser : null);
  if (!state.ready || !user) return null;
  const message = {
    targetType: payload.targetType || "expert",
    targetName: payload.targetName || "",
    targetField: payload.targetField || "",
    targetProject: payload.targetProject || "",
    message: payload.message || "",
    source: "skilf-homepage-card",
    authUid: user.uid,
    authEmail: user.email || "",
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(collection(state.db, "messages"), message);
  await sendMessageEmail({ ...message, messageId: docRef.id }, user);
  return docRef;
}

async function sendMessageEmail(payload, user) {
  const token = await getIdToken(user);
  const response = await fetch("/.netlify/functions/send-message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      targetType: payload.targetType,
      targetName: payload.targetName,
      targetField: payload.targetField,
      targetProject: payload.targetProject,
      message: payload.message,
      messageId: payload.messageId,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Email notification failed (${response.status}). ${detail}`.trim());
  }
  return response.json().catch(() => ({ ok: true }));
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
    const profileButton = event.target.closest('[data-auth-action="profile-menu"]');
    const signOutButton = event.target.closest('[data-auth-action="sign-out"]');
    if (profileButton) {
      const uiRoot = profileButton.closest("[data-auth-ui]");
      const menu = uiRoot ? uiRoot.querySelector("[data-auth-menu]") : null;
      const opening = menu ? menu.hidden : false;
      closeAuthMenus();
      if (menu && opening) {
        menu.hidden = false;
        profileButton.setAttribute("aria-expanded", "true");
      }
      return;
    }
    if (signIn) {
      if (!state.ready) {
        setAuthStatus("Firebase is not configured yet.");
        return;
      }
      await signInWithGoogle();
    }
    if (signOutButton && state.ready) {
      closeAuthMenus();
      await signOut(state.auth);
      return;
    }
    if (!event.target.closest("[data-auth-profile]")) closeAuthMenus();
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
  getRedirectResult(state.auth).catch((error) => {
    console.error("Google redirect sign-in failed.", error);
    setAuthStatus(friendlyAuthMessage(error));
  });
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
  requireSignIn,
  saveCardMessage,
  savePersonApplication,
};

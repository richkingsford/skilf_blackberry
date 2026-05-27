import { firebaseConfig, firebaseReady } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getRedirectResult,
  GoogleAuthProvider,
  getAuth,
  getIdToken,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const VALID_ROLES = ["admin", "board-member", "mentor", "intern"];
const REGISTERED_MESSAGE_ROLES = ["board-member", "mentor", "intern"];
const OWNER_EMAIL = "richkingsford@gmail.com";
const OWNER_ROLES = ["admin", "board-member", "mentor", "intern"];
const ADMIN_LINKS = [
  ["admin.html", "Admin"],
  ["intern-dashboard.html", "Intern Dashboard"],
  ["board-member-dashboard.html", "Board Dashboard"],
  ["mentor-dashboard.html", "Mentor Dashboard"],
];
const ADVENTURE_OPTIONS = [
  ["intern", "Join intern waitlist"],
  ["scholarship", "Request support"],
  ["board-member", "Join reviewer board"],
  ["mentor", "Offer mentorship"],
  ["hire", "Hire or host interns"],
  ["feedback", "Send feedback"],
];
const state = {
  ready: false,
  auth: null,
  db: null,
  user: null,
  profile: null,
  registeredRoles: [],
};

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function writesAllowedInThisDeployment() {
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "") return true;
  if (host.includes("deploy-preview-") && host.endsWith(".netlify.app")) return false;
  if (host.includes("--") && host.endsWith(".netlify.app")) return false;
  return true;
}

function assertWritesAllowed() {
  if (writesAllowedInThisDeployment()) return;
  throw new Error("Production writes are disabled for this preview deployment.");
}

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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function registeredRolesFrom(values) {
  return [...new Set((values || []).map(normalizeRole).filter((role) => VALID_ROLES.includes(role)))];
}

function primaryRoleFor(roles) {
  return ["admin", "board-member", "mentor", "intern"].find((role) => roles.includes(role)) || "";
}

function dashboardForRoles(roles) {
  if (roles.includes("admin")) return "admin.html";
  if (roles.includes("board-member")) return "board-member-dashboard.html";
  if (roles.includes("mentor")) return "mentor-dashboard.html";
  if (roles.includes("intern")) return "intern-dashboard.html";
  return "";
}

function redirectToDashboardIfRequested() {
  const target = dashboardForRoles(state.registeredRoles);
  if (!target) return;
  const current = location.pathname.split("/").pop() || "index.html";
  if (["admin.html", "board-member-dashboard.html", "mentor-dashboard.html", "intern-dashboard.html", "student-dashboard.html"].includes(current)) return;
  if (sessionStorage.getItem("skilfRedirectAfterSignIn") !== "1") return;
  sessionStorage.removeItem("skilfRedirectAfterSignIn");
  location.href = target;
}

function applyProfileData(data) {
  state.profile = data || null;
  state.registeredRoles = registeredRolesFrom(data && data.roles);
  renderAdminChrome();
}

function hasRegisteredMessageRole() {
  return state.registeredRoles.some((role) => REGISTERED_MESSAGE_ROLES.includes(role));
}

function registeredMessageRoles() {
  return state.registeredRoles.filter((role) => REGISTERED_MESSAGE_ROLES.includes(role));
}

function claimRolesFrom(tokenResult) {
  const claims = tokenResult && tokenResult.claims ? tokenResult.claims : {};
  const roles = registeredRolesFrom([
    ...(Array.isArray(claims.roles) ? claims.roles : []),
    ...(Array.isArray(claims.skilfRoles) ? claims.skilfRoles : []),
  ]);
  if (claims.boardMember === true) roles.push("board-member");
  if (claims.mentor === true) roles.push("mentor");
  if (claims.intern === true) roles.push("intern");
  if (claims.admin === true) roles.push("admin");
  if (claims.suspended === true) return [];
  return registeredRolesFrom(roles);
}

async function authorityRolesFor(user) {
  const tokenResult = await getIdTokenResult(user, true).catch(() => null);
  const roles = claimRolesFrom(tokenResult);
  const emailVerified = user.emailVerified === true || (tokenResult && tokenResult.claims && tokenResult.claims.email_verified === true);
  if (normalizeEmail(user.email) === OWNER_EMAIL && emailVerified) {
    roles.push(...OWNER_ROLES);
  }
  return registeredRolesFrom(roles);
}

function authoritySourceFor(user, roles, tokenResult = null) {
  const claims = tokenResult && tokenResult.claims ? tokenResult.claims : {};
  if (normalizeEmail(user && user.email) === OWNER_EMAIL && (user.emailVerified || claims.email_verified === true)) return "owner-email";
  if (roles.length) return "custom-claims";
  return "none";
}

async function syncUserProfile(user = state.user, requestedRole = "") {
  if (!state.ready || !user) return null;
  const profileRef = doc(state.db, "userProfiles", user.uid);
  const existing = await getDoc(profileRef).catch(() => null);
  const existingData = existing && existing.exists() ? existing.data() : {};
  const tokenResult = await getIdTokenResult(user, true).catch(() => null);
  const roles = registeredRolesFrom([
    ...claimRolesFrom(tokenResult),
    ...(normalizeEmail(user.email) === OWNER_EMAIL && (user.emailVerified || (tokenResult && tokenResult.claims && tokenResult.claims.email_verified === true)) ? OWNER_ROLES : []),
  ]);
  const requestedRoles = [...new Set([
    ...((existingData.requestedRoles || []).map(normalizeRole)),
    normalizeRole(requestedRole),
  ].filter(Boolean))];
  const profileData = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    roles,
    requestedRoles,
    primaryRole: primaryRoleFor(roles),
    isRegistered: roles.length > 0,
    authoritySource: authoritySourceFor(user, roles, tokenResult),
    source: "skilf-site",
    updatedAt: serverTimestamp(),
  };
  if (!existing || !existing.exists()) profileData.createdAt = serverTimestamp();

  await setDoc(profileRef, profileData, { merge: true });
  applyProfileData({ ...existingData, ...profileData });

  const latest = await getDoc(profileRef).catch(() => null);
  if (latest && latest.exists()) applyProfileData(latest.data());
  return state.profile;
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
  renderAdminChrome();
}

function isAdminUser() {
  if (state.registeredRoles.includes("admin")) return true;
  return state.user && normalizeEmail(state.user.email) === OWNER_EMAIL && state.user.emailVerified === true;
}

function adminLinkMarkup(className = "", useMenuRole = false) {
  const role = useMenuRole ? ' role="menuitem"' : "";
  return ADMIN_LINKS.map(([href, label]) => `<a class="${className} site-admin-link" data-admin-only href="${href}"${role}>${label}</a>`).join("");
}

function renderAdminChrome() {
  const canAdmin = Boolean(state.user) && isAdminUser();

  for (const footer of document.querySelectorAll(".site-footer-links")) {
    footer.querySelectorAll("[data-admin-only]").forEach((link) => link.remove());
    if (canAdmin) footer.insertAdjacentHTML("beforeend", adminLinkMarkup("site-footer-admin-link"));
  }

  for (const ui of authUiElements()) {
    if (!ui.menu) continue;
    ui.menu.querySelectorAll("[data-admin-only]").forEach((link) => link.remove());
    if (!canAdmin) continue;
    const signOut = ui.menu.querySelector('[data-auth-action="sign-out"]');
    const wrapper = document.createElement("span");
    wrapper.setAttribute("data-admin-only", "");
    wrapper.className = "site-auth-admin-links";
    wrapper.innerHTML = adminLinkMarkup("site-auth-menu-link", true);
    if (signOut) ui.menu.insertBefore(wrapper, signOut);
    else ui.menu.appendChild(wrapper);
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
    if (state.user) await syncUserProfile(state.user).catch((error) => console.error("User profile sync failed.", error));
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
  if (state.user) {
    await syncUserProfile(state.user).catch((error) => console.error("User profile sync failed.", error));
    return state.user;
  }
  setAuthStatus(message);
  return signInWithGoogle();
}

async function savePersonApplication(form) {
  if (!state.ready) return null;
  assertWritesAllowed();
  const data = Object.fromEntries(new FormData(form).entries());
  const user = state.user;
  const docRef = await addDoc(collection(state.db, "people"), {
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
  if (user) await syncUserProfile(user, data.role).catch((error) => console.error("User role sync failed.", error));
  return docRef;
}

async function saveCardMessage(payload) {
  const user = state.user || (state.auth ? state.auth.currentUser : null);
  if (!state.ready || !user) return null;
  assertWritesAllowed();
  await syncUserProfile(user);
  if (!hasRegisteredMessageRole()) {
    throw new Error("Only registered mentors, interns, and board members can send messages.");
  }
  const message = {
    targetType: payload.targetType || "expert",
    targetName: payload.targetName || "",
    targetField: payload.targetField || "",
    targetProject: payload.targetProject || "",
    message: payload.message || "",
    source: "skilf-homepage-card",
    authUid: user.uid,
    authEmail: user.email || "",
    senderRoles: registeredMessageRoles(),
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(collection(state.db, "messages"), message);
  await sendMessageEmail({ ...message, messageId: docRef.id }, user);
  return docRef;
}

async function saveDashboardAction(payload) {
  const user = state.user || (state.auth ? state.auth.currentUser : null);
  if (!state.ready || !user) return null;
  assertWritesAllowed();
  await syncUserProfile(user);
  if (!hasRegisteredMessageRole()) {
    throw new Error("Only registered mentors, interns, and board members can use dashboards.");
  }
  const token = await getIdToken(user, true);
  const response = await fetch("/.netlify/functions/record-dashboard-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: payload.action || "",
      internId: payload.internId || "",
      internName: payload.internName || "",
      creditKind: payload.creditKind || "",
      creditDelta: Number(payload.creditDelta || 0),
      sourcePage: payload.sourcePage || "",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Dashboard action could not be recorded.");
  }
  return data;
}

async function sendMessageEmail(payload, user) {
  assertWritesAllowed();
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

async function getCurrentIdToken(forceRefresh = false) {
  const user = state.user || (state.auth ? state.auth.currentUser : null);
  if (!user) return "";
  return getIdToken(user, forceRefresh);
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
      sessionStorage.setItem("skilfRedirectAfterSignIn", "1");
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

function adventureMenuMarkup() {
  return `
    <span class="site-adventure-label">Choose a path</span>
    ${ADVENTURE_OPTIONS.map(([value, label]) => `<a role="menuitem" href="apply.html#${value}">${label}</a>`).join("")}
  `;
}

function wireAdventureChrome() {
  for (const summary of document.querySelectorAll(".site-adventure summary")) {
    summary.textContent = "Get Started";
  }

  for (const menu of document.querySelectorAll(".site-adventure-menu")) {
    menu.innerHTML = adventureMenuMarkup();
  }

  if (document.querySelector("[data-fixed-actions]")) return;
  const fixedActions = document.createElement("aside");
  fixedActions.className = "site-fixed-actions";
  fixedActions.setAttribute("data-fixed-actions", "");
  fixedActions.setAttribute("aria-label", "Quick actions");
  fixedActions.innerHTML = `
    <a class="site-fixed-btn" href="apply.html#feedback">Send feedback</a>
    <details class="site-adventure site-fixed-adventure">
      <summary class="site-nav-cta site-fixed-btn">Get Started</summary>
      <div class="site-adventure-menu" role="menu">
        ${adventureMenuMarkup()}
      </div>
    </details>
  `;
  document.body.appendChild(fixedActions);
}

wireAdventureChrome();
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
    if (!user) applyProfileData(null);
    renderAuthState(user);
    if (user) {
      syncUserProfile(user)
        .then(() => redirectToDashboardIfRequested())
        .catch((error) => console.error("User profile sync failed.", error));
    }
  });
}

window.skilfFirebase = {
  get ready() {
    return state.ready;
  },
  get user() {
    return state.user;
  },
  get profile() {
    return state.profile;
  },
  get registeredRoles() {
    return [...state.registeredRoles];
  },
  get hasRegisteredRole() {
    return hasRegisteredMessageRole();
  },
  get isAdmin() {
    return isAdminUser();
  },
  requireSignIn,
  syncUserProfile,
  saveCardMessage,
  saveDashboardAction,
  savePersonApplication,
  getIdToken: getCurrentIdToken,
  writesAllowedInThisDeployment,
};

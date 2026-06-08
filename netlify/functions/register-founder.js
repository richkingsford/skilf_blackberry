const {
  FieldValue,
  auth,
  blockWritesIfDisabled,
  db,
  isAdmin,
  json,
  registeredRolesFrom,
  requireUser,
} = require("./_firebase-admin");
const {
  clean,
  defaultJourney,
  emailDocId,
  isEmail,
  normalizeEmail,
  stepMapFrom,
  stepsFrom,
} = require("./_founder-journey");
const { sendWelcomeEmail } = require("./_welcome-email");

function readAdminToken(headers = {}) {
  return headers["x-skilf-admin-token"] || headers["X-Skilf-Admin-Token"] || "";
}

function primaryRoleFor(roles) {
  return ["admin", "board-member", "mentor", "intern"].find((role) => roles.includes(role)) || "";
}

function claimRolesFromClaims(claims = {}) {
  const roles = registeredRolesFrom([
    ...(Array.isArray(claims.roles) ? claims.roles : []),
    ...(Array.isArray(claims.skilfRoles) ? claims.skilfRoles : []),
    ...(Array.isArray(claims.suspendedRoles) ? claims.suspendedRoles : []),
  ]);
  if (claims.admin === true) roles.push("admin");
  if (claims.boardMember === true) roles.push("board-member");
  if (claims.mentor === true) roles.push("mentor");
  if (claims.intern === true) roles.push("intern");
  return registeredRolesFrom(roles);
}

async function authorizeAdmin(event) {
  if (process.env.ADMIN_ROLE_TOKEN && readAdminToken(event.headers || {}) === process.env.ADMIN_ROLE_TOKEN) {
    return {
      source: "admin-token",
      actorUid: "admin-token",
      actorEmail: "admin-token",
      actorRoles: ["admin"],
    };
  }

  const verified = await requireUser(event);
  if (!isAdmin(verified.decodedToken, verified.roles)) {
    const error = new Error("Admin access required.");
    error.statusCode = 403;
    throw error;
  }
  return {
    source: "firebase-admin",
    actorUid: verified.decodedToken.uid,
    actorEmail: verified.decodedToken.email || "",
    actorRoles: verified.roles,
  };
}

function userSnapshot(user, roles) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    disabled: user.disabled === true,
    roles,
    primaryRole: primaryRoleFor(roles),
  };
}

async function maybeGrantApplicantRole(user, actor, email) {
  if (!user) return { user: null, roles: [] };
  const existingClaims = user.customClaims || {};
  const activeRoles = registeredRolesFrom([...claimRolesFromClaims(existingClaims), "intern"]);
  const suspended = user.disabled === true || existingClaims.suspended === true;
  const nextClaims = {
    ...existingClaims,
    roles: activeRoles,
    skilfRoles: activeRoles,
    admin: activeRoles.includes("admin"),
    boardMember: activeRoles.includes("board-member"),
    mentor: activeRoles.includes("mentor"),
    intern: activeRoles.includes("intern"),
    suspended,
  };

  await auth().setCustomUserClaims(user.uid, nextClaims);
  await auth().revokeRefreshTokens(user.uid);
  await db().collection("userProfiles").doc(user.uid).set({
    uid: user.uid,
    email: user.email || email,
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    roles: suspended ? [] : activeRoles,
    primaryRole: suspended ? "" : primaryRoleFor(activeRoles),
    isRegistered: !suspended,
    status: suspended ? "suspended" : "active",
    authoritySource: "custom-claims",
    founderApplicant: true,
    source: "register-founder",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db().collection("roleAudit").add({
    targetUid: user.uid,
    targetEmail: user.email || email,
    roles: suspended ? [] : activeRoles,
    suspended,
    action: "register-founder",
    actorUid: actor.actorUid,
    actorEmail: actor.actorEmail,
    actorRoles: actor.actorRoles,
    source: actor.source,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { user, roles: suspended ? [] : activeRoles };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid founder payload." });
  }

  let actor;
  try {
    actor = await authorizeAdmin(event);
    blockWritesIfDisabled();
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }

  const name = clean(payload.name, 160);
  const email = normalizeEmail(payload.email);
  const note = clean(payload.note, 1200);
  if (!name) return json(400, { error: "Founder name is required." });
  if (!isEmail(email)) return json(400, { error: "Founder email is required." });

  const founderId = emailDocId(email);
  let firebaseUser = null;
  try {
    firebaseUser = await auth().getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      return json(500, { error: error.message || "Could not check Firebase Auth for that email." });
    }
  }

  const founderRef = db().collection("founders").doc(founderId);
  const founderSnapshot = await founderRef.get().catch(() => ({ exists: false, data: () => ({}) }));
  const existingFounder = founderSnapshot.exists ? founderSnapshot.data() : {};
  const journeyRef = db().collection("studentJourneys").doc(founderId);
  const journeySnapshot = await journeyRef.get().catch(() => ({ exists: false, data: () => ({}) }));
  const existingJourney = journeySnapshot.exists ? journeySnapshot.data() : {};
  const journeySteps = stepMapFrom(existingJourney.steps || payload.steps);
  const founderRecord = {
    id: founderId,
    name,
    email,
    note,
    status: "applicant",
    applicantType: "founder",
    founder: true,
    authUid: firebaseUser ? firebaseUser.uid : null,
    source: "admin-register-founder",
    updatedAt: FieldValue.serverTimestamp(),
    registeredByUid: actor.actorUid,
    registeredByEmail: actor.actorEmail,
  };

  try {
    await founderRef.set({
      ...founderRecord,
      createdAt: existingFounder.createdAt || FieldValue.serverTimestamp(),
    }, { merge: true });
    await db().collection("people").doc(`founder_${founderId}`).set({
      role: "intern",
      kind: "founder",
      name,
      email,
      project: "Founder applicant",
      message: note || "Registered from the admin console.",
      founder: true,
      status: "applicant",
      source: "admin-register-founder",
      authUid: firebaseUser ? firebaseUser.uid : null,
      authEmail: firebaseUser ? firebaseUser.email || email : null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await journeyRef.set({
      ...defaultJourney({ name, email }),
      steps: journeySteps,
      authUid: firebaseUser ? firebaseUser.uid : null,
      source: "admin-register-founder",
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existingJourney.createdAt || FieldValue.serverTimestamp(),
    }, { merge: true });

    const grant = await maybeGrantApplicantRole(firebaseUser, actor, email);
    const welcomeEmail = await sendWelcomeEmail({
      to: email,
      name,
      idempotencyKey: `highbar-founder-${founderId}`,
    });

    return json(200, {
      ok: true,
      founder: {
        ...founderRecord,
        steps: stepsFrom(journeySteps),
      },
      authUserFound: Boolean(firebaseUser),
      user: userSnapshot(firebaseUser, grant.roles),
      welcomeEmail,
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not register founder." });
  }
};

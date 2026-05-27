const {
  FieldValue,
  OWNER_EMAIL,
  OWNER_ROLES,
  auth,
  blockWritesIfDisabled,
  db,
  isAdmin,
  json,
  normalizeEmail,
  registeredRolesFrom,
  requireUser,
} = require("./_firebase-admin");

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

function userSnapshot(user, roles, suspended, suspendedReason = "") {
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    disabled: user.disabled === true,
    suspended,
    suspendedReason,
    roles,
    primaryRole: primaryRoleFor(roles),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid admin payload." });
  }

  let actor;
  try {
    actor = await authorizeAdmin(event);
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }

  const email = normalizeEmail(payload.email);
  if (!email) return json(400, { error: "Email is required." });

  let user;
  try {
    user = await auth().getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") return json(404, { error: "No Firebase user found for that email." });
    return json(500, { error: error.message || "Could not look up that user." });
  }

  const existingClaims = user.customClaims || {};
  const existingRoles = claimRolesFromClaims(existingClaims);
  const existingSuspended = user.disabled === true || existingClaims.suspended === true;
  const existingReason = String(existingClaims.suspendedReason || "");
  if (payload.lookupOnly === true) {
    return json(200, {
      ok: true,
      lookupOnly: true,
      user: userSnapshot(user, existingRoles, existingSuspended, existingReason),
    });
  }

  try {
    blockWritesIfDisabled();
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }

  const targetEmail = normalizeEmail(user.email || email);
  const ownerTarget = targetEmail === OWNER_EMAIL;
  const requestedRoles = registeredRolesFrom(payload.roles);
  const assignedRoles = ownerTarget ? registeredRolesFrom([...requestedRoles, ...OWNER_ROLES]) : requestedRoles;
  const suspended = payload.suspended === true;
  const suspendedReason = String(payload.reason || "").trim().slice(0, 500);
  if (ownerTarget && suspended) return json(400, { error: "The owner admin account cannot be suspended here." });

  const activeRoles = suspended ? [] : assignedRoles;
  const suspendedRoles = suspended ? assignedRoles : [];
  const nextClaims = {
    ...existingClaims,
    roles: activeRoles,
    skilfRoles: activeRoles,
    suspendedRoles,
    admin: activeRoles.includes("admin"),
    boardMember: activeRoles.includes("board-member"),
    mentor: activeRoles.includes("mentor"),
    intern: activeRoles.includes("intern"),
    suspended,
    suspendedReason: suspended ? suspendedReason : "",
  };

  try {
    await auth().setCustomUserClaims(user.uid, nextClaims);
    await auth().updateUser(user.uid, { disabled: suspended });
    await auth().revokeRefreshTokens(user.uid);

    const status = suspended ? "suspended" : "active";
    await db().collection("userProfiles").doc(user.uid).set({
      uid: user.uid,
      email: user.email || email,
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      roles: activeRoles,
      suspendedRoles,
      primaryRole: primaryRoleFor(activeRoles),
      isRegistered: activeRoles.length > 0,
      status,
      suspended,
      suspendedReason: suspended ? suspendedReason : "",
      suspendedAt: suspended ? FieldValue.serverTimestamp() : null,
      suspendedByEmail: suspended ? actor.actorEmail : "",
      suspendedByUid: suspended ? actor.actorUid : "",
      reinstatedAt: suspended ? null : FieldValue.serverTimestamp(),
      reinstatedByEmail: suspended ? "" : actor.actorEmail,
      reinstatedByUid: suspended ? "" : actor.actorUid,
      authoritySource: activeRoles.length ? "custom-claims" : "none",
      source: "admin-set-user-roles",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db().collection("roleAudit").add({
      targetUid: user.uid,
      targetEmail: user.email || email,
      roles: activeRoles,
      suspendedRoles,
      suspended,
      suspendedReason: suspended ? suspendedReason : "",
      action: suspended ? "suspend-account" : "update-permissions",
      actorUid: actor.actorUid,
      actorEmail: actor.actorEmail,
      actorRoles: actor.actorRoles,
      source: actor.source,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not update that account." });
  }

  return json(200, {
    ok: true,
    user: userSnapshot({
      uid: user.uid,
      email: user.email || email,
      displayName: user.displayName || "",
      disabled: suspended,
    }, assignedRoles, suspended, suspended ? suspendedReason : ""),
  });
};

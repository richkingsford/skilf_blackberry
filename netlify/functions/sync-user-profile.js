const {
  FieldValue,
  OWNER_ROLES,
  auth,
  db,
  isOwner,
  json,
  normalizeEmail,
  registeredRolesFrom,
  requireUser,
  rolesFromClaims,
} = require("./_firebase-admin");
const { clean, emailDocId } = require("./_founder-journey");

function primaryRoleFor(roles) {
  return ["admin", "board-member", "mentor", "intern"].find((role) => roles.includes(role)) || "";
}

function requestedRolesFrom(values) {
  return [...new Set((values || []).map((role) => String(role || "").trim().toLowerCase()).filter(Boolean))];
}

async function getExistingAuthUser(uid) {
  try {
    return await auth().getUser(uid);
  } catch {
    return null;
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid profile payload." });
  }

  let verified;
  try {
    verified = await requireUser(event);
  } catch (error) {
    return json(error.statusCode || 401, { error: error.message || "Sign in before continuing." });
  }

  const decoded = verified.decodedToken || {};
  const uid = decoded.uid || decoded.user_id || "";
  const email = normalizeEmail(decoded.email);
  if (!uid || !email) return json(400, { error: "Signed-in account is missing a UID or email." });

  const docId = emailDocId(email);
  const profileRef = db().collection("userProfiles").doc(uid);
  const founderRef = db().collection("founders").doc(docId);
  const journeyRef = db().collection("studentJourneys").doc(docId);
  const [profileSnapshot, founderSnapshot, journeySnapshot, authUser] = await Promise.all([
    profileRef.get().catch(() => ({ exists: false, data: () => ({}) })),
    founderRef.get().catch(() => ({ exists: false, data: () => ({}) })),
    journeyRef.get().catch(() => ({ exists: false, data: () => ({}) })),
    getExistingAuthUser(uid),
  ]);

  const existingProfile = profileSnapshot.exists ? profileSnapshot.data() : {};
  const existingClaims = authUser && authUser.customClaims ? authUser.customClaims : decoded;
  const suspended = existingClaims.suspended === true || (authUser && authUser.disabled === true);
  const isFounderApplicant = founderSnapshot.exists && normalizeEmail(founderSnapshot.data().email) === email;
  const isJourneyApplicant = journeySnapshot.exists && normalizeEmail(journeySnapshot.data().email) === email;
  const ownerRoles = isOwner(decoded) ? OWNER_ROLES : [];
  const currentRoles = suspended ? [] : registeredRolesFrom([...rolesFromClaims(decoded), ...ownerRoles]);
  const earnedRoles = isFounderApplicant && !suspended ? ["intern"] : [];
  const roles = registeredRolesFrom([...currentRoles, ...earnedRoles]);
  const requestedRoles = requestedRolesFrom([
    ...(existingProfile.requestedRoles || []),
    payload.requestedRole,
    isJourneyApplicant ? "applicant" : "",
    isFounderApplicant ? "founder" : "",
    isFounderApplicant ? "intern" : "",
  ]);

  let claimsUpdated = false;
  if (isFounderApplicant && !suspended && !currentRoles.includes("intern")) {
    const nextClaims = {
      ...existingClaims,
      roles,
      skilfRoles: roles,
      admin: roles.includes("admin"),
      boardMember: roles.includes("board-member"),
      mentor: roles.includes("mentor"),
      intern: roles.includes("intern"),
      founderApplicant: true,
      applicant: true,
    };
    await auth().setCustomUserClaims(uid, nextClaims);
    claimsUpdated = true;
  }

  const displayName = clean(decoded.name || (authUser && authUser.displayName) || existingProfile.displayName, 160);
  const profile = {
    uid,
    email,
    displayName,
    photoURL: clean(decoded.picture || (authUser && authUser.photoURL) || existingProfile.photoURL, 500),
    roles,
    requestedRoles,
    primaryRole: primaryRoleFor(roles),
    isRegistered: roles.length > 0,
    status: suspended ? "suspended" : "active",
    authoritySource: roles.length ? (currentRoles.length ? "custom-claims" : "registered-founder") : "none",
    applicant: isJourneyApplicant,
    founderApplicant: isFounderApplicant,
    applicantType: isFounderApplicant ? "founder" : isJourneyApplicant ? "applicant" : "",
    source: "sync-user-profile",
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!profileSnapshot.exists) profile.createdAt = FieldValue.serverTimestamp();

  await profileRef.set(profile, { merge: true });
  if (isFounderApplicant) {
    await founderRef.set({
      authUid: uid,
      authEmail: email,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  if (isJourneyApplicant) {
    await journeyRef.set({
      authUid: uid,
      authEmail: email,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return json(200, {
    ok: true,
    claimsUpdated,
    profile: {
      ...profile,
      updatedAt: null,
      createdAt: profile.createdAt ? null : undefined,
    },
  });
};

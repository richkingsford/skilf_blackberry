const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, beforeEach, test } = require("node:test");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  deleteDoc,
  doc,
  getDoc,
  setLogLevel,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const root = path.join(__dirname, "..");
const projectId = "skilf-9f736";
let testEnv;
setLogLevel("silent");

function claims(uid, roles = [], extra = {}) {
  return {
    email: `${uid}@example.test`,
    email_verified: true,
    roles,
    suspended: false,
    ...extra,
  };
}

function dbFor(uid, roles = [], extra = {}) {
  return testEnv.authenticatedContext(uid, claims(uid, roles, extra)).firestore();
}

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function profileData(uid, roles = []) {
  return {
    uid,
    email: `${uid}@example.test`,
    displayName: `QA ${uid}`,
    photoURL: "",
    roles,
    requestedRoles: [],
    primaryRole: roles[0] || "",
    isRegistered: roles.length > 0,
    authoritySource: roles.length ? "custom-claims" : "none",
    source: "rules-test",
    createdAt: "rules-test",
    updatedAt: "rules-test",
  };
}

function validMessage(uid) {
  return {
    authUid: uid,
    authEmail: `${uid}@example.test`,
    targetType: "intern",
    targetName: "QA Intern",
    message: "This is a rules-test message.",
  };
}

async function seed(pathname, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), pathname), data);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.join(root, "firestore.rules"), "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test("unauthenticated visitors cannot write protected or intake collections", async () => {
  await assertFails(setDoc(doc(anonDb(), "messages/anon"), validMessage("anon")));
  await assertFails(setDoc(doc(anonDb(), "people/anon"), {
    authUid: "anon",
    authEmail: "anon@example.test",
    email: "anon@example.test",
    role: "intern",
  }));
  await assertFails(setDoc(doc(anonDb(), "dashboardActions/anon"), { action: "pass-demo" }));
});

test("only registered mentors, interns, and board members can create messages", async () => {
  await assertFails(setDoc(doc(dbFor("signed-no-role"), "messages/no-role"), validMessage("signed-no-role")));
  await assertFails(setDoc(doc(dbFor("admin-only", ["admin"]), "messages/admin-only"), validMessage("admin-only")));

  for (const role of ["intern", "mentor", "board-member"]) {
    await assertSucceeds(setDoc(doc(dbFor(`${role}-sender`, [role]), `messages/${role}`), validMessage(`${role}-sender`)));
  }

  await assertFails(setDoc(doc(dbFor("intern-suspended", ["intern"], { suspended: true }), "messages/suspended"), validMessage("intern-suspended")));
  await assertFails(setDoc(doc(dbFor("intern-spoof", ["intern"]), "messages/spoof"), {
    ...validMessage("someone-else"),
    authEmail: "intern-spoof@example.test",
  }));
});

test("dashboard decisions and credit ledgers stay server-only for every browser role", async () => {
  const protectedWrites = [
    ["dashboardActions/client", { action: "pass-demo" }],
    ["creditLedger/client", { creditDelta: -1 }],
    ["creditPools/client", { credits: 1 }],
    ["roleAudit/client", { roles: ["admin"] }],
  ];

  for (const roles of [[], ["intern"], ["mentor"], ["board-member"], ["admin"], ["admin", "board-member", "mentor", "intern"]]) {
    const db = dbFor(`actor-${roles.join("-") || "none"}`, roles);
    for (const [pathname, data] of protectedWrites) {
      await assertFails(setDoc(doc(db, `${pathname}-${roles.join("-") || "none"}`), data));
      await assertFails(updateDoc(doc(db, `${pathname}-${roles.join("-") || "none"}`), data));
      await assertFails(deleteDoc(doc(db, `${pathname}-${roles.join("-") || "none"}`)));
    }
  }
});

test("users can read and edit only their own safe profile fields", async () => {
  await assertSucceeds(setDoc(doc(dbFor("intern-a", ["intern"]), "userProfiles/intern-a"), profileData("intern-a", ["intern"])));
  await assertFails(setDoc(doc(dbFor("intern-a", ["intern"]), "userProfiles/intern-b"), profileData("intern-b", ["intern"])));
  await assertFails(setDoc(doc(dbFor("intern-a", ["intern"]), "userProfiles/intern-a-escalated"), profileData("intern-a-escalated", ["admin"])));

  await seed("userProfiles/intern-a", profileData("intern-a", ["intern"]));
  await seed("userProfiles/intern-b", profileData("intern-b", ["intern"]));

  await assertSucceeds(getDoc(doc(dbFor("intern-a", ["intern"]), "userProfiles/intern-a")));
  await assertFails(getDoc(doc(dbFor("intern-a", ["intern"]), "userProfiles/intern-b")));
  await assertSucceeds(updateDoc(doc(dbFor("intern-a", ["intern"]), "userProfiles/intern-a"), {
    displayName: "Updated Intern",
    updatedAt: "rules-test-update",
  }));
  await assertFails(updateDoc(doc(dbFor("intern-a", ["intern"]), "userProfiles/intern-a"), {
    suspended: true,
  }));
});

test("credit accounts and payment records are private and read-only to their owner", async () => {
  await seed("creditAccounts/intern-a", { uid: "intern-a", checkInCredits: 1 });
  await seed("creditAccounts/intern-b", { uid: "intern-b", checkInCredits: 1 });
  await seed("payments/pay-a", { authUid: "intern-a", status: "paid" });
  await seed("payments/pay-b", { authUid: "intern-b", status: "paid" });

  await assertSucceeds(getDoc(doc(dbFor("intern-a", ["intern"]), "creditAccounts/intern-a")));
  await assertFails(getDoc(doc(dbFor("intern-a", ["intern"]), "creditAccounts/intern-b")));
  await assertSucceeds(getDoc(doc(dbFor("intern-a", ["intern"]), "payments/pay-a")));
  await assertFails(getDoc(doc(dbFor("intern-a", ["intern"]), "payments/pay-b")));

  await assertFails(setDoc(doc(dbFor("intern-a", ["intern"]), "creditAccounts/intern-a"), { uid: "intern-a", checkInCredits: 99 }));
  await assertFails(setDoc(doc(dbFor("intern-a", ["intern"]), "payments/pay-new"), { authUid: "intern-a", status: "paid" }));
});

test("owner email authority can keep Rich's local profile in sync without granting public users owner powers", async () => {
  const richDb = dbFor("rich-uid", [], {
    email: "richkingsford@gmail.com",
    email_verified: true,
  });
  await assertSucceeds(setDoc(doc(richDb, "userProfiles/rich-uid"), {
    ...profileData("rich-uid", ["admin", "board-member", "mentor", "intern"]),
    email: "richkingsford@gmail.com",
    primaryRole: "admin",
    authoritySource: "owner-email",
  }));

  await assertFails(setDoc(doc(dbFor("fake-rich", []), "userProfiles/fake-rich"), {
    ...profileData("fake-rich", ["admin"]),
    email: "richkingsford@gmail.com",
    primaryRole: "admin",
  }));

  assert.ok(testEnv, "rules test environment should initialize");
});

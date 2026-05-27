const {
  FieldValue,
  blockWritesIfDisabled,
  db,
  hasRole,
  json,
  requireUser,
} = require("./_firebase-admin");

const VALID_ACTIONS = [
  "donate-credit",
  "offer-mentor",
  "report-problem",
  "pass-demo",
  "fail-demo",
  "schedule-check-in",
  "give-intern-credit",
  "become-mentor",
];

const CREDIT_ACTIONS = {
  "donate-credit": {
    field: "mentorDonationCredits",
    creditKind: "mentor-monthly-check-in",
    requires: ["mentor", "board-member"],
  },
  "schedule-check-in": {
    field: "checkInCredits",
    creditKind: "intern-check-in",
    requires: ["intern"],
  },
  "give-intern-credit": {
    field: "internGiveawayCredits",
    creditKind: "intern-give-away",
    requires: ["intern"],
  },
};

function clean(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function canUseAction(action, roles) {
  if (["pass-demo", "fail-demo"].includes(action)) return hasRole(roles, "board-member");
  if (["donate-credit", "offer-mentor"].includes(action)) return hasRole(roles, "mentor") || hasRole(roles, "board-member");
  if (["schedule-check-in", "give-intern-credit", "become-mentor"].includes(action)) return hasRole(roles, "intern");
  if (action === "report-problem") return roles.length > 0;
  return false;
}

function freshAccount(current, roles) {
  const nowMonth = monthKey();
  const base = {
    mentorDonationCredits: Number(current.mentorDonationCredits || 0),
    internGiveawayCredits: Number(current.internGiveawayCredits || 0),
    checkInCredits: Number(current.checkInCredits || 0),
    monthKey: current.monthKey || nowMonth,
  };

  if (base.monthKey !== nowMonth) {
    base.monthKey = nowMonth;
    base.mentorDonationCredits = hasRole(roles, "mentor") || hasRole(roles, "board-member") ? 2 : 0;
    base.internGiveawayCredits = hasRole(roles, "intern") ? 1 : 0;
  }

  if (!current.createdAt) {
    base.mentorDonationCredits = Math.max(base.mentorDonationCredits, hasRole(roles, "mentor") || hasRole(roles, "board-member") ? 2 : 0);
    base.internGiveawayCredits = Math.max(base.internGiveawayCredits, hasRole(roles, "intern") ? 1 : 0);
  }

  return base;
}

async function handleCreditAction(tx, refs, user, roles, payload, config) {
  const accountSnap = await tx.get(refs.accountRef);
  const account = freshAccount(accountSnap.exists ? accountSnap.data() : {}, roles);
  const balance = Number(account[config.field] || 0);
  if (balance <= 0) {
    const error = new Error("No credits left for that action.");
    error.statusCode = 409;
    throw error;
  }

  account[config.field] = balance - 1;
  tx.set(refs.accountRef, {
    ...account,
    uid: user.uid,
    email: user.email || "",
    roles,
    updatedAt: FieldValue.serverTimestamp(),
    ...(accountSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  tx.set(refs.ledgerRef, {
    action: payload.action,
    creditKind: config.creditKind,
    creditDelta: -1,
    actorUid: user.uid,
    actorEmail: user.email || "",
    actorRoles: roles,
    internId: payload.internId,
    internName: payload.internName,
    sourcePage: payload.sourcePage,
    status: "recorded",
    createdAt: FieldValue.serverTimestamp(),
  });

  return account;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
  try {
    blockWritesIfDisabled();
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }

  let verified;
  try {
    verified = await requireUser(event);
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid dashboard payload." });
  }

  const payload = {
    action: clean(body.action, 80),
    internId: clean(body.internId, 120),
    internName: clean(body.internName, 180),
    sourcePage: clean(body.sourcePage, 120),
  };

  if (!VALID_ACTIONS.includes(payload.action)) return json(400, { error: "Unknown dashboard action." });
  if (!canUseAction(payload.action, verified.roles)) return json(403, { error: "This role cannot use that dashboard action." });

  const database = db();
  const user = {
    uid: verified.decodedToken.uid,
    email: verified.decodedToken.email || "",
  };
  const actionRef = database.collection("dashboardActions").doc();
  const ledgerRef = database.collection("creditLedger").doc();
  const accountRef = database.collection("creditAccounts").doc(user.uid);

  try {
    const result = await database.runTransaction(async (tx) => {
      const refs = { actionRef, ledgerRef, accountRef };
      let balances = null;
      const creditConfig = CREDIT_ACTIONS[payload.action];
      if (creditConfig) {
        balances = await handleCreditAction(tx, refs, user, verified.roles, payload, creditConfig);
      }

      tx.set(actionRef, {
        ...payload,
        authUid: user.uid,
        authEmail: user.email,
        actorRoles: verified.roles,
        creditKind: creditConfig ? creditConfig.creditKind : "",
        creditDelta: creditConfig ? -1 : 0,
        status: "recorded",
        createdAt: FieldValue.serverTimestamp(),
      });

      return balances;
    });

    return json(200, {
      ok: true,
      actionId: actionRef.id,
      roles: verified.roles,
      balances: result,
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Dashboard action could not be recorded." });
  }
};

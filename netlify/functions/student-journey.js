const {
  FieldValue,
  blockWritesIfDisabled,
  db,
  json,
  requireUser,
} = require("./_firebase-admin");
const {
  defaultJourney,
  emailDocId,
  normalizeEmail,
  stepMapFrom,
  stepsFrom,
} = require("./_founder-journey");

function responseFor(doc, fallback) {
  const data = doc && doc.exists ? doc.data() : fallback;
  const steps = stepsFrom(data.steps);
  return {
    ok: true,
    journey: {
      email: normalizeEmail(data.email || fallback.email),
      name: data.name || fallback.name || "",
      status: data.status || "applicant",
      steps,
      completedCount: steps.filter((step) => step.done).length,
      totalCount: steps.length,
    },
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (!["GET", "POST", "PUT"].includes(event.httpMethod)) return json(405, { error: "Use GET or POST." });

  let verified;
  try {
    verified = await requireUser(event);
  } catch (error) {
    return json(error.statusCode || 401, { error: error.message || "Sign in before continuing." });
  }

  const email = normalizeEmail(verified.decodedToken.email);
  if (!email) return json(400, { error: "Signed-in account is missing an email address." });

  const journeyId = emailDocId(email);
  const ref = db().collection("studentJourneys").doc(journeyId);
  const fallback = defaultJourney({
    email,
    name: verified.decodedToken.name || "",
  });

  if (event.httpMethod === "GET") {
    try {
      const snapshot = await ref.get();
      return json(200, responseFor(snapshot, fallback));
    } catch (error) {
      return json(error.statusCode || 500, { error: error.message || "Could not load journey." });
    }
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid journey payload." });
  }

  try {
    blockWritesIfDisabled();
    const snapshot = await ref.get().catch(() => ({ exists: false, data: () => ({}) }));
    const existing = snapshot.exists ? snapshot.data() : fallback;
    let nextInput = payload.steps || existing.steps;
    if (payload.stepId) {
      const nextMap = stepMapFrom(existing.steps);
      nextMap[String(payload.stepId)] = payload.done === true;
      nextInput = nextMap;
    }
    const stepMap = stepMapFrom(nextInput);
    await ref.set({
      email,
      name: existing.name || fallback.name || "",
      status: existing.status || "applicant",
      steps: stepMap,
      authUid: verified.decodedToken.uid || "",
      source: "student-journey",
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing.createdAt || FieldValue.serverTimestamp(),
    }, { merge: true });

    const updated = await ref.get().catch(() => ({ exists: true, data: () => ({ ...existing, steps: stepMap }) }));
    return json(200, responseFor(updated, fallback));
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || "Could not save journey." });
  }
};

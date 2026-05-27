const Stripe = require("stripe");
const {
  FieldValue,
  blockWritesIfDisabled,
  db,
  json,
} = require("./_firebase-admin");

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function rawBody(event) {
  if (event.isBase64Encoded) return Buffer.from(event.body || "", "base64");
  return event.body || "";
}

async function reconcileCheckoutCompleted(session) {
  const database = db();
  const paymentId = session.metadata && session.metadata.paymentId;
  if (!paymentId) return;

  const paymentRef = database.collection("payments").doc(paymentId);
  const paymentSnap = await paymentRef.get();
  const payment = paymentSnap.exists ? paymentSnap.data() : {};
  const authUid = session.metadata.authUid || payment.authUid || "";
  const authEmail = session.metadata.authEmail || payment.authEmail || "";
  const kind = session.metadata.kind || payment.kind || "";

  await database.runTransaction(async (tx) => {
    tx.set(paymentRef, {
      status: "paid",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: session.payment_intent || "",
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const ledgerRef = database.collection("creditLedger").doc();
    if (kind === "check-in" && authUid) {
      const accountRef = database.collection("creditAccounts").doc(authUid);
      tx.set(accountRef, {
        uid: authUid,
        email: authEmail,
        checkInCredits: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(ledgerRef, {
        action: "payment-credit",
        creditKind: "paid-check-in",
        creditDelta: 1,
        actorUid: authUid,
        actorEmail: authEmail,
        paymentId,
        stripeCheckoutSessionId: session.id,
        status: "recorded",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (kind === "sponsor-credit") {
      const poolRef = database.collection("creditPools").doc("sponsored-check-ins");
      tx.set(poolRef, {
        availableCredits: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(ledgerRef, {
        action: "sponsor-credit",
        creditKind: "sponsored-check-in",
        creditDelta: 1,
        actorUid: authUid,
        actorEmail: authEmail,
        paymentId,
        stripeCheckoutSessionId: session.id,
        status: "pooled",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
  try {
    blockWritesIfDisabled();
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) return json(500, { error: "Stripe webhook secret is not configured." });

  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  let stripeEvent;
  try {
    stripeEvent = stripeClient().webhooks.constructEvent(rawBody(event), signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return json(400, { error: `Webhook signature verification failed: ${error.message}` });
  }

  try {
    if (stripeEvent.type === "checkout.session.completed") {
      await reconcileCheckoutCompleted(stripeEvent.data.object);
    }
    return json(200, { received: true });
  } catch (error) {
    return json(500, { error: error.message || "Webhook reconciliation failed." });
  }
};

const Stripe = require("stripe");
const {
  FieldValue,
  auth,
  blockWritesIfDisabled,
  db,
  json,
  rolesFromClaims,
} = require("./_firebase-admin");

const CHECKOUT_ITEMS = {
  "check-in": {
    name: "Skilf monthly check-in",
    description: "One 15-minute monthly check-in review",
    amount: 10000,
    requiresSignIn: true,
  },
  "demo-day": {
    name: "Skilf Demo Day",
    description: "Demo Day review after passing check-in #4",
    amount: 50000,
    requiresSignIn: true,
  },
  "sponsor-credit": {
    name: "Sponsor one Skilf check-in credit",
    description: "Funds one intern monthly check-in credit",
    amount: 10000,
    requiresSignIn: false,
  },
};

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY in Netlify.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function optionalUser(event, requiresSignIn) {
  const value = (event.headers || {}).authorization || (event.headers || {}).Authorization || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : "";
  if (!token) {
    if (requiresSignIn) {
      const error = new Error("Sign in before paying for a check-in or Demo Day.");
      error.statusCode = 401;
      throw error;
    }
    return { decodedToken: null, roles: [] };
  }
  const decodedToken = await auth().verifyIdToken(token, true);
  return { decodedToken, roles: rolesFromClaims(decodedToken) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    blockWritesIfDisabled();
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const item = CHECKOUT_ITEMS[payload.kind];
  if (!item) return json(400, { error: "Unknown checkout kind" });

  let verified;
  try {
    verified = await optionalUser(event, item.requiresSignIn);
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }

  let paymentRef = null;
  try {
    paymentRef = db().collection("payments").doc();
  } catch (error) {
    return json(500, { error: error.message });
  }

  const origin = event.headers.origin || process.env.URL || "http://localhost:3999";
  const authUid = verified.decodedToken ? verified.decodedToken.uid : "";
  const authEmail = verified.decodedToken ? verified.decodedToken.email || "" : "";

  await paymentRef.set({
    kind: payload.kind,
    amount: item.amount,
    currency: "usd",
    status: "checkout_created",
    authUid,
    authEmail,
    actorRoles: verified.roles,
    internId: String(payload.internId || ""),
    source: "stripe-checkout",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/thanks.html?payment=success&paymentId=${paymentRef.id}`,
      cancel_url: `${origin}/payments.html?payment=cancelled&paymentId=${paymentRef.id}`,
      customer_email: authEmail || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: item.amount,
          product_data: {
            name: item.name,
            description: item.description,
          },
        },
      }],
      metadata: {
        paymentId: paymentRef.id,
        kind: payload.kind,
        authUid,
        authEmail,
        internId: String(payload.internId || ""),
      },
    });

    await paymentRef.set({
      stripeCheckoutSessionId: session.id,
      status: "checkout_opened",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return json(200, { id: session.id, url: session.url, paymentId: paymentRef.id });
  } catch (error) {
    await paymentRef.set({
      status: "checkout_failed",
      error: error.message || "Stripe checkout failed",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return json(502, { error: error.message || "Stripe checkout failed" });
  }
};

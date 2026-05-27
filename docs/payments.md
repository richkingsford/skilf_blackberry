# Payments

Skilf uses a lightweight Stripe Checkout scaffold for program fees:

- `$100` monthly check-in
- `$500` Demo Day
- `$100` sponsored check-in credit

The browser calls `/.netlify/functions/create-checkout-session`, and the Netlify Function calls Stripe with `STRIPE_SECRET_KEY`. No card data touches the static site. Stripe then calls `/.netlify/functions/stripe-webhook`, which verifies `STRIPE_WEBHOOK_SECRET` before updating Firestore payment and credit records.

## Environment

Set these in Netlify:

- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: signing secret for the Stripe webhook endpoint
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase Admin service account JSON, or the split Firebase Admin env vars listed in `SETUP.md`
- `URL`: Netlify normally sets this; used for checkout success and cancel URLs

## Firestore reconciliation

- `payments/{paymentId}` is created before Checkout opens.
- `stripe-webhook` marks the payment `paid` after `checkout.session.completed`.
- A paid `check-in` adds 1 `checkInCredits` credit to the signed-in user's `creditAccounts/{uid}`.
- A paid `sponsor-credit` adds 1 credit to `creditPools/sponsored-check-ins`.
- Demo Day payments are marked paid but do not mint check-in credits.

## Nonprofit handling

Treat check-ins and Demo Day as program fees unless counsel says otherwise. Treat gifts, scholarships, and sponsored credits as donations only when nonprofit status, receipt language, and accounting are ready.

Stripe may offer nonprofit discounted pricing for eligible organizations, but the organization must apply and the discount may depend on transaction type. Keep donation flows separate from earned program fees.

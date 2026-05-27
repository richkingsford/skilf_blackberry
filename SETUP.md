# Skilf Deployment Setup

## Netlify form email

The old Google Form links now point to `apply.html`, which contains a Netlify form named `skilf-application`.

After deploying from GitHub:

1. Open Netlify site dashboard.
2. Go to Forms and confirm `skilf-application` appears after the first submission.
3. Add an email notification for `skilf-application`.
4. Send notifications to `richkingsford@gmail.com`.

Netlify captures the form without a custom backend. The recipient cannot be fully enforced from static HTML, so the email notification is the one dashboard step still required.

## Firebase Google login and Firestore

1. Create or open a Firebase project at `https://console.firebase.google.com/`.
2. In Project settings, add a Web app and copy its Firebase config object.
3. Paste the values into `firebase-config.js`.
   Required for this site: `apiKey`, `authDomain`, `projectId`, and `appId`.
   Optional but fine to paste too: `storageBucket`, `messagingSenderId`, and `measurementId`.
   Firebase web config values identify the app; they are not passwords. Keep Firestore locked down with rules, and review Firebase API key restrictions in Google Cloud.
4. In Build > Authentication > Sign-in method, enable Google.
5. In Build > Authentication > Settings > Authorized domains, add every domain that will show the Sign in button:
   - `localhost`
   - `127.0.0.1`
   - your Netlify domain, for example `skilf.netlify.app`
   - any custom production domain
6. In Build > Firestore Database, create a database.
7. Deploy the repo-owned Firestore rules and indexes:
   ```bash
   npm run firebase:login
   npm run firebase:deploy-db
   ```
8. Run the site locally with `npm run serve:workspace` and open `http://localhost:3999/index.html`.
9. Click Sign in. After Google sign-in succeeds, the nav should show your profile chip.

The application form saves signed-in submissions to the `people` collection with `role` values of `intern`, `scholarship`, `board-member`, `mentor`, `hire`, or `feedback`. Netlify form capture still works if Firebase is not configured yet.

Signed-in users also get a private `userProfiles/{uid}` document with registered roles of `intern`, `mentor`, or `board-member`. Roles are now authority-backed by Firebase custom claims or the verified owner email rule for `richkingsford@gmail.com`; public form submissions only create requested roles. Homepage and interns-page card messages save to the `messages` collection only for users with registered authority. The structure is documented in `docs/firestore-schema.md`.

Dashboard actions call `netlify/functions/record-dashboard-action.js`, which verifies the Firebase ID token with Firebase Admin, enforces role-specific authority, records `dashboardActions`, and updates the server-side credit ledger. `richkingsford@gmail.com` has admin, board-member, mentor, and intern authority by verified owner email and can be permanently granted those custom claims with `npm run firebase:bootstrap-rich`.

Calendly links now use the production scheduling link `https://calendly.com/richkingsford/30m` with Skilf tracking parameters.

Payments use the `payments.html` page, `netlify/functions/create-checkout-session.js`, and `netlify/functions/stripe-webhook.js`. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and Firebase Admin credentials in Netlify before checkout and reconciliation will work. See `docs/payments.md`.

If sign-in says `This domain is not authorized in Firebase Authentication`, add the exact host you are using to Authorized domains. For local testing, `localhost` and `127.0.0.1` are different hosts.

## Homepage card message email

The card Send buttons call `netlify/functions/send-message.js` after Firebase saves the signed-in user's message. The function verifies the Firebase ID token server-side, requires an active registered `intern`, `mentor`, or `board-member` role, then emails the message to `richkingsford@gmail.com`.

Required email values in `.env.local`:

```bash
RESEND_API_KEY=your_resend_api_key
MESSAGE_TO_EMAIL=richkingsford@gmail.com
MESSAGE_FROM_EMAIL=Skilf <sender@your-verified-domain.example>
```

The sender in `MESSAGE_FROM_EMAIL` must be verified in Resend. For production, prefer a Skilf-owned verified domain or sender instead of Resend's onboarding sender. The same `.env.local` file also needs Firebase Admin, Firebase web API, `ADMIN_ROLE_TOKEN`, and `SKILF_ALLOW_WRITES` values because production email authorization is role-backed.

Before pushing anything to Netlify, run:

```bash
npm run production:env-check
npm run production:email-smoke
```

If both pass and the smoke-test email arrives, push the email environment variables and deploy:

```bash
npm run production:set-email-env
npm run production:deploy
npm run production:message-smoke
```

Then confirm the direct Resend smoke email and the production message smoke email arrived at `richkingsford@gmail.com`.

## Server authority and payments

Netlify Functions that verify roles, record credit movement, set custom claims, or reconcile payments need Firebase Admin credentials. Add one of these shapes in Netlify:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

or:

```bash
FIREBASE_PROJECT_ID=skilf-9f736
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@skilf-9f736.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Role administration:

```bash
ADMIN_ROLE_TOKEN=long-random-admin-token
```

Stripe:

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

After credentials are present, run this once from a trusted shell to permanently grant Rich all test/owner roles:

```bash
npm run firebase:bootstrap-rich
```

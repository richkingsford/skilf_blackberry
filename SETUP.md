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

The application form saves signed-in submissions to the `people` collection with `role` values of `intern`, `scholarship`, `board-member`, or `mentor`. Netlify form capture still works if Firebase is not configured yet.

Homepage card messages save to the `messages` collection. The structure is documented in `docs/firestore-schema.md`.

If sign-in says `This domain is not authorized in Firebase Authentication`, add the exact host you are using to Authorized domains. For local testing, `localhost` and `127.0.0.1` are different hosts.

## Homepage card message email

The card Send buttons call `netlify/functions/send-message.js` after Firebase saves the signed-in user's message. The function verifies the Firebase ID token server-side, then emails the message to `richkingsford@gmail.com`.

In Netlify, add this environment variable:

```bash
RESEND_API_KEY=your_resend_api_key
```

Optional overrides:

```bash
MESSAGE_TO_EMAIL=richkingsford@gmail.com
MESSAGE_FROM_EMAIL=Skilf <onboarding@resend.dev>
FIREBASE_WEB_API_KEY=your_firebase_web_api_key
```

The Firebase web API key is already in the function as a non-secret fallback, so the only required email setting is `RESEND_API_KEY`.

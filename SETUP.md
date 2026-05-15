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

1. Create or open a Firebase project.
2. Add a Web app and copy its config.
3. Paste the values into `firebase-config.js`.
4. In Firebase Authentication, enable Google as a sign-in provider.
5. In Firestore Database, create a database.
6. Publish the rules in `firestore.rules`.
7. Add the deployed domain, such as `skilf.netlify.app`, to Authentication > Settings > Authorized domains.

The application form saves signed-in submissions to the `people` collection with `role` values of `student`, `panelist`, or `sponsor`. Netlify form capture still works if Firebase is not configured yet.

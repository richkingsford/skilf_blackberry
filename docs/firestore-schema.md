# Firestore Schema

This repo treats Firestore as an intake database for the public site, plus server-authoritative role, payment, and credit records.

## Collections

### `people`

Created when a signed-in user submits the application form.

Fields:

- `role`: `intern`, `scholarship`, `board-member`, `mentor`, `hire`, or `feedback`
- `name`
- `email`
- `project`
- `message`
- `kind`
- `source`: `skilf-site`
- `authUid`: Firebase Auth user ID
- `authEmail`: Firebase Auth user email
- `createdAt`: server timestamp

Public clients may create documents only for their own authenticated user. Public clients cannot read, update, or delete documents.

If the role is `intern`, `mentor`, or `board-member`, the app saves that intent as a requested role. It does not grant authority. Feedback submissions are organization-directed intake and are not sent to an intern, mentor, or board member.

### `userProfiles`

Created or updated when an authenticated user signs in or submits a role-bearing application.

Fields:

- `uid`: Firebase Auth user ID
- `email`
- `displayName`
- `photoURL`
- `roles`: any of `admin`, `intern`, `mentor`, or `board-member`, copied only from Firebase custom claims or the verified owner email rule
- `suspendedRoles`: roles preserved for review while a suspended account has active authority removed
- `requestedRoles`: roles or intents the user asked for through the public form
- `primaryRole`
- `isRegistered`: `true` when `roles` has at least one registered role
- `status`: `active` or `suspended` when set by admin tooling
- `suspended`, `suspendedReason`, `suspendedAt`, `suspendedByEmail`, `suspendedByUid`
- `reinstatedAt`, `reinstatedByEmail`, `reinstatedByUid`
- `authoritySource`: `custom-claims`, `owner-email`, or `none`
- `source`: `skilf-site`
- `createdAt`: server timestamp
- `updatedAt`: server timestamp

`richkingsford@gmail.com` has admin, board-member, mentor, and intern authority when the Firebase ID token has that verified email, and can also be granted those custom claims with `npm run firebase:bootstrap-rich`. Public clients may read, create, or update only their own profile document, and Firestore rules reject any role that is not backed by custom claims or the verified owner email. Public clients cannot edit suspension fields that were set by admin tooling.

### `messages`

Created when a signed-in user presses `Send` on an expert or partner card.

Fields:

- `targetType`: `expert` or `partner`
- `targetName`
- `targetField`
- `targetProject`
- `message`
- `source`: `skilf-homepage-card`
- `authUid`: Firebase Auth user ID
- `authEmail`: Firebase Auth user email
- `senderRoles`: registered sender roles copied from `userProfiles/{uid}`
- `createdAt`: server timestamp

Public clients may create documents only for their own authenticated user, and only when that user has an `intern`, `mentor`, or `board-member` role in `userProfiles/{uid}`. Public clients cannot read, update, or delete documents.

### `dashboardActions`

Created by `netlify/functions/record-dashboard-action.js` after Firebase Admin verifies the ID token and role authority.

Fields:

- `action`: one of `donate-credit`, `offer-mentor`, `report-problem`, `pass-demo`, `fail-demo`, `schedule-check-in`, `give-intern-credit`, or `become-mentor`
- `internId`
- `internName`
- `creditKind`: present for credit-moving actions
- `creditDelta`: `-1` when a dashboard action spends or donates one credit
- `sourcePage`
- `authUid`: Firebase Auth user ID
- `authEmail`: Firebase Auth user email
- `actorRoles`: registered sender roles copied from `userProfiles/{uid}`
- `createdAt`: server timestamp

Public clients cannot create these directly. Board-only actions such as `pass-demo` and `fail-demo` are enforced by the Netlify Function and Firestore rules block direct client writes.

### `creditAccounts`

Created and updated only by server functions.

Fields:

- `uid`
- `email`
- `roles`
- `monthKey`
- `mentorDonationCredits`: monthly credits mentors and board members may donate
- `internGiveawayCredits`: monthly credit interns may give another intern
- `checkInCredits`: spendable check-in credits owned by the user
- `createdAt`
- `updatedAt`

Clients may read only their own account. Clients cannot create, update, or delete credit accounts.

### `creditLedger`

Append-only server ledger for credit movement.

Fields:

- `action`
- `creditKind`
- `creditDelta`
- `actorUid`
- `actorEmail`
- `actorRoles`
- `internId`
- `internName`
- `paymentId`
- `stripeCheckoutSessionId`
- `status`
- `createdAt`

Public clients cannot read or write the ledger.

### `payments`

Created by `create-checkout-session` and reconciled by `stripe-webhook`.

Fields:

- `kind`: `check-in`, `demo-day`, or `sponsor-credit`
- `amount`
- `currency`
- `status`: `checkout_created`, `checkout_opened`, `checkout_failed`, or `paid`
- `authUid`
- `authEmail`
- `actorRoles`
- `stripeCheckoutSessionId`
- `stripePaymentIntentId`
- `paidAt`
- `createdAt`
- `updatedAt`

Clients may read their own payment records. Clients cannot write payment records.

### `creditPools`

Server-only pooled sponsored credits, currently `creditPools/sponsored-check-ins`.

### `roleAudit`

Server-only role grant, suspension, and reinstatement audit trail written by `admin-set-user-roles` or `bootstrap-rich-authority`.

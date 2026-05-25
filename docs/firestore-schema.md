# Firestore Schema

This repo treats Firestore as an intake database for the public site, plus a small authenticated user profile for registration roles.

## Collections

### `people`

Created when a signed-in user submits the application form.

Fields:

- `role`: `intern`, `scholarship`, `board-member`, `mentor`, or `hire`
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

If the role is `intern`, `mentor`, or `board-member`, the app also syncs the user's registration role into `userProfiles/{uid}`.

### `userProfiles`

Created or updated when an authenticated user signs in or submits a role-bearing application.

Fields:

- `uid`: Firebase Auth user ID
- `email`
- `displayName`
- `photoURL`
- `roles`: any of `intern`, `mentor`, or `board-member`
- `primaryRole`
- `isRegistered`: `true` when `roles` has at least one registered role
- `source`: `skilf-site`
- `createdAt`: server timestamp
- `updatedAt`: server timestamp

For temporary testing, `richkingsford@gmail.com` is seeded as `mentor` when that account signs in. Public clients may read, create, or update only their own profile document.

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

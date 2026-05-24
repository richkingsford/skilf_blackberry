# Firestore Schema

This repo treats Firestore as an append-only intake database for the public site.

## Collections

### `people`

Created when a signed-in user submits the application form.

Fields:

- `role`: `intern`, `scholarship`, `board-member`, or `mentor`
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
- `createdAt`: server timestamp

Public clients may create documents only for their own authenticated user. Public clients cannot read, update, or delete documents.

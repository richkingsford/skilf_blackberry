# Production smoke checklist

Run this after each production deploy:

```bash
npm run production:smoke
```

When you intentionally want to send the live message/email smoke, run:

```bash
npm run production:smoke -- --live-message
```

The automated script verifies public production pages and can trigger the existing signed Rich message smoke. Finish the run with these browser checks:

- Sign out and sign back in on production as `richkingsford@gmail.com`.
- Confirm Rich can see Admin, Intern Dashboard, Board Dashboard, and Mentor Dashboard in the footer and profile menu.
- Confirm Rich lands on or can access the Board Member dashboard.
- Send one homepage card message and confirm Firestore plus email delivery.
- Send one Interns page message and confirm Firestore plus email delivery.
- Use one board pass/fail action and confirm only board-authorized Rich can do it.
- Confirm a non-board test account cannot pass/fail.
- When payments reopen, run one Stripe test checkout and verify webhook reconciliation.

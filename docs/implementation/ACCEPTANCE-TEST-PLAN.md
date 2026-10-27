# Acceptance Test Plan

Environments: a Supabase branch for staging (create_branch), a Vercel preview, then production with dedicated test accounts (A and B), plus an admin account. Expensive provider calls use the shortest and cheapest settings and run only with a recorded spend approval.

Evidence rule: every check records proof (SQL output, screenshot, request ID). Mocked or unit-only results don't count as "verified".

## P1: Security hotfix
- [ ] anon `POST /rest/v1/rpc/refund_credits` returns permission denied
- [ ] authenticated user A calling `rpc/refund_credits` for themselves is denied
- [ ] A: `profiles.update({plan:'pro'})` is rejected, `update({display_name})` succeeds
- [ ] advisors(security): no 0028/0029 for the credit functions
- [ ] Existing pages (marketing, app shell, Gen Studio) load with no console errors
- [ ] Simulated features are visibly labelled; Connections show "Coming soon"

## P2: Shared backend
- [ ] Upload of a 200 MB MP4 resumes after a network drop; a disallowed MIME is rejected
- [ ] A cannot read B's object by path or signed URL
- [ ] The same Idempotency-Key twice gives 1 job, 1 hold
- [ ] Provider 500 leads to retries with backoff, then failed; ledger hold − release = 0
- [ ] Cancel while running gives cancelled status and the hold is released
- [ ] Tab closed mid-job, reopened: the job finished, the output is in Storage
- [ ] Ledger sum equals profiles.credits_balance for all users (SQL check)
- [ ] An image generation stores an asset in Storage, not a data URL

## P3: Clipping (Ssemble)
- [ ] A real YouTube 10-min source gives ≥1 clip, playable from a Cloudnivo signed URL
- [ ] title, reason, score and timestamps stored; matches the GET /shorts/:id payload
- [ ] An upload source via signed fileUrl works
- [ ] A Shorts URL or invalid URL fails immediately with no charge
- [ ] A 45-min range gives 3 requests (≤1200 s each), and the progress aggregates
- [ ] Ssemble 429 gives backoff and an eventual success
- [ ] Deleting a clip set calls Ssemble DELETE and removes the Storage objects
- [ ] 3 concurrent jobs from 2 users are all correct, with no cross-user data

## P4: Generation
- [ ] One real image and one real video per enabled model family
- [ ] The cost preview equals the settled ledger amount
- [ ] Image-to-video with an uploaded reference works
- [ ] Ad variants (N=3): one approval, 3 jobs, total charged = the sum
- [ ] A missing provider secret gives PROVIDER_NOT_CONFIGURED with no hold

## P5: Long-form
- [ ] A 60–90 s video renders end to end (VO, visuals, music, captions)
- [ ] A step cannot start before its dependency succeeds
- [ ] Regenerating one scene re-renders only that scene's charge
- [ ] Browser closed during the render: it finishes and is visible later
- [ ] A cancelled render releases its credits
- [ ] The render worker rejects calls without the shared secret

## P6: Publishing
- [ ] OAuth connect and disconnect for YouTube and TikTok; tokens are stored in Vault only
- [ ] An unlisted YouTube upload succeeds and the URL is stored
- [ ] A TikTok post (private/sandbox) succeeds
- [ ] Expired token: refresh, or the `auth_expired` error with a reconnect prompt
- [ ] A scheduled post fires within 2 min of its time; retry works

## P7: Payments/admin
- [ ] Stripe test checkout: the webhook grants the plan and credits; no client path can do the same
- [ ] An invalid webhook signature gives 400
- [ ] Subscription cancel: downgrade at period end
- [ ] An admin ledger adjustment is written to audit_events with the actor and reason

## P9: Release
- [ ] Playwright suite green at 375/768/1280
- [ ] `grep -r "sk_\|tgk_\|service_role" dist/` is empty
- [ ] Load: 20 concurrent jobs, no double charge (ledger audit)
- [ ] Rollback rehearsed: tag plus DB restore point documented

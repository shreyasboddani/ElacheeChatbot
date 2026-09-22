# Knowledge automation setup and operations

The automation keeps all Gemini credentials in Vercel only. GitHub Actions crawls and validates public website content without any Gemini or Vercel secret. Production deployments validate and build the app; a protected Vercel Cron job uses Vercel's server-side configuration to reconcile Gemini File Search after deployment.

## Workflow sequence

1. `Detect and commit website knowledge updates` runs daily, manually, or from an approved CMS webhook.
2. It crawls only public Elachee pages, rejects off-domain fetch and redirect targets, revalidates every previously approved URL first, preserves unchanged timestamps, prepares the corpus, and runs the knowledge verifier.
3. Failed, incomplete, redirected, missing, or suspiciously shrunken approved pages retain their last-known-good documents and appear in `retainedPages`. A permanent removal requires a canonical URL already committed to `knowledge/source/approved-removals.json` after human review.
4. Optional Elachee staff FAQ and official-document sources are kept outside the public-site crawl; the website crawler neither invents nor removes them.
5. If deterministic crawl health and prepared retrieval content are unchanged, the workflow creates no commit. No Vercel deployment or Gemini request occurs.
6. If content changed, GitHub verifies that only generated files changed, rejects tracked or newly created staff-FAQ changes, counts tracked and untracked prepared documents toward the 20-document automatic limit, and runs all tests, lint, production build, and diff checks. Every deletion must be a website Markdown document and stay within a separate five-document automatic-removal cap.
7. Immediately before committing, it fetches `origin/main`. If `main` advanced during validation, it exits instead of rebasing or overwriting newer work. Otherwise, the knowledge bot creates a normal commit directly on `main` and pushes without force.
8. Vercel's Git integration starts a Production deployment for the new `main` commit. `vercel.json` selects `npm run build:vercel`.
9. The production build verifies the committed corpus and runs `next build`; it never waits for Gemini indexing or requires a Gemini key.
10. Vercel Cron invokes `/api/knowledge/sync` daily. The protected route uses only Vercel's `GEMINI_API_KEY` and `GEMINI_FILE_SEARCH_STORE`, starts missing replacements without waiting for indexing, and deletes stale managed copies only on a later run after every replacement is active. Preview and Development builds never mutate Gemini.

The GitHub workflow never receives, references, or logs the Gemini key. Crawl timestamps remain in audit data and the source manifest but are omitted from retrieval text, preventing timestamp-only changes from consuming indexing quota.

## One-time configuration

### GitHub

1. In **Settings -> Actions -> General -> Workflow permissions**, allow read and write access so the workflow can push its bounded generated commit to `main`.
2. If `main` is protected, allow this workflow to push only after its repository safety gate succeeds. Never enable force pushes.
3. Do not add `GEMINI_API_KEY`, `GEMINI_FILE_SEARCH_STORE`, or a Vercel Deploy Hook to GitHub. They are unnecessary for this design.

### Vercel

Add these values to the Vercel **Production** environment:

| Kind | Name | Purpose |
| --- | --- | --- |
| Sensitive | `GEMINI_API_KEY` | Server-side Gemini authentication for Cron synchronization and runtime answers. |
| Variable | `GEMINI_FILE_SEARCH_STORE` | Stable existing `fileSearchStores/...` resource name. |
| Variable | `GEMINI_MODEL` | Runtime chat model, currently `gemini-3.5-flash-lite`. |
| Variable | `NEXT_PUBLIC_SITE_URL` | Stable public deployment origin. |
| Sensitive | `CRON_SECRET` | Random value (16+ characters) used only by Vercel to authorize `/api/knowledge/sync`. |

The key must never use the `NEXT_PUBLIC_` prefix. Vercel makes environment variables available during builds and Function execution, while keeping sensitive values outside repository files. Variable changes apply only to new deployments.

Vercel automatically sends `CRON_SECRET` as the authorization header for the configured daily Cron invocation. The Gemini key must never use the `NEXT_PUBLIC_` prefix and is never added to GitHub. Changing the Gemini key or store in Vercel takes effect after the next production deployment, with no GitHub secret or workflow change required.

## Initial and periodic checks

1. Push the automation and verified corpus to `main`.
2. Confirm the Vercel Production build log runs `knowledge:verify` and then `next build` without a File Search synchronization step.
3. Confirm the Vercel Cron Job at `/api/knowledge/sync` reports `indexing` or `synchronized`; a later run removes stale managed copies after pending replacements become active.
4. Run **Actions -> Detect and commit website knowledge updates -> Run workflow**.
5. Confirm an unchanged crawl completes without creating a commit.
6. Confirm the deployed `/api/health`, one grounded question, one follow-up, source cards, and a contact fallback.

## Permanent page removal

The crawler never infers that approved information should be deleted. HTTP errors, empty responses, redirects, extraction shrinkage, discovery gaps, and crawl-capacity issues retain the last-known-good page. If Elachee intentionally and permanently removes a page:

1. Verify the old URL and any replacement in a normal browser.
2. Check that no unique policy, schedule, eligibility rule, address, contact, or service detail would be lost.
3. Add the canonical URL to `knowledge/source/approved-removals.json` in a human-authored, reviewed commit.
4. Run the refresh workflow and inspect the resulting deletion and Vercel synchronization log.

Removal approvals accept only canonical public `elachee.org` HTML routes. The public-site workflow never edits this allowlist or any staff FAQ approval file.

## Immediate CMS-triggered refresh

If Elachee's website platform supports outgoing webhooks, configure a trusted integration to send the GitHub `repository_dispatch` event type `elachee-website-updated`. Its credential should have only permission to dispatch the workflow. The same crawl, change cap, tests, and main-race check apply.

Without a webhook, GitHub checks daily at 09:17 UTC. It must fetch the public site to discover updates, but an unchanged check creates no commit and therefore no deployment or Gemini request. Scheduled jobs can be delayed, so this provides eventual rather than exact-time synchronization.

## Manual commands

```bash
npm run knowledge:refresh
npm run knowledge:sync -- --reconcile
npm run knowledge:sync -- --reconcile --apply
```

The first command needs no Gemini key. The second previews remote changes using the locally configured key. The third applies a reviewed plan.

For a new Gemini project or intentional blue/green rebuild only:

```bash
npm run knowledge:sync -- --new-store
```

Update Vercel's store variable after verifying a new store. Keep the previous store until the replacement deployment passes acceptance testing.

## Failure and rollback behavior

- No meaningful website change: no commit, deployment, or Gemini request.
- Crawl, extraction, corpus, prompt-injection, test, lint, build, or diff failure in GitHub: no commit or deployment.
- More than 20 changed prepared documents, more than five removals, a non-website deletion, or a deletion without an exact human-approved removal: no commit; manual inspection is required.
- Approved-page fetch or suspicious shrink failure: retain last-known-good content and record the warning.
- Staff FAQ or out-of-boundary file change: no commit.
- `main` advances during validation: no push; the next run starts from the new revision.
- Missing Vercel Gemini configuration: deployment still succeeds, while the protected Cron job returns a retriable failure and the existing File Search store remains untouched.
- Unmanaged Gemini documents: reconciliation aborts before mutation.
- Upload failure: every pre-existing remote document remains. A successfully uploaded replacement may remain as a safe duplicate for the next retry.
- Upload transport accepts only `fileSearchStores/...` resources and the exact HTTPS `generativelanguage.googleapis.com` upload host. The Gemini key is sent only in the upload-session header, never in a URL, document body, report, or log.
- Transient upload, deletion, quota, and network failures are retried with bounded backoff; logs and reports contain only sanitized error name/status/code metadata.
- Replacement cleanup is recalculated from the live store after upload, so stale copies are deleted only after every desired replacement is active and no unmanaged document is present.
- Deletion failure: the new document remains indexed and the stale copy is reported for retry.
- Next build failure after a successful sync: the previous deployment remains live; the store may be one verified commit ahead and the next production build safely reconciles it again.
- Bad automated content discovered later: revert the knowledge commit and redeploy. The old File Search store itself is never automatically deleted.

File Search store deletion is always manual and permanent:

```bash
npm run knowledge:delete-store -- fileSearchStores/EXACT_STORE_NAME --confirm
```

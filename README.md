# Elachee Information Assistant

A grounded chatbot prototype for Elachee, created by LearnAI. The application answers only from a prepared Gemini File Search store containing Elachee's public website and any reviewed staff FAQ entries. Unsupported, uncited, sensitive, or conflicting questions are routed to Elachee instead of being guessed.

This repository is a prototype for review. It is not a case-management system, does not check application status, and isn't represented as a final production service approved by Elachee.

## What is included

- A polished standalone demonstration at `/`
- A responsive iframe experience at `/embed`
- A framework-independent floating widget loader at `/widget-loader.js`
- A visible Auto / English / Español response-language selector
- Bounded desktop resizing for both the demo panel and integration widget
- A dismissible, once-per-session launcher suggestion
- `POST /api/chat` with File Search-only Gemini grounding
- `GET /api/health` with non-secret configuration status
- A robots-aware, same-origin website crawler
- Staff DOCX parsing with approved and pending separation
- Prepared Elachee website/FAQ Markdown corpus
- Gemini File Search create/reuse, upload, list, and manual-delete scripts
- Local sensitive-data detection, Zod validation, source URL allowlisting, and best-effort rate limiting
- Automated tests and a manual review checklist

## Architecture

```text
src/app/                 Next.js pages and route handlers
src/components/chatbot/  Interactive chat UI
src/lib/gemini/          Gemini request, prompt, citation, and response logic
src/lib/knowledge/       Shared knowledge and manifest contracts
src/lib/security/        Validation, privacy detection, and rate limiting
src/generated/           Build-time source manifest
knowledge/source/        Optional staff FAQ source and source approvals
knowledge/generated/     Crawl, FAQ, prepared corpus, and sync reports
scripts/                 Offline crawl, parse, prepare, and File Search tools
public/widget-loader.js  Dependency-free host-site integration
tests/                   Vitest coverage for trust-boundary logic
docs/                    Manual test checklist
```

Runtime visitor questions never trigger website crawling. The chat route calls Gemini's current Interactions API with exactly one tool: the configured File Search store. It uses `store: false`, requests a constrained JSON result, and separately maps File Search annotations to the checked-in source manifest. An `answered` response is released only when at least one citation maps to an approved source.

Standalone greetings, thanks, questions about what the assistant can do, and availability questions that uniquely match a registered official document are answered locally with the corresponding validated source. They do not consume a Gemini request. Document-content and other organization-specific questions still use the grounded File Search path.

Before a grounded request, harmless greeting and courtesy wrappers are removed while the substantive wording is preserved. The grounding instruction explicitly resolves obvious spelling mistakes, repeated letters, chat shorthand, and clear follow-ups into a standalone retrieval query and tries one reasonable paraphrase before reporting a confirmed knowledge miss. A malformed model response or an answer without a mapped citation uses separate source-verification wording; it does not claim that the information is absent from the corpus.

The language selector defaults to **Auto**. Auto detects the visitor's language from the current message and recent conversational context, including common phonetic or transliterated language written with Latin letters, and asks Gemini to reply in the same language and script style. English and Español explicitly override automatic detection. The selector value is a validated enum carried separately from untrusted message text; language translation never relaxes File Search retrieval, citation mapping, sensitive-data blocking, or contact-fallback rules. The browser interface, quick actions, status text, and deterministic fallbacks are localized in Spanish when Español is selected. No additional environment variable is required.

On desktop, the floating panel can be resized from its inward-facing top corner. The handle supports pointer dragging and arrow-key resizing, including larger Shift+Arrow steps. Width and height are clamped to usable minimums, maximums, and the current viewport; the panel is fitted again if the browser window shrinks. Embedded and mobile layouts stay viewport-sized so resizing cannot interfere with touch scrolling or host-page layout. The same behavior is implemented in the framework-independent widget loader.

## Requirements

- Node.js 20 or newer (the official `@google/genai` SDK requires Node 20+)
- npm
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- A Gemini project with sufficient File Search/model quota for the sync and prototype traffic

No database, authentication provider, Redis service, or paid third-party dependency is required by the prototype.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Confirm the generated Elachee website corpus is present here:

   ```text
   knowledge/generated/prepared/
   ```

   A staff-provided DOCX is optional. If supplied, place it at `knowledge/source/elachee-questions.docx` or pass its path to the parser.

3. Copy the environment template without committing the result:

   PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   macOS/Linux:

   ```bash
   cp .env.example .env.local
   ```

4. Add the real values to `.env.local` after the knowledge store is created.

## Environment variables

```dotenv
GEMINI_API_KEY=
GEMINI_FILE_SEARCH_STORE=
GEMINI_MODEL=gemini-3.5-flash-lite
NEXT_PUBLIC_SITE_URL=https://elachee-chatbot.vercel.app
```

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-only Gemini credential used by Vercel for production knowledge synchronization and grounded runtime answers. Never prefix it with `NEXT_PUBLIC_`. |
| `GEMINI_FILE_SEARCH_STORE` | Resource name printed by the sync command, such as `fileSearchStores/...`. |
| `GEMINI_MODEL` | Central model configuration. Defaults to stable `gemini-3.5-flash-lite`. |
| `NEXT_PUBLIC_SITE_URL` | Public deployment origin used in documentation/integration context. It contains no secret. |

The application still renders without Gemini configuration. `/api/chat` returns a non-technical service-unavailable response with Elachee's official contact path. `/api/health` returns only `ok` or `unavailable`; it does not disclose the model or which credential is missing.

### Gemini model selection

The chatbot uses the stable [`gemini-3.5-flash-lite`](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) model by default. Google lists it as a production-ready, low-latency, cost-efficient model with File Search and structured-output support. Every request explicitly uses the `minimal` thinking level. Short questions are limited to 224 output tokens and longer multi-part questions to 384; the prompt asks for 25-70 words for simple answers and 60-120 when important details require more context. File Search retrieves 6 results for a fresh simple question, 8 for a contextual follow-up, and up to 10 for a complex question.

Prompt size is bounded by sending only the four most recent valid conversation messages (two complete turns). Google can change model and free-tier limits, so review the current [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) before production use. Changing the runtime model does not require recreating the File Search store or uploading the knowledge corpus again.

## Knowledge synchronization

The synchronization pipeline has four explicit stages so each can be inspected independently.

### 1. Parse the staff DOCX

```bash
npm run knowledge:parse-faq
```

To use a different input path:

```bash
npm run knowledge:parse-faq -- path/to/elachee-questions.docx
```

This writes structured FAQ JSON plus:

- `knowledge/generated/manager-faq-approved.md`
- `knowledge/generated/manager-faq-pending.md`
- `knowledge/generated/manager-faq-report.json`

Only `approved` entries can become prepared File Search documents.

### 2. Crawl the official website

```bash
npm run knowledge:crawl
```

The default and hard cap are 150 pages, leaving room for the current public site to grow while keeping every refresh bounded. A smaller review crawl can be run with:

```bash
npm run knowledge:crawl -- --max-pages=25
```

The crawler reads `robots.txt`, checks sitemap candidates, revalidates previously approved URLs first, follows only canonicalized `elachee.org` pages, waits between requests, avoids blocked/private/asset routes, and records per-page timestamps and failures. It never submits forms. A failed or suspiciously incomplete refresh retains the last-known-good document; permanent removal requires a human-reviewed entry in `knowledge/source/approved-removals.json`.

### 3. Prepare the approved corpus

```bash
npm run knowledge:prepare
```

This generates one retrieval document per approved source under `knowledge/generated/prepared`, then writes:

- `knowledge/generated/sources.json`
- `src/generated/knowledge-manifest.json`
- `knowledge/generated/sync-report.json`

Review the pending entries, potential website matches, conflicts, missing links, and crawl failures before uploading.

Validate the complete prepared snapshot before any upload:

```bash
npm run knowledge:verify
```

The verifier fails closed on manifest drift, unsafe paths, duplicate IDs or URLs, pending FAQ leakage, fabricated staff URLs, excessive crawl failures, suspicious instruction-like content, and unexpected corpus size changes.

No staff FAQ or official PDF sources are bundled in this Elachee clone. If Elachee later supplies reviewed documents, add them through the approved source registries and rerun preparation; the public-site crawler will not invent or remove staff content.

### 4. Upload or reconcile File Search

After setting `GEMINI_API_KEY` in `.env.local`:

```bash
npm run knowledge:sync -- --new-store
```

This explicitly creates a timestamped store and uploads every prepared document. Each document receives source metadata plus a SHA-256 content fingerprint. The script waits for indexing and finally prints:

```text
GEMINI_FILE_SEARCH_STORE=fileSearchStores/...
```

Copy that full value into `.env.local`. The raw API key is never logged. Existing stores are never deleted automatically.

For routine updates to an existing managed store, preview the reconciliation first:

```bash
npm run knowledge:sync -- --reconcile
```

After reviewing the counts, apply it:

```bash
npm run knowledge:sync -- --reconcile --apply
```

Reconciliation skips unchanged hashes, uploads replacements before deleting stale copies, removes obsolete managed documents only after every upload succeeds, and aborts without mutation if unmanaged documents are present. A store created before content fingerprints were added will reindex its managed documents once; later refreshes upload only changes.

File Search document bytes use a bounded native HTTPS resumable uploader instead of the SDK's fetch-based upload transport. The uploader accepts only the configured `fileSearchStores/...` resource and Google's exact `generativelanguage.googleapis.com` HTTPS upload host, keeps the API key in the initial request header, limits response sizes and timeouts, and then hands the typed operation back to the official SDK for polling and verification. This avoids the Vercel build-runtime `TypeError: fetch failed` while preserving the same upload-before-delete safeguards.

Run the complete pipeline after the key is available:

```bash
npm run knowledge:all
```

### Store maintenance

List stores:

```bash
npm run knowledge:list-stores
```

Delete a verified old store manually:

```bash
npm run knowledge:delete-store -- fileSearchStores/EXACT_STORE_NAME --confirm
```

Deletion is permanent, requires both an exact resource name and `--confirm`, and is never part of an automatic refresh.

## Automatic website refresh

The repository includes a fail-closed, direct-to-main automation system for bounded public-site updates:

- `Detect and commit website knowledge updates` runs daily at 09:17 UTC, on demand, or from the `elachee-website-updated` repository-dispatch event.
- GitHub has no Gemini or Vercel secrets. An unchanged site produces no commit, deployment, or Gemini call.
- A change can be committed directly to `main` only after file-boundary checks, staff-FAQ isolation, a 20-document automatic-change cap, exact reconciliation of every website deletion against the human removal allowlist, a separate five-deletion cap, corpus verification, all tests, lint, production build, and a final check that `main` did not advance. It never force-pushes.
- The resulting Vercel Production build verifies the committed corpus again, reconciles the existing File Search store using Vercel's server-side key, and only then builds the deployable application. Preview builds never mutate Gemini.
- Reconciliation uploads every replacement before deleting its stale managed copy and fails closed on unknown remote documents or missing production configuration.
- The website crawler never parses or approves staff FAQ entries or removal approvals. Staff FAQ changes and permanent-removal allowlist changes still require human review and a normal commit.

`crawl-report.json` keeps the detailed timestamped failures, duplicates, and blocked-route audit record. Its deterministic `crawl-health.json` companion records retained last-known-good pages, human-approved removals, and indexed page counts without treating intermittent discovery of an unapproved empty candidate as a knowledge change. An unhealthy full crawl is rejected before it can replace the last-known-good files, and crawl timestamps are omitted from retrieval document text to prevent unnecessary File Search re-indexing.

See [Knowledge automation setup and operations](docs/knowledge-automation.md) for the one-time GitHub/Vercel configuration, review checklist, failure behavior, and rollback process.

## Run locally

```bash
npm run dev
```

Open:

- Standalone demo: `http://localhost:3000`
- Embed experience: `http://localhost:3000/embed`
- Health status: `http://localhost:3000/api/health`
- Loader file: `http://localhost:3000/widget-loader.js`

Supported embed query options are constrained to:

- `theme=light|dark|auto`
- `launcher=hidden|visible`
- `position=bottom-left|bottom-right`

For example:

```text
http://localhost:3000/embed?theme=auto&launcher=hidden&position=bottom-right
```

Arbitrary CSS or script values are ignored.

## Testing and verification

```bash
npm test
npm run lint
npm run build
```

Automated tests mock or interpret Gemini-shaped responses and do not consume API quota. The real DOCX is parsed during tests to confirm known contacts, URLs, and pending exclusions. See [the manual test checklist](docs/manual-test-checklist.md) for browser and content scenarios.

## Standalone demo testing

1. Start the app with all three Gemini variables configured.
2. Open `/` and launch **Ask Elachee**.
3. Send a supported question and confirm approved website source cards appear when the answer cites a public page. Staff-only evidence remains hidden rather than being presented as a website link.
4. Send an unresolved policy question and confirm the contact fallback appears.
5. Remove `GEMINI_FILE_SEARCH_STORE`, restart, and confirm the page remains usable while chat shows the service-unavailable contact path.
6. Test keyboard navigation, Escape-to-minimize, restart, narrow mobile width, and reduced-motion mode.

## Iframe integration

```html
<iframe
  src="https://elachee-chatbot.vercel.app/embed?theme=light&launcher=hidden"
  title="Elachee information assistant"
  style="width: 390px; height: 650px; border: 0;"
  loading="lazy">
</iframe>
```

The iframe should be served from the deployed chatbot origin so its `/api/chat` request remains same-origin.

## Floating widget integration

Add this before the host page's closing `</body>` tag or through its approved script-injection area:

```html
<script
  async
  src="https://elachee-chatbot.vercel.app/widget-loader.js"
  data-chatbot-url="https://elachee-chatbot.vercel.app/embed"
  data-position="bottom-right"
  data-label="Ask Elachee"
  data-prompt="visible"
  data-prompt-text="Ask Elachee chatbot">
</script>
```

The loader has no dependencies, uses a Shadow DOM boundary when available, locks the iframe to the loader's own HTTPS origin, and constrains position/theme values. It does not assume React, Next.js, WordPress, Squarespace, or another host framework.

When the launcher remains closed, a small “Need help?” suggestion appears after 2.2 seconds, never takes focus, disappears after 9 seconds, and can be dismissed or clicked to open the chat. A single `sessionStorage` boolean prevents it from repeating during the browser session; no visitor message or personal information is stored. The suggestion is enabled by default. Set `data-prompt="hidden"` to disable it, or customize its secondary line with a plain-text `data-prompt-text` value of up to 80 characters. Custom text is assigned with `textContent`, not interpreted as HTML.

## Deploy to Vercel

The current official Vercel workflow is documented at [Deploying a project from the CLI](https://vercel.com/docs/projects/deploy-from-cli) and [Managing environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

1. Install and authenticate the Vercel CLI:

   ```bash
   npm install --global vercel
   vercel login
   ```

2. From this repository, link or create the project:

   ```bash
   vercel link
   ```

3. Add the required values to **Production** in **Project Settings → Environment Variables**, or with the CLI. Mark the API key sensitive:

   ```bash
   vercel env add GEMINI_API_KEY production --sensitive
   vercel env add GEMINI_FILE_SEARCH_STORE production
   vercel env add GEMINI_MODEL production
   vercel env add NEXT_PUBLIC_SITE_URL production
   ```

   Enter `gemini-3.5-flash-lite` for `GEMINI_MODEL`. If a variable already exists, edit its Production value instead of creating a duplicate. Add separate Preview values only if preview deployments must answer live Gemini questions; Preview builds never synchronize or mutate File Search.

4. Create a preview deployment:

   ```bash
   vercel deploy
   ```

5. Set `NEXT_PUBLIC_SITE_URL` to the intended stable deployment origin if it changed, then redeploy. Vercel environment-variable changes—including `GEMINI_MODEL`—apply only to new deployments.

6. Verify the preview:

   ```bash
   curl https://elachee-chatbot.vercel.app/api/health
   ```

7. Only after stakeholder review, create production:

   ```bash
   vercel deploy --prod
   ```

8. Test `/`, `/embed`, `/api/health`, a supported answer with sources, a fallback answer, mobile behavior, and the loader on a non-production host page.

## Refreshing website information

The normal production path is the guarded direct-to-main workflow described above. For a manual local review cycle:

```bash
npm run knowledge:crawl
npm run knowledge:prepare
npm run knowledge:verify
```

This intentionally does not reparse or alter staff FAQ approval. Inspect `crawl-report.json`, `sync-report.json`, and the generated diff. Preview and apply the existing-store reconciliation with:

```bash
npm run knowledge:sync -- --reconcile
npm run knowledge:sync -- --reconcile --apply
```

Use `--new-store` only for initial setup, ownership transfer, or an intentional blue/green rebuild. Reusing a store without `--reconcile` is rejected so duplicate documents cannot accumulate accidentally.

## Current synchronization result

The initial Elachee preparation pass indexed 60 public website pages and produced 60 prepared documents with no crawl failures, staff FAQ entries, or bundled official PDFs. Rerun the refresh commands after reviewing future Elachee site changes.

The following staff questions remain pending and are excluded from the approved FAQ corpus:

- Furniture delivery fees
- Return policy
- Whether electronics-testing outlets are available
- Meaning of colored clothing barbs
- Whether prices are negotiable
- Whether clothing exchanges are accepted

Targeted searches of the crawled official corpus found no direct official answer for those six questions. A future website change can still become an official website source after a new crawl, but it does not silently convert a pending staff entry into an approved FAQ.

## Ownership transfer from LearnAI to Elachee

1. Elachee creates its own Google AI project and Gemini API key.
2. Greg (or the designated hosting administrator) configures that key in Elachee's Vercel project.
3. Run the knowledge crawl, FAQ parse, preparation, and File Search sync using Elachee's key/project.
4. Copy the newly printed `GEMINI_FILE_SEARCH_STORE` into the hosting environment.
5. Confirm `vercel.json` uses the guarded production build described in `docs/knowledge-automation.md`.
6. Redeploy and complete the manual checklist.
7. Remove LearnAI's key from every old hosting environment.
8. After confirming the new deployment, manually delete the obsolete LearnAI File Search store if appropriate.

File Search stores belong to the Gemini project that created them; changing only the key is not enough. The corpus must be synchronized under the new project.

## Privacy, security, and reliability notes

- The Gemini key remains server-side in Vercel and is accessed only by the production build synchronization script and Node.js chat route.
- Chat transcripts are not written to a database, file, analytics service, or application log.
- Gemini interactions use `store: false`; provider-side abuse monitoring and service policies may still apply.
- Obvious SSNs, Luhn-valid card numbers, password disclosures, bank-account context with long numbers, and large private-document-like pastes are blocked before Gemini.
- React renders answer text directly; raw HTML and `dangerouslySetInnerHTML` are not used for model output.
- Website source URLs are limited to HTTPS `elachee.org` hosts and must exist in the generated manifest.
- The crawler revalidates both requested and final redirect hosts so off-domain content cannot enter the approved corpus through a redirect or external sitemap.
- Request size, the 600-character message limit, history length, timeout, and response shape are bounded.
- The optional language preference is restricted to `auto`, `en`, or `es`; arbitrary browser values cannot enter the system instruction.
- The API requires `application/json`, model-generated images are not loaded, the widget iframe is same-origin with its loader, and response security headers limit framing to Elachee domains.
- Production provider failures log only error type/status/code metadata, never visitor message text.
- The in-memory rate limiter is best-effort only. Serverless instances do not share its state, so production should use a durable distributed limiter if abuse risk warrants it.
- No browser analytics or transcript persistence is included by default.
- The launcher suggestion stores only a non-sensitive, once-per-session “seen” flag in `sessionStorage`.

## Prototype limitations and production hardening

- File Search quality depends on the latest successful Vercel Production build synchronization and staff review.
- Public-site updates are detected automatically. Large changes, staff-FAQ changes, unsafe content, invalid crawls, and unapproved removals fail closed for human investigation; no crawler can guarantee the correctness of a legitimately compromised official page.
- The crawler uses practical main-content extraction; synchronization reports should be audited periodically for missing, duplicated, retained, or layout-heavy pages.
- Semantic retrieval can miss relevant wording. The citation gate favors a safe fallback over an unsupported answer.
- The app does not authenticate visitors or connect to Elachee's internal systems.
- In-memory rate limiting is not a strong production control.
- Before broad public promotion, configure a Vercel Firewall rate-limit rule for `POST /api/chat`, plus a formal content-review workflow, uptime/error monitoring that excludes message text, accessibility testing with assistive technologies, retention/legal review, and a documented incident/rollback procedure.
- Review Gemini and Vercel quotas, billing, and data-processing terms for Elachee's expected traffic. Free-tier availability and limits can change.
- Next.js and its ESLint configuration are pinned to the current compatible 16.2.12 patch. `npm audit` reports 12 high-severity transitive findings: PostCSS and Sharp/libvips inside Next.js, plus glob-expansion packages used by development-only lint tooling. This app accepts neither user-provided CSS nor image uploads, has no remote image domains, disables runtime image optimization for its trusted local logos, and does not pass visitor input to lint tooling. npm's forced fix proposes an unsafe Next.js 9 downgrade; ESLint 10 is not yet compatible with the React plugin bundled by this Next configuration. Neither unsafe change is applied. Monitor the next stable compatible releases and rerun the audit regularly.

## Packages added

Runtime:

- `@google/genai` — official current Gemini JavaScript/TypeScript SDK
- `cheerio` — HTML and sitemap content parsing
- `mammoth` — DOCX conversion while preserving links
- `zod` — runtime request and model-result validation

Development:

- `tsx` — TypeScript execution for offline scripts
- `vitest` — unit and API-behavior tests
- `yaml` — local validation of GitHub workflow configuration

No deprecated Gemini SDK or legacy model name is used.

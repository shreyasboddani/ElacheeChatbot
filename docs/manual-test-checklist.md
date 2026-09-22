# Elachee chatbot manual test checklist

Run this checklist against a configured local instance and the Vercel preview. Record answers, source cards, browser errors, and contact fallbacks.

## Preflight

- [ ] `GET /api/health` returns `status: "ok"`.
- [ ] `geminiConfigured` and `fileSearchConfigured` are `true`.
- [ ] No API key, store content, or internal stack trace is exposed.
- [ ] The standalone page and `/embed` load without console errors.

## Elachee questions

- [ ] What are Elachee's visitor center hours?
- [ ] What is admission and parking at Elachee?
- [ ] What trails are available, and when are trails open?
- [ ] What camps and programs does Elachee offer?
- [ ] How do I plan an Elachee field trip?
- [ ] What volunteer opportunities are available?
- [ ] What upcoming events are listed for Elachee?
- [ ] What membership options are available?
- [ ] Hii pls who can I contact about Elachee trails?
- [ ] Heyy I need hlp planning a visit to Elachee pls.
- [ ] Helo can u tell me about Elachee camps thx.

For each supported answer:

- [ ] The answer is concise and does not introduce an unsupported organization-specific fact.
- [ ] At least one source card appears.
- [ ] Website source links open only on `https://elachee.org` or `https://www.elachee.org`.
- [ ] Staff-only evidence is not shown as a source card, and no public URL is fabricated for it.

## Conversational follow-ups

- [ ] Ask "Hello" and confirm a friendly response appears instead of a contact fallback.
- [ ] Ask "What questions can you answer?" and confirm the supported areas are explained.
- [ ] Ask "What are the trails?", then "Are they open Friday?" without restating the trail topic.
- [ ] Ask "What events are upcoming for Elachee?" and confirm only retrieved future events are summarized.
- [ ] Ask "Can you explain that more simply?" after a detailed sourced answer.
- [ ] Correct a topic with "I meant camps, not trails.".

For each follow-up:

- [ ] Only recent `{ role, content }` history entries are sent.
- [ ] Welcome, loading, invalid-request, safety, and service-error messages are absent from history.
- [ ] The follow-up remains File Search-grounded and displays a mapped source card when answered.
- [ ] An ambiguous follow-up produces one brief clarification, not `invalid_request`.

## Language handling

- [ ] The response-language control shows Auto, English, and Español at 320px width.
- [ ] Auto is selected by default and English questions receive English grounded answers.
- [ ] With Español selected, visible UI text, quick actions, source labels, and answers are Spanish.
- [ ] Spanish quick actions use `/api/chat` with `language: "es"`.
- [ ] Changing language keeps the conversation and changes the next answer language.
- [ ] Unsupported Spanish questions use the Spanish Elachee contact fallback.

## Safety and fallback

- [ ] Unsupported questions do not guess and recommend contacting Elachee.
- [ ] Prompt injection and sensitive personal/payment information are safely redirected and not echoed or logged.
- [ ] Conflicting or uncited mocked results produce the expected fallback status.
- [ ] Unmapped citations and external manifest URLs are not displayed.

## Interface, embed, and accessibility

- [ ] Launcher, minimize, close, restart, focus indicators, and accessible names work.
- [ ] The launcher defaults to the bottom-left and stays aligned on narrow screens.
- [ ] `/embed`, themes, launcher visibility, and invalid option fallbacks work.
- [ ] `widget-loader.js` opens, closes, reopens, and resizes independently of host-page styles.
- [ ] Enter sends; Shift+Enter inserts a line break; the 600-character limit is enforced.
- [ ] The panel remains usable at 320px width and in reduced-motion mode.
- [ ] Approved `elachee.org` links open safely; user-entered Markdown and HTML remain escaped.

## Reliability and knowledge automation

- [ ] Missing Gemini configuration loads safely and returns a contact path.
- [ ] Oversized requests, invalid JSON, upstream timeouts, and repeated requests receive safe errors.
- [ ] `npm run knowledge:verify` passes before synchronization.
- [ ] Failed or truncated pages retain the last-known-good prepared document.
- [ ] Public-page removal requires `knowledge/source/approved-removals.json` approval.
- [ ] Refreshes change only generated knowledge and the runtime manifest.
- [ ] Tests, lint, build, and diff checks pass before the bot pushes `main`.
- [ ] GitHub Actions never exposes the Gemini key in logs or repository content.

# LaunchPilot AI

React + TypeScript + Vite, FastAPI, SQLite/SQLAlchemy, and the existing OpenAI structured-output adapter. The application supports one active business per account and two starting journeys.

## Run locally

Python 3.11+ and Node 22.14+ are required (tested with Python 3.14).

```sh
# Project root — first-time setup
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
# Only if backend/.env does not already exist:
cp -n backend/.env.example backend/.env
cd frontend
npm ci
```

Start the applications in separate terminals:

```sh
# Project root
source .venv/bin/activate
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

```sh
# Project root
cd frontend
npm run dev
```

Open **http://127.0.0.1:5173**. Vite forwards `/api` to FastAPI at port 8000. API documentation: **http://127.0.0.1:8000/docs**. `VITE_API_PROXY` can override the development backend target. A production frontend needs a same-origin `/api` reverse proxy.

## User flow

Sign Up / Sign In → **Where are you in your business journey?**

1. **I'm Ready to Launch My Business** → a single business form → personalized roadmap → task guide.
2. **I'm Still Exploring My Business Idea** → natural-language discovery and follow-ups → relevant model comparisons → **Continue to Launch** or **Keep Exploring**.

The ready form collects name, activity, category, operating city/state, optional founder count/ownership details, registration status, and an optional structure. No structure is automatically selected. Required activity/location facts are validated before generating a launch roadmap.

Discovery saves conversations and founder-confirmed decisions. It does not generate a legal roadmap just because facts were extracted. **Keep Exploring** keeps the conversation open; **Continue to Launch** explicitly generates the same roadmap experience as the ready journey. Coffee shops support traditional storefront, kiosk and mobile-cart comparisons. Cost/location discussion is qualitative or explicitly uncertain unless supported by evidence; the app does not fabricate rental prices, neighborhood demand or market research.

Navigation contains only the current business/idea and its roadmap once generated. Task-linked documents remain accessible from **Documents Needed** in a guide. There is no project switcher, additional dashboard, recommendation widget or separate assistant page. **Log Out** remains visible in every signed-in view.

The saved journey, profile, decisions, roadmap, completion records and conversations persist in SQLite. A saved task/page route is restored after refresh or signing back in. Missing or archived task IDs safely return to the roadmap. Another account's data returns 404; signed-out protected requests return 401.

## Task guides

Each guide has exactly four left-column sections:

- **What Is This Step?** — a short task/business-specific explanation.
- **Terms You Should Know** — relevant beginner definitions.
- **Documents Needed** — information to prepare, possible documents, and evidence-supported requirements distinguished explicitly.
- **Helpful Resources** — official sources/application pages and labelled YouTube tutorial searches.

The right column contains only **Ask LaunchPilot AI**, with saved task history, composer, loading/error states, retry and suggested questions. The backend reloads the authoritative business, task and current evidence for each request. Failed requests are shown as errors; neither chat endpoint silently substitutes a mock/demo answer. Failed exchanges do not become fake persisted replies.

Task completion remains an explicit founder action. Uploading a document or ticking a preparation checklist does not itself complete a task. Model changes retain unaffected completed tasks and archived task records. Existing formed entities receive review guidance rather than an assumption that they must form a new entity.

## API keys and AI configuration

Keep real values in ignored **`backend/.env`**, never `.env.example` or frontend code:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ADVISOR_MODEL=gpt-4o-mini
ADVISOR_TIMEOUT_SECONDS=25
ADVISOR_RETRIES=1
SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=
TAVILY_API_KEY=
```

Use **one** search provider: Brave or Tavily. General discovery and task explanations need the LLM key; live regulatory research additionally needs the selected search key. `RESEARCH_MODEL` defaults to `OPENAI_MODEL` and must support structured output. The existing HTTPX Chat Completions adapter is retained; no provider/SDK migration is introduced.

Advisor calls have a 55-second overall budget, below the client deadline. `ADVISOR_TIMEOUT_SECONDS` accepts 1–50 seconds and retries accept 0–2. Access errors, rate/quota limits, invalid model/configuration, malformed responses and timeouts produce safe errors without exposing credentials, prompts or raw provider bodies. Funding an account does not guarantee access: inspect the actual provider error. Automated tests use mocks and do not spend provider credits.

Restart FastAPI after changing `.env`; development reload does not reliably watch environment files. Existing `RESEARCH_*` bounds, cache and agency-registry settings are documented in `.env.example`. Official structured-output reference: [OpenAI documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

## SQLite and safe migration

No separate database service is needed. Startup creates missing tables and applies idempotent migrations. Default database: **`backend/launchpilot.db`**, resolved independently of the working directory. Override with an absolute SQLite URL:

```dotenv
DATABASE_URL=sqlite:////absolute/path/to/launchpilot.db
```

Initialize explicitly with `.venv/bin/python -m backend.database`. Stop the backend before copying the database for backup; preserve the database and original documents when upgrading.

The one-business migration adds `active` and `last_path` to the existing `account_projects` table. A partial unique index enforces **one active founder/business slot per account**, including concurrent creation attempts. Existing extra projects are **not deleted**: the most recently edited business remains active and the others are retained as inactive records in SQLite. Inactive projects cannot be selected or accessed through normal account APIs. Their profiles, task IDs, progress, research, documents and conversations remain stored. This retention is solely for preserving older data; the application does not expose multiple-business functionality.

The old unowned `local-development` founder is not automatically assigned to the first new account. A trusted local operator can attach it to an existing account that has no active business:

```sh
.venv/bin/python -m backend.claim_legacy your-account@example.com
```

The command refuses a second active business or reassignment to another owner. Historical browser storage is not deleted. On an explicitly claimed legacy business, the existing document import copies previous browser files after confirmation while preserving originals. Old worksheet APIs/records are retained; no extra editor is added to the guide.

## Authentication and privacy

Passwords use pwdlib/Argon2id. Starlette/itsdangerous signs HttpOnly SameSite cookies; SQLite stores revocable sessions with seven-day absolute expiry. Logout revokes the current session, and sign-in rotates it. Failed sign-ins are throttled. Cross-site mutations are rejected and private responses disable caching.

For local HTTP, `COOKIE_SECURE=false` can use the automatically generated ignored mode-0600 `backend/.session-secret`. For HTTPS hosting set a stable random `SESSION_SECRET` of at least 32 characters, `COOKIE_SECURE=true`, and exact `CORS_ORIGINS`. No secrets belong in frontend variables. This remains a local development deployment; password recovery, email verification, MFA and comprehensive production abuse controls are not included.

Documents and existing task drafts are private SQLite records with business/task ownership checks. Upload validation checks allowed extension, MIME, signature, nonempty contents and a 12 MB limit on client and server. Previews support images/plain text and sandboxed PDFs; Office files are downloadable. File validation is not malware scanning. Files/drafts are never sent to the LLM or research providers.

## Government research

The retained service scopes queries toward reviewed federal/state/county/local agencies using `backend/research/registry.json`. It checks official-domain/jurisdiction matches, HTTPS/public addresses, redirects, content type, size and timeouts before extracting readable HTML/PDF evidence. LLM quotations and application URLs are validated against retrieved sources. Sources carry retrieval dates; runs have cache expiry, profile fingerprints and coverage warnings. Profile changes require relevant findings to be revalidated.

Research runs in-process using FastAPI background tasks, not a separate worker service. Interrupted runs are marked failed on restart. Coverage is limited to reviewed US agencies. Curated links are labelled separately from live research; tutorial links are unverified searches. Missing evidence is not proof of compliance, and completion checks are not legal determinations. No automatic government filing or document submission is performed.

## Checks

```sh
# Project root
.venv/bin/python -m pytest backend/tests -q
.venv/bin/python -m pip check
cd frontend
npm test
npm run build
npm run test:e2e
# One focused scenario:
npm run test:e2e -- A
```

The Chrome suite uses an installed Chrome/Chromium executable and Node built-ins. Set `CHROME_BIN` or `PYTHON_BIN` if necessary. It starts isolated loopback test servers with a temporary database, private browser contexts, fake keys and mocked outbound LLM/search/government HTTP. Test controls exist only in `tests/e2e/server.py`, never in the production app. Reports/screenshots are generated under ignored `frontend/e2e/artifacts/`.

Current scenarios are exactly **A** ready software/Virginia/task advisor; **B** coffee discovery/Keep Exploring; **C** later Continue to Launch; **D** logout/resume with progress, history and isolation; **E** clear LLM failure and successful retry. Historical milestone reports describe earlier implementations. See [the current single-business verification report](docs/single-business-flow-verification.md).

### Free-form business conversations and navigation

The ready-to-launch form accepts any industry description, with catalog suggestions rather than a fixed picker. Industries outside the catalog retain their actual name in `details.industry_label`; custom operating approaches are stored in `details.operating_model_label`. Discovery and advisor prompts use those details and the founder's activities to discuss businesses beyond the presets. Official research queries use those same descriptions. Extracted facts still require confirmation before saving.

Preset comparison tables remain available for supported catalog models. For other industries, discuss and compare approaches in the conversation; the shared roadmap is a starting point, not an exhaustive industry-specific compliance checklist. Current legal claims still require verified official evidence. Provider configuration and quota errors remain visible instead of generating fallback answers.

Back buttons connect the business page to journey selection, the roadmap to business details, documents to their task, and task guides to the roadmap. Returning to journey selection preserves the account's existing business and saved conversations.

### Advisor presentation and research configuration

Assistant replies render safe text formatting, short paragraphs, bold terms, lists, and numbered option cards. A pending exploration change is shown for review before saved-profile comparisons or Continue to Launch become available. Follow-up messages retain pending idea details until confirmation; discussing a new industry proposes clearing the old idea's name/model, and changing states without naming a city proposes clearing the previous city. These changes remain explicit, reviewable proposals.

Use one search provider: `SEARCH_PROVIDER=tavily` with `TAVILY_API_KEY`, or `SEARCH_PROVIDER=brave` with `BRAVE_SEARCH_API_KEY`. Put keys in `backend/.env`, not `.env.example`; OpenAI and web search use separate keys. Restart the backend after changing environment configuration. A successful search request verifies connectivity, not the accuracy or completeness of extracted regulations. Official starting links are distinguished from retrieved evidence; current applicability still needs validation.

Task documents include an expandable preparation worksheet and a text download based on that step's preparation checklist. It is not an official filing form and does not establish mandatory requirements. Use the linked agency's current form when filing.

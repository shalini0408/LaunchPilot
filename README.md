# LaunchPilot AI (https://launchpilot-six.vercel.app)
<img width="1469" height="831" alt="Screenshot 2026-10-30 at 10 56 05 PM" src="https://github.com/user-attachments/assets/d02a4b39-1597-4a1a-a9e9-60639287f7bc" />

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

# LaunchPilot AI (https://launchpilot-six.vercel.app)
<img width="1469" height="831" alt="Screenshot 2026-10-30 at 10 56 05 PM" src="https://github.com/user-attachments/assets/d02a4b39-1597-4a1a-a9e9-60639287f7bc" />

React + TypeScript + Vite, FastAPI, SQLite/SQLAlchemy, and the existing OpenAI structured-output adapter. The application supports one active business per account and two starting journeys.

## Run locally

To run LaunchPilot locally, open a terminal in your **LaunchPilot** folder.

**1. Install backend dependencies**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

**2. Configure API keys**

Edit **`backend/.env`**. If it doesn’t exist, create it by copying `backend/.env.example`.

Keep your existing working keys. For OpenAI with Tavily, the relevant settings are:

```dotenv
OPENAI_API_KEY=your_actual_openai_key
OPENAI_MODEL=gpt-4o-mini
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=your_actual_tavily_key
COOKIE_SECURE=false
```

For local setup, leave `DATABASE_URL` unset to use `backend/launchpilot.db`.

**3. Start the backend**

In the same terminal:

```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

**4. Start the frontend**

Open a **second terminal** in the LaunchPilot folder:

```bash
cd frontend
npm ci
npm run dev
```

**5. Open the app**

Visit **http://127.0.0.1:5173**.

Keep both terminals running. SQLite initializes automatically. After changing `.env`, restart the backend. Press **Ctrl+C** in each terminal to stop the app.
```

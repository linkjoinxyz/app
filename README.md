# LinkJoin

[linkjoin.xyz](https://linkjoin.xyz) — automatically opens your virtual meetings at the right time.

Save recurring meetings once. LinkJoin opens them for you when it's time, so you never have to hunt for a link again.

## Features

- **Auto-open meetings:** meetings open at their scheduled time, with a configurable early-open window
- **Pre-meet countdown:** a popup appears before each meeting with a live countdown and optional password copy
- **Bookmarks:** save any link for one-click access, separate from your meetings
- **Calendar view:** monthly calendar alongside your meetings list, with per-day breakdowns
- **Sharing:** invite others to a recurring meeting; they can accept or decline
- **Notes:** per-meeting notes that persist across sessions
- **Google Calendar and Outlook import:** pull recurring meetings in automatically
- **Vacation mode:** pause all auto-opens temporarily
- **Meeting assistant:** ask questions about your schedule

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router |
| Backend | FastAPI, Python 3.12 |
| Database | MongoDB (Motor async driver) |
| Auth | JWT + Google OAuth |
| Real-time | WebSockets |

## Repo structure

```
linkjoin-frontend/   React + Vite app
linkjoin-backend/    FastAPI backend
```

## Local development

**Backend**
```bash
cd linkjoin-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd linkjoin-frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `localhost:8000`, so both can run together at `localhost:5173`.

## Browser extensions

The Chrome and Firefox extensions live in [linkjoinxyz/extension](https://github.com/linkjoinxyz/extension). They handle the pre-meet popup outside the browser tab and let you add bookmarks from any page.

## Contributing

PRs go to `dev`. Once `dev` is stable, `dev` -> `main` ships to production.

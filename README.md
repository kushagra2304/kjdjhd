# Wind Forecast Monitor

A web app that compares UK national wind generation forecasts with actual generation for January 2026, using
public Elexon BMRS data. Pick a time window and a forecast horizon (0–48h) to see the forecast that was available
that many hours before each period, how it compared with reality, and how large the error was.

**Live app:** _Vercel link coming soon_

---

## How to start the app

### Option 1: Docker (recommended)

Requires Docker Desktop.

```bash
docker compose up --build
```

- App: http://localhost:3000
- API docs: http://localhost:8000/api/docs

If port 3000 is already in use, pick another one: `FRONTEND_PORT=3001 docker compose up --build`.

### Option 2: Run locally without Docker

Requires Python 3.11+ and Node.js 22+.

**Backend** (terminal 1):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173 by default). The dev server forwards `/api` requests to the
backend on port 8000.

### Other commands

| Task | Command (run from) |
|---|---|
| Backend tests | `pytest` (`backend/`) |
| Frontend tests | `npm test` (`frontend/`) |
| Re-download the data from Elexon | `python -m scripts.fetch_data` (`backend/`) |
| Open the analysis notebook | `pip install -r analysis/requirements.txt`, then `jupyter notebook analysis/forecast_error_analysis.ipynb` |

The app reads the cached data in `backend/data/`; it never calls Elexon while running.

---

## File structure

```
.
├── docker-compose.yml          Runs backend + frontend together (ports 8000 and 3000)
├── vercel.json                 Vercel deployment: frontend at /, FastAPI backend at /api (one project)
├── docs/
│   ├── architecture.svg        Architecture and data-flow diagram
│   └── architecture.png        The same diagram as an image
├── backend/                    Python FastAPI service
│   ├── Dockerfile              Backend container image (python:3.11-slim)
│   ├── requirements.txt        Runtime dependencies
│   ├── requirements-dev.txt    Runtime + test dependencies (pytest, httpx)
│   ├── pytest.ini              Test configuration
│   ├── .python-version         Python version Vercel uses for the backend
│   ├── app/
│   │   ├── main.py             API routes: /api/health, /api/meta, /api/comparison, /api/horizon-error
│   │   ├── config.py           Constants: date range, horizon limits, API settings, file paths
│   │   ├── elexon_client.py    Downloads data from the Elexon API (weekly chunks, retries)
│   │   ├── cleaning.py         Turns raw API rows into tidy actuals/forecasts tables
│   │   ├── data_store.py       Reads/writes the cached data files; loads them once per process
│   │   ├── forecast_logic.py   Core rule: picks the forecast available H hours before each period
│   │   ├── metrics.py          Error metrics (MAE, RMSE, bias, percentiles) and error by horizon
│   │   └── schemas.py          Response models (also used for the API docs)
│   ├── data/
│   │   ├── actuals_wind_jan2026.json    Actual wind generation, every 30 min (1,488 rows)
│   │   └── forecasts_wind_jan2026.json  Wind forecasts, hourly targets, 0–48h ahead (11,873 rows)
│   ├── scripts/
│   │   └── fetch_data.py       Downloads, cleans and saves the two data files
│   └── tests/                  pytest suite: logic, metrics, cleaning and API tests
├── frontend/                   React + TypeScript + Vite single-page app
│   ├── Dockerfile              Builds the site, then serves it with nginx
│   ├── nginx.conf              Serves the app and forwards /api to the backend container
│   ├── vite.config.ts          Dev server config (forwards /api to localhost:8000) and test config
│   ├── package.json            Dependencies (React, D3) and scripts (dev, build, test)
│   ├── index.html              Page shell
│   └── src/
│       ├── main.tsx            Entry point
│       ├── App.tsx             Page layout, state, data loading
│       ├── api.ts              Typed calls to the backend API
│       ├── types.ts            TypeScript types matching the API responses
│       ├── hooks.ts            Debounce, data-loading and element-size hooks
│       ├── canvas.ts           HiDPI canvas setup; reads theme colours for the canvas charts
│       ├── format.ts           Number/date formatting (UTC, MW/GW)
│       ├── chartData.ts        Turns API data into chart points, error bands, heatmap grid, ticks and summary text
│       ├── styles.css          Dark theme; colour tokens shared with the canvas charts
│       ├── *.test.ts           Vitest unit tests
│       └── components/
│           ├── Controls.tsx           Date pickers, quick ranges, horizon slider
│           ├── GenerationChart.tsx    Actual vs forecast (Canvas + D3): zoom, pan, overview brush, error bands
│           ├── ErrorHeatmap.tsx       Day × hour error heatmap for the month (Canvas); click a day to open it
│           ├── HorizonErrorChart.tsx  Error vs horizon (D3 + SVG); drag the marker to change the horizon
│           └── MetricsCards.tsx       Error summary cards
└── analysis/
    ├── forecast_error_analysis.ipynb  Analysis of forecast error with business conclusions
    ├── key_numbers.json               Headline figures exported by the notebook
    └── requirements.txt               Notebook dependencies
```

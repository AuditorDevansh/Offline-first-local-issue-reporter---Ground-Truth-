# GroundTruth

> Report it before you lose signal.

GroundTruth is an **offline-first civic issue reporter** — a PWA that lets residents, field crews, and municipal staff capture infrastructure problems (potholes, broken lights, sanitation issues, etc.) instantly on-device, with no connection required, and sync automatically once one returns.

Built for **First Commit**, part of the Bharat Builds Tour, powered by AWS Builders.

---

## Repository layout

```
client/     React + Vite PWA  — capture, queue, map, and admin panel
backend/    AWS SAM app       — Python Lambda functions behind API Gateway
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser / PWA (Amplify Hosting)                            │
│  React + Vite · Dexie (IndexedDB) · Service Worker         │
│                                                             │
│  Capture → IndexedDB outbox → Sync → API Gateway           │
│  Admin panel → API Gateway (X-Api-Key)                      │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────────────────────┐
│  API Gateway (prod stage)                                   │
│                                                             │
│  POST /sync/batch          (public)                         │
│  GET  /issues/nearby       (public)                         │
│  GET  /healthz             (public)                         │
│  GET/PATCH /issues/{id}    (PATCH requires API key)         │
│  POST /issues/{id}/photo   (public — presigned S3 URL)      │
│  GET  /admin/issues        (API key required)               │
│  GET  /admin/stats         (API key required)               │
│  POST /admin/issues/bulk   (API key required)               │
└──────────────────┬──────────────────────────────────────────┘
                   │ VPC
┌──────────────────▼──────────────────────────────────────────┐
│  Lambda Functions (Python 3.12 · 256 MB · 10 s)            │
│  health · sync_batch · nearby_issues · issue_detail        │
│  photo_upload · admin_issues                                │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
  ┌────────▼────────┐      ┌──────────▼──────────┐
  │  RDS PostgreSQL  │      │  S3 (photos bucket)  │
  │  (private VPC)   │      │  + CloudFront CDN    │
  └──────────────────┘      └──────────────────────┘
```

Client writes are durable in IndexedDB before any network attempt. Every sync batch is idempotent, keyed by client-generated UUIDs, so a dropped connection can always retry safely. Photos are stored as Blobs in IndexedDB and uploaded to S3 via presigned URLs after the issue is synced. Conflicts resolve last-write-wins by default.

---

## Local development

### Prerequisites

- Node.js 20+
- Python 3.12+
- AWS SAM CLI (for backend deploy)
- AWS CLI configured with appropriate credentials

### Client

```bash
cd client
npm install
cp .env.example .env.local   # edit VITE_API_BASE_URL if needed
npm run dev
```

Open `http://localhost:5173`. The client defaults to `http://localhost:8000` for the API.

### Backend

```bash
cd backend
pip install -r requirements.txt pytest
pytest                        # run all handler tests
python -m uvicorn app:api --reload --port 8000
```

The FastAPI server exposes the same routes as the Lambda deployment.
SQLite (`groundtruth.db`) is used locally; set `DATABASE_URL` to a PostgreSQL connection string for PostgreSQL.

---

## Deploying to AWS

### 1 — Provision RDS PostgreSQL

Create a PostgreSQL 15+ instance in a private VPC subnet. Note the:
- connection string: `postgresql://user:password@host:5432/groundtruth`
- private subnet IDs
- security group ID (allow Lambda SG on port 5432)

### 2 — Deploy the backend

```bash
cd backend
sam build
sam deploy --guided
```

Answer the prompts:
| Parameter | Value |
|---|---|
| `DatabaseUrl` | Your PostgreSQL connection string |
| `VpcSubnetIds` | Comma-separated private subnet IDs |
| `VpcSecurityGroupIds` | Security group for Lambda |
| `AllowedOrigin` | Your Amplify app URL (e.g. `https://main.d1abc.amplifyapp.com`) |

The deploy prints an **ApiUrl** output — copy it for the next step.

### 3 — Create an API key for the admin panel

1. AWS Console → **API Gateway** → **API Keys** → **Create API key**
2. Note the key value (shown once, then hidden).
3. Associate it with the **GroundTruth** usage plan that SAM created.

### 4 — Deploy the client to Amplify

1. Connect the GitHub repository in the **AWS Amplify** console.
2. Amplify auto-detects `amplify.yml` in `client/`.
3. Set these **environment variables** in Amplify:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<id>.execute-api.<region>.amazonaws.com/prod` |
| `VITE_ADMIN_API_KEY` | Leave blank (prompt at login) or set the key |
| `VITE_PHOTOS_CDN` | CloudFront domain for photos (optional) |

4. Trigger a deploy — Amplify runs `npm ci && npm run build` and hosts `dist/`.

### 5 — Verify

```bash
curl https://<api-url>/healthz
# {"status":"ok","service":"groundtruth-api","version":"1.0.0"}
```

Open the Amplify URL. Navigate to `#app/admin` (or click the ⚙ in the footer) to reach the admin panel.

---

## Admin panel

The admin panel lives at `<app-url>/#app/admin`. It is lazy-loaded and not part of the public bundle.

**Features:**
- **Login** — enter the API key once per browser session (stored in `sessionStorage`)
- **Dashboard** — stat cards showing totals by status; click a card to filter the table
- **Issue table** — paginated, searchable, filterable by status and category
- **Bulk update** — select multiple issues and change their status in one click
- **Issue modal** — edit title, description, and status; view GPS location on OpenStreetMap; preview attached photo

**Status lifecycle:**

```
queued → synced → acknowledged → in_progress → resolved
                                             → rejected
```

---

## PWA / offline behaviour

- Issues are saved to IndexedDB the instant the user submits — no network required.
- The service worker (`sw.js`) pre-caches the app shell so the app loads from cache when offline.
- OpenStreetMap tiles are cached stale-while-revalidate so the map works offline after first load.
- Background Sync is wired: when the browser regains connectivity the SW notifies open tabs to drain the outbox.
- Photos are stored as Blobs in IndexedDB and uploaded to S3 after the issue is successfully synced.

---

## Environment variables reference

| Variable | Used by | Description |
|---|---|---|
| `VITE_API_BASE_URL` | client | API Gateway invoke URL |
| `VITE_ADMIN_API_KEY` | client | API key (build-time; leave blank to prompt) |
| `VITE_PHOTOS_CDN` | client | CloudFront hostname for photo serving |
| `DATABASE_URL` | backend | PostgreSQL connection string |
| `PHOTOS_BUCKET` | backend | S3 bucket name (injected by SAM) |
| `ALLOWED_ORIGIN` | backend | CORS origin for admin endpoints |
| `APP_VERSION` | backend | Version string in `/healthz` response |
| `GROUNDTRUTH_DB` | backend | SQLite path override (local dev only) |

---

## CI/CD

GitHub Actions runs on every push and pull request to `main`:

- **client** — lint (oxlint) + Vite production build
- **backend** — pytest + `sam build`

Deployment to Amplify is triggered automatically by git push (Amplify git integration). SAM deploys are manual (`sam deploy`) — add an `aws-actions/aws-sam-cli-install` step to automate if needed.

---

## License

MIT — see `LICENSE`.

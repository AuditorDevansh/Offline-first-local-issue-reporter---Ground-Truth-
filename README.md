# GroundTruth

Report it before you lose signal. GroundTruth is an offline-first local issue
reporter — capture civic issues (potholes, broken lights, and everything else
that breaks) instantly on-device, no connection required, and sync
automatically once one returns.

Built for **First Commit**, part of the Bharat Builds Tour, powered by AWS
Builders.

## Repository layout

```
client/    React + Vite PWA — capture, queue, and map screens
backend/   AWS SAM app — plain Python Lambda functions behind API Gateway
```

## Local development

**Client**

```bash
cd client
npm install
npm run dev
```

**Backend** (no AWS account required — runs entirely local)

```bash
cd backend
pip install -r requirements.txt pytest
pytest                    # run the handler tests directly
uvicorn app:api --reload  # FastAPI on http://localhost:8000
sam build --use-container  # requires Docker; avoids local Python runtime mismatch
sam local start-api       # exercises the real API Gateway + Lambda path
```

The local API also exposes the same routes through Flask at `/flask/*`. Both
frameworks share the SQLite store (`groundtruth.db` by default), so captures
made through the offline client and requests made through either API remain
consistent. Set `GROUNDTRUTH_DB` to use a different database path.

## Deploying

**Backend** → `sam deploy --guided` (Lambda + API Gateway). The deployment
requires private subnet IDs, security group IDs, and a reachable
PostgreSQL/PostGIS connection string through the `DatabaseUrl` parameter. The
application uses SQLite only when `DATABASE_URL` is empty, for local
development. Lambda and the database must be in compatible VPC networking.

**Client** → connect the repo to AWS Amplify Hosting for git-triggered
deploys.

## Architecture

Client writes are durable in IndexedDB before any network attempt. Every sync
batch is idempotent, keyed by a client-generated UUID, so a dropped
connection can always retry safely. Conflicts resolve last-write-wins by
default. See the [design doc](#) and
[execution plan](#) for the full model.

## Status

Scaffold — created at the start of the First Commit build window. See
`.github/workflows/ci.yml` for the CI pipeline and the Notion execution plan
for the phase-by-phase build order.

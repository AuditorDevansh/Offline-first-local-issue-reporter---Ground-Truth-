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
backend/   AWS SAM app — API Gateway + Lambda, deploys to AWS
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
npm install
sam build
sam local start-api
```

## Deploying

**Backend** → `sam deploy --guided` (Lambda + API Gateway, RDS connection via
the `DatabaseUrl` parameter)

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

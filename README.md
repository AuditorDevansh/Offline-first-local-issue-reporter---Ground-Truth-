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

**Backend**

```bash
cd backend
pip install -r requirements.txt pytest
pytest
```

## Deploying

**Backend** → `sam deploy --guided` (Lambda + API Gateway). The deployment
requires private subnet IDs, security group IDs, and a reachable
PostgreSQL/PostGIS connection string through the `DatabaseUrl` parameter.

**Client** → connect the repo to AWS Amplify Hosting for git-triggered
deploys.

## Architecture

Client writes are durable in IndexedDB before any network attempt. Every sync
batch is idempotent, keyed by a client-generated UUID, so a dropped connection
can always retry safely. Conflicts resolve last-write-wins by default.

## Status

The app includes offline capture, local queueing, automatic synchronization,
responsive intro and reporter screens, and a GPS-backed Leaflet/OpenStreetMap
signal map.

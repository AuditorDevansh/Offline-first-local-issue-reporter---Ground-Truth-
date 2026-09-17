// POST /sync/batch
// Accepts an array of queued issues from the client's offline outbox.
// Idempotent: each issue carries a client-generated UUID, so replaying the
// same batch after a dropped connection must never create duplicates.
//
// TODO: replace this stub with a real upsert against RDS (PostgreSQL + PostGIS),
// keyed on `id`, that also compares `sync_version` to resolve conflicts.

exports.handler = async (event) => {
  let issues;
  try {
    issues = JSON.parse(event.body || "[]");
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Body must be a JSON array of issues" }),
    };
  }

  if (!Array.isArray(issues)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Expected an array of issues" }),
    };
  }

  // Stub response — echoes back what would have been upserted.
  const results = issues.map((issue) => ({
    id: issue.id,
    status: issue.id ? "synced" : "rejected",
  }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
  };
};

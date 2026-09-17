// GET /issues/{id} — single issue detail, for the municipal dashboard.
// PATCH /issues/{id} — staff status update (e.g. acknowledged, resolved).
//
// TODO: replace both branches with real RDS reads/writes.

exports.handler = async (event) => {
  const id = event.pathParameters && event.pathParameters.id;

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing issue id" }) };
  }

  if (event.httpMethod === "PATCH") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (err) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body, updated: true }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status: "queued", title: "Stub issue — replace with a real RDS read" }),
  };
};

// GET /healthz — cheap liveness check for the deploy target and demo prep.
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", service: "groundtruth-api" }),
  };
};

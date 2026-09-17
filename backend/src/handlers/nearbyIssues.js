// GET /issues/nearby?lat=&lng=&radius=
// Returns synced issues within `radius` meters of (lat, lng), for the map view.
//
// TODO: replace with a real PostGIS query, e.g.
//   SELECT * FROM issues
//   WHERE ST_DWithin(location, ST_MakePoint($lng, $lat)::geography, $radius)

exports.handler = async (event) => {
  const { lat, lng, radius } = event.queryStringParameters || {};

  if (!lat || !lng) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "lat and lng query parameters are required" }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      center: { lat: Number(lat), lng: Number(lng) },
      radius: Number(radius) || 1000,
      issues: [],
    }),
  };
};

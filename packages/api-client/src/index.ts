// Browser/Server shared fetch client to consume the fastify API
export async function fetchHealth() {
  const url = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${url}/health`);
  if (!res.ok) {
    throw new Error("Failed to fetch health status");
  }
  return res.json();
}

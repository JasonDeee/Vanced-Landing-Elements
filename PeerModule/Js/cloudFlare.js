// Điền tất cả code của CloudFlare Workers  vào đây

// Store connected peers (in memory - will reset when worker restarts)
let connectedPeers = new Set();

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Only POST requests are allowed", { status: 405 });
  }

  try {
    const { peerId } = await request.json();

    if (!peerId) {
      return new Response("Peer ID is required", { status: 400 });
    }

    // Add new peer
    connectedPeers.add(peerId);

    // Convert Set to Array for response
    const peerList = Array.from(connectedPeers);

    // Clean up disconnected peers (simple timeout-based cleanup)
    setTimeout(() => {
      connectedPeers.delete(peerId);
    }, 60000); // Remove peer after 1 minute of inactivity

    return new Response(JSON.stringify(peerList), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response("Error processing request", { status: 500 });
  }
}

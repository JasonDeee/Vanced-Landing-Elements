addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://beta.vanced.media",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };

  // Handle OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  // Forward request to Google Apps Script
  const APPS_SCRIPT_URL = "YOUR_GOOGLE_APPS_SCRIPT_URL";

  try {
    // Clone request và thêm headers cần thiết
    const modifiedRequest = new Request(APPS_SCRIPT_URL, {
      method: request.method,
      body: request.body,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const response = await fetch(modifiedRequest);
    const data = await response.json();

    // Return response với CORS headers
    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
}

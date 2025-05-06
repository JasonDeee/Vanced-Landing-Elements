// Đoạn mã test searchHacom với Cloudflare Worker Node.js
// Keyword: "14700K"

export default {
  async fetch(request, env, ctx) {
    const keyword = "14700K";
    const params = new URLSearchParams({
      action: "search",
      action_type: "search",
      q: keyword,
      limit: 10,
    });
    const url = `https://hacom.vn/ajax/get_json.php?${params.toString()}`;
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "Origin": "https://hacom.vn/"
        },
        // Cloudflare Worker mặc định CORS
        // mode: "cors" không cần thiết ở môi trường Worker
      });
      const data = await resp.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" },
        status: 200,
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        headers: { "content-type": "application/json; charset=utf-8" },
        status: 500,
      });
    }
  }
};

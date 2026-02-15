const DEFAULT_OFFICIAL_API_URL = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const toJsonResponse = (body, init = {}) => {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS,
      ...(init.headers || {}),
    },
  });
};

const getLatestProxy = async (drawNo) => {
  const url = `${DEFAULT_OFFICIAL_API_URL}${drawNo}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://www.dhlottery.co.kr/lt645/lotto645_more.do",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const text = await res.text();
  return { ok: res.ok, text };
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return toJsonResponse("{}", { headers: CORS });
    }

    // Support ?url= parameter (like AllOrigins)
    const targetUrlStr = url.searchParams.get("url");

    if (targetUrlStr) {
      try {
        const targetUrl = new URL(targetUrlStr);
        // Security: Only allow dhlottery.co.kr
        if (targetUrl.hostname !== "www.dhlottery.co.kr") {
          return toJsonResponse(JSON.stringify({ error: "Forbidden domain" }), { status: 403 });
        }

        const res = await fetch(targetUrl.toString(), {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.dhlottery.co.kr/",
            "X-Requested-With": "XMLHttpRequest"
          }
        });

        const text = await res.text();
        return toJsonResponse(text);
      } catch (e) {
        return toJsonResponse(JSON.stringify({ error: "Invalid URL" }), { status: 400 });
      }
    }

    // Fallback/Legacy: /proxy/latest?draw_no=1000
    if (url.pathname === "/proxy/latest") {
      const drawNo = Number(url.searchParams.get("draw_no") || 0);
      if (!drawNo) return toJsonResponse(JSON.stringify({ error: "missing draw_no" }), { status: 400 });

      const { ok, text } = await getLatestProxy(drawNo);
      if (!ok) return toJsonResponse(JSON.stringify({ error: "upstream error" }), { status: 502 });
      return toJsonResponse(text);
    }

    return toJsonResponse(JSON.stringify({ error: "Not Found" }), { status: 404 });
  },
};

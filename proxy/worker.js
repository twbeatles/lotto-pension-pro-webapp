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
      return toJsonResponse("{}");
    }

    if (url.pathname !== "/proxy/latest") {
      return toJsonResponse(JSON.stringify({ error: "not found" }), { status: 404 });
    }

    const drawNo = Number(url.searchParams.get("draw_no") || 0);
    const target = drawNo > 0 ? drawNo : 0;

    if (!target) {
      return toJsonResponse(
        JSON.stringify({
          error: "draw_no query parameter required",
          message: "proxy requires draw_no in query until API output is confirmed",
        }),
        { status: 400 }
      );
    }

    try {
      const { ok, text } = await getLatestProxy(target);
      if (!ok) {
        return toJsonResponse(JSON.stringify({
          error: "upstream_failed",
          status: "upstream_error",
        }), { status: 502 });
      }
      return toJsonResponse(text);
    } catch (err) {
      return toJsonResponse(JSON.stringify({ error: String(err) }), { status: 502 });
    }
  },
};

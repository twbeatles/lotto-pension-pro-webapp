const DEFAULT_OFFICIAL_API_URL = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const toJsonResponse = (body, init = {}) => {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(payload, {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS,
      ...(init.headers || {}),
    },
  });
};

const fetchOfficialRaw = async (drawNo) => {
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

const normalizeOfficialData = (raw) => {
  const drawNo = Number(raw?.ltEpsd);
  if (!drawNo) return null;

  const dateRaw = String(raw?.ltRflYmd || "");
  const date = dateRaw.length === 8
    ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
    : dateRaw;

  const numbers = [
    raw.tm1WnNo, raw.tm2WnNo, raw.tm3WnNo,
    raw.tm4WnNo, raw.tm5WnNo, raw.tm6WnNo
  ].map(Number);

  if (numbers.some((n) => Number.isNaN(n))) return null;

  return {
    draw_no: drawNo,
    date,
    numbers,
    bonus: Number(raw.bnsWnNo || 0),
    prize_amount: Number(raw.rnk1WnAmt || 0),
    winners_count: Number(raw.rnk1WnNope || 0),
    total_sales: Number(raw.rlvtEpsdSumNtslAmt || 0)
  };
};

const toLegacyDataRow = (row) => {
  const date = String(row?.date || "").replaceAll("-", "");
  const nums = Array.isArray(row?.numbers) ? row.numbers : [];
  return {
    ltEpsd: Number(row?.draw_no || 0),
    ltRflYmd: date,
    tm1WnNo: Number(nums[0] || 0),
    tm2WnNo: Number(nums[1] || 0),
    tm3WnNo: Number(nums[2] || 0),
    tm4WnNo: Number(nums[3] || 0),
    tm5WnNo: Number(nums[4] || 0),
    tm6WnNo: Number(nums[5] || 0),
    bnsWnNo: Number(row?.bonus || 0),
    rnk1WnAmt: Number(row?.prize_amount || 0),
    rnk1WnNope: Number(row?.winners_count || 0),
    rlvtEpsdSumNtslAmt: Number(row?.total_sales || 0),
  };
};

const getOneDraw = async (drawNo) => {
  const { ok, text } = await fetchOfficialRaw(drawNo);
  if (!ok) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return null;
  }
  const list = parsed?.data?.list;
  if (!Array.isArray(list) || list.length === 0) return null;
  return normalizeOfficialData(list[0]);
};

const getRange = async (from, to) => {
  const data = [];
  const missing = [];
  for (let drawNo = from; drawNo <= to; drawNo++) {
    const row = await getOneDraw(drawNo);
    if (row) data.push(row);
    else missing.push(drawNo);
  }
  return { from, to, count: data.length, missing, data };
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
      if (!drawNo) return toJsonResponse({ error: "missing draw_no" }, { status: 400 });
      const format = String(url.searchParams.get("format") || "hybrid").toLowerCase();

      const row = await getOneDraw(drawNo);
      if (!row) return toJsonResponse({ error: "upstream error" }, { status: 502 });
      const legacy = { data: { list: [toLegacyDataRow(row)] } };

      if (format === "legacy") return toJsonResponse(legacy);
      if (format === "normalized") return toJsonResponse({ data: [row] });

      return toJsonResponse({
        ...legacy,
        normalized: [row],
        meta: { format: "hybrid" }
      });
    }

    // Batch range endpoint: /proxy/range?from=1200&to=1210
    if (url.pathname === "/proxy/range") {
      const from = Number(url.searchParams.get("from") || 0);
      const to = Number(url.searchParams.get("to") || 0);
      const format = String(url.searchParams.get("format") || "normalized").toLowerCase();
      if (!from || !to || from > to) {
        return toJsonResponse({ error: "invalid range" }, { status: 400 });
      }
      if (to - from > 60) {
        return toJsonResponse({ error: "range too large (max 60)" }, { status: 400 });
      }

      const payload = await getRange(from, to);
      if (format === "legacy") {
        return toJsonResponse({
          from: payload.from,
          to: payload.to,
          count: payload.count,
          missing: payload.missing,
          data: { list: payload.data.map(toLegacyDataRow) }
        });
      }
      if (format === "hybrid") {
        return toJsonResponse({
          ...payload,
          legacy: { data: { list: payload.data.map(toLegacyDataRow) } }
        });
      }
      return toJsonResponse(payload);
    }

    return toJsonResponse({ error: "Not Found" }, { status: 404 });
  },
};

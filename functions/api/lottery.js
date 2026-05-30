/**
 * Cloudflare Pages Function: /api/lottery
 * (path kept as /api/lottery for frontend compatibility)
 *
 * Uses Tavily Search API to fetch real-time lottery draw data.
 * No LLM required — structured search + regex extraction.
 *
 * Environment variables (Pages → Settings → Environment variables):
 *   TAVILY_API_KEY  – your Tavily API key  (tvly-xxxxxxx)
 *   ALLOWED_ORIGIN  – your Pages domain (optional)
 */

// ── Lottery search query templates ──────────────────────────────
const LOTTERY_QUERIES = {
  ssq:  (issue) => issue ? `双色球第${issue}期开奖号码` : `双色球最新开奖号码期次`,
  dlt:  (issue) => issue ? `大乐透第${issue}期开奖号码` : `大乐透最新开奖号码期次`,
  qxc:  (issue) => issue ? `七星彩第${issue}期开奖号码` : `七星彩最新开奖号码期次`,
  fc3d: (issue) => issue ? `福彩3D第${issue}期开奖号码` : `福彩3D最新开奖号码期次`,
  p5:   (issue) => issue ? `排列五第${issue}期开奖号码` : `排列五最新开奖号码期次`,
};

// ── Extract lottery data from Tavily results ─────────────────────
function extractLotteryData(type, results, targetIssue) {
  // Merge all result text
  const text = results.map(r => (r.title || '') + ' ' + (r.content || '')).join('\n');

  // ── Issue number: 7-digit like 2026063 ──
  const issueNums = [...text.matchAll(/20\d{2}[012]\d{2}/g)]
    .map(m => parseInt(m[0]))
    .filter(n => n >= 2020001 && n <= 2030999)
    .sort((a, b) => b - a);

  let issue = targetIssue
    ? (issueNums.find(n => String(n) === String(targetIssue)) ? String(targetIssue) : null)
    : (issueNums[0] ? String(issueNums[0]) : null);

  if (!issue) return null;

  // ── Draw date ──
  let date = '';
  const dm = text.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})/);
  if (dm) date = `${dm[1]}-${dm[2].padStart(2,'0')}-${dm[3].padStart(2,'0')}`;

  // ── Ball numbers by lottery type ──
  let red = [], blue = [];

  if (type === 'ssq') {
    // 双色球: 6红(01-33) + 1蓝(01-16)
    // Try "XX XX XX XX XX XX + XX" pattern
    const m = text.match(/\b(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s*[+＋]\s*(\d{2})/);
    if (m) {
      red  = [m[1],m[2],m[3],m[4],m[5],m[6]].map(Number).filter(n=>n>=1&&n<=33);
      blue = [parseInt(m[7])].filter(n=>n>=1&&n<=16);
    }
    // Fallback: comma/顿号 separated
    if (red.length < 6) {
      const m2 = text.match(/红球[：:]?\s*([\d,，、\s]+?)[\s蓝]/);
      if (m2) red = m2[1].match(/\d+/g).map(Number).filter(n=>n>=1&&n<=33).slice(0,6);
      const m3 = text.match(/蓝球[：:]?\s*(\d+)/);
      if (m3) blue = [parseInt(m3[1])].filter(n=>n>=1&&n<=16);
    }

  } else if (type === 'dlt') {
    // 大乐透: 5前(01-35) + 2后(01-12)
    const m = text.match(/\b(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s*[+＋]\s*(\d{2})\s+(\d{2})/);
    if (m) {
      red  = [m[1],m[2],m[3],m[4],m[5]].map(Number).filter(n=>n>=1&&n<=35);
      blue = [parseInt(m[6]),parseInt(m[7])].filter(n=>n>=1&&n<=12);
    }
    if (red.length < 5) {
      const m2 = text.match(/前区[：:]?\s*([\d,，、\s]+?)后区/);
      if (m2) red = m2[1].match(/\d+/g).map(Number).filter(n=>n>=1&&n<=35).slice(0,5);
      const m3 = text.match(/后区[：:]?\s*([\d,，\s]+)/);
      if (m3) blue = m3[1].match(/\d+/g).map(Number).filter(n=>n>=1&&n<=12).slice(0,2);
    }

  } else if (type === 'qxc') {
    // 七星彩: 7位数字0-9
    const m = text.match(/七星彩[^\d]*(\d[\s,]*\d[\s,]*\d[\s,]*\d[\s,]*\d[\s,]*\d[\s,]*\d)/);
    if (m) red = m[1].match(/\d/g).map(Number).slice(0,7);

  } else if (type === 'fc3d') {
    // 福彩3D: 3位数字0-9
    const m = text.match(/3D[^\d]*(\d[\s,]*\d[\s,]*\d)/i);
    if (m) red = m[1].match(/\d/g).map(Number).slice(0,3);
    if (red.length < 3) {
      const m2 = text.match(/开奖号码[：:\s]*(\d{3})/);
      if (m2) red = m2[1].split('').map(Number);
    }

  } else if (type === 'p5') {
    // 排列五: 5位数字0-9
    const m = text.match(/排列五[^\d]*(\d[\s,]*\d[\s,]*\d[\s,]*\d[\s,]*\d)/);
    if (m) red = m[1].match(/\d/g).map(Number).slice(0,5);
    if (red.length < 5) {
      const m2 = text.match(/开奖号码[：:\s]*(\d{5})/);
      if (m2) red = m2[1].split('').map(Number);
    }
  }

  const minBalls = { ssq:6, dlt:5, qxc:7, fc3d:3, p5:5 };
  if (red.length < minBalls[type]) return null;

  return { issue, date, red, blue };
}

// ── Call Tavily Search API ────────────────────────────────────────
async function tavilySearch(apiKey, query) {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      query,
      search_depth:   'basic',
      max_results:    5,
      include_answer: true,
      topic:          'news',
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('TAVILY_' + resp.status + ': ' + t.slice(0, 120));
  }
  return resp.json();
}

// ── Pages Function handler ────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const origin  = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || origin || '*';
  const cors = {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400, cors); }

  const { type, issue } = body;
  if (!type || !['ssq','dlt','qxc','fc3d','p5'].includes(type)) {
    return json({ error: 'Invalid lottery type' }, 400, cors);
  }

  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) return json({ error: 'TAVILY_API_KEY not configured' }, 500, cors);

  const query = LOTTERY_QUERIES[type](issue || null);

  let tavilyData;
  try { tavilyData = await tavilySearch(apiKey, query); }
  catch (e) { return json({ error: e.message }, 502, cors); }

  const allResults = [
    ...(tavilyData.answer  ? [{ title: 'answer', content: tavilyData.answer }] : []),
    ...(tavilyData.results || []),
  ];

  const extracted = extractLotteryData(type, allResults, issue || null);

  if (!extracted) {
    // Return raw snippets for debugging
    return json({
      error:    'parse_failed',
      answer:   tavilyData.answer || '',
      snippets: (tavilyData.results||[]).slice(0,2).map(r=>({
        title:   r.title,
        content: (r.content||'').slice(0, 300),
      })),
    }, 200, cors);
  }

  return json(extracted, 200, cors);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    },
  });
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

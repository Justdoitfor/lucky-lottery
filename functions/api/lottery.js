/**
 * Cloudflare Pages Function: /api/lottery
 *
 * Data source: https://raw.githubusercontent.com/yangxb919/lottery-data/main/data/
 * - data/latest.json  — latest draw for ssq & dlt (updated daily by GitHub Actions)
 * - data/ssq.json     — full ssq history, latest first
 * - data/dlt.json     — full dlt history, latest first
 *
 * For qxc / fc3d / p5: falls back to Tavily (set TAVILY_API_KEY optionally)
 *
 * Required env vars: none (GitHub data is public)
 * Optional env vars: TAVILY_API_KEY (for qxc/fc3d/p5 draw queries)
 */

const RAW = 'https://raw.githubusercontent.com/yangxb919/lottery-data/main/data';

// ── GitHub data source (ssq + dlt) ──────────────────────────────
async function fetchFromGitHub(type, issue) {
  // Latest draw
  if (!issue) {
    const resp = await fetch(`${RAW}/latest.json`, {
      headers: { 'Cache-Control': 'no-cache' },
      cf: { cacheTtl: 300 },           // Cloudflare edge cache 5 min
    });
    if (!resp.ok) throw new Error('GitHub latest fetch failed: ' + resp.status);
    const data = await resp.json();
    const entry = data.lotteries?.[type];
    if (!entry) throw new Error('type not in latest.json: ' + type);
    return normaliseEntry(type, entry);
  }

  // Historical draw by issue
  const resp = await fetch(`${RAW}/${type}.json`, {
    cf: { cacheTtl: 3600 },           // cache full history 1h
  });
  if (!resp.ok) throw new Error('GitHub history fetch failed: ' + resp.status);
  const list = await resp.json();
  const entry = list.find(e => String(e.issue) === String(issue));
  if (!entry) return null;            // issue not found = not drawn yet
  return normaliseEntry(type, entry);
}

function normaliseEntry(type, e) {
  if (type === 'ssq') {
    return {
      issue: String(e.issue),
      date:  e.date || '',
      red:   (e.red  || []).map(Number),
      blue:  (e.blue || []).map(Number),
    };
  }
  if (type === 'dlt') {
    return {
      issue: String(e.issue),
      date:  e.date || '',
      red:   (e.front || e.red || []).map(Number),
      blue:  (e.back  || e.blue || []).map(Number),
    };
  }
  return null;
}

// ── Tavily fallback for qxc / fc3d / p5 ─────────────────────────
const TAVILY_QUERIES = {
  qxc:  (issue) => issue
    ? `七星彩${issue}期开奖号码`
    : `七星彩最新开奖号码 期次 site:sporttery.cn OR site:500.com`,
  fc3d: (issue) => issue
    ? `福彩3D${issue}期开奖号码`
    : `福彩3D最新开奖号码 期次 site:cwl.gov.cn OR site:500.com`,
  p5:   (issue) => issue
    ? `排列五${issue}期开奖号码`
    : `排列五最新开奖号码 期次 site:cwl.gov.cn OR site:500.com`,
};

async function fetchFromTavily(apiKey, type, issue) {
  const query = TAVILY_QUERIES[type]?.(issue || null);
  if (!query) throw new Error('No Tavily query for type: ' + type);

  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      query,
      search_depth:    'advanced',
      max_results:     6,
      include_answer:  false,          // skip AI answer — too unreliable
      include_domains: [
        'cwl.gov.cn', 'sporttery.cn', '500.com',
        'zhcw.com', 'cjcp.com.cn', 'aicai.com',
      ],
      topic: 'general',
    }),
  });
  if (!resp.ok) throw new Error('Tavily ' + resp.status);

  const data = await resp.json();
  const text = (data.results || [])
    .map(r => (r.title || '') + ' ' + (r.content || ''))
    .join('\n');

  return parseTavilyText(type, text, issue);
}

function parseTavilyText(type, text, targetIssue) {
  // Issue: 5-digit (26063) or 7-digit (2026063)
  const issueRe = /\b((?:20)?\d{2}[012]\d{2})\b/g;
  const issues = [...text.matchAll(issueRe)]
    .map(m => parseInt(m[1]))
    .filter(n => (n >= 20001 && n <= 30999) || (n >= 2020001 && n <= 2035365))
    .sort((a, b) => b - a);
  let issue = targetIssue || (issues[0] ? String(issues[0]) : null);
  if (!issue) return null;

  const dateM = text.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})/);
  const date  = dateM
    ? `${dateM[1]}-${dateM[2].padStart(2,'0')}-${dateM[3].padStart(2,'0')}`
    : '';

  let red = [], blue = [];

  if (type === 'qxc') {
    const m = text.match(/七星彩[^0-9]*(\d[\s,]*\d[\s,]*\d[\s,]*\d[\s,]*\d[\s,]*\d[\s,]*\d)/);
    if (m) red = m[1].match(/\d/g).map(Number).slice(0, 7);
  } else if (type === 'fc3d') {
    const m = text.match(/3D[^0-9]*(\d[\s,]*\d[\s,]*\d)/i)
           || text.match(/开奖号码[：:\s]*(\d{3})/);
    if (m) red = m[1].match(/\d/g).map(Number).slice(0, 3);
  } else if (type === 'p5') {
    const m = text.match(/排列五[^0-9]*(\d[\s,]*\d[\s,]*\d[\s,]*\d[\s,]*\d)/);
    if (m) red = m[1].match(/\d/g).map(Number).slice(0, 5);
  }

  const need = { qxc:7, fc3d:3, p5:5 }[type];
  if (!need || red.length < need) return null;
  return { issue, date, red, blue };
}

// ── Main handler ─────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const origin = request.headers.get('Origin') || '';
  const cors = {
    'Access-Control-Allow-Origin':  env.ALLOWED_ORIGIN || origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  let body;
  try { body = await request.json(); }
  catch { return j({ error: 'Invalid JSON' }, 400, cors); }

  const { type, issue } = body;
  const validTypes = ['ssq','dlt','qxc','fc3d','p5'];
  if (!type || !validTypes.includes(type)) {
    return j({ error: 'Invalid lottery type. Valid: ' + validTypes.join(',') }, 400, cors);
  }

  try {
    let result = null;

    if (type === 'ssq' || type === 'dlt') {
      // Primary: GitHub JSON data (accurate, fast, free)
      result = await fetchFromGitHub(type, issue || null);

      if (!result && !issue) {
        return j({ error: 'Latest data not available from GitHub' }, 503, cors);
      }
      if (!result && issue) {
        return j({ error: 'Issue ' + issue + ' not found — may not be drawn yet' }, 404, cors);
      }

    } else {
      // qxc / fc3d / p5 — use Tavily if key is set
      const apiKey = env.TAVILY_API_KEY;
      if (!apiKey) {
        return j({
          error: 'TAVILY_API_KEY not configured (required for qxc/fc3d/p5)',
        }, 500, cors);
      }
      result = await fetchFromTavily(apiKey, type, issue || null);
      if (!result) {
        return j({ error: 'draw_not_found', message: '未找到开奖数据，可能尚未开奖' }, 200, cors);
      }
    }

    return j(result, 200, cors);

  } catch (err) {
    return j({ error: err.message }, 502, cors);
  }
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

function j(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

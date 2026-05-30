/**
 * Cloudflare Pages Function: /api/lottery
 *
 * Data source: https://github.com/yangxb919/lottery-data
 * Updated daily by GitHub Actions after each draw (~22:05 BJT).
 *
 * Supported types: ssq (双色球), dlt (大乐透)
 *
 * No API keys required — data is public on GitHub.
 */

const RAW = 'https://raw.githubusercontent.com/yangxb919/lottery-data/main/data';

// ── Fetch from GitHub JSON files ─────────────────────────────────
async function fetchLatest(type) {
  const resp = await fetch(`${RAW}/latest.json`, {
    cf: { cacheTtl: 300 },   // Cloudflare edge cache: 5 min
  });
  if (!resp.ok) throw new Error('GitHub fetch failed: ' + resp.status);
  const data = await resp.json();

  const entry = data.lotteries?.[type];
  if (!entry) throw new Error('Type not in latest.json: ' + type);
  return normalise(type, entry);
}

async function fetchByIssue(type, issue) {
  const resp = await fetch(`${RAW}/${type}.json`, {
    cf: { cacheTtl: 3600 },  // cache full history: 1 hour
  });
  if (!resp.ok) throw new Error('GitHub history fetch failed: ' + resp.status);
  const list = await resp.json();

  const entry = list.find(e => String(e.issue) === String(issue));
  return entry ? normalise(type, entry) : null;
}

function normalise(type, e) {
  if (type === 'ssq') {
    return {
      issue: String(e.issue),
      date:  e.date || '',
      red:   (e.red  || []).map(Number),
      blue:  (e.blue || []).map(Number),
    };
  }
  // dlt: front/back or red/blue
  return {
    issue: String(e.issue),
    date:  e.date || '',
    red:   (e.front || e.red  || []).map(Number),
    blue:  (e.back  || e.blue || []).map(Number),
  };
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
  if (!type || !['ssq', 'dlt'].includes(type)) {
    return j({ error: 'Invalid type. Supported: ssq, dlt' }, 400, cors);
  }

  try {
    if (issue) {
      // Query a specific draw
      const result = await fetchByIssue(type, issue);
      if (!result) {
        return j({ error: 'not_drawn_yet', message: `第${issue}期尚未开奖` }, 200, cors);
      }
      return j(result, 200, cors);
    } else {
      // Get latest draw
      const result = await fetchLatest(type);
      return j(result, 200, cors);
    }
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

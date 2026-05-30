/**
 * Cloudflare Pages Function: /api/lottery
 *
 * Uses Tavily Search API to fetch Chinese lottery draw results.
 * Searches Chinese-language sources with site restrictions.
 *
 * Environment variables:
 *   TAVILY_API_KEY  – Tavily API key (tvly-xxxxxxx)
 */

// ── Per-lottery search config ───────────────────────────────────
const LOTTERY_CONFIG = {
  ssq: {
    name: '双色球',
    latestQuery:  (today) => `双色球最新开奖结果 ${today} 期次 红球 蓝球 site:cwl.gov.cn OR site:zhcw.com OR site:500.com`,
    issueQuery:   (issue) => `双色球 ${issue}期 开奖结果 红球 蓝球 site:cwl.gov.cn OR site:zhcw.com OR site:500.com`,
    redCount: 6, blueCount: 1,
    redRange: [1,33], blueRange: [1,16],
  },
  dlt: {
    name: '大乐透',
    latestQuery:  (today) => `大乐透最新开奖结果 ${today} 期次 前区 后区 site:lottery.gov.cn OR site:sporttery.cn OR site:500.com`,
    issueQuery:   (issue) => `大乐透 ${issue}期 开奖结果 前区 后区 site:sporttery.cn OR site:500.com`,
    redCount: 5, blueCount: 2,
    redRange: [1,35], blueRange: [1,12],
  },
  qxc: {
    name: '七星彩',
    latestQuery:  (today) => `七星彩最新开奖号码 ${today} 期次 site:sporttery.cn OR site:500.com OR site:zhcw.com`,
    issueQuery:   (issue) => `七星彩 ${issue}期 开奖号码 site:sporttery.cn OR site:500.com`,
    redCount: 7, blueCount: 0,
    redRange: [0,9], blueRange: null,
  },
  fc3d: {
    name: '福彩3D',
    latestQuery:  (today) => `福彩3D最新开奖号码 ${today} 期次 site:cwl.gov.cn OR site:zhcw.com OR site:500.com`,
    issueQuery:   (issue) => `福彩3D ${issue}期 开奖号码 site:cwl.gov.cn OR site:zhcw.com`,
    redCount: 3, blueCount: 0,
    redRange: [0,9], blueRange: null,
  },
  p5: {
    name: '排列五',
    latestQuery:  (today) => `排列五最新开奖号码 ${today} 期次 site:cwl.gov.cn OR site:zhcw.com OR site:500.com`,
    issueQuery:   (issue) => `排列五 ${issue}期 开奖号码 site:cwl.gov.cn OR site:zhcw.com`,
    redCount: 5, blueCount: 0,
    redRange: [0,9], blueRange: null,
  },
};

// ── Tavily search ────────────────────────────────────────────────
async function tavilySearch(apiKey, query) {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      query,
      search_depth:    'advanced',   // deeper search for better results
      max_results:     8,
      include_answer:  true,
      include_domains: [             // restrict to Chinese lottery sites
        'cwl.gov.cn', 'zhcw.com', 'sporttery.cn',
        'lottery.gov.cn', '500.com', 'cjcp.com.cn',
        'caipiao.163.com', 'aicai.com',
      ],
      topic: 'general',
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('TAVILY_' + resp.status + ': ' + t.slice(0, 200));
  }
  return resp.json();
}

// ── Extract issue number from text ───────────────────────────────
function extractIssue(text) {
  // Match 7-digit issues like 2026063
  const matches = [...text.matchAll(/\b(20[23]\d{4})\b/g)]
    .map(m => parseInt(m[1]))
    .filter(n => n >= 2020001 && n <= 2035365)
    .sort((a, b) => b - a);
  return matches.length ? String(matches[0]) : null;
}

// ── Extract draw date from text ───────────────────────────────────
function extractDate(text) {
  const m = text.match(/(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
}

// ── Extract ball numbers ──────────────────────────────────────────
function extractNumbers(text, cfg) {
  const { redCount, blueCount, redRange, blueRange } = cfg;
  const isSeq = redRange[0] === 0; // sequential 0-9 games

  let red = [], blue = [];

  if (!isSeq) {
    // ── Padded number games (ssq / dlt) ──
    // Try explicit label pattern first
    if (cfg.name === '双色球') {
      // "红球：06 11 18 22 28 31 蓝球：12"
      const m1 = text.match(/红球[号码：:\s]*((?:\d{1,2}[\s,，、]+){5}\d{1,2})/);
      const m2 = text.match(/蓝球[号码：:\s]*(\d{1,2})/);
      if (m1) red  = m1[1].match(/\d+/g).map(Number).filter(n => n>=1&&n<=33).slice(0,6);
      if (m2) blue = [parseInt(m2[1])].filter(n => n>=1&&n<=16);

      // Fallback: "06 11 18 22 28 31 + 12"
      if (red.length < 6) {
        const m3 = text.match(/\b(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s*[＋+]\s*(\d{2})/);
        if (m3) {
          red  = [m3[1],m3[2],m3[3],m3[4],m3[5],m3[6]].map(Number).filter(n=>n>=1&&n<=33);
          blue = [parseInt(m3[7])].filter(n=>n>=1&&n<=16);
        }
      }
    }

    if (cfg.name === '大乐透') {
      // "前区：05 11 18 24 33 后区：04 09"
      const m1 = text.match(/前区[号码：:\s]*((?:\d{1,2}[\s,，、]+){4}\d{1,2})/);
      const m2 = text.match(/后区[号码：:\s]*((?:\d{1,2}[\s,，、]+)?\d{1,2})/);
      if (m1) red  = m1[1].match(/\d+/g).map(Number).filter(n=>n>=1&&n<=35).slice(0,5);
      if (m2) blue = m2[1].match(/\d+/g).map(Number).filter(n=>n>=1&&n<=12).slice(0,2);

      if (red.length < 5) {
        const m3 = text.match(/\b(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})\s*[＋+]\s*(\d{2})\s+(\d{2})/);
        if (m3) {
          red  = [m3[1],m3[2],m3[3],m3[4],m3[5]].map(Number).filter(n=>n>=1&&n<=35);
          blue = [parseInt(m3[6]),parseInt(m3[7])].filter(n=>n>=1&&n<=12);
        }
      }
    }

  } else {
    // ── Sequential digit games (qxc/fc3d/p5) ──
    const nameMap = { '七星彩':'七星彩', '福彩3D':'3D|福彩3D', '排列五':'排列五' };
    const pat = nameMap[cfg.name] || cfg.name;

    // "七星彩：1 2 3 4 5 6 7" or "开奖号码：12345"
    const m1 = text.match(new RegExp(
      '(?:' + pat + '|开奖号码)[^\\d]*([\\d][\\s,，]*' +
      '[\\d](?:[\\s,，]*[\\d]){' + (redCount-2) + '})'
    ));
    if (m1) {
      const digits = m1[1].match(/\d/g);
      if (digits && digits.length >= redCount) red = digits.slice(0, redCount).map(Number);
    }

    // Fallback: find a run of exactly redCount single digits
    if (red.length < redCount) {
      const allDigits = [...text.matchAll(/\b(\d)\b/g)].map(m => parseInt(m[1]));
      if (allDigits.length >= redCount) red = allDigits.slice(0, redCount);
    }
  }

  return { red, blue };
}

// ── Parse Tavily response into structured lottery data ────────────
function parseLotteryData(cfg, tavilyData, targetIssue) {
  // Merge answer + all result snippets
  const chunks = [
    tavilyData.answer || '',
    ...(tavilyData.results || []).map(r => (r.title||'') + ' ' + (r.content||'')),
  ];
  const fullText = chunks.join('\n');

  // Extract issue
  let issue = targetIssue
    ? (fullText.includes(String(targetIssue)) ? String(targetIssue) : extractIssue(fullText))
    : extractIssue(fullText);

  if (!issue) return null;

  const date = extractDate(fullText);
  const { red, blue } = extractNumbers(fullText, cfg);

  const minRed = cfg.redCount;
  const minBlue = cfg.blueCount;
  if (red.length < minRed || blue.length < minBlue) return null;

  return { issue, date, red: red.slice(0, minRed), blue: blue.slice(0, minBlue) };
}

// ── Main handler ─────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  const origin  = request.headers.get('Origin') || '';
  const cors = {
    'Access-Control-Allow-Origin':  env.ALLOWED_ORIGIN || origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  let body;
  try { body = await request.json(); }
  catch { return j({ error: 'Invalid JSON' }, 400, cors); }

  const { type, issue } = body;
  if (!type || !LOTTERY_CONFIG[type]) return j({ error: 'Invalid type' }, 400, cors);

  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) return j({ error: 'TAVILY_API_KEY not configured' }, 500, cors);

  const cfg = LOTTERY_CONFIG[type];
  const todayBJ = new Date(Date.now() + 8*3600000).toISOString().slice(0,10);
  const query = issue ? cfg.issueQuery(issue) : cfg.latestQuery(todayBJ);

  let tavilyData;
  try { tavilyData = await tavilySearch(apiKey, query); }
  catch (e) { return j({ error: e.message }, 502, cors); }

  const result = parseLotteryData(cfg, tavilyData, issue || null);

  if (!result) {
    // Return debug info so frontend can show a proper message
    return j({
      error:    'parse_failed',
      query,
      answer:   (tavilyData.answer || '').slice(0, 200),
      snippets: (tavilyData.results || []).slice(0, 2).map(r => ({
        url:     r.url,
        title:   r.title,
        content: (r.content || '').slice(0, 200),
      })),
    }, 200, cors);
  }

  return j(result, 200, cors);
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

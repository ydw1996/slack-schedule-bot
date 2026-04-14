import { config } from '../../../config/env.mjs';
import { buildUrl, fetchJson } from '../../shared/http.mjs';
import { formatKoreanBasisTime } from '../../shared/time.mjs';

const TWELVE_LIMIT_PER_MINUTE = 8;
const TWELVE_WINDOW_MS = 60_000;
let twelveWindowStartedAt = 0;
let twelveRequestCount = 0;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function throttleTwelveRequest() {
  const now = Date.now();

  if (!twelveWindowStartedAt || now - twelveWindowStartedAt >= TWELVE_WINDOW_MS) {
    twelveWindowStartedAt = now;
    twelveRequestCount = 0;
  }

  if (twelveRequestCount >= TWELVE_LIMIT_PER_MINUTE) {
    const waitMs = Math.max(0, TWELVE_WINDOW_MS - (now - twelveWindowStartedAt)) + 300;
    await sleep(waitMs);
    twelveWindowStartedAt = Date.now();
    twelveRequestCount = 0;
  }

  twelveRequestCount += 1;
}

function toNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value, { digits = 1 } = {}) {
  if (!Number.isFinite(value)) {
    return '정보 없음';
  }

  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function calcPercentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function parseErrorMessage(payload, label) {
  if (payload?.status === 'error' && payload?.message) {
    return `${label} error: ${payload.message}`;
  }

  return null;
}

async function fetchTwelve(endpoint, params, label) {
  if (!config.invest.twelveDataApiKey) {
    throw new Error('TWELVE_DATA_API_KEY is missing.');
  }

  await throttleTwelveRequest();

  const url = buildUrl(config.invest.twelveDataBaseUrl, endpoint, {
    ...params,
    apikey: config.invest.twelveDataApiKey,
  });
  const payload = await fetchJson(url, { timeoutMs: 20_000 });
  const errorMessage = parseErrorMessage(payload, label);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return payload;
}

function parseTimeSeries(payload, label) {
  const rows = Array.isArray(payload?.values) ? payload.values : [];
  const numeric = rows
    .map((row) => ({
      date: row.datetime,
      value: toNumber(row.close),
    }))
    .filter((item) => Number.isFinite(item.value));

  if (numeric.length === 0) {
    throw new Error(`${label} time series has no numeric rows.`);
  }

  return {
    value: numeric[0].value,
    previous: numeric[1]?.value ?? null,
    date: numeric[0].date,
  };
}

async function fetchPrice(symbol, label) {
  const payload = await fetchTwelve('/price', { symbol }, label);
  const value = toNumber(payload?.price);

  if (!Number.isFinite(value)) {
    throw new Error(`${label} price is missing.`);
  }

  return { value };
}

async function fetchDailyCloseWithCandidates(symbols, label) {
  let lastError = null;

  for (const symbol of symbols) {
    try {
      const payload = await fetchTwelve(
        '/time_series',
        { symbol, interval: '1day', outputsize: 2, order: 'desc' },
        `${label}(${symbol})`,
      );
      const result = parseTimeSeries(payload, `${label}(${symbol})`);
      return {
        ...result,
        symbol,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`${label} quote is unavailable.`);
}

async function fetchKospiLike() {
  return fetchDailyCloseWithCandidates(['KOSPI', '^KS11', '069500:KRX', 'EWY'], 'KOSPI');
}

async function fetchSp500Like() {
  return fetchDailyCloseWithCandidates(['SPX', 'SPY'], 'S&P 500');
}

async function fetchNasdaqLike() {
  return fetchDailyCloseWithCandidates(['IXIC', 'QQQ'], 'NASDAQ');
}

async function fetchWtiLike() {
  const candidates = ['WTI', 'USOIL', 'CL=F'];
  let lastError = null;

  for (const symbol of candidates) {
    try {
      const price = await fetchPrice(symbol, `WTI(${symbol})`);
      return { ...price, symbol };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('WTI quote is unavailable.');
}

async function fetchGoldLike() {
  const candidates = ['XAU/USD', 'GOLD', 'GC=F'];
  let lastError = null;

  for (const symbol of candidates) {
    try {
      const price = await fetchPrice(symbol, `Gold(${symbol})`);
      return { ...price, symbol };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Gold quote is unavailable.');
}

async function withFallback(label, fallback, task) {
  try {
    return await task();
  } catch (error) {
    console.error(`${label} lookup failed:`, error.message);
    return fallback;
  }
}

function formatIndex(name, value, changePct, { digits = 1 } = {}) {
  const change = formatSignedPercent(changePct);
  return `${name} ${formatNumber(value, { digits })}${change ? ` (${change})` : ''}`;
}

async function buildFxLine() {
  const [usdKrw, jpyKrw] = await Promise.all([
    withFallback('USD/KRW', null, () => fetchPrice('USD/KRW', 'USD/KRW')),
    withFallback('JPY/KRW', null, () => fetchPrice('JPY/KRW', 'JPY/KRW')),
  ]);

  if (!usdKrw || !jpyKrw) {
    return '환율: 조회 실패';
  }

  return `환율: 원/달러 ${formatNumber(usdKrw.value, { digits: 1 })} / 원/엔 ${formatNumber(jpyKrw.value, { digits: 2 })}`;
}

async function buildIndicesLine() {
  const [sp500, nasdaq, kospi] = await Promise.all([
    withFallback('S&P 500', null, fetchSp500Like),
    withFallback('NASDAQ', null, fetchNasdaqLike),
    withFallback('KOSPI', null, fetchKospiLike),
  ]);

  const parts = [];

  if (sp500) {
    parts.push(formatIndex('S&P', sp500.value, calcPercentChange(sp500.value, sp500.previous)));
  }
  if (nasdaq) {
    parts.push(formatIndex('나스닥', nasdaq.value, calcPercentChange(nasdaq.value, nasdaq.previous)));
  }
  if (kospi) {
    const kospiLabel = ['KOSPI', '^KS11', '069500:KRX'].includes(kospi.symbol) ? '코스피' : '코스피(대체)';
    parts.push(formatIndex(kospiLabel, kospi.value, calcPercentChange(kospi.value, kospi.previous)));
  }

  return parts.length > 0 ? `지수: ${parts.join(' / ')}` : '지수: 조회 실패';
}

async function buildCommoditiesLine() {
  const [oil, gold] = await Promise.all([
    withFallback('WTI', null, fetchWtiLike),
    withFallback('Gold', null, fetchGoldLike),
  ]);

  const parts = [];

  if (oil) {
    parts.push(`유가(WTI) $${formatNumber(oil.value, { digits: 2 })}`);
  }
  if (gold) {
    parts.push(`금($/oz) $${formatNumber(gold.value, { digits: 2 })}`);
  }

  return parts.length > 0 ? `원자재: ${parts.join(' / ')}` : '원자재: 조회 실패';
}

export async function buildInvestBriefing() {
  const [fxLine, indicesLine, commoditiesLine] = await Promise.all([
    buildFxLine(),
    buildIndicesLine(),
    buildCommoditiesLine(),
  ]);

  return {
    key: 'invest',
    title: ':chart_with_upwards_trend: 투자 브리핑',
    basis: formatKoreanBasisTime(new Date(), config.timezone),
    lines: [fxLine, indicesLine, commoditiesLine],
  };
}

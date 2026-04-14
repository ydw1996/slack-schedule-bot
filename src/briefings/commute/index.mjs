import { config } from '../../../config/env.mjs';
import { buildUrl, fetchJson } from '../../shared/http.mjs';
import { formatKoreanBasisTime } from '../../shared/time.mjs';

const weatherSky = {
  1: '맑음',
  3: '구름많음',
  4: '흐림',
};

const weatherPrecipitation = {
  0: null,
  1: '비',
  2: '비/눈',
  3: '눈',
  4: '소나기',
};

const airQualityGrades = {
  1: '좋음',
  2: '보통',
  3: '나쁨',
  4: '매우 나쁨',
};

function getForecastItems(payload) {
  return payload?.response?.body?.items?.item || [];
}

function toForecastTimestamp(entry) {
  const date = String(entry.fcstDate || '');
  const time = String(entry.fcstTime || '').padStart(4, '0');

  if (!/^\d{8}$/.test(date) || !/^\d{4}$/.test(time)) {
    return null;
  }

  const year = Number.parseInt(date.slice(0, 4), 10);
  const month = Number.parseInt(date.slice(4, 6), 10);
  const day = Number.parseInt(date.slice(6, 8), 10);
  const hour = Number.parseInt(time.slice(0, 2), 10);
  const minute = Number.parseInt(time.slice(2, 4), 10);

  if (hour > 23 || minute > 59) {
    return null;
  }

  // fcstDate/fcstTime are in KST, convert to UTC timestamp for stable comparison.
  return Date.UTC(year, month - 1, day, hour - 9, minute);
}

function pickForecast(items, now = new Date()) {
  const grouped = new Map();

  for (const item of items) {
    const key = `${item.fcstDate || ''}${item.fcstTime || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        fcstDate: item.fcstDate,
        fcstTime: item.fcstTime,
      });
    }
    grouped.get(key)[item.category] = item.fcstValue;
  }

  const forecasts = [...grouped.values()].sort((a, b) =>
    `${a.fcstDate}${a.fcstTime}`.localeCompare(`${b.fcstDate}${b.fcstTime}`),
  );

  const nowTimestamp = now.getTime();
  let nearest = null;

  for (const entry of forecasts) {
    if (!entry.TMP && !entry.SKY && !entry.PTY) {
      continue;
    }

    const timestamp = toForecastTimestamp(entry);
    if (timestamp === null) {
      continue;
    }

    const distance = Math.abs(timestamp - nowTimestamp);
    if (!nearest || distance < nearest.distance || (distance === nearest.distance && timestamp > nearest.timestamp)) {
      nearest = { entry, timestamp, distance };
    }
  }

  return nearest?.entry || forecasts.find((entry) => entry.TMP || entry.SKY || entry.PTY) || {};
}

function summarizeWeather(payload) {
  const forecast = pickForecast(getForecastItems(payload));
  const sky = weatherSky[forecast.SKY] || '정보 없음';
  const precipitation = weatherPrecipitation[forecast.PTY];
  const temperature = forecast.TMP ? `${forecast.TMP}도` : '기온 정보 없음';
  const rain = forecast.POP ? `강수 ${forecast.POP}%` : null;

  return [precipitation || sky, temperature, rain].filter(Boolean).join(' / ');
}

function findObjectWithKeys(value, keys) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (keys.some((key) => Object.prototype.hasOwnProperty.call(value, key))) {
    return value;
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findObjectWithKeys(item, keys);
        if (found) {
          return found;
        }
      }
      continue;
    }

    const found = findObjectWithKeys(child, keys);
    if (found) {
      return found;
    }
  }

  return null;
}

function summarizeAirQuality(payload) {
  if (payload?.pm10 || payload?.pm25 || payload?.khai_grade) {
    const grade = payload.pm10?.grade || payload.khai_grade || '정보 없음';
    const pm10 = payload.pm10?.value ? `미세: ${payload.pm10.value}` : null;
    const pm25 = payload.pm25?.value ? `초미세: ${payload.pm25.value}` : null;

    return {
      text: [grade, pm10, pm25].filter(Boolean).join(' / '),
    };
  }

  const item = findObjectWithKeys(payload, ['pm10Value', 'pm25Value', 'pm10Grade', 'khaiGrade']);
  const grade = airQualityGrades[item?.pm10Grade] || airQualityGrades[item?.khaiGrade] || '정보 없음';
  const pm10 = item?.pm10Value ? `미세: ${item.pm10Value}` : null;
  const pm25 = item?.pm25Value ? `초미세: ${item.pm25Value}` : null;

  return {
    text: [grade, pm10, pm25].filter(Boolean).join(' / '),
  };
}

function createDailySummary({ weather, airQuality }) {
  if (weather.includes('정보 확인 실패') || airQuality.includes('정보 확인 실패')) {
    return '외부 데이터 조회에 실패해 요약 신뢰도가 낮습니다. 잠시 후 재시도 권장';
  }

  if (airQuality.includes('나쁨')) {
    return '마스크 챙기고 실내 이동 위주로 준비 추천';
  }

  if (weather.includes('비') || weather.includes('소나기')) {
    return '우산 챙기고 이동 시간 조금 넉넉히 잡기';
  }

  return '평소 루틴대로 출근해도 괜찮아 보입니다';
}

async function withFallback(label, fallback, task) {
  try {
    return await task();
  } catch (error) {
    console.error(`${label} lookup failed:`, error.message);
    return fallback;
  }
}

async function getWeather() {
  return withFallback('Weather', '날씨 정보 확인 실패', async () => {
    if (!config.kskillProxyBaseUrl) {
      throw new Error(
        'KSKILL_PROXY_BASE_URL is required for /v1/korea-weather/forecast. Set a self-host or verified proxy URL.',
      );
    }

    const url = buildUrl(config.kskillProxyBaseUrl, '/v1/korea-weather/forecast', {
      lat: config.commute.lat,
      lon: config.commute.lon,
    });
    const payload = await fetchJson(url);
    return summarizeWeather(payload);
  });
}

async function getAirQuality() {
  return withFallback(
    'Air quality',
    { text: '미세먼지 정보 확인 실패' },
    async () => {
      if (!config.kskillProxyBaseUrl) {
        throw new Error(
          'KSKILL_PROXY_BASE_URL is required for /v1/fine-dust/report. Set a self-host or verified proxy URL.',
        );
      }

      const url = buildUrl(config.kskillProxyBaseUrl, '/v1/fine-dust/report', {
        regionHint: config.commute.regionHint,
      });
      const payload = await fetchJson(url);
      return summarizeAirQuality(payload);
    },
  );
}

export async function buildCommuteBriefing() {
  const [weather, airQuality] = await Promise.all([getWeather(), getAirQuality()]);
  const weatherText = typeof weather === 'string' ? weather : weather.text;
  const airQualityText = airQuality.text;
  const summary = createDailySummary({ weather: weatherText, airQuality: airQualityText });

  return {
    key: 'commute',
    title: ':bar_chart: 출근 브리핑',
    basis: formatKoreanBasisTime(new Date(), config.timezone),
    lines: [`날씨: ${weatherText}`, `미세먼지: ${airQualityText}`, `요약: ${summary}`],
  };
}

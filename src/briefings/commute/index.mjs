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

function pickForecast(items, targetTime) {
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

  return (
    forecasts.find((entry) => entry.fcstTime === config.commute.weatherTargetTime) ||
    forecasts.find((entry) => entry.TMP || entry.SKY || entry.PTY) ||
    {}
  );
}

function summarizeWeather(payload) {
  const forecast = pickForecast(getForecastItems(payload), config.commute.weatherTargetTime);
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

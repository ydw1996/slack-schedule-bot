import 'dotenv/config';

export const config = {
  botName: process.env.BOT_NAME || 'My Briefing Bot',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  kskillProxyBaseUrl: process.env.KSKILL_PROXY_BASE_URL || '',
  timezone: process.env.BRIEFING_TIMEZONE || 'Asia/Seoul',
  scheduleCron: process.env.BRIEFING_CRON || '0 8 * * *',
  runOnce: process.env.BRIEFING_RUN_ONCE === 'true',
  commute: {
    lat: process.env.BRIEFING_LAT || '37.5665',
    lon: process.env.BRIEFING_LON || '126.9780',
    regionHint: process.env.BRIEFING_REGION_HINT || '서울 중구',
    weatherTargetTime: process.env.BRIEFING_WEATHER_TARGET_TIME || '0800',
  },
};

import cron from 'node-cron';
import { config } from '../config/env.mjs';
import { formatBotMessage } from './bot/formatMessage.mjs';
import { sendSlackMessage } from './bot/sendSlack.mjs';
import { buildCommuteBriefing } from './briefings/commute/index.mjs';
import { buildInvestBriefing } from './briefings/invest/index.mjs';
import { buildScheduleBriefing } from './briefings/schedule/index.mjs';

async function runSection(title, task) {
  try {
    return await task();
  } catch (error) {
    console.error(`${title} failed:`, error.message);
    return {
      title,
      basis: '정보 없음',
      lines: ['데이터 조회 실패'],
    };
  }
}

async function collectBriefings() {
  const [commute, invest, schedule] = await Promise.all([
    runSection('출근 브리핑', buildCommuteBriefing),
    runSection('투자 브리핑', buildInvestBriefing),
    runSection('일정 브리핑', buildScheduleBriefing),
  ]);

  return [commute, invest, schedule];
}

async function sendDailyBriefing() {
  try {
    const sections = await collectBriefings();
    const text = formatBotMessage({
      sections,
    });

    await sendSlackMessage(config.slackWebhookUrl, text);
    console.log('Briefing sent.');
  } catch (error) {
    console.error('Failed to send briefing:', error.message);
  }
}

await sendDailyBriefing();

cron.schedule(
  config.scheduleCron,
  () => {
    void sendDailyBriefing();
  },
  {
    timezone: config.timezone,
  },
);

console.log(`Scheduler is running: ${config.scheduleCron} (${config.timezone})`);

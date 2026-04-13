function partsToMap(parts) {
  const map = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return map;
}

export function formatDateTime(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = partsToMap(formatter.formatToParts(date));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function nowInTimeZone(timeZone) {
  return formatDateTime(new Date(), timeZone);
}

export function formatKoreanBasisTime(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
  });

  const parts = partsToMap(formatter.formatToParts(date));
  return `${parts.month}월 ${parts.day}일 ${parts.dayPeriod} ${parts.hour}시 기준`;
}

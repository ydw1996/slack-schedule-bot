export function formatBotMessage({ sections }) {
  const lines = [];

  for (const section of sections) {
    if (lines.length > 0) {
      lines.push('');
    }

    lines.push(section.title);

    if (section.basis) {
      lines.push(`- 기준 시각: ${section.basis}`);
    }

    for (const line of section.lines) {
      lines.push(`- ${line}`);
    }
  }

  return lines.join('\n');
}

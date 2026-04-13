export function buildUrl(baseUrl, path, params = {}) {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

export async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${body}`);
  }

  return JSON.parse(body);
}

// Pure utilities shared by the offline generator and the edge guard.
export const VPN_FEED = 'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt';
export const TOR_FEED = 'https://check.torproject.org/torbulkexitlist';

export function ipv4Number(value) {
  if (typeof value !== 'string') return null;
  let address = value.trim().toLowerCase();
  // Also handle IPv4-mapped IPv6. Ordinary IPv6 is not in this IPv4 VPN feed.
  if (address.startsWith('::ffff:')) {
    address = address.slice(7);
    if (!address.includes('.')) {
      const match = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
      return match ? parseInt(match[1], 16) * 65536 + parseInt(match[2], 16) : null;
    }
  }
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((number, part) => number * 256 + Number(part), 0);
}

export function compileRanges(text, minimumEntries = 50) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error('Invalid feed size');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (lines.length < minimumEntries || lines.length > 50000) throw new Error('Invalid feed entry count');
  const ranges = lines.map(line => {
    const parts = line.split('/');
    const ip = ipv4Number(parts[0]);
    const prefix = parts.length === 1 ? 32 : Number(parts[1]);
    // Fail the whole refresh on HTML, malformed entries, or dangerous broad CIDRs.
    if (ip === null || parts.length > 2 || (parts.length === 2 && !/^\d{1,2}$/.test(parts[1])) || !Number.isInteger(prefix) || prefix < 8 || prefix > 32) throw new Error('Invalid feed address');
    const size = 2 ** (32 - prefix);
    const start = Math.floor(ip / size) * size;
    return [start, start + size - 1];
  }).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], range[1]);
    else merged.push(range);
  }
  return { entries: lines.length, ranges: merged };
}

export function containsAddress(ranges, address) {
  const ip = ipv4Number(address);
  if (ip === null) return false;
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [start, end] = ranges[middle];
    if (ip < start) high = middle - 1;
    else if (ip > end) low = middle + 1;
    else return true;
  }
  return false;
}

export function validRanges(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50000) return false;
  let previous = -1;
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isSafeInteger) || pair[0] <= previous || pair[1] < pair[0] || pair[1] > 4294967295) return false;
    previous = pair[1];
  }
  return true;
}

export async function boundedText(response, maxBytes = 2 * 1024 * 1024) {
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes) throw new Error('Feed unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('Feed too large'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

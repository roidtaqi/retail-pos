interface TlvItem {
  tag: string;
  value: string;
}

function parseTlv(payload: string): TlvItem[] {
  const items: TlvItem[] = [];
  let cursor = 0;

  while (cursor + 4 <= payload.length) {
    const tag = payload.slice(cursor, cursor + 2);
    const length = Number(payload.slice(cursor + 2, cursor + 4));
    if (!Number.isFinite(length) || length < 0) break;

    const valueStart = cursor + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > payload.length) break;

    items.push({ tag, value: payload.slice(valueStart, valueEnd) });
    cursor = valueEnd;
  }

  return items;
}

function serializeTlv(items: TlvItem[]) {
  return items.map((item) => `${item.tag}${item.value.length.toString().padStart(2, '0')}${item.value}`).join('');
}

function crc16CcittFalse(input: string) {
  let crc = 0xffff;

  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function upsertTag(items: TlvItem[], tag: string, value: string, beforeTags: string[] = []) {
  const existing = items.find((item) => item.tag === tag);
  if (existing) {
    existing.value = value;
    return;
  }

  const insertIndex = items.findIndex((item) => beforeTags.includes(item.tag));
  const nextItem = { tag, value };
  if (insertIndex >= 0) {
    items.splice(insertIndex, 0, nextItem);
  } else {
    items.push(nextItem);
  }
}

export function buildDynamicQrisPayload(staticPayload: string, amount: number) {
  const normalized = staticPayload.replace(/\s/g, '');
  if (!normalized) {
    throw new Error('Payload QRIS merchant belum diisi di Pengaturan.');
  }

  const withoutCrc = normalized.replace(/6304[0-9A-Fa-f]{4}$/, '');
  const items = parseTlv(withoutCrc).filter((item) => item.tag !== '63');
  if (!items.some((item) => item.tag === '00' && item.value === '01')) {
    throw new Error('Payload QRIS tidak valid.');
  }

  upsertTag(items, '01', '12', ['26', '51', '52']);
  upsertTag(items, '53', '360', ['54', '58', '59']);
  upsertTag(items, '54', amount.toFixed(2), ['55', '58', '59', '60', '61', '62']);

  const body = serializeTlv(items);
  const crcInput = `${body}6304`;
  return `${crcInput}${crc16CcittFalse(crcInput)}`;
}

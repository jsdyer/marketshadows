export const fields = {
  position: [
    { key: 'shares', label: 'Shares short' },
    { key: 'change', label: 'Reported net change', signed: true },
  ],
  trading: [
    { key: 'volume', label: 'Short-traded shares' },
    { key: 'volumePercent', label: 'Share of traded volume', decimals: 3, percent: true },
    { key: 'trades', label: 'Short sale trades' },
    { key: 'tradesPercent', label: 'Share of trades', decimals: 3, percent: true },
    { key: 'value', label: 'Short-traded value', decimals: 2 },
    { key: 'valuePercent', label: 'Share of traded value', decimals: 3, percent: true },
  ],
};

const shared = {
  symbol: ['security symbol', 'listing symbol', 'symbol', 'security', 'symbole du titre'],
  name: ['security issue name', 'security name', 'company name', 'issuer name', 'nom de la société'],
  market: ['exchange code', 'listing market', 'listing exchange', 'exchange', 'marché de cotation'],
};

const schemas = {
  position: {
    shares: ['no shares', 'number of shares', 'aggregate short position', 'shares short', 'short position'],
    change: ['net change', 'net change shares', 'net change in shares short', 'change from previous report'],
  },
  trading: {
    volume: ['short traded volume', 'short sale volume', 'short volume'],
    volumePercent: ['% total traded volume', '% of total traded volume', '% total trading volume'],
    trades: ['short sale trades', 'short trades', 'number of short sale trades'],
    tradesPercent: ['% total trades', '% of total trades'],
    value: ['short traded value', 'short sale value'],
    valuePercent: ['% total traded value', '% of total traded value'],
  },
};

export function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, ' ').trim();
}

export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (ch === '"' && !field) quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('The CSV ends inside a quoted field. Download a fresh copy of the report.');
  if (row.length || field) rows.push([...row, field]);
  return rows;
}

function columnMap(row, schema) {
  const headers = row.map(normalize);
  return Object.fromEntries(Object.entries(schema).map(([key, names]) => [key, headers.findIndex(header => names.some(name => normalize(name) === header))]));
}

function findHeader(rows) {
  for (const [index, row] of rows.slice(0, 30).entries()) {
    const identity = columnMap(row, shared);
    if (identity.symbol < 0 || identity.market < 0) continue;
    const trading = columnMap(row, schemas.trading);
    if (trading.volume >= 0) return { index, type: 'trading', columns: { ...identity, ...trading } };
    const position = columnMap(row, schemas.position);
    if (position.shares >= 0) return { index, type: 'position', columns: { ...identity, ...position } };
  }
  return null;
}

function numeric(value, signed = false, percent = false) {
  let clean = String(value ?? '').trim().replace(/[,$\s%]/g, '').replace(/^\((.+)\)$/, '-$1');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(clean)) return null;
  const number = Number(clean);
  return Number.isFinite(number) && (signed || number >= 0) && (!percent || number <= 100) ? number : null;
}

export function reportPeriod(name) {
  const dates = [];
  for (const match of name.matchAll(/(?<!\d)((?:19|20)\d\d)[-_]?(\d\d)[-_]?(\d\d)(?!\d)/g)) {
    const date = match.slice(1).join('-');
    const stamp = new Date(`${date}T00:00:00Z`);
    if (Number.isFinite(+stamp) && stamp.toISOString().slice(0, 10) === date) dates.push(date);
  }
  return { start: dates.length > 1 ? dates[0] : '', date: dates.at(-1) || '' };
}

export function parseReport(sheets, name) {
  for (const sheet of sheets) {
    const head = findHeader(sheet.rows);
    if (!head) continue;
    const { type, columns } = head;
    const rows = [];
    let skipped = 0;
    for (const record of sheet.rows.slice(head.index + 1)) {
      if (!record.some(value => String(value ?? '').trim())) continue;
      const read = key => record[columns[key]];
      const symbol = String(read('symbol') ?? '').trim().toUpperCase().slice(0, 60);
      const market = String(read('market') ?? '').trim().toUpperCase().slice(0, 60);
      const measures = Object.fromEntries(fields[type].map(field => [field.key, numeric(read(field.key), field.signed, field.percent)]));
      if (!symbol || !market || measures[fields[type][0].key] === null) { skipped++; continue; }
      rows.push({ symbol, market, name: String(read('name') ?? '').trim().slice(0, 240), ...measures });
    }
    if (rows.length) return { type, name, sheet: sheet.name || '', rows, skipped, ...reportPeriod(name) };
  }
  throw new Error('No supported report table found. Import a Short Sale Trading Summary CSV or a Consolidated Short Position workbook.');
}

export function rowKey(row) {
  return `${row.market}\u0000${row.symbol}`;
}

export function comparison(reports, type, key, metric) {
  return reports.filter(report => report.type === type).map(report => {
    const matches = report.rows.filter(row => rowKey(row) === key);
    return { report, value: matches.length === 1 ? matches[0][metric] : null, count: matches.length };
  }).sort((a, b) => (a.report.date || '9999').localeCompare(b.report.date || '9999') || a.report.name.localeCompare(b.report.name));
}

export function rankChanges(current, baseline, metric, direction = 'absolute') {
  if (!current || !baseline || current.type !== baseline.type) return [];
  const observationsByKey = rows => {
    const records = new Map();
    for (const row of rows) {
      const key = rowKey(row);
      records.set(key, records.has(key) ? null : row);
    }
    return records;
  };
  const prior = observationsByKey(baseline.rows);
  const recent = observationsByKey(current.rows);
  const movements = [];
  for (const [key, row] of recent) {
    const before = prior.get(key)?.[metric.key];
    const after = row?.[metric.key];
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
    const change = Number((after - before).toFixed(metric.decimals ?? 0));
    if (change === 0 || (direction === 'increase' && change < 0)
      || (direction === 'decrease' && change > 0)) continue;
    movements.push({ row, before, after, change });
  }
  const score = direction === 'decrease' ? value => -value
    : direction === 'increase' ? value => value : Math.abs;
  return movements.sort((a, b) => score(b.change) - score(a.change)
    || a.row.symbol.localeCompare(b.row.symbol) || a.row.market.localeCompare(b.row.market));
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (typeof value === 'string' && /^[\s]*[+=@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

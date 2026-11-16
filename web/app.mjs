import { comparison, csvCell, fields, normalize, rankChanges, rowKey } from './model.mjs';

const $ = id => document.getElementById(id);
const pageSize = 30;
const maxReports = 24;
const maxBytes = 12 * 1024 * 1024;
const demo = [
  { symbol: 'DEMO.A', name: 'Harbour Circuit Holdings', market: 'TSX' },
  { symbol: 'DEMO.B', name: 'Sideband Instruments', market: 'TSXV' },
  { symbol: 'DEMO.C', name: 'Rain Coast Networks', market: 'CSE' },
];

let reports = [], type = 'trading', reportId = '', selected = null, page = 0;
let filtered = [], series = [], movers = [], inFlight = false;

function element(tag, text = '', cls) {
  const item = document.createElement(tag);
  item.textContent = text;
  if (cls) item.className = cls;
  return item;
}

function option(value, text) {
  const item = element('option', text);
  item.value = value;
  return item;
}

function button(label, action) {
  const item = element('button', label);
  item.type = 'button';
  item.addEventListener('click', action);
  return item;
}

function number(value, field) {
  if (value === null || value === undefined) return '—';
  const display = value.toLocaleString('en-CA', {
    maximumFractionDigits: field.decimals || 0,
    signDisplay: field.signed ? 'exceptZero' : 'auto',
  });
  return `${display}${field.percent ? '%' : ''}`;
}

function dateLabel(report) {
  if (!report.date) return 'Date unknown';
  return report.type === 'trading' && report.start && report.start <= report.date
    ? `${report.start} – ${report.date}` : report.date;
}

function orderedReports() {
  return reports.filter(report => report.type === type).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

function currentReport() { return reports.find(report => report.id === reportId); }

function matchesFilters(row, query, exchange) {
  return (!exchange || row.market === exchange) && (!query || normalize(`${row.symbol} ${row.name}`).includes(query));
}

function syncControls() {
  const available = orderedReports();
  const report = available.find(item => item.id === reportId) || available[0];
  reportId = report?.id || '';
  $('workspace').hidden = !reports.length;
  $('sample').hidden = !reports.some(item => item.sample);
  $('view-trading').setAttribute('aria-pressed', String(type === 'trading'));
  $('view-position').setAttribute('aria-pressed', String(type === 'position'));
  $('report').replaceChildren(...available.map(item => option(item.id, `${dateLabel(item)} · ${item.name}`)));
  $('report').value = reportId;
  $('report').disabled = !report;
  const priorMarket = $('exchange').value;
  const markets = [...new Set(report?.rows.map(row => row.market))].sort();
  $('exchange').replaceChildren(option('', 'All markets'), ...markets.map(market => option(market, market)));
  if (markets.includes(priorMarket)) $('exchange').value = priorMarket;
  const sorting = [option('symbol', 'Symbol A–Z')];
  sorting.push(...fields[type].map(field => option(field.key, `${field.label} ↓`)));
  const priorSort = $('sort').value;
  $('sort').replaceChildren(...sorting);
  $('sort').value = sorting.some(item => item.value === priorSort) ? priorSort : fields[type][0].key;
  const priorMetric = $('metric').value;
  $('metric').replaceChildren(...fields[type].map(field => option(field.key, field.label)));
  if (fields[type].some(field => field.key === priorMetric)) $('metric').value = priorMetric;
  renderTable();
  renderSeries();
  renderFiles();
  syncMovers(report, available);
}

function renderTable() {
  const report = currentReport();
  const query = normalize($('search').value);
  const exchange = $('exchange').value;
  const sort = $('sort').value;
  const shownFields = type === 'position' ? fields.position : fields.trading.slice(0, 3);
  filtered = report ? report.rows.filter(row => matchesFilters(row, query, exchange)) : [];
  const hasExactSymbol = row => Number(Boolean(query && normalize(row.symbol) === query));
  filtered.sort((a, b) => hasExactSymbol(b) - hasExactSymbol(a)
    || (sort === 'symbol' ? 0 : (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity))
    || a.symbol.localeCompare(b.symbol) || a.market.localeCompare(b.market));
  const count = filtered.length;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  page = Math.min(page, pages - 1);
  $('results-status').textContent = report ? `${count.toLocaleString('en-CA')} of ${report.rows.length.toLocaleString('en-CA')} rows` : '';
  $('report-meta').textContent = report ? `${dateLabel(report)}${report.sheet ? ` · ${report.sheet}` : ''}${report.skipped ? ` · ${report.skipped} incomplete rows skipped` : ''}` : '';
  $('report-meta').hidden = !report;
  $('table').hidden = !count;
  $('empty').hidden = Boolean(count);
  $('empty').textContent = report ? 'No securities match these filters.' : 'Open a report for this view.';
  $('export').disabled = !count;
  $('paginate').hidden = pages < 2;
  $('page').textContent = `Page ${page + 1} of ${pages}`;
  $('prev').disabled = page === 0;
  $('next').disabled = page >= pages - 1;

  const headers = element('tr');
  for (const name of ['Symbol and company', 'Market', ...shownFields.map(field => field.label)]) {
    const header = element('th', name);
    header.scope = 'col';
    headers.append(header);
  }
  $('head').replaceChildren(headers);
  const rows = document.createDocumentFragment();
  for (const row of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
    const entry = element('tr');
    const identity = element('th');
    identity.scope = 'row';
    const select = button(row.symbol, () => {
      selected = row;
      $('rows').querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      select.setAttribute('aria-pressed', 'true');
      renderSeries();
      if (matchMedia('(max-width: 860px)').matches) $('compare-title').scrollIntoView({ block: 'start' });
    });
    select.className = 'symbol';
    select.setAttribute('aria-label', `Compare ${row.symbol} on ${row.market}`);
    select.setAttribute('aria-pressed', String(Boolean(selected && rowKey(row) === rowKey(selected))));
    identity.append(select, element('span', row.name, 'company'));
    entry.append(identity, element('td', row.market));
    for (const field of shownFields) entry.append(element('td', number(row[field.key], field), 'num'));
    rows.append(entry);
  }
  $('rows').replaceChildren(rows);
}

function renderSeries() {
  $('compare').hidden = !selected;
  $('compare-empty').hidden = Boolean(selected);
  if (!selected) return;
  const metric = fields[type].find(field => field.key === $('metric').value) || fields[type][0];
  series = comparison(reports, type, rowKey(selected), metric.key);
  $('compare-symbol').textContent = `${selected.symbol} · ${selected.market}`;
  $('compare-name').textContent = selected.name;
  const available = series.filter(item => item.value !== null && item.value !== undefined);
  const max = metric.percent ? 100 : Math.max(1, ...available.map(item => Math.abs(item.value)));
  $('comparison-tip').textContent = series.length < 2 ? 'Add another report of this type for a comparison.'
    : metric.signed ? 'Bar length shows the size of the reported change. The value preserves its sign.' : 'Matched by symbol and listing market.';
  const entries = [];
  for (const { report, value, count } of series) {
    const li = element('li');
    const line = element('div', '', 'observation');
    const descriptor = count > 1 ? 'Multiple matching rows' : count === 0 ? 'Absent from report' : number(value, metric);
    const known = value !== null && value !== undefined;
    line.append(element('span', dateLabel(report)), element('strong', descriptor));
    li.append(line);
    if (known) {
      const bar = element('meter');
      bar.max = max;
      bar.value = Math.abs(value);
      bar.setAttribute('aria-label', `${metric.label} for ${dateLabel(report)}: ${number(value, metric)}`);
      li.append(bar);
    }
    li.append(element('small', report.name));
    entries.push(li);
  }
  $('chart').replaceChildren(...entries);
  $('export-series').disabled = !available.length;
}

function syncMovers(report, available) {
  const earlier = report?.date ? available.filter(item => item.date && item.date < report.date) : [];
  const baseline = $('movers-baseline');
  const prior = baseline.value;
  baseline.replaceChildren(...earlier.map(item => option(item.id, `${dateLabel(item)} · ${item.name}`)));
  baseline.value = earlier.some(item => item.id === prior) ? prior : (earlier[0]?.id ?? '');
  baseline.disabled = !earlier.length;

  const metric = $('movers-metric');
  const priorMetric = metric.value;
  const measures = type === 'position' ? fields.position.filter(field => field.key === 'shares') : fields.trading;
  metric.replaceChildren(...measures.map(field => option(field.key, field.label)));
  metric.value = measures.some(field => field.key === priorMetric) ? priorMetric : measures[0].key;
  metric.disabled = !earlier.length;
  $('movers-direction').disabled = !earlier.length;
  renderMovers();
}

function renderMovers() {
  const current = currentReport();
  const baseline = reports.find(report => report.id === $('movers-baseline').value);
  const metric = fields[type].find(field => field.key === $('movers-metric').value);
  const query = normalize($('search').value);
  const exchange = $('exchange').value;
  movers = baseline && metric ? rankChanges(current, baseline, metric, $('movers-direction').value)
    .filter(({ row }) => matchesFilters(row, query, exchange)) : [];
  $('movers-table').hidden = !movers.length;
  $('export-movers').disabled = !movers.length;
  $('movers-change-title').textContent = metric?.percent ? 'Change (pp)' : 'Change';
  if (!baseline) {
    $('movers-status').textContent = 'Open an earlier dated report of this type to see changes.';
  } else {
    const period = `${baseline.date} to ${current.date}`;
    $('movers-status').textContent = movers.length
      ? `Showing ${Math.min(15, movers.length)} of ${movers.length.toLocaleString('en-CA')} movements · ${period}`
      : `No matched movements under these filters · ${period}`;
  }
  $('movers-rows').replaceChildren(...movers.slice(0, 15).map(({ row, before, after, change }) => {
    const tr = element('tr');
    const who = element('th', `${row.symbol} · ${row.market}`);
    who.scope = 'row';
    who.append(element('span', row.name, 'company'));
    const delta = number(change, { ...metric, percent: false, signed: true });
    tr.append(who, element('td', number(before, metric), 'num'), element('td', number(after, metric), 'num'),
      element('td', delta, 'num ' + (change < 0 ? 'move-down' : 'move-up')));
    return tr;
  }));
}

function renderFiles() {
  const files = document.createDocumentFragment();
  for (const report of reports) {
    const li = element('li');
    const name = element('div', report.name, 'filename');
    const parts = [report.type === 'trading' ? 'Trading summary' : 'Short positions', `${report.rows.length.toLocaleString('en-CA')} rows`];
    if (!report.sample) parts.push(`SHA-256 ${report.id.slice(0, 12)}…`);
    const summary = element('small', parts.join(' · '));
    if (!report.sample) summary.title = `SHA-256 ${report.id}`;
    const controls = element('div', '', 'file-actions');
    const date = element('input');
    date.type = 'date';
    date.disabled = inFlight;
    date.value = report.date;
    date.setAttribute('aria-label', `Reporting end date for ${report.name}`);
    date.addEventListener('change', () => {
      report.date = date.value;
      syncControls();
    });
    const remove = button('Remove', () => {
      reports = reports.filter(item => item.id !== report.id);
      if (!reports.length) selected = null;
      syncControls();
    });
    remove.disabled = inFlight;
    remove.setAttribute('aria-label', `Remove ${report.name}`);
    controls.append(date, remove);
    li.append(name, summary, controls);
    files.append(li);
  }
  $('files').replaceChildren(files);
}

function parseFile(file) {
  return file.arrayBuffer().then(buffer => new Promise((resolve, reject) => {
    const worker = new Worker('./parse-worker.js');
    const finish = (report, error) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(new Error(error));
      else resolve(report);
    };
    const timer = setTimeout(() => finish(null, 'Reading the report timed out.'), 25000);
    worker.onmessage = ({ data }) => finish(data.report, data.error);
    worker.onerror = () => finish(null, 'The local report reader could not start. Reload the page and try again.');
    worker.postMessage({ name: file.name, buffer }, [buffer]);
  }));
}

async function loadFiles(files) {
  if (inFlight || !files.length) return;
  inFlight = true;
  for (const id of ['pick', 'demo', 'clear']) $(id).disabled = true;
  renderFiles();
  $('issues').replaceChildren();
  $('issues').hidden = true;
  $('import-status').hidden = false;
  const prior = reports.filter(report => !report.sample);
  const loaded = [];
  const issues = [];
  for (const file of files.slice(0, maxReports)) {
    if (prior.length + loaded.length >= maxReports) { issues.push(`This tab can hold ${maxReports} reports. Remove one before adding more.`); break; }
    $('import-status').textContent = `Reading ${file.name} locally…`;
    try {
      if (!/\.(csv|xls|xlsx)$/i.test(file.name)) throw new Error('Choose a CSV, XLS or XLSX report.');
      if (file.size < 8 || file.size > maxBytes) throw new Error('The file must be between 8 bytes and 12 MiB.');
      const report = await parseFile(file);
      if ([...prior, ...loaded].some(item => item.id === report.id)) throw new Error('That exact file is already open.');
      loaded.push(report);
    } catch (error) { issues.push(`${file.name}: ${error.message}`); }
  }
  if (files.length > maxReports) issues.push(`Only the first ${maxReports} selected files were checked.`);
  inFlight = false;
  for (const id of ['pick', 'demo', 'clear']) $(id).disabled = false;
  if (loaded.length) {
    reports = [...prior, ...loaded];
    type = loaded[0].type;
    reportId = loaded[0].id;
    selected = null;
    page = 0;
    $('search').value = '';
  }
  $('import-status').textContent = loaded.length ? `Opened ${loaded.length} ${loaded.length === 1 ? 'report' : 'reports'} in this tab.` : 'No reports were added.';
  $('issues').replaceChildren(...issues.map(issue => element('li', issue)));
  $('issues').hidden = !issues.length;
  syncControls();
}

function showDemo() {
  if (reports.some(report => !report.sample)) {
    $('import-status').hidden = false;
    $('import-status').textContent = 'Clear your imported reports before opening the fictional sample workspace.';
    return;
  }
  const dates = [['2026-10-01', '2026-10-15'], ['2026-10-16', '2026-10-31']];
  const fictional = ['trading', 'position'].flatMap(kind => dates.map(([start, date], period) => ({
    type: kind, id: `${kind}-${period}`, name: `Example ${kind} ${period + 1}`, sample: true, date, start,
    rows: demo.map((row, index) => {
      const base = (index + 1) * 36000 + period * (index === 1 ? -4800 : 10030);
      return kind === 'trading'
        ? { ...row, volume: base, volumePercent: 12 + index * 1.4 + period, trades: 620 + index * 141, tradesPercent: 16.2 + index, value: base * 9, valuePercent: 15.81 + period }
        : { ...row, shares: base * 2, change: period ? (index === 1 ? -9600 : 20060) : index * 1900 - 3000 };
    }),
  })));
  reports = fictional;
  type = 'trading';
  selected = demo[0];
  reportId = 'trading-1';
  page = 0;
  $('search').value = '';
  $('import-status').hidden = true;
  $('issues').hidden = true;
  syncControls();
}

function download(name, grid) {
  const body = grid.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const object = URL.createObjectURL(new Blob(['\uFEFF', body], { type: 'text/csv;charset=utf-8' }));
  const anchor = element('a');
  anchor.href = object;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(object), 1000);
}

$('pick').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', event => {
  loadFiles(Array.from(event.target.files));
  event.target.value = '';
});
$('drop-zone').addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  $('drop-zone').classList.add('dragging');
});
$('drop-zone').addEventListener('dragleave', event => {
  if (!$('drop-zone').contains(event.relatedTarget)) $('drop-zone').classList.remove('dragging');
});
$('drop-zone').addEventListener('drop', event => {
  event.preventDefault();
  $('drop-zone').classList.remove('dragging');
  loadFiles(Array.from(event.dataTransfer.files));
});
$('demo').addEventListener('click', showDemo);
for (const key of ['trading', 'position']) $('view-' + key).addEventListener('click', () => {
  type = key;
  reportId = '';
  page = 0;
  syncControls();
});
$('report').addEventListener('change', () => {
  reportId = $('report').value;
  page = 0;
  syncControls();
});
for (const id of ['search', 'exchange', 'sort']) $(id).addEventListener('input', () => {
  page = 0;
  renderTable();
  if (id !== 'sort') renderMovers();
});
for (const id of ['movers-baseline', 'movers-metric', 'movers-direction']) $(id).addEventListener('change', renderMovers);
$('prev').addEventListener('click', () => { page--; renderTable(); });
$('next').addEventListener('click', () => { page++; renderTable(); });
$('metric').addEventListener('change', renderSeries);
$('clear').addEventListener('click', () => {
  reports = [];
  selected = null;
  reportId = '';
  $('search').value = '';
  $('issues').hidden = true;
  $('import-status').hidden = false;
  $('import-status').textContent = 'Cleared all reports from this tab.';
  syncControls();
  $('pick').focus();
});
$('export').addEventListener('click', () => {
  const report = currentReport();
  const metrics = fields[type];
  download(`market-shadows-${type}-${report.date || 'undated'}.csv`, [
    ['Source file', 'Period start', 'Reporting date', 'Symbol', 'Market', 'Company', ...metrics.map(field => field.percent ? `${field.label} (%)` : field.label)],
    ...filtered.map(row => [report.name, report.start, report.date, row.symbol, row.market, row.name, ...metrics.map(field => row[field.key])]),
  ]);
});
$('export-series').addEventListener('click', () => {
  const metric = fields[type].find(field => field.key === $('metric').value);
  download(`market-shadows-${type}-comparison.csv`, [
    ['Source file', 'Period start', 'Reporting date', 'Symbol', 'Market', 'Measure', 'Value', 'Matching rows'],
    ...series.map(item => [item.report.name, item.report.start, item.report.date, selected.symbol, selected.market,
      metric.percent ? `${metric.label} (%)` : metric.label, item.value, item.count]),
  ]);
});

$('export-movers').addEventListener('click', () => {
  const current = currentReport();
  const baseline = reports.find(report => report.id === $('movers-baseline').value);
  const metric = fields[type].find(field => field.key === $('movers-metric').value);
  if (!current || !baseline || !metric || !movers.length) return;
  download(`market-shadows-${type}-ranked-changes.csv`, [
    ['Baseline file', 'Baseline date', 'Current file', 'Current date', 'Symbol', 'Market', 'Company',
      'Measure', 'Baseline value', 'Current value', metric.percent ? 'Change (percentage points)' : 'Change'],
    ...movers.map(({ row, before, after, change }) => [baseline.name, baseline.date, current.name,
      current.date, row.symbol, row.market, row.name, metric.label, before, after, change]),
  ]);
});

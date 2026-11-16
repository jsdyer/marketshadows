import assert from 'node:assert/strict';
import test from 'node:test';
import { comparison, csvCell, parseCsv, parseReport, rankChanges, reportPeriod, rowKey } from '../web/model.mjs';

test('actual CIRO trading headers, quoted fields and date range', () => {
  const text = 'Security,Company Name,Listing Market,Short Sale Trades,% Total Trades,Short Traded Volume,% Total Traded Volume,Short Traded Value,% Total Traded Value\r\n'
    + 'SYN.A,"Harbour ""Circuit"", Ltd.",TSX,5,12.5,1550,12.67,27100,10.5\r\n';
  const report = parseReport([{ rows: parseCsv(text) }], '20261016-20261031_ShortSaleTradingSummaryReport.csv');
  assert.equal(report.type, 'trading');
  assert.equal(report.start, '2026-10-16');
  assert.equal(report.date, '2026-10-31');
  assert.deepEqual(report.rows[0], { symbol: 'SYN.A', name: 'Harbour "Circuit", Ltd.', market: 'TSX', trades: 5, tradesPercent: 12.5, volume: 1550, volumePercent: 12.67, value: 27100, valuePercent: 10.5 });
});

test('actual CIRO position headers with unlabelled preamble, missing field and signed change', () => {
  const report = parseReport([{ name: 'Positions', rows: [[], ['Security Issue Name', 'Security Symbol', 'Exchange Code', 'No.Shares', 'Net Change'],
    ['Circuit', 'SYN.A', 'TSX', 54000, -5000], ['Storefront', 'SYN.B', 'CSE', 150, ''],
    ['Blank position value', 'SYN.C', 'TSX', null]] }], '20261031_CSPR_Report.xls');
  assert.equal(report.type, 'position');
  assert.equal(report.skipped, 1);
  assert.equal(report.rows[0].change, -5000);
  assert.equal(report.rows[1].change, null);
});

test('comparison leaves unmatched and ambiguous observations blank', () => {
  const security = { symbol: 'SYN.A', market: 'TSX', shares: 180 };
  const reports = [
    { name: 'oct', date: '2026-10-31', type: 'position', rows: [security] },
    { name: 'sep', date: '2026-09-30', type: 'position', rows: [{ ...security, market: 'CSE' }] },
    { name: 'aug', date: '2026-08-31', type: 'position', rows: [security, security] },
    { name: 'trades', date: '2026-10-31', type: 'trading', rows: [security] },
  ];
  const results = comparison(reports, 'position', rowKey(security), 'shares');
  assert.deepEqual(results.map(row => [row.report.name, row.value, row.count]), [['aug', null, 2], ['sep', null, 0], ['oct', 180, 1]]);
});

test('rejects unsupported inputs and prevents spreadsheet formula injection', () => {
  assert.equal(reportPeriod('20260230_CSPR_Report.xlsx').date, '');
  assert.throws(() => parseCsv('"unclosed'), /quoted field/);
  assert.throws(() => parseReport([{ rows: [['Any other CSV', 20]] }], 'notes.csv'), /No supported/);
  assert.equal(csvCell('=HYPERLINK("https://example.com/")'), `"'=HYPERLINK(""https://example.com/"")"`);
  assert.equal(csvCell(-10), '"-10"');
});

test('ranking joins unique securities by market, filters direction and rounds percentage points', () => {
  const row = (symbol, market, volumePercent) => ({ symbol, market, name: symbol, volumePercent });
  const current = { type: 'trading', rows: [
    row('A', 'TSX', 2), row('A', 'TSXV', 9), row('B', 'TSX', 7), row('C', 'TSX', 5),
    row('D', 'TSX', 3.2), row('E', 'TSX', 3.021), row('E', 'TSX', 4),
  ] };
  const baseline = { type: 'trading', rows: [
    row('A', 'TSX', 8.511), row('A', 'TSXV', 6), row('B', 'TSX', 1),
    row('C', 'TSX', 4), row('C', 'TSX', 3), row('D', 'TSX', 3.2),
    row('E', 'TSX', 2),
  ] };
  const metric = { key: 'volumePercent', decimals: 3 };
  const values = result => result.map(({ row, change }) => [row.symbol, row.market, change]);
  assert.deepEqual(values(rankChanges(current, baseline, metric)), [['A', 'TSX', -6.511], ['B', 'TSX', 6], ['A', 'TSXV', 3]]);
  assert.deepEqual(values(rankChanges(current, baseline, metric, 'increase')), [['B', 'TSX', 6], ['A', 'TSXV', 3]]);
  assert.deepEqual(values(rankChanges(current, baseline, metric, 'decrease')), [['A', 'TSX', -6.511]]);
  assert.deepEqual(rankChanges(current, { ...baseline, type: 'position' }, metric), []);
});

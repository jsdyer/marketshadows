import assert from 'node:assert/strict';
import test from 'node:test';
import { comparison, csvCell, parseCsv, parseReport, reportPeriod, rowKey } from '../web/model.mjs';

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

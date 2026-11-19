const model = import('./model.mjs');
const maximumRows = 30000;

self.onmessage = async ({ data: { name, buffer } }) => {
  try {
    const { parseCsv, parseReport } = await model;
    let sheets;
    if (/\.(csv|tsv)$/i.test(name)) {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { text = new TextDecoder('windows-1252').decode(buffer); }
      const rows = parseCsv(text, /\.tsv$/i.test(name) ? '\t' : ',');
      if (rows.length >= maximumRows) throw new Error('This CSV exceeds the 30,000-row limit.');
      sheets = [{ rows }];
    } else {
      const bytes = new Uint8Array(buffer);
      const compound = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
      const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
      if (!compound && !zip) throw new Error('The file signature does not match an XLS or XLSX workbook.');
      importScripts('./vendor/xlsx.full.min.js');
      const book = self.XLSX.read(buffer, {
        type: 'array', cellFormula: false, cellHTML: false, cellText: false, bookVBA: false, sheetRows: maximumRows,
      });
      if (book.SheetNames.length > 20) throw new Error('This workbook exceeds the 20-sheet limit.');
      sheets = book.SheetNames.map(sheet => {
        const tab = book.Sheets[sheet];
        if (!tab['!ref']) return { name: sheet, rows: [] };
        const range = self.XLSX.utils.decode_range(tab['!ref']);
        if (range.e.r >= maximumRows - 1) throw new Error('A worksheet exceeds the 30,000-row limit.');
        range.e.c = Math.min(range.e.c, range.s.c + 31);
        return {
          name: sheet,
          rows: self.XLSX.utils.sheet_to_json(tab, { header: 1, raw: true, defval: '', blankrows: true, range }),
        };
      });
    }
    const report = parseReport(sheets, name);
    const sha = await crypto.subtle.digest('SHA-256', buffer);
    const id = Array.from(new Uint8Array(sha), byte => byte.toString(16).padStart(2, '0')).join('');
    self.postMessage({ report: { ...report, id } });
  } catch (error) {
    self.postMessage({ error: error?.message || 'This report could not be read.' });
  }
};

# Market Shadows

[Open Market Shadows on CoolCode.ca](https://coolcode.ca/marketshadows/) to explore Canadian short sale trading summaries and consolidated short position reports. On the [ciro.ca](https://www.ciro.ca/) home page, choose Markets → Reports, Statistics and Other Information → Short Sale Trading Statistics and Reports. Download the Summary CSV, Corrections CSV or Consolidated Short Position workbook for the dates you want. Choose the original files or paste column headings and rows from a report, with its reporting end date. Pasted CSV and spreadsheet selections stay in the tab and use the same parser as the file import.

<!-- coolcode:guide -->
Open a CIRO corrections CSV to see the signed change in shares alongside the original trade period. For summaries or positions, open two reporting dates to rank changes by security.
<!-- /coolcode:guide -->

Market Shadows recognizes the standard English CIRO summary CSV and position XLS files, and XLSX exports of the same tables. It opens up to 24 files (12 MiB each), including reports from several dates. For files, the report date comes from the filename when available, and the files panel lets you enter the end date manually. Duplicate files are detected by SHA-256. Only files and values you supply are represented.

Search by security symbol or company name, filter by listing market, and select a row to compare dates. Short sale trading includes volume and the reported share of trading volume. Consolidated positions show reported shares short at a date and the net change in the source. Comparisons match symbol and listing market. Check issuer identities and corporate actions in the original records. A blank observation means the corresponding value or unambiguous record was unavailable. Exports retain the report filename and date. Trading corrections have a dedicated view. Each signed share adjustment belongs to the original trade period on its row. The filename dates identify the period of submission. Search by symbol, filter by trade period, and export both periods. A recognized header with no entries opens as an empty report. [CIRO report downloads](https://www.ciro.ca/markets/reports-statistics-and-other-information/short-sale-trading-statistics-and-reports)

Inputs are read locally in a browser worker and stay in tab memory. No CIRO data is bundled, harvested, or served by this repo. Users can export the current analysis locally. The workbook parser uses a same-origin copy of SheetJS Community Edition under Apache 2.0. CoolCode counts page opens by tool ID. Uploaded file contents and names stay in the browser.

## Build and test

```sh
python3 scripts/build.py
node --test tests/model.test.mjs
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. The build downloads the versioned, hash-pinned SheetJS 0.20.3 full browser script and its licence from the official project CDN. An offline build accepts these exact files with `python3 scripts/build.py --vendor-dir /path/to/asset-copies`. GitHub Pages serves `dist/` using relative URLs.

Changes between reports ranks matching securities by absolute movement, increase or decrease for a chosen pair of dated reports. The workspace keeps trading and position measures separate and shows percentage-point movements for share-of-trading measures. It excludes absent, ambiguous and unchanged observations. The visible list caps at 15 and the ranked CSV includes every filtered movement with both source filenames and dates.

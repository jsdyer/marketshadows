# Market Shadows

[Open Market Shadows on CoolCode.ca](https://coolcode.ca/marketshadows/) to explore Canadian short sale trading summaries and consolidated short position reports. Download the files you want from the Markets section of the [CIRO website](https://www.ciro.ca/), then open or drop them into the app. The fictional sample can be opened without any files.

Market Shadows recognizes the standard English CIRO summary CSV and position XLS files, and XLSX exports of the same tables. It opens up to 24 files (12 MiB each), including reports from several dates. The report date comes from the filename when available, and the files panel lets you enter the end date manually. Duplicate files are detected by SHA-256. Only files and values you supply are represented.

Search by security symbol or company name, filter by listing market, and select a row to compare dates. Short sale trading includes volume and the reported share of trading volume. Consolidated positions show reported shares short at a date and the net change in the source. Comparisons match symbol and listing market. Check issuer identities and corporate actions in the original records. A blank observation means the corresponding value or unambiguous record was unavailable. Exports retain the report filename and date. Published correction tables are outside the current importer’s scope.

Inputs are read locally in a browser worker and stay in tab memory. No CIRO data is bundled, harvested, or served by this repo. Users can export the current analysis locally. The workbook parser uses a same-origin copy of SheetJS Community Edition under Apache 2.0. No analytics or runtime library CDN is used.

## Build and test

```sh
python3 scripts/build.py
node --test tests/model.test.mjs
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. The build downloads the versioned, hash-pinned SheetJS 0.20.3 full browser script and its licence from the official project CDN. An offline build accepts these exact files with `python3 scripts/build.py --vendor-dir /path/to/asset-copies`. GitHub Pages serves `dist/` using relative URLs.

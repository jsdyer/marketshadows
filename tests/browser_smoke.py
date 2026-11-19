"""Open a corrections file via the browser worker and verify its CSV export."""
import csv
import os
from pathlib import Path
import sys
from playwright.sync_api import expect, sync_playwright

header = "Reporting Period when trade occurred, Security, Change in Short Volume Traded  (+/-)\r\n"
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))
    page = browser.new_page(viewport={"width": 390, "height": 850})
    page.goto(sys.argv[1])
    def upload(name, text):
        page.locator("#file").set_input_files({"name": name, "mimeType": "text/csv", "buffer": text.encode()})
    upload("20261101-20261115_ShortSaleTradingCorrectionsReport.csv",
           header + "1-15 November 2026,SAMPLE,+300\r\n16-30 April 2025,SAMPLE,-100\r\n")
    expect(page.locator("#results-status")).to_have_text("2 of 2 rows")
    page.locator("#exchange").select_option("16-30 April 2025")
    expect(page.locator("#rows")).to_contain_text("-100")
    expect(page.locator("#movers-title")).to_be_hidden()
    with page.expect_download() as result:
        page.locator("#export").click()
    with Path(result.value.path()).open(encoding="utf-8-sig", newline="") as source:
        assert list(csv.reader(source))[1][1:] == ["2026-11-01", "2026-11-15", "16-30 April 2025", "SAMPLE", "-100"]
    upload("20261001-20261015_ShortSaleTradingCorrectionsReport.csv", header)
    expect(page.locator("#empty")).to_contain_text("no corrections")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    browser.close()

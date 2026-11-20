"""Exercise all 100 duel tickets, save/resume, chip budgets and mobile layout."""
import argparse
import json
import shutil
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8000/')
args = parser.parse_args()
with sync_playwright() as runner:
    browser = runner.chromium.launch(executable_path=shutil.which('chromium'))
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url)
    expect(page.locator('#guide')).to_be_visible()
    page.get_by_role('button', name='Deal me in').click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    ids = set()
    for i in range(100):
        label = page.locator('#round').inner_text()
        ticket_id = label.split(' · ')[1]
        assert ticket_id not in ids
        ids.add(ticket_id)
        page.get_by_role('button', name='Read configuration diff · free').click()
        expect(page.locator('#findings')).to_contain_text('Proposed configuration')
        if i % 3 == 0:
            page.locator('#chip').check()
        else:
            expect(page.locator('#chip')).to_be_disabled()
        page.locator('#moves button').nth(i % 3).click()
        expect(page.locator('#totals')).to_contain_text(f'{i + 1} of 100 tickets complete')
        state = page.evaluate("JSON.parse(localStorage.getItem('roulette-campaign-duel-v1'))")
        assert len(state['records']) == i + 1
        assert state['playerTotal'] == sum(r['you']['points'] for r in state['records'].values())
        if i in [0, 49, 99]:
            before = page.locator('#compare').inner_text()
            page.reload()
            expect(page.locator('#compare')).to_have_text(before)
        if i < 99:
            page.locator('#next').click()
    expect(page.locator('#next')).to_be_hidden()
    expect(page.locator('#totals')).to_contain_text('Campaign complete')
    page.locator('#library').click()
    expect(page.locator('#ticket-list')).to_contain_text('All tickets in this selection are complete.')
    assert not errors, errors
    browser.close()
print('PASS: 100 unique tickets, all actions, saved totals, shift chips, resume, completion and mobile width; no browser errors')

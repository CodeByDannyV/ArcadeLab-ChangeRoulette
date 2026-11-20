"""Exercise the NAF rehearsal and verify the player's campaign record in Chromium."""
import argparse
import json
import shutil
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8000/')
args = parser.parse_args()


def submit(page, branch):
    page.get_by_role('checkbox', name=branch, exact=True).check()
    page.get_by_role('radio', name='Low', exact=True).check()
    page.locator('#commit').click()


with sync_playwright() as runner:
    browser = runner.chromium.launch(executable_path=shutil.which('chromium'))
    player = browser.new_page(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    errors = []
    player.on('pageerror', lambda error: errors.append(str(error)))
    player.goto(args.url)
    player.locator('#open-library').click()
    player.locator('#tutorial').click()

    drawer = player.locator('#naf-detail')
    trace = player.locator('#naf-trace')
    expect(drawer).not_to_have_attribute('open', '')
    expect(player.locator('#commit')).to_be_in_viewport()
    drawer.locator('summary').first.focus()
    player.keyboard.press('Enter')
    expect(drawer).to_have_attribute('open', '')
    for block in ('Intent', 'Presentation', 'Orchestration', 'Executor', 'Collector', 'Observability'):
        expect(drawer).to_contain_text(block)
    for site in ('Tucson', 'Phoenix'):
        expect(drawer).to_contain_text(site)
    expect(trace).to_be_hidden()
    expect(player.locator('#open-naf')).to_be_hidden()
    expect(player.locator('#hud-progress')).to_have_text('0 / 100 completed')
    drawer.locator('#naf-config').click()
    expect(player.locator('#config-before')).to_contain_text('TUC-TEST')
    expect(player.locator('#config-after')).not_to_contain_text('TUC-TEST')
    expect(player.locator('#config-after')).to_contain_text('PHX-PROD')
    drawer.locator('summary').first.click()

    submit(player, 'Tucson')
    player.locator('#open-naf').click()
    expect(drawer).to_have_attribute('open', '')
    expect(trace).to_be_visible()
    expect(trace).to_contain_text('Intent matched')
    tucson = trace.get_by_role('row').filter(has=player.get_by_role('rowheader', name='Tucson'))
    phoenix = trace.get_by_role('row').filter(has=player.get_by_role('rowheader', name='Phoenix'))
    expect(tucson.get_by_role('cell')).to_have_text(['Revoke', 'Unreachable', 'Match'])
    expect(phoenix.get_by_role('cell')).to_have_text(['Permit', 'Reachable', 'Match'])
    player.locator('#naf-rollback').click()
    expect(trace).to_contain_text('Intent discrepancy')
    expect(tucson.get_by_role('cell')).to_have_text(['Revoke', 'Reachable', 'Mismatch'])
    expect(phoenix.get_by_role('cell')).to_have_text(['Permit', 'Reachable', 'Match'])
    player.locator('#naf-proposed').click()
    expect(trace).to_contain_text('Intent matched')
    expect(player.locator('#hud-progress')).to_have_text('0 / 100 completed')
    expect(player.locator('#hud-points')).to_have_text('0 pts')
    assert player.evaluate('document.documentElement.scrollWidth <= innerWidth')

    player.locator('#advance').click()
    expect(drawer).not_to_have_attribute('open', '')
    expect(trace).to_be_hidden()
    player.locator('#open-library').click()
    player.locator('#search').fill('CR-062')
    player.locator('.ticket-option').click()
    drawer.locator('summary').first.click()
    expect(trace).to_be_hidden()
    submit(player, 'Denver')
    expect(player.locator('#hud-points')).to_have_text('100 pts')
    player.locator('#open-naf').click()
    expect(trace).to_contain_text('Intent discrepancy')
    player.locator('#naf-rollback').click()
    expect(trace).to_contain_text('Intent matched')

    player.reload()
    player.locator('#open-score').click()
    with player.expect_download() as download:
        player.locator('#export').click()
    report = json.loads(Path(download.value.path()).read_text())
    assert len(report['evidence']) == 1
    record = report['evidence'][0]
    assert record['id'] == 'CR-062' and record['points'] == 100 and not record['assisted']
    rehearsal = record['frameworkRehearsal']
    assert rehearsal['phase'] == 'proposed' and rehearsal['event'] == 'Intent discrepancy'
    assert {probe['site']: probe['matchesIntent'] for probe in rehearsal['probes']} == {
        'Denver': False, 'Boise': True,
    }
    assert not errors, errors
    print('Verified the six NAF roles, intent checks, simulated rollback and saved scorecard evidence.')
    browser.close()

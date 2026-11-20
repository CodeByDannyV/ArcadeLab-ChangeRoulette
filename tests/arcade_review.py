"""Play the solo arcade and verify skill-practice saves and offline play in Chromium."""
import argparse
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8000/classic.html')
args = parser.parse_args()


def submit(page, sites, risk, board='', evidence=''):
    form = page.locator('#prediction-form')
    if sites:
        for site in sites:
            form.locator('input[value="' + site + '"]').check()
    else:
        form.locator('#neither').check()
    form.get_by_role('radio', name=risk, exact=True).check()
    if board:
        form.get_by_role('radio', name=board, exact=True).check()
    if evidence:
        page.locator('#evidence-pick').evaluate('node => node.open = true')
        form.locator('#citation').select_option(evidence)
    form.locator('#commit').click()


with TemporaryDirectory() as directory, sync_playwright() as runner:
    package = Path(directory) / 'game.html'
    subprocess.run(['python3', 'tools/build_offline.py', str(package)], cwd=root, check=True)
    browser = runner.chromium.launch(executable_path=shutil.which('chromium'))
    ctx = browser.new_context(viewport={'width':1280,'height':900})
    player = ctx.new_page()
    errors = []
    player.on('pageerror', lambda error: errors.append(str(error)))
    player.goto(args.url)
    player.locator('#wager').check()
    submit(player, ['denver'], 'Low', evidence='path')
    expect(player.locator('#bot-result')).to_contain_text('You outread the bot')
    expect(player.locator('#arcade-feedback')).to_contain_text('+25 arcade points')
    expect(player.locator('#hud-points')).to_have_text('100 pts')
    expect(player.locator('#deal-cards button')).to_have_count(2)
    player.locator('#ride-packet').click()
    expect(player.locator('#packet-hop')).to_contain_text('Workstation')
    player.locator('#hop-next').click()
    expect(player.locator('#packet-hop')).to_contain_text('/32 via standby')
    player.locator('#hop-next').click()
    expect(player.locator('#packet-hop')).to_contain_text('Forwarding stops')
    player.locator('#site-select').select_option('Boise')
    expect(player.locator('#packet-hop')).to_contain_text('Boise opens HTTPS')
    for _ in range(3):
        player.locator('#hop-next').click()
    expect(player.locator('#packet-hop')).to_contain_text('Service reached')
    player.locator('#atlas-detail').screenshot(path='/tmp/roulette-arcade-packet.png')
    player.locator('#deal-cards button').last.click()
    expect(player.locator('#wager-label')).to_be_hidden()
    expect(player.locator('#case-id')).to_contain_text('Question 2 of 5')
    player.locator('#open-score').click()
    expect(player.locator('#arcade-total')).to_contain_text('25 arcade points')
    badge = player.locator('#stamp-list button').filter(has_text='Outread the Bot')
    badge.click()
    expect(player.locator('#challenge')).to_have_attribute('data-ticket','CR-062')
    expect(player.locator('#case-id')).to_have_text('Optional practice')
    print('Verified bot, wager, two face-up tickets, branch-by-branch packet ride and stamp replay.')

    # A retired multiplayer session should resume the player's campaign.
    player.evaluate("""sessionStorage.setItem('change-roulette-practice-v1', JSON.stringify({
      mode:'duel', code:'CR1-062-083-092-002-093', calls:[], used:{}
    }))""")
    player.reload()
    expect(player.locator('#case-id')).to_contain_text('Question 2 of 5')
    expect(player.locator('#hud-points')).to_have_text('100 pts')
    expect(player.locator('#open-match, #match-dialog, #share-round')).to_have_count(0)
    assert player.evaluate("sessionStorage.getItem('change-roulette-practice-v1')") is None
    guest = browser.new_page(offline=True, viewport={'width':390,'height':844})
    guest.on('pageerror', lambda error: errors.append(str(error)))
    guest.set_content(package.read_text())
    expect(guest.locator('#open-match, #match-dialog, #share-round')).to_have_count(0)
    submit(guest, ['denver'], 'Low')
    expect(guest.locator('#hud-points')).to_have_text('100 pts')
    guest.close()

    player.locator('#open-score').click()
    player.locator('#skills-list button').first.click()
    for i in range(5):
        if i == 1:
            # Migrate an older solo drill, including its already accepted first call.
            player.evaluate("""() => {
              const key = 'change-roulette-practice-v1'
              const saved = JSON.parse(sessionStorage.getItem(key))
              saved.code = 'CR1-' + saved.tickets.join('-')
              delete saved.tickets
              sessionStorage.setItem(key, JSON.stringify(saved))
            }""")
        if i in (1, 2):
            player.reload()
        if i == 4:
            submit(player, [], 'Low')
            expect(player.locator('#input-error')).to_contain_text('change board')
            expect(player.locator('#hud-progress')).to_have_text('4 / 5 practice calls')
            player.locator('#board-picks input[value="Hold"]').check()
            player.locator('#commit').click()
            expect(player.locator('#input-error')).to_contain_text('Cite')
        expect(player.locator('#case-id')).to_have_text(f'Skill practice · Question {i+1} of 5')
        submit(player, [], 'Low','Stage' if i == 4 else '', 'path' if i == 4 else '')
        player.locator('#advance').click()
    expect(player.locator('#round-arcade')).to_contain_text('campaign baseline')
    player.locator('#results-score').click()
    expect(player.locator('#skills-list')).to_contain_text('Last practice')
    expect(player.locator('#score-history > li')).to_have_count(1)
    player.reload()
    player.locator('#open-score').click()
    expect(player.locator('#skills-list')).to_contain_text('Last practice')
    expect(player.locator('#arcade-total')).to_contain_text('25 arcade points')
    assert not errors, errors
    print('Verified skill drills, their saved feedback and separate campaign scoring.')
    browser.close()

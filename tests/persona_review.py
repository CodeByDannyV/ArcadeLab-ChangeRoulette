"""Run the 20 browser persona passes against a running local game server."""
import argparse
import ipaddress
import shutil
import sys
from tempfile import TemporaryDirectory
from pathlib import Path
import json, math, subprocess
from playwright.sync_api import sync_playwright, expect
root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8000/classic.html')
parser.add_argument('--chromium', default=shutil.which('chromium'))
args = parser.parse_args()
url = args.url
passes = []
def done(persona, evidence):
    passes.append((persona, evidence))
    print(f'{len(passes):02d} {persona}: {evidence}', flush=True)

def reaches_service(ticket, branch):
    """Independent post-change calculation for each kind of change."""
    model = ticket.get('network')
    site = branch['id']
    if not model:
        ip = ipaddress.ip_address(branch.get('afterIp', branch['ip']))
        return any(not rule['remove'] and ip in ipaddress.ip_network(rule['source']) for rule in ticket['rules'])
    after = model['after']
    if model['kind'] == 'route':
        target = ipaddress.ip_address(model['target'])
        routes = [(ipaddress.ip_network(row['cidr']).prefixlen, row['path']) for row in after
                  if row['branch'] == site and target in ipaddress.ip_network(row['cidr'])]
        return bool(routes) and (max(routes)[1] == 'primary' or model['standby'][site])
    if model['kind'] == 'pzen':
        source = ipaddress.ip_address(after['sources'][site])
        return any(rule['host'] == model['target'] and source in ipaddress.ip_network(rule['source'])
                   for rule in after['rules'])
    rules = after if site in model['assigned'] else model['before']
    labels = model['target'].split('.')
    domains = {'.'.join(labels[i:]) for i in range(len(labels))}
    bypass = any(rule['value'] == model['target'] or rule['match'] == 'domain' and rule['value'] in domains
                 for rule in rules)
    return not bypass or model['direct'][site]


with TemporaryDirectory() as tmp, sync_playwright() as p:
    standalone = Path(tmp) / 'Network-Change-Roulette-CR.html'
    subprocess.run([sys.executable, str(root / 'tools/build_offline.py'), str(standalone)], check=True)
    b = p.chromium.launch(executable_path=args.chromium)
    context = b.new_context(viewport={'width':1440,'height':960})
    page = context.new_page()
    errors = []
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url)
    at=page.locator
    btn=lambda name:page.get_by_role('button',name=name,exact=True)
    def pick(id):
        btn('Ticket library').click()
        at('#search').fill(id)
        at('.ticket-option').first.click()
    def commit(cities,risk):
        if cities:
            for name in cities: page.get_by_role('checkbox',name=name,exact=True).check()
        else: page.get_by_role('checkbox',name='Neither branch').check()
        page.get_by_role('radio',name=risk,exact=True).check()
        btn('Spin & commit').click()

    # 1: The decision fits on the first screen at desktop and phone widths.
    expect(page).to_have_title('Network Automation Arcade - Network Change Roulette (CR)')
    expect(at('.wordmark')).to_have_text('Network Automation Arcade - Network Change Roulette (CR)')
    expect(at('#case-id')).to_have_text('Round 1 of 20 · Question 1 of 5')
    expect(at('#hud-progress')).to_have_text('0 / 100 completed')
    for width in (390,1440):
        page.set_viewport_size({'width':width,'height':844})
        for selector in ('#question-stem','#choices','#risk-choices','#commit'):
            expect(at(selector)).to_be_in_viewport(ratio=1)
        expect(at('#challenge details[open]')).to_have_count(0)
    done('Change lead','The question and both sets of choices fit on desktop and mobile with the evidence collapsed.')

    # 2: Site evidence via mouse, without using the text selector to make the pick.
    at('#atlas-detail > summary').click()
    at('#site-select').select_option('Denver')
    rect=at('#globe').bounding_box()
    sy, sx = map(math.radians,(39.74,-104.99))
    lat,lon=map(math.radians,(32.78,-96.80))
    radius=min(rect['width']*.44,rect['height']*.45)
    x=rect['width']/2 + radius*math.cos(lat)*math.sin(lon-sx)
    y=rect['height']*.49 - radius*(math.cos(sy)*math.sin(lat)-math.sin(sy)*math.cos(lat)*math.cos(lon-sx))
    page.wait_for_timeout(70)
    at('#globe').click(position={'x':x,'y':y})
    expect(at('#site-name')).to_have_text('Dallas')
    done('Architect','Clicking the projected Dallas marker opened Dallas evidence.')

    # 3: Scope investigation to the chosen site, including its workload.
    btn('Change desk').click()
    expect(at('#site-detail')).to_contain_text('Payroll')
    at('#site-tickets').click()
    expect(at('#library-count')).to_have_text('10 of 100 questions')
    at('.ticket-option').first.click()
    expect(at('#round-title')).to_contain_text('Payroll')
    done('Change lead','Site selection exposed operational context and filtered the library to ten matching cases.')

    # 4: Explore freely and reorient to the active site.
    at('#atlas-detail > summary').click()
    globe=at('#globe')
    before=globe.evaluate('el=>el.toDataURL()')
    globe.focus()
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(60)
    assert before != globe.evaluate('el=>el.toDataURL()')
    btn('Zoom in').click(); expect(btn('Zoom out')).to_be_visible()
    btn('Center ticket').click(); expect(btn('Zoom in')).to_be_visible()
    done('Architect','Keyboard rotation changed the rendered sphere. Zoom and recenter worked.')

    # 5: Inspect an active destination before claiming all outages are local.
    at('#site-select').select_option('Atlanta')
    expect(at('#site-detail')).to_contain_text('Simulated service region')
    done('Architect','The service-region marker exposes the destination and TCP port.')

    # 6: No credit on incomplete input.
    pick('CR-002')
    btn('Spin & commit').click()
    expect(at('#input-error')).to_contain_text('branch')
    at('input[value="denver"]').check()
    btn('Spin & commit').click()
    expect(at('#input-error')).to_contain_text('risk')
    expect(at('#hud-progress')).to_have_text('0 / 100 completed')
    done('Change lead','A partial forecast gives field-specific guidance and consumes no attempt.')

    # 7: Trace a pre/post address change before committing.
    pick('CR-042')
    at('#ticket-evidence > summary').click()
    expect(at('#source-chips')).to_contain_text('→')
    expect(at('#source-chips')).to_contain_text('10.101.2.45')
    done('Architect','A backup-egress ticket shows both source addresses in the evidence panel.')

    # 8: Apply a visible rubric without invoking assistance.
    at('#ticket-evidence > summary').click()
    btn('Inspect the evidence').click()
    expect(at('#ticket-evidence > summary')).to_be_focused()
    at('#rubric > summary').click()
    expect(at('#rubric')).to_have_attribute('open','')
    btn('Return to forecast').click()
    expect(at('#risk-picks input').first).to_be_focused()
    expect(at('#point-terms')).to_contain_text('100 points')
    done('Change lead','The published risk matrix is freely available and keyboard focus returns to risk selection.')

    # 9: Risk can be correct while impact is wrong.
    pick('CR-002')
    commit(['Boise'],'Low')
    expect(at('#award')).to_contain_text('+40 pts')
    at('#replay-detail > summary').click()
    expect(at('#risk-review')).to_contain_text('18 min')
    expect(at('#intent-verdict')).to_have_text('Change meets intent')
    done('Change lead','A risk-only first forecast earned 40 points and the replay explained recovery versus tolerance.')

    # 10: Look at animation & deterministic endpoint and enforcement.
    assert at('.dial').evaluate('el=>getComputedStyle(el).animationName')=='roulette'
    expect(at('#replay-rows')).to_contain_text('default deny')
    expect(at('.source-node.blocked')).to_contain_text('Denver')
    done('Architect','The wheel animated while firewall evidence independently identified the blocked branch.')

    # 11: Retry and revisits cannot replace the first forecast.
    btn('Try again').click()
    at('input[value="boise"]').uncheck()
    commit(['Denver'],'Low')
    expect(at('#hud-points')).to_have_text('40 pts')
    expect(at('#award')).to_contain_text('Practice only')
    done('Change lead','Correcting a missed branch preserved the original 40-point assessment.')

    # 12: Persist accepted first attempts across a refresh.
    page.reload()
    expect(at('#case-id')).to_contain_text('Question 2 of 5')
    expect(at('#hud-progress')).to_have_text('1 / 100 completed')
    assert at('#challenge').get_attribute('data-ticket') != 'CR-002'
    expect(at('#hud-points')).to_have_text('40 pts')
    done('Architect','Reload restored the score and resumed with an unanswered question.')

    # 13: Assistance survives switching tickets before a first commit.
    pick('CR-003')
    at('#help-detail > summary').click()
    btn('Worked solution').click()
    pick('CR-004')
    pick('CR-003')
    expect(at('#point-terms')).to_contain_text('0 points')
    commit([], 'Low')
    expect(at('#award')).to_contain_text('Assisted practice')
    done('Change lead','Leaving and reopening a revealed solution still counted as assisted practice.')

    # 14: Export inspectable evidence.
    at('#open-score').click()
    expect(at('#score-lede')).to_contain_text('1 independent forecast · 1 assisted')
    expect(at('#score-history li')).to_have_count(2)
    with page.expect_download() as event: btn('Export evidence').click()
    report=json.loads(Path(event.value.path()).read_text())
    assert report['summary']['points']==40 and report['summary']['excess']==1 and report['summary']['missed']==1
    assert len(report['evidence'][0]['branchEvidence'])==2
    assert report['campaignSize']==100 and report['questionsPerRound']==5
    assert report['assessment'].startswith('Network Automation Arcade - Network Change Roulette (CR)')
    assert event.value.suggested_filename=='network-change-roulette-cr-scorecard.json'
    done('Change lead','Exported records linked first forecasts, blind spots, risk inputs and decisive rules.')

    # 15: Preserve accidental reset.
    btn('Reset run').click(); btn('Cancel').click()
    expect(at('#hud-points')).to_have_text('40 pts')
    btn('Back to question').click()
    done('Change lead','Canceling reset kept both first assessments intact.')

    # 16: Library search, empty state and draw.
    btn('Ticket library').click(); at('#search').fill('not-a-real-site')
    expect(at('#library-count')).to_have_text('0 of 100 questions')
    expect(at('#library-list')).to_contain_text('No matching')
    expect(at('#draw')).to_be_disabled()
    at('#search').fill('')
    at('#type-filter').select_option('route')
    at('#draw').click()
    expect(at('#question-type')).to_have_text('Routing')
    expect(at('#case-id')).to_contain_text('Question 3 of 5')
    done('Architect','Library search handles empty results. Random draw returned an unassessed case.')

    # 17: The longest content should fit a small viewport even with the matrix expanded.
    for kind, count, resource in [('route',20,'aws_route'),('pzen',10,'zia_url_filtering_rules'),('pac',10,'local_file')]:
        btn('Ticket library').click()
        at('#type-filter').select_option(kind)
        expect(at('#library-count')).to_have_text(f'{count} of 100 questions')
        at('.ticket-option').first.click()
        expect(at('#config-detail')).not_to_have_attribute('open','')
        at('#config-detail > summary').click()
        expect(at('#config-before')).to_contain_text(resource)
        expect(at('#config-after')).to_contain_text(resource)
        assert at('#config-after').inner_text() != at('#config-before').inner_text()
        if kind=='pac':
            at('#config-format').select_option('pac')
            expect(at('#config-after')).to_contain_text('FindProxyForURL')
            expect(at('#config-after .added')).to_contain_text('claims.svc.example')
        page.set_viewport_size({'width':320,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), kind
        page.set_viewport_size({'width':1440,'height':960})
    pick('CR-087')
    at('#ticket-evidence > summary').click()
    at('#rubric summary').click()
    at('#atlas-detail > summary').click()
    at('#config-detail > summary').click()
    for width in (320,390,768,1024,1440):
        page.set_viewport_size({'width':width,'height':890})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow {width}'
    page.set_viewport_size({'width':390,'height':844})
    done('Architect','Expanded evidence and map fit widths from 320 through 1440 pixels.')

    # 18: Verify instantaneous motion-reduced play.
    page.emulate_media(reduced_motion='reduce')
    commit([], 'Low')
    assert at('.dial').evaluate('el=>getComputedStyle(el).animationName')=='none'
    expect(at('#advance')).to_be_visible()
    done('Change lead','Reduced motion gave an immediate result and a usable next action.')

    # 19: Independently solve every ticket through the same controls a player uses.
    page.set_viewport_size({'width':1440,'height':960})
    at('#open-score').click()
    btn('Reset run').click()
    btn('Restart session').click()
    expect(at('#hud-progress')).to_have_text('0 / 100 completed')
    btn('Ticket library').click()
    at('#tutorial').click()
    expect(at('#case-id')).to_have_text('Optional practice')
    commit(['Tucson'], 'Low')
    expect(at('#hud-progress')).to_have_text('0 / 100 completed')
    at('#advance').click()
    src="import {catalog} from './game/catalog.mjs'; console.log(JSON.stringify(catalog.slice(1)))"
    catalog=json.loads(subprocess.check_output(['node','--input-type=module','-e',src], cwd=root))
    forecasts={}
    for ticket in catalog:
        lost=[branch['id'] for branch in ticket['branches'] if not reaches_service(ticket,branch)]
        d=ticket['readiness']
        total=d['rehearsal']+2+(d['recovery']>d['tolerance'])+(d['recovery']>2*d['tolerance'])
        forecasts[ticket['id']]=[lost,'Low' if total<=3 else 'Moderate' if total==4 else 'High']

    seen=set()
    for number in range(1,21):
        ids=page.evaluate("""({forecasts, number}) => {
          const byId = id => document.getElementById(id)
          const ids = []
          for (let step = 1; step <= 5; step++) {
            const id = byId('challenge').dataset.ticket
            if (byId('case-id').textContent !== `Round ${number} of 20 · Question ${step} of 5`)
              throw new Error('Unexpected round position for ' + id)
            const [lost, risk] = forecasts[id]
            for (const input of byId('branch-choices').querySelectorAll('input')) {
              if (lost.includes(input.value)) input.click()
            }
            if (!lost.length) byId('neither').click()
            document.querySelector('input[name=risk][value=' + risk + ']').click()
            if (step === 5) {
              byId('board-picks').querySelector('input').click()
              byId('citation').value = 'path'
            }
            byId('commit').click()
            if (!byId('award').textContent.startsWith('+100 pts')) throw new Error('Wrong verdict on ' + id)
            if (step < 5 && step + number < 20 && !byId('deal-cards').children.length) throw new Error('No next ticket')
            byId('advance').click()
            if (byId('round-results').hidden !== (step < 5)) throw new Error('Unexpected round ending')
            ids.push(id)
          }
          return ids
        }""",{'forecasts':forecasts,'number':number})
        assert len(set(ids))==5 and not seen.intersection(ids)
        seen.update(ids)
        expect(at('#round-history > li')).to_have_count(5)
        expect(at('#round-stats')).to_contain_text('500 / 500')
        if number==1:
            page.reload()
            expect(at('#round-result-heading')).to_have_text('Round 1 complete')
            btn('Ticket library').click()
            expect(at('#draw')).to_be_disabled()
            expect(at('.ticket-option:disabled')).to_have_count(95)
            at('.ticket-option:enabled').first.click()
            expect(at('#case-id')).to_have_text('Optional practice')
            commit([], 'Low')
            expect(at('#hud-progress')).to_have_text('5 / 100 completed')
            at('#advance').click()
        if number<20:
            expect(at('#continue-round')).to_be_visible()
            at('#continue-round').click()
            if number==1:
                next_id=at('#challenge').get_attribute('data-ticket')
                # A new tab has fresh sessionStorage and shares the saved campaign.
                next_page=page.context.new_page()
                next_page.goto(url)
                expect(next_page.locator('#case-id')).to_have_text('Round 2 of 20 · Question 1 of 5')
                expect(next_page.locator('#challenge')).to_have_attribute('data-ticket',next_id)
                next_page.close()
                page.reload()
                expect(at('#challenge')).to_have_attribute('data-ticket',next_id)
    assert seen==set(forecasts) and len(seen)==100
    page.reload()
    expect(at('#round-result-heading')).to_have_text('Campaign complete')
    expect(at('#continue-round')).to_be_hidden()
    expect(at('#hud-points')).to_have_text('10000 pts')
    at('#results-score').click()
    expect(at('#score-history li')).to_have_count(100)
    with page.expect_download() as final_download:
        at('#export').click()
    final_report=json.loads(Path(final_download.value.path()).read_text())
    assert final_report['completedRounds']==20 and len(final_report['evidence'])==100
    assert {entry['type'] for entry in final_report['evidence']}=={'Routing','Firewall allowlist','Zscaler PZEN','Endpoint PAC'}
    for entry in final_report['evidence']:
        if entry['type']!='Firewall allowlist':
            assert entry['network']['before'] and entry['network']['after'] and entry['branchEvidence'][0]['afterReason']
    # A saved firewall ticket still reports the original policy after the catalog changes.
    legacy=b.new_page()
    legacy.goto(url)
    legacy.evaluate("""() => localStorage.setItem('change-roulette-campaign-v3',JSON.stringify({
      forecasts:[['CR-062',['boise'],'Low',[]]],help:[],current:'CR-002',roundStart:0
    }))""")
    legacy.reload()
    legacy.locator('#open-score').click()
    expect(legacy.locator('#score-history')).to_contain_text('Claims · Host exception')
    legacy.locator('#score-history .review-ticket').click()
    expect(legacy.locator('#question-type')).to_have_text('Firewall allowlist')
    legacy.reload()
    legacy.locator('#open-score').click()
    expect(legacy.locator('#score-history')).to_contain_text('Claims · Host exception')
    legacy.close()
    done('Architect','Independently solved 100 unique questions in 20 five-question rounds, checked continuation across tabs and refresh, and reached the final scorecard.')

    # 20: Distribute the same experience offline.
    offline=b.new_page(offline=True)
    offline.on('pageerror',lambda e:errors.append(str(e)))
    offline.set_content(standalone.read_text())
    expect(offline.locator('#round-title')).to_have_text('Claims · Add a host route')
    expect(offline).to_have_title('Network Automation Arcade - Network Change Roulette (CR)')
    offline.locator('#atlas-detail > summary').click()
    offline.locator('#site-select').select_option('Kigali')
    offline.locator('#site-tickets').click()
    expect(offline.locator('#library-count')).to_have_text('10 of 100 questions')
    offline.locator('.ticket-option').first.click()
    offline.locator('#neither').check()
    offline.get_by_role('radio',name='Moderate',exact=True).check()
    offline.locator('#commit').click()
    expect(offline.locator('#award')).to_contain_text('First forecast')
    assert not errors,errors
    done('Change lead','The standalone build supported site investigation, ticket choice, forecast and grading with networking disabled.')

assert len(passes)==20
print('All 20 persona passes completed.')

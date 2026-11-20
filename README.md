# Network Change Roulette (CR)

Play 20 rounds of five network-change questions. Each forecast covers the affected branches and rollout risk. The 100 scored questions span ten service deployments with 60 firewall, 20 routing, 10 Zscaler PZEN and 10 endpoint PAC tickets. The original Tucson/Phoenix case is an optional unscored tutorial in the ticket library.

## Play locally

From the project root, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **http://127.0.0.1:8000/** in your browser. In a cloud workspace, bind to `0.0.0.0` for a configured HTTP preview on port 8000. The game uses static HTML, CSS and JavaScript modules with no install or build step.

1. Read the current change and choose the affected branches and risk rating. Expand the network evidence, Terraform comparison, risk matrix or globe when you need more information.
2. Press **Spin & commit** to submit. Expand **Answer explanation** for the simulated outcome. Each distinct first submission counts as one completed question. An independent forecast can earn 60 points for impact and 40 for risk. Hints and worked solutions mark a first forecast as assisted.
3. After five first forecasts, review your round results. Choose **Play the next 5 questions** to continue with unanswered questions. Practice and retries earn no additional progress. The campaign ends at 100.
4. Open **Scorecard** to review first-forecast accuracy, errors, streaks and downloadable JSON evidence. Progress saves in this browser when local storage is available. If storage is restricted, the game attempts tab storage and supports in-memory play.

## Play the arcade round

- Lock in the branches and risk before the rival bot reveals its call. You can cite the decisive site evidence. The fifth ticket also asks the change board to **Approve**, **Stage**, or **Hold** under the ticket’s rollout scope, active-user counts and recovery deadline. The board rubric is printed beside the choices.
- Call your shot once per round. An exact independent impact prediction earns 25 arcade points. The campaign assessment still awards up to 60 for impact and 40 for risk. The scorecard keeps the ticket that earned each collectible stamp.
- Pick either face-up ticket or choose **Pick for me**. After a verdict, **Ride the packet** opens the globe. Choose a branch and play the journey or advance one hop at a time. Reduced-motion settings keep the route marker stationary between steps.
- The **Skills** section of the scorecard offers five-ticket drills and shows the most recent practice accuracy beside the campaign baseline. Each drill tracks its own five calls. Viewing a previously unanswered ticket’s solution or submitting it in practice marks its future campaign forecast as assisted.

Active practice rounds resume in the same tab when session storage is available. The campaign and scorecard persist in browser storage. User counts, the rollout scope and the board's policy are workshop fixtures.

## Model and evidence

The NAF workshop loop connects a stated intent, a player decision, a visible network consequence and an explanation. This version compares the proposed policy with the intended branch access independently of how accurately the player predicted it. [NAF AC6 workshop](https://github.com/automateyournetwork/NAF_AC6/blob/main/WORKSHOP/LAB/README.md)

Use **Ticket library → Ticket type** to choose a topic, or search for one of these examples. Every ticket includes expandable **Current configuration** and **Proposed configuration** panels. The goal is to assess the proposed change before it is applied.

| Ticket | Change | What determines site access |
| --- | --- | --- |
| CR-002 | Remove a firewall permit | Whether a surviving allow rule covers the observed source of the new HTTPS connection. |
| CR-062 | Add a more-specific route | The longest matching destination prefix in each branch table and reachability through its selected gateway. |
| CR-072 | Withdraw a service prefix | The remaining route, including the default, and continuity through the standby path. |
| CR-083 | Change the source seen at the on-premises PZEN | A matching source group and permitted hostname for the same ZIA URL-filtering rule. |
| CR-093 | Add a domain bypass to the local PAC file | Which workstations receive the file, whether the hostname matches, and whether the site has private direct connectivity. |

The Terraform examples use AWS security group ingress rules and routes, ZIA URL filtering rules, and a local file containing the managed workstation PAC script. For PZEN tickets the example assumes existing lab locations, source IP groups, single-host URL categories and a lower-priority block policy. PAC tickets also show the rendered JavaScript. The workstation rollout scope and private route evidence are supplied in the ticket. [AWS route](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route) · [ZIA URL filtering rules](https://github.com/zscaler/terraform-provider-zia/blob/master/docs/resources/zia_url_filtering_rules.md) · [PAC file reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Proxy_servers_and_tunneling/Proxy_Auto-Configuration_PAC_file)

Each branch makes a fresh HTTPS connection on TCP 443. The game grades post-change service access separately from intended access. The rehearsal and recovery matrix is an educational rubric for rollout risk. Service workflows, service regions and recovery estimates are fictional. When resuming a saved campaign, previously assessed tickets keep their original configuration and points.

The orthographic globe uses a 3D unit sphere, approximate city-center coordinates, visible-hemisphere clipping and great-circle service paths. Its coastlines are derived from Natural Earth’s public-domain 1:110m dataset. [Natural Earth coastline](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-coastline/)

## Verification and offline play

Run `node tests/run.mjs` or open **http://127.0.0.1:8000/tests/**. The 19 model checks cover the original workshop scenario, the 100 campaign questions, CIDR boundaries, routing, forward proxy policies, PAC decisions, scoring and assistance. The 20 simulated architect and change-lead browser checks play the full campaign with independently calculated answers. They verify five-question stopping points, unique draws, saved progress, scorecard export, globe selection, keyboard controls, phone layouts, reduced motion and offline play.

With the server running, Python Playwright, Chromium and Node installed, run `python3 tests/persona_review.py` to reproduce the 20 browser passes. The script creates a temporary browser session and checks the standalone build offline. Run `python3 tests/arcade_review.py` against the same server for the packet ride, board decision, chip integrity, saved stamps and focused drill. Both scripts accept `--url`.

To generate a standalone HTML game with Python’s standard library:

```sh
python3 tools/build_offline.py /tmp/Network-Change-Roulette-CR.html
```

Open the generated file in a browser. It contains the entire catalog and globe.

## Workshop files

The [StarterKit](StarterKit/) inputs describe the learning goal and first build. The working [constitution](.specify/memory/constitution.md), [spec and clarifications](specs/001-change-roulette/spec.md), [plan and analysis](specs/001-change-roulette/plan.md), and [tasks](specs/001-change-roulette/tasks.md) record the original single-round milestone. The [assessment atlas](specs/002-assessment-atlas/review.md) records the earlier globe and assessment design passes. Spec Kit 1.4.3 is available in the prepared cloud environment. Run `/workspace/.arcadelab-tools/bin/specify version` to verify it there.

Backup-egress, route, forward proxy and local PAC changes are included. Multi-service API path tracing remains a workshop proposal.

Adapted from the [AutoCon 6 lab](https://github.com/automateyournetwork/NAF_AC6/blob/main/WORKSHOP/LAB/README.md). [Apache License 2.0](LICENSE).

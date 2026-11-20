---
arcade_version: 1

game:
  title: "Network Automation Arcade - Network Change Roulette (CR)"
  slug: network-change-roulette
  tagline: "Predict which branches a network change breaks before it ships"
  summary: "Players read a firewall, routing, Zscaler PZEN or endpoint PAC change ticket and forecast which branch sites lose access and how risky the rollout is. Each answer is compared with a simulated outcome and explained, and a globe shows the packet path."
  topics: [Firewall, Routing, Terraform, Zscaler, PAC, Change management]
  category: automation
  skill_level: intermediate
  play_minutes: 30
  levels: 20
  card_image: ""             # TODO (HUMAN): add a 16:9 image under 1 MB and set its path
  card_image_alt: ""
  repo: "https://github.com/CodeByDannyV/ArcadeLab-ChangeRoulette"
  repo_path: ""
  license: Apache-2.0

creator:                     # (HUMAN) fill in before submitting
  name: ""
  github: "CodeByDannyV"
  location: ""
  organization: ""
  links: []
  first_spec_project: true
  workshop: "NAF AC6"
  consent_to_publish: false

build:
  started: "2026-11-19"      # The game-building session records the date.
  finished: "2026-11-19"     # The tested solo build was delivered before the next day's GitHub push.
  wall_time: unknown
  spec_driven:
    framework: "GitHub Spec Kit"
    framework_version: "1.4.3"
    artifacts: [constitution, spec, clarify, plan, tasks, analysis]
    task_count: 7
    loops_or_phases: 20        # Architect and change-lead build/review passes documented in the assessment atlas.
  model: unknown
  helper_models: ["ImageGen (UI mockups, exact model ID unknown)"]
  harness: "Codex"
  harness_version: "0.167.0-alpha.4"  # Workspace CLI version reported by codex --version.
  mcp_servers: [codex_apps]    # Server identified in the session's cloud-environment tool calls.
  rag_and_sources:
    - "Creator's AutoCon 6 handoff and the workshop StarterKit"
    - "Network Automation Forum AC6 workshop lab guide"
    - "Automate Your Network and NetBox Labs (creator-supplied visual references)"
    - "RFC 4632, section 3.1 (CIDR notation)"
    - "NIST SP 800-41 Rev. 1, Guidelines on Firewalls and Firewall Policy"
    - "Natural Earth 1:110m coastline data"
    - "Terraform AWS provider documentation for routes"
    - "Zscaler ZIA Terraform provider documentation for URL filtering rules, URL categories and firewall filtering rules"
    - "MDN Proxy Auto-Configuration (PAC) file reference"
  skills_and_plugins:
    - "cloud-environment-onboarding:setup"
    - "cloud-environment:cloud-environment-runtime"
    - "cloud-environment:cloud-desktop"
    - "game-studio:game-playtest"
  other_tools: [Git, "GitHub Spec Kit CLI", Node.js, Python, Playwright, Chromium, Pillow, python-hcl2, ImageGen, curl, ripgrep]
  human_prompts: unknown
  usage:
    input_tokens: unknown
    output_tokens: unknown
    cost_note: unknown
  ai_generated_assets:
    - "Three design mockups of the retired-subnet screen: amber change ticket, purple roulette wheel, and teal traffic path. These were visual references during development."

runtime:
  kind: static-web
  stack: [HTML, CSS, ES modules]
  start: "python3 -m http.server 8000 --bind 127.0.0.1"
  url_after_start: "http://127.0.0.1:8000/"
  hosted_url: ""
  static_root: "."
  requires_install: false
  requires_network: false
  requires_api_key: false
  uses_ai_at_runtime: false
  browsers: [Chromium]
  accessibility: "Keyboard controls, reduced-motion handling and phone layouts are covered by the Playwright persona checks."
  save_state: "browser localStorage, with sessionStorage and in-memory fallback"

verification:
  tests: "node tests/run.mjs"
  tests_passing: 19
  facts_sourced_from: ["AWS Terraform provider documentation", "Zscaler ZIA Terraform provider documentation", "MDN PAC file reference", "Natural Earth 1:110m coastline"]
  known_limits: ["Service workflows, regions, user counts and recovery estimates are fictional fixtures", "The rehearsal and recovery matrix is an educational rubric", "Multi-service API path tracing is not implemented"]
---

## In one paragraph

Network Change Roulette puts you in the change-review seat. Each ticket shows current and proposed configuration for a firewall, route, Zscaler PZEN or PAC change. You forecast which branch sites keep or lose HTTPS access and rate the rollout risk, then compare your call with a rival bot and a simulated result. It suits network engineers learning to assess changes before they are applied.

## How it was built

We started with the workshop constitution and wrote the specification around a single firewall ticket. Tucson needed to lose access while Phoenix stayed connected. The clarifications defined a fresh HTTPS request and gave “Neither branch” its own choice so a blank answer could never earn credit. Next came the implementation plan with its policy analysis, then the task list. Hand-worked examples gave us expected answers before we wired the evaluator to the roulette wheel.

The creator asked for an explorable globe and a way to assess rollout risk alongside branch impact. The assessment atlas records twenty architect and change-lead review passes. One pass caught a grading bug. Choosing a risk rating cleared “Neither branch.” We restricted the clearing behavior to branch checkboxes, then submitted a zero-impact forecast in Chromium to verify the fix.

The creator later asked to put decisions before supporting evidence and divide the campaign into five-ticket rounds. Routing, forward-proxy and workstation PAC tickets added different ways for a connection to fail. The final solo build kept the change-board decision and skill drills after the creator asked to remove teammate play.

## What we'd tell the next builder

- Write down at least one correct case, one plausible wrong choice and one edge case before implementing, and turn them into tests.
- Grade the network outcome independently of the player's prediction so explanations stay trustworthy.
- Record the model ID, MCP servers and timings during the build so this file can be completed honestly.

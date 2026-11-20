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
  started: unknown
  finished: unknown
  wall_time: unknown
  spec_driven:
    framework: "GitHub Spec Kit"
    framework_version: "1.4.3"
    artifacts: [constitution, spec, clarify, plan, tasks, analysis]
    task_count: 7
    loops_or_phases: unknown
  model: unknown             # (HUMAN/agent that built it) exact model ID was not recorded in the repo
  helper_models: []
  harness: "GitHub Copilot"
  harness_version: unknown
  mcp_servers: []            # not recorded in the repo; list the MCP servers connected during the build
  rag_and_sources: ["NAF AC6 workshop lab guide", "Natural Earth 1:110m coastline", "Terraform AWS provider docs", "Zscaler ZIA Terraform provider docs", "MDN PAC file reference"]
  skills_and_plugins: [speckit-constitution, speckit-specify, speckit-clarify, speckit-plan, speckit-tasks, speckit-analyze, speckit-implement]
  other_tools: [Node.js, Python, Playwright, Chromium]
  human_prompts: unknown
  usage:
    input_tokens: unknown
    output_tokens: unknown
    cost_note: unknown
  ai_generated_assets: []

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

We followed the NAF AC6 workflow with GitHub Spec Kit: constitution, specification with clarifications, plan with analysis, then tasks and implementation. The first milestone was a single Tucson/Phoenix round, which became an unscored tutorial. The game then grew into a 100-question campaign, a globe with packet rides, and an assessment scorecard. Model checks and simulated persona browser runs verify the answers. Details such as exact model, token use and timings were not recorded in the repository, so they are marked unknown.

## What we'd tell the next builder

- Write down at least one correct case, one plausible wrong choice and one edge case before implementing, and turn them into tests.
- Grade the network outcome independently of the player's prediction so explanations stay trustworthy.
- Record the model ID, MCP servers and timings during the build so this file can be completed honestly.

# ArcadeLab-ChangeRoulette · Specification input

A new NOC change lead reads a firewall ticket, compares branch IPs to the rules, and predicts which branches will lose the ability to open a case in a fresh session. The replay explains the post-change verdict at each branch.

- **Round:** Tucson’s test lab is retiring. Remove `TUC-TEST` (`10.42.8.0/24`), keep `PHX-PROD` (`10.42.9.0/24`). Tucson is `10.42.8.75` and Phoenix is `10.42.9.75`.
- **Model:** IPv4 allowlist for a single HTTPS destination on TCP 443. The firewall sees the original IP. Before the change, all listed branches can open a case. When the post-change policy has no matching allow rule, it denies the request.
- **Decision:** Select affected branches or explicitly select **Neither branch**. Commit an exact-set prediction. Read the replay and retry or advance.
- **Correct:** Tucson only. Removing its only matching rule leaves default deny. Phoenix matches `PHX-PROD`.
- **Plausible wrong prediction:** Both branches. Replay explains that Phoenix can still open a case because its source IP matches the kept rule.
- **Boundary:** `10.42.9.0` is outside `10.42.8.0/24` and inside `10.42.9.0/24` for matching purposes. In a separate no-removal fixture, the explicit empty prediction is correct.

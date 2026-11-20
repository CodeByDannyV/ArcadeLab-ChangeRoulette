# Feature specification · Network Automation Arcade - Network Change Roulette (CR)

**Scope.** One playable workshop round about the effect of removing an IPv4 source allow rule. Audience is a networking learner playing the NOC change lead. Later NAT and service-to-service scenarios remain proposals.

## User stories and acceptance

| ID | Story | Acceptance |
| --- | --- | --- |
| A1 | Inspect the ticket before committing | Show per-branch access intent and a traffic board linking branch IPs to the firewall and destination port. Show source visibility, current allow rules and proposed removals. Reject invalid fixture content before enabling play. |
| A2 | Predict the impact | Select an exact set of branches or explicitly choose Neither branch. A blank submit gives guidance and consumes no attempt. Editing either choice clears the conflicting choice. |
| A3 | Learn from the replay | After a counted commit, show each branch’s before and after status, decisive post-change rule or default deny, and any prediction mismatch. Update the traffic board and report whether the result matched the stated change intent independently of prediction accuracy. Reveal order may vary while verdicts and score stay fixed. |
| A4 | Retry and finish | Incorrect predictions permit retry. A correct result enables explicit advance. Repeated commits before retry or after success cannot add attempts or completions. |
| A5 | Use help and reset | Reveal a method hint and a worked solution on request. The summary reports completed rounds, attempts, assistance and unassisted first-try success separately. Restart requires confirmation. Reload starts fresh. |
| A6 | Play accessibly | All core actions work by keyboard. Status is expressed in text. Readability and controls survive narrow screens. Feedback is immediate under reduced motion. |

## Clarifications applied before planning

- **Successful case opening:** For this fixture, opening a case requires a fresh HTTPS connection to the AWS case portal. The firewall sees the original IP. Existing sessions, NAT, rule priorities, authentication and downstream service calls are outside this round’s model.
- **Selection:** The lack of a selection means unanswered. An explicit Neither branch choice expresses an empty set.
- **Feedback for both branches:** “Phoenix can still open a case. Its source IP 10.42.9.75 matches the kept PHX-PROD rule (10.42.9.0/24).” Tucson’s missing allow rule triggers default deny.
- **Boundary fixture:** CIDR membership for the adjacent /24 boundary is checked independently of host assignability. A separate fixture with both rules kept exercises the zero-impact answer.
- **Progress:** A round completes on a correct commit. Advance reveals the summary. Help may be opened before completion and counts once per help type.

## Hand-checked comparisons

| Case | Expected |
| --- | --- |
| Baseline | Both IPs match their own /24 and can open a case. |
| Tucson only | Correct after removing `TUC-TEST`. |
| Tucson and Phoenix | Incorrect. Phoenix’s retained rule still matches. |
| `10.42.9.0` | Outside `10.42.8.0/24` and inside `10.42.9.0/24`. |
| Both rules kept | No losses. Explicit Neither branch is correct. The change still misses its intent because Tucson retains access. |

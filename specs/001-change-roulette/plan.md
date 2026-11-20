# Implementation plan · Network Change Roulette (CR)

The feature is a static site with no build step. The round module holds the authored evidence and intended post-change access for each branch. The policy module validates CIDRs and round data and evaluates IPv4 membership before and after rule removal. The session module guards commits and tracks help, attempts and progress. The browser controller renders the traffic board, semantic forms, replay and summary. Python serves the project on port 8000.

## Constitution check

The README documents the teaching model and sources. Tests carry independently chosen expectations. The UI consumes the evaluator’s decisions and preserves explicit zero impact. No runtime service or permissions are required. Motion decorates reveal order and never gates results. Browser verification checks keyboard, narrow screens, reduced motion and reset.

## Analysis before implementation

- A cleared form is ambiguous. Use a distinct empty-set option and leave unanswered submissions uncounted.
- A correct forecast can describe an unsuccessful change. Compare actual firewall access to intent independently of the prediction.
- Replay order could accidentally affect scoring. Compare exact sets before ordering output.
- The baseline is an assumption learners rely on. Validate that each configured branch has an initial match before presenting the challenge.
- Prevent accidental second submissions in session state as well as the UI. Confirm restart through a native dialog.
- Multiple allow matches are equivalent for grading. Retain the first matching rule in evidence order for a reproducible explanation.
- Keep the two later proposals out of current completion counts. They need distinct evidence and worked cases.

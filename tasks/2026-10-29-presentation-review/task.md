# Presentation review — 2026-10-29

Status: research. User requests six independent roles: Design Critic, Storytelling Analyst, Content & Fact Checker, Audience Simulator, Presentation Coach, Red Team Reviewer. Review only; no changes to source PPTX or app, no publication. Low risk.

Baseline: redbe66a4fd21dc54c0b42bc13aa1d04016129d7c, initially clean tree. Read README, docs/project.md, domain.md, architecture.md, verification.md, checks/README.md, .agent/workflow.md/policies.md and context template. Exploration limited to the deck and targeted claim verification, not a complete application audit.

Input: attached seven-slide PPTX, SHA256 6c815e59f68fb9be22c790933508337b01983a54dd7c9e70f34fe12082904dce. Temporary visual artifacts: /tmp/eosdo-presentation-review. macOS Quick Look HTML rendered by local Chromium, with OOXML checks for suspected rendering issues.

Acceptance:
- AC-01: six separate role reviews, slide-specific findings and actionable corrections.
- AC-02: consolidated priorities, facts distinguished from assumptions and unknowns.
- AC-03: visual inspection; material conversion suspicions checked against OOXML.
- AC-04: unchanged original and application; durable report and explicit limitations.

Flow: PPTX -> text/Quick Look -> seven visual renders -> independent reviews -> evidence checks -> report. Relevant inputs: text, screenshots, geometry, unsupported claims. Invalid geometry checked directly in OOXML. Application concurrency, migrations and runtime tests are inapplicable because code is unchanged. Verify six reports, slide references, source hash before/after and final diff. Audience assumption: management/IT deciding on a pilot; actual audience and speaking time unknown. Local current code cannot establish historical deployed behavior.

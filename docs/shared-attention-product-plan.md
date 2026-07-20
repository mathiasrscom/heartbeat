# Heartbeat shared-attention plan

## Product purpose

Heartbeat turns customer conversations into shared priorities for support,
development, product leadership, and management. It is an attention layer on two
office monitors, not a replacement for Intercom or the development backlog.

The monitors answer two questions:

1. What needs action now?
2. What are customers collectively asking us to improve?

## Product principles

- Show evidence, not unsupported AI conclusions.
- Show a maximum of a few priorities at once.
- Make the next owner visible without implying blame.
- Keep SLA and ownership facts deterministic.
- Use local AI for interpretation and synthesis.
- Work without AI and clearly distinguish weak evidence from recurring signals.
- Treat product as context; organize the shared view around customer impact.
- Optimize typography, density, contrast, and motion for distant monitors.

## Monitor 1: Attention now

Audience: primarily support, but understandable to everyone walking past.

The screen contains:

- Overall customer state: Calm, Worth watching, or Needs attention.
- Up to three customer situations requiring a concrete action.
- The next responsible group and a suggested next move.
- Direct links to the Intercom evidence.
- Four guardrail metrics: customers at risk, waiting on us, over SLA, and
  unassigned.
- Product pressure as supporting context.

It intentionally removes teammate rankings, long metric grids, and rotating
panels from the primary experience.

## Monitor 2: Customer pulse

Audience: support, development, product leadership, and management.

The screen contains:

- The overall customer-confidence direction.
- Recurring customer needs backed by multiple conversations.
- Customer happiness and evidence coverage.
- One representative customer voice moment.
- A compact product lens showing where pressure and happiness differ.

Recurring themes require at least two related conversations. A single customer
report can still become a customer-attention signal, but it cannot be presented
as a product-wide pattern.

## Signal model

### Customer attention

Current deterministic inputs include:

- SLA breach or deadline within 60 minutes.
- Missing ownership.
- High or urgent priority.
- Enterprise tier.
- Reopened conversations.
- Long waits for a support reply.
- Explicit blocked or declining-confidence language in English or Danish.

Every signal preserves its Intercom conversation ID and the facts that caused it
to rank. The suggested action is guidance, not an automated customer response.

### Product attention

The first implementation groups recent Intercom tags over a rolling 14-day
window. It reports:

- Related conversation count.
- Known affected-customer count.
- Open evidence count.
- Products in which the theme appears.
- Links to up to six source conversations.

This conservative grouping is useful immediately and creates a safe fallback for
future AI clustering.

## Local-AI architecture

Ollama remains the default interpretation engine. Cloud or Codex usage is
optional and should be reserved for scheduled synthesis rather than continuous
wallboard refreshes.

The next AI implementation should be incremental:

1. Sync the full Intercom thread only for new or changed conversations.
2. Hash the latest analyzed message ID and skip unchanged threads.
3. Ask Ollama for structured JSON: sentiment, customer impact, confidence risk,
   topic, evidence, summary, and suggested response objective.
4. Store the structured assessment, model, timestamp, and content hash.
5. Rank assessments with deterministic code.
6. Cluster topic embeddings or normalized topics across conversations.
7. Let Ollama phrase the final card, but never change IDs, SLA facts, counts, or
   ownership facts.

This avoids reanalyzing the full inbox every five minutes and keeps the system
useful when Ollama is offline.

## Privacy and office-display policy

Customer visibility must be configurable before full rollout:

- Company or contact name.
- Initials only.
- Anonymous customer.
- Hidden for sensitive or VIP conversations.

Message excerpts should be short, strip HTML, and avoid email addresses, phone
numbers, links, and other sensitive identifiers. Intercom remains the source for
the complete conversation.

## Delivery plan

### Phase 1 — Shared attention foundation (implemented)

- Evidence-backed customer-attention signals.
- Conservative recurring-theme detection.
- New monitor-first Attention now and Customer pulse screens.
- Direct wallboard switching and a focused settings workspace.
- Clear support/shared ownership and suggested next actions.
- Honest empty states and deterministic operation without AI.
- Optional write-only bearer token support for authenticated Ollama-compatible
  endpoints.

### Phase 2 — Ollama conversation understanding

- Fetch and normalize full changed conversation threads.
- Store incremental structured assessments.
- Detect frustration, blocking impact, repetition, churn language, promises, and
  deadlines with confidence and evidence.
- Add privacy controls and an analysis-health indicator.

### Phase 3 — Development and management workflow

- Link a product signal to the existing development work item.
- Track acknowledged, investigating, action underway, improving, and resolved.
- Show whether customers have received an update after internal action.
- Add a weekly management digest using cached signal history.

### Phase 4 — Quality and learning

- Allow support to mark a signal useful, incorrect, duplicate, or sensitive.
- Measure false positives and missed critical conversations.
- Improve topic normalization from reviewed outcomes.
- Add trend history without increasing wallboard density.

## Success measures

- Time from material customer signal to explicit owner.
- Percentage of high-risk conversations updated before SLA or promised deadline.
- Time from repeated customer reports to linked development investigation.
- Percentage of displayed signals judged useful by support.
- False-positive rate for customer-risk and recurring-product signals.
- Number of unchanged conversations reprocessed by AI; target: zero.

The wallboard itself should remain small even as the underlying signal quality
improves.

# 🚫 `NON_GOALS.md` — Explicit Boundaries & Scope Control

## Purpose

This contract defines **what the backend skill must NOT do**.

It exists to prevent:

* overengineering
* unnecessary infrastructure
* hidden assumptions
* scope creep disguised as helpfulness

This contract is as important as any other — it protects simplicity.

---

## Core Principle

> **Do only what the prompt explicitly asks. Nothing more.**

If a feature, tool, or pattern is not mentioned in the prompt, it must not be introduced.

---

## Explicit Non-Goals

The backend skill must **not**:

### Infrastructure & Scaling

* Add Redis or any cache
* Add message queues (Kafka, RabbitMQ, etc.)
* Add background workers
* Add cron jobs or schedulers
* Add load balancing or scaling logic

---

### Performance Optimization

* Add indexes unless explicitly required
* Add caching layers
* Optimize queries prematurely
* Add batching or parallelism

Correctness comes before performance.

---

### Architectural Patterns

* Introduce  Introduce event sourcing
* Introduce domain-driven design artifacts
* Introduce dependency injection frameworks
* Introduce microservices

Monolith-first is the default.

---

### Database & Storage

* Auto-sync schemas
* Create tables without migrations
* Use NoSQL databases unless asked
* Mix persistent data with in-memory state

PostgreSQL is the default unless stated otherwise.

---

### Blockchain & Payments

* Perform on-chain transactions
* Integrate wallets beyond validation
* Execute payouts
* Sign transactions

Accounting only, execution later.

---

### External Integrations

* Integrate third-party APIs unless requested
* Scrape social platforms
* Handle rate limits or retries unless required

Placeholders are preferred for complex integrations.

---

### Developer Experience Extras

* Add code generators
* Add CLIs
* Add framework-level abstractions
* Add opinionated tooling

Simplicity beats tooling.

---

## What This Contract Allows

This contract does **not** prevent:

* Clean architecture
* Correct database usage
* Explicit placeholders
* Swagger documentation
* Clear README instructions

It only prevents **unasked complexity**.

---

## Success Criteria

This contract is satisfied if:

* The backend does exactly what the prompt requests
* No hidden services or infra appear
* All complexity is traceable to explicit instructions

---

## Failure Conditions

This contract is violated if:

* "Helpful" features appear without being asked
* The backend includes unused services
* Complexity exists without justification

---

## Summary

This contract ensures the backend remains:

* simple
* intentional
* prompt-driven
* free from ego-driven architecture

> **Restraint is a feature, not a limitation.**


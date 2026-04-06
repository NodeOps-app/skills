# 🧬 `MIGRATIONS_CONTRACT.md` — Schema Evolution & Reproducibility

## Purpose

This contract defines **how database schema changes must be managed**.

It exists to ensure that the database is:

* reproducible across environments
* safe to evolve over time
* consistent between developers, staging, and production

This contract does **not** dictate tooling or complexity. It constrains *when and how migrations are used*.

---

## Core Principles

1. **Schema changes are explicit**
2. **Database state must be reproducible from migrations**
3. **Migrations are versioned and ordered**
4. **Schema must never be modified manually in production**

---

## When Migrations Are Required

A migration must be created when:

* A table is created or removed
* A column is added, removed, or modified
* Constraints are added or changed
* Indexes are introduced or removed
* Enum or state definitions change

If the prompt involves any persistent data change, migrations are mandatory.

---

## Migration Structure

* Emigration must be:

  * atomic
  * versioned
  * named descriptively

Example naming:

```
001_create_tasks_table.sql
002_add_submission_status.sql
```

Migrations must run in order.

---

## Forward & Backward Changes

* Migrations should be **forward-only by default**
* Rollback logic may be included when feasible
* Destructive rollbacks are not required unless explicitly requested

The primary goal is **forward progress with safety**.

---

## Idempotency & Safety

* Migrations must not assume prior manual changes
* Avoid destructive operations unless necessary
* Prefer additive changes (new tables, new columns)

Breaking changes must be intentional and explicit.

---

## Tooling Independence

This contract does not mandate a specific migration tool.

Allowed approaches include:

* SQL-based migrations
* Migration libraries
* ORM-backed migration systems

Regardless of tool choice:

* Migration files must be committed
* Execution order must be deterministic

---

## Running Migrations

* Migrations must be runnable via a single command
* Running migrations must be documented in the README
* Production migrations must be explicit and deliberate

Silent or automatic schema changes are forbidden.

---

## Placeholders & Deferred Tables

When features are stubbed:

* Required tables may still be created with minimal schema
* Schema must reflect future intent where reasonable
* Placeholder tables must not break later evolution

---

## Forbidden Practices

The following are explicitly forbidden:

* Modifying schema directly in production
* Relying on ORM auto-sync
* Implicit schema creation at runtime
* Environment-specific schema divergence

---

## Success Criteria

This contract is satisfied if:

* A new environment can be fully set up from migrations alone
* Schema changes are traceable and reviewable
* Production and development schemas remain aligned

---

## Summary

This contract ensures schema evolution is:

* explicit
* safe
* reproducible
* auditable

> **If data persists, its shape must be versioned.**


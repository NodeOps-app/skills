# 🗄️ `DATABASE_CONTRACT.md` — PostgreSQL Correctness & Safety

## Purpose

This contract defines **how PostgreSQL must be used** in the backend.

It exists to ensure that **all database interactions are safe, predictable, and correct**, even when the prompt requests only simple behavior.

This contract does **not** force complexity. It constrains correctness.

> If the prompt says “create a table”, this contract governs *how* that table is created and accessed — not how sophisticated it is.

---

## Core Principles

1. PostgreSQL is a transactional, ACID-compliant database
2. The backend must not violate ACID assumptions
3. Simplicity is preferred, but **safety is mandatory**
4. Correctness always beats convenience

---

## ACID Awareness (Mandatory Knowledge)

The backend must **respect** the following principles:

* **Atomicity** — Operations that must succeed together must not be partially applied
* **Consistency** — Data must never transition into an invalid state
* **Isolation** rations must not corrupt data
* **Durability** — Committed data must persist

The backend is **not required** to explicitly reference ACID in code unless needed.

---

## When Transactions Are Required

Transactions must be used **only when necessary**, including:

* Updating multiple tables as part of one logical operation
* Read–modify–write sequences that can race
* State transitions that must be atomic (e.g. approval flows)

Transactions must **not** be added by default if a single statement is sufficient.

---

## Safe Write Patterns

All write operations must be safe under concurrency.

### Allowed

* Single-statement `INSERT`, `UPDATE`, or `DELETE`
* Database-enforced constraints
* Explicit locking when truly required

### Forbidden

* Read → modify → write without protection
* Application-level locking as a default strategy
* Assumptions about request order

---

## Race Conditions

The backend must be written under the assumption that:

* Multiple requests may occur concurrently
* Order on is not guaranteed

Services must prevent:

* Double approvals
* Duplicate submissions
* Inconsistent state transitions

This must be handled using:

* Transactions
* Constraints
* Safe update conditions

Not via time-based or in-memory assumptions.

---

## Constraints & Data Integrity

The database schema must enforce invariants whenever possible.

Examples:

* NOT NULL where appropriate
* Unique constraints for identifiers
* Foreign keys for relationships
* Enumerated values for state fields

Do not rely solely on application logic to enforce integrity.

---

## Error Handling

Database errors must:

* Be handled explicitly
* Not be swallowed
* Not leak internal details to clients

Controllers must map database failures to appropriate HTTP responses.

---

## Query Placement Rules

* All SQL lives in the **repository layer**
* Services must never construct SQL
* Controllers must never touch the database

This rule is absolute.

---

## Performance Assumptions

* Assume small to moderate data volumes unless told otherwise
* Do not add indexes unless justified by access patterns
* Do not optimize prematurely

Correctness comes before performance.

---

## Placeholders & Deferred Logic

When database-heavy features are deferred:

* Schema must still reflect future intent
* Repositories may return deterministic placeholder data
* Contracts must not change when logic is implemented later

This enables safe future expansion.

---

## Forbidden Practices

The following are explicitly forbidden:

* Hardcoded database credentials
* In-memory state used as a source of truth
* Silent failure on database errors
* Implicit reliance on transaction isolation defaults

---

## Success Criteria

This contract is satisfied if:

* All database access is centralized
* Concurrent requests do not corrupt data
* Schema enforces key invariants
* Transactions are used intentionally
* Simplicity is preserved where safe

---

## Summary

This contract ensures PostgreSQL is used:

* Safely
* Correctly
* Predictably
* Without unnecessary complexity

> **Use the database as a database, not a key-value store.**


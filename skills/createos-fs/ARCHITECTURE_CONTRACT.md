# 🧱 `ARCHITECTURE_CONTRACT.md` — Backend Structure & Responsibility

## Purpose

This contract defines **how backend code must be structured** and **where responsibilities live**.

It does **not** dictate feature scope, complexity, or business rules.
It exists to ensure that **whatever is built is built in the right place**.

> If the prompt says “build X”, this contract only governs *how X is organized*, not *how complex X becomes*.

---

## Core Principle

> **Clear responsibility boundaries beat clever abstractions.**

The backend must follow a **simple layered architecture** that:

* is easy to reason about
* is easy to extend later
* avoids entangling concerns

---

## Mandatory Layers

The backend is organized into **four conceptual layers**.
All code must belong clearly to one of them.

```
Request
  ↓
Route / Controller
  ↓
Service (Business Logic)
  ↓
Repository (Database)
```

No layer skipping is allowed.

---

## 1️⃣ API Layer (Routes / Controllers)

### Responsibility

erns only
* Parse request inputs
* Call the appropriate service
* Return HTTP responses

### Allowed

* Input validation
* Authentication / authorization checks
* Mapping service results to HTTP responses

### Forbidden

* Business rules
* Database queries
* Data aggregation logic
* Conditional workflows beyond trivial checks

> Controllers should be thin and boring.

---

## 2️⃣ Service Layer (Business Logic)

### Responsibility

* Contain all business rules
* Orchestrate workflows
* Decide *what happens* and *in what order*

### Allowed

* Conditional logic
* Calling multiple repositories
* Transaction boundaries (conceptually)
* Placeholder logic when instructed

### Forbidden

* Raw SQL
* HTTP concerns
* Request/response objects
* Environment variable access

> Services are where “thinking” happens.

---

## 3️⃣ Repository Layer (Persistence)

### Responsibility

* Interact with PostgreSQL
* Perform CRUD operations
* Encapsulate SQL or query builders

### Allowed

* Queries
* Inserts / updat
* Returning raw data models

### Forbidden

* Business logic
* Cross-entity orchestration
* HTTP or auth logic

> Repositories only know *how* data is stored, not *why*.

---

## 4️⃣ Infrastructure / Bootstrap Layer

### Responsibility

* App initialization
* Database connection setup
* Middleware wiring
* Server startup

### Allowed

* Reading environment variables
* Initializing shared clients
* Attaching routes

### Forbidden

* Business logic
* Feature-specific behavior

---

## Dependency Direction (Strict)

Dependencies must flow **downward only**:

```
Controllers → Services → Repositories
```

The following are **not allowed**:

* Repository calling a service
* Service importing a controller
* Controller accessing the database directly

---

## File & Folder Expectations (Conceptual)

The exact structure is flexible, but responsibilities must be clear.

Example (illustrative, not mandatory):

```
src/
├── routes/
├── controllers/
├── services/
├── repositories/
├ârganized differently, the **responsibility boundaries must still hold**.

---

## Transactions & Cross-Cutting Logic

* Services decide **when** a transaction is needed
* Repositories execute queries
* Controllers are unaware of transactions

If the prompt does not require transactions, they must **not** be added implicitly.

---

## Placeholders & Deferred Logic

When instructed to use placeholders:

* Placeholders live in the **service layer**
* Repositories still return valid data shapes
* Controllers remain unchanged

This allows future replacement without refactoring.

---

## What This Contract Explicitly Avoids

This architecture **does NOT require**:

* Domain-driven design
* Event sourcing
* CQRS
* Dependency injection frameworks
* Excessive abstraction layers

If such patterns are needed, they must be **explicitly requested**.

---

## Success Criteria

An architecture complies with this contract if:

* Each file has a single, clear responsibility
* Business logic is isolated in services
* Database access is isolated in repositories
* Controllers are thin and predictable
* Future complexity can be added without restructuring

---

## Failure Conditions

This contract is violated if:

* SQL appears in controllers
* Business rules appear in routes
* Repositories make decisions
* The system requires explanation to understand flow

---

## Summary

This contract ensures the backend is:

* Cleanly structured
* Easy to reason about
* Safe to extend
* Free from unnecessary complexity

> **Structure is enforced.
> Complexity is optional.**


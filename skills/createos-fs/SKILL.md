# Backend API — Agent Skill (Contract-Driven, Swagger-First)

This document defines the **authoritative backend SKILL.md** for generating backend APIs using **Node.js (Express)**.

This skill is **contract-driven**: it teaches *how* to build backends correctly while allowing the **prompt to control scope and complexity**.

The backend may use:

* in-memory storage
* PostgreSQL
* placeholders

…depending strictly on what the user asks for.

---

## File Layout

```
skills/backend-api-nodejs/
└── SKILL.md
```

Only `SKILL.md` is required. All correctness rules are enforced via contracts.

---

## SKILL.md

```markdown
---
name: backend-api-nodejs
 description: Generate a Node.js (Express) backend API using in-memory storage or PostgreSQL, with Swagger (OpenAPI) documentation. Behavior and complexity are strictly controlled by the user prompt and backend contracts.
---

# Backend API Generator — Node.js (Contract-Driven)

## Purpose
This skill generates **runnable backend APIs** using **Node.** with **Swagger / OpenAPI documentation**.

It does not assume databases, infrastructure, or complexity. Those are introduced **only when explicitly requested**.

The skill enforces:
- clean architecture
- safe database usage
- correct configuration
- reproducible migrations
- stable placeholders
- accurate Swagger contracts

All feature scope comes **only from the user prompt**.

---

## Governing Contracts (Mandatory)

This skill must comply with the following contracts:

- `ARCHITECTURE_CONTRACT.md`
- `DATABASE_CONTRACT.md`
- `CONFIGURATION_CONTRACT.md`
- `MIGRATIONS_CONTRACT.md`
- `CODE_QUALITY_CONTRACT.md`
- `PLACEHOLDER_CONTRACT.md`
- `SWAGGER_CONTRACT.md`
- `README_CONTRACT.md`
- `NON_GOALS.md`

If a conflict arises, **contracts override this file**.

---

## When to Use
Use this skill when the user:
- wants a backend API
- needs Swagger / OpenAPI documentation
- wants a clean, safe backend scaffold
- is prototyping or building real systems

Triggering phrases include:
- "Build a backend API"
- "Generate Express endpoints"
- "Backend with Swagger"
- "Node.js API"

---

## Clarification Questions (Ask Only If Needed)

Ask questions **only when required to proceed**:

1. Storage type?
   - in-memory (default)
   - PostgreSQL

2. Entities / resources?

3. Required operations per entity?
   - create
   - list
   - get
   - update
   - delete

4. Placeholder allowance for complex logic?

If the prompt is sufficient, **do not ask questions**.

---

## Storage Rules

### In-Memory Mode

Use in-memory storage when:
- the prompt does not mention a database
- the user is prototyping

Rules:
- Use Maps or arrays
- Treat storage as ephemeral
- No persistence assumptions

### PostgreSQL Mode

Use PostgreSQL **only when explicitly requested**.

Rules:
- Use `DATABASE_URL` from environment variables
- Use migrations for schema changes
- Follow database and migration contracts strictly

---

## Placeholder Rules

When the prompt allows placeholders:
- Follow `PLACEHOLDER_CONTRACT.md`
- Define stable interfaces
- Return deterministic data
- Document placeholders in Swagger and README

---

## API & Swagger Rules

- Swagger is mandatory for all endpoints
- Every route must be documented
- Request and response schemas must be explicit
- Error responses must be documented

Swagger must be accessible via `/docs` by default.

---

## Architecture Rules

- Routes/controllers are thin
- Services contain business logic
- Repositories handle persistence
- No layer skipping

Even in simple or single-file setups, these boundaries must be respected conceptually.

---

## Output Requirements

The generated backend must:

- run via `node index.js` or equivalent
- expose Swagger UI
- include `.env.example` if configuration is used
- include migrations when PostgreSQL is used
- include a README following `README_CONTRACT.md`

---

## Notes for the Agent

- Do not add features not requested
- Do not optimize prematurely
- Do not introduce infrastructure implicitly
- Prefer clarity over cleverness

This skill exists to **build backends that can grow safely without forcing complexity**.
```

---

## Usage Notes

Install this skill alongside frontend skills. The backend skill enforces correctness via contracts while letting the prompt decide how much functionality is built.


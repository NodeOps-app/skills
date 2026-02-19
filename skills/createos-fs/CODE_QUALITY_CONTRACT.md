# 🧼 CODE_QUALITY_CONTRACT.md — Clean Code Without Overengineering

## Purpose

This contract defines **how backend code should be written** to remain:
- readable
- maintainable
- safe
- easy to extend

It exists to prevent two extremes:
1. messy, ad-hoc code
2. overengineered, pattern-heavy code

This contract does **not** increase scope or complexity. It constrains *style, structure, and discipline*.

---

## Core Philosophy

> **Clarity beats cleverness.**

Code should be easy to read and understand by another engineer without explanation.

If a construct exists only to look “clean” or “architected”, it is likely unnecessary.

---

## Single Responsibility (Practical SOLID)

Each unit of code should have **one clear reason to change**.

Applied practically:
- Controllers handle HTTP
- Services handle business logic
- Repositories handle persistence

Do **not** split files or classes further unless it improves clarity.

---

## Explicit Over Implicit

Prefer:
- explicit parameters
- explvalues
- explicit error handling

Avoid:
- magic behavior
- hidden side effects
- framework-level abstractions that obscure flow

If behavior is important, it should be visible in code.

---

## Allowed Design Patterns (Minimal Set)

Only the following patterns are allowed by default:

- **Service pattern** — for business workflows
- **Repository pattern** — for database access
- **Factory (lightweight)** — only when object creation is non-trivial

All other patterns must be explicitly requested.

---

## Forbidden Patterns (Unless Requested)

The following are forbidden unless the prompt explicitly asks for them:

- Dependency Injection frameworks
- Abstract base classes with no clear need
- Generic service layers
- Event buses
- Domain-driven design artifacts
- CQRS
- Heavy inheritance hierarchies

These add cost without guaranteed benefit.

---

## Function & File Size Guidelines

- Functions should be short enough to read in one glance
- Files should have a single clear purpose
- If a file requirelling to understand, consider refactoring

These are **guidelines**, not hard limits.

---

## Naming Rules

- Names must describe intent
- Avoid abbreviations unless universally understood
- Prefer full words over short forms

Good names remove the need for comments.

---

## Error Handling

- Errors must be handled explicitly
- Do not swallow errors
- Do not rely on implicit framework behavior
- Services should throw meaningful errors
- Controllers should translate errors into HTTP responses

---

## Comments & Documentation

- Comment *why*, not *what*
- Do not comment obvious code
- Use comments sparingly and intentionally

Swagger and README are the primary documentation surfaces.

---

## Refactoring Rules

Refactoring is encouraged **only when**:
- clarity improves
- duplication is reduced
- complexity is lowered

Refactoring is discouraged if it:
- introduces abstractions
- increases indirection
- reduces readability

---

## Consistency Over Preference

Once a style is chosen:
- apply it consistently
- do not mix paradigms
- do not rewrite existing code for stylistic reasons

Consistency matters more than personal preference.

---

## Success Criteria

This contract is satisfied if:
- Code is easy to read and reason about
- New features can be added without restructuring
- There is minimal abstraction overhead
- Another engineer can onboard quickly

---

## Failure Conditions

This contract is violated if:
- Code requires explanation to understand
- Patterns are used without justification
- Abstractions outnumber concrete logic
- Changes require touching many unrelated files

---

## Summary

This contract ensures the backend codebase is:
- clean
- explicit
- maintainable
- free from unnecessary abstraction

> **Write code for humans first. Machines will follow.**


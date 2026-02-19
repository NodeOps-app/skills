# 🧩 PLACEHOLDER_CONTRACT.md — Deferred Complexity Without Rework

## Purpose

This contract defines **how complex or uncertain functionality must be stubbed** when the prompt explicitly instructs the backend to defer implementation.

It exists to ensure that:
- hard problems can be postponed safely
- future implementations do not require refactoring
- APIs, schemas, and flows remain stable

This contract **does not permit sloppy stubs**.  
Placeholders must be intentional, shaped, and replaceable.

---

## Core Principle

> **A placeholder is a promise, not a hack.**

Anything stubbed today must be:
- structurally correct
- deterministic
- safely replaceable later

---

## When Placeholders Are Allowed

Placeholders may be used **only when the prompt explicitly allows or requests them**, such as:

- “Leaderboard logic is complex, stub it”
- “Analytics can be placeholder for now”
- “Return mock data here”
- “We’ll integrate this later”

If the prompt does not say this, real logic must be implemented.

---

## What a Placeholder Must Provide

Every placeholder implementation must satisfy **all** of the following:

### 1️⃣ Stable Interface

- Function names must reflect final intent
- Parameters must match expected future usage
- Return shapes must match final API contracts

The interface **must not change** when the placeholder is replaced.

---

### 2️⃣ Deterministic Behavior

- No randomness
- No time-based variance (unless explicitly required)
- Same inputs → same outputs

This ensures:
- predictable testing
- stable frontend integration

---

### 3️⃣ Realistic Data Shape

- Return objects must look like real data
- Field names, nesting, and types must be final
- Empty or trivial arrays are allowed only if realistic

Never return placeholder strings like:
- `"TODO"`
- `"mock"`
- `"placeholder"`

---

## Where Placeholders Live

### Allowed Locations
- **Service layer** (primary)
- **Dedicated adapter or module** (optional)

### Forbidden Locations
- Controllers
- Roa (unless explicitly instructed)

Controllers and repositories must behave as if the placeholder were real.

---

## Database & Schema Rules for Placeholders

- Schema may include minimal tables needed to support placeholders
- Schema must reflect **future intent**, not temporary hacks
- Do not add throwaway tables or columns

If unsure, prefer:
- minimal schema
- forward-compatible names

---

## Placeholder vs Fake Implementation

A placeholder is **not**:
- a half-written real implementation
- commented-out code
- temporary logic mixed with real logic

A placeholder **is**:
- a clean, isolated stand-in
- intentionally shallow
- structurally complete

---

## Error Handling in Placeholders

- Placeholders must still handle errors cleanly
- Error shapes must match final expectations
- Do not bypass validation or safety checks

Deferred logic does **not** mean unsafe logic.

---

## Documentation Requirements

Whenever placeholders are used:

- They must be clearly documented in:
  - Swagger (if exposed via API)
  - README (as deferred functionality)
- Comments must explain *why* logic is deferred, not *how*

---

## Replacement Guarantee

A placeholder implementation is valid only if:

> It can be replaced with a real implementation  
> **without changing controllers, routes, schemas, or frontend contracts**.

If replacement would require refactoring, the placeholder is invalid.

---

## Forbidden Practices

The following are explicitly forbidden:

- Returning dummy values that violate contracts
- Introducing feature flags to hide placeholders
- Mixing placeholder and real logic in the same function
- “Quick hacks” meant to be deleted later

---

## Success Criteria

This contract is satisfied if:

- Placeholders behave like real components externally
- Frontend can be built without changes later
- Real implementations can be swapped in cleanly
- Deferred complexity is isolated and explicit

---

## Summary

This contract ensures that deferred work is:

- intentional
- safe
- reversible
- non-disruptive
*If it’s hard today, stub it properly — not lazily.**


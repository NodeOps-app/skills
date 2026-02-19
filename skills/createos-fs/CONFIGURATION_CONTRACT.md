# ⚙️ CONFIGURATION_CONTRACT.md — Environment & Runtime Configuration

## Purpose

This contract defines **how configuration and environment variables must be handled** in the backend.

It exists to ensure that the application is:
- portable across environments
- safe from credential leaks
- predictable to run
- easy to set up once dependencies (e.g. PostgreSQL) are available

This contract does **not** add features. It constrains *how configuration is accessed and used*.

---

## Core Principles

1. **Configuration is external to code**
2. **Secrets never live in source files**
3. **Missing configuration must fail loudly**
4. **Defaults are allowed only for non-critical values**

---

## Environment Variables (Mandatory)

All runtime configuration must be provided via environment variables.

### Required Variables (When Applicable)

- `DATABASE_URL`
  - Full PostgreSQL connection string
  - Example:
    ```
    postgres://user:password@host:5432/dbname
    ```

- `PORT`
  - Port the HTTP server listens on
  - Default allowed only for local development

Additional variables may be introduced **only when required by the prompt**.

---

## `.env` File Usage

- A `.env` file **may be used for local development only**
- `.env` files must never be committed to source control
- A `.env.example` file must be generated when environment variables are required

`.env.example` must list:
- variable names
- short descriptions
- no real values

---

## Accessing Configuration in Code

- Environment variables may only be read in the **bootstrap / infrastructure layer**
- Configuration values must be passed explicitly to:
  - database clients
  - servers
  - services (if required)

### Forbidden

- Reading `process.env` inside services or repositories
- Accessing environment variables deep inside business logic

---

## Validation of Configuration

At application startup:

- Required environment variables must be validated
- The application must fail fast if a required variable is missing or invalid
- Error messast be clear and actionable

Silent fallback behavior is forbidden.

---

## Separation of Concerns

Configuration logic must be isolated from:
- business logic
- request handling
- database queries

A single configuration module is recommended.

---

## Environment Awareness

The backend may support multiple environments:

- development
- staging
- production

Environment-specific behavior must:
- be explicit
- be minimal
- never change business logic

---

## Security Rules

The following are explicitly forbidden:

- Hardcoding secrets
- Logging sensitive configuration values
- Exposing configuration via API endpoints

---

## Success Criteria

This contract is satisfied if:

- The application runs using only environment variables
- Secrets are never committed
- Missing configuration causes clear startup failure
- Configuration access is centralized

---

## Summary

This contract ensures configuration is:

- explicit
- secure
- environment-agnostic
- easy to reason about

> **If it changes per environment, it belongs in configuration — not code.**


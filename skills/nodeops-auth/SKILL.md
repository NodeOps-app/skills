---
name: nodeops-auth
description: Add NodeOps PKCE OAuth authentication to a Next.js app. Trigger when the user wants to set up NodeOps login, integrate NodeOps OAuth, add @nodeops-createos/integration-oauth, or connect a Next.js project to NodeOps identity/SSO. Also trigger on "add NodeOps auth", "setup NodeOps authentication", or "add NodeOps login".
---

# NodeOps Auth Setup

Add NodeOps PKCE OAuth to an existing Next.js (App Router) project.

## Prerequisites

Before starting, verify the project is compatible:

- **App Router required**: Check if `app/` directory exists. If only `pages/` exists, stop and tell the user: "This skill only supports Next.js App Router. Your project uses Pages Router."
- **Next.js required**: Check `package.json` for `next` in dependencies. If missing, stop and tell the user this is a Next.js-only package.

## Idempotency

Before each step, check if the work is already done. Skip steps that are already complete:
- If `@nodeops-createos/integration-oauth` is already in `package.json` dependencies, skip install.
- If `app/api/auth/me/route.ts` and `app/api/auth/token/route.ts` already exist, skip route creation.
- If `AuthProvider` from `@nodeops-createos/integration-oauth` is already imported in the layout, skip wrapping.
- If `app/callback/page.tsx` (or `.jsx`) already exists, skip callback page creation.
- If `.env.example` already exists and contains `NODEOPS_`, skip env file creation.

## Steps

1. **Detect project setup** — read `package.json` and check for lock files:
   - Package manager: if `pnpm-lock.yaml` exists → pnpm, if `yarn.lock` exists → yarn, else → npm
   - TypeScript: if `tsconfig.json` exists use `.ts`/`.tsx` extensions, else `.js`/`.jsx`
   - Confirm `app/` directory exists (App Router). If only `pages/` exists, stop.
   - Confirm `next` is in dependencies. If not, stop.

2. **Install the package** — run the appropriate install command:
   - npm: `npm install @nodeops-createos/integration-oauth`
   - pnpm: `pnpm add @nodeops-createos/integration-oauth`
   - yarn: `yarn add @nodeops-createos/integration-oauth`
   - **If install fails**: check if the user has network access and the registry is reachable. Suggest running the command manually if it keeps failing.

3. **Create the API routes** — create two separate route files, creating directories as needed:

   `app/api/auth/me/route.ts` (or `.js`):
   ```ts
   export { GET } from '@nodeops-createos/integration-oauth/server/me';
   ```

   `app/api/auth/token/route.ts` (or `.js`):
   ```ts
   export { POST } from '@nodeops-createos/integration-oauth/server/token';
   ```

4. **Wrap layout with AuthProvider** — read the root layout file. It could be `app/layout.tsx`, `app/layout.jsx`, `app/layout.js`, or `app/layout.ts`. Find whichever exists.
   - Add the import at the top of the file:
     ```tsx
     import { AuthProvider } from '@nodeops-createos/integration-oauth';
     ```
   - Find `{children}` inside the `<body>` tag. Wrap it with `<AuthProvider>`:
     ```tsx
     <AuthProvider>{children}</AuthProvider>
     ```
   - **Do NOT add "use client" to the layout.** `AuthProvider` is already marked `"use client"` internally — it works fine when imported from a Server Component layout.
   - **If the layout already has other providers** (e.g., ThemeProvider, QueryClientProvider), nest `<AuthProvider>` alongside them. Do NOT remove or replace existing providers.
   - **If `{children}` is not directly inside `<body>`** (e.g., it's inside a wrapper div or fragment), wrap wherever `{children}` appears.
   - **If no layout file exists**, stop and tell the user to create a root layout first.

5. **Create the callback page** — ask the user: "Where should users be redirected after login? (default: /dashboard)". Use their answer as the `redirectTo` value. Then create `app/callback/page.tsx` (or `.jsx`):
   ```tsx
   "use client";
   import { useCallbackHandler } from "@nodeops-createos/integration-oauth";

   export default function Callback() {
     const { loading, error } = useCallbackHandler({ redirectTo: "/dashboard" });

     if (loading) return (
       <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
         <p>Signing in...</p>
       </div>
     );
     if (error) return <p>Login failed: {error}</p>;
     return null;
   }
   ```

6. **Create `.env.example`** — create this file at the project root:
   ```
   # ── Client-side (exposed to browser via NEXT_PUBLIC_ prefix) ──────────────────
   NEXT_PUBLIC_NODEOPS_AUTH_URL=https://id.nodeops.network/oauth2/auth
   NEXT_PUBLIC_NODEOPS_CLIENT_ID=your_client_id_here
   NEXT_PUBLIC_NODEOPS_REDIRECT_URI=http://localhost:3000/callback
   NEXT_PUBLIC_NODEOPS_SCOPES=offline_access offline openid

   # ── Server-side only (never sent to browser) ──────────────────────────────────
   NODEOPS_CLIENT_SECRET=your_client_secret_here
   NODEOPS_TOKEN_URL=https://id.nodeops.network/oauth2/token
   NODEOPS_USERINFO_URL=https://autogen-v2-api.nodeops.network/v1/users/me
   ```

7. **Create `.env.local`** — if `.env.local` does not already exist, copy `.env.example` to `.env.local` and remind the user to fill in `NEXT_PUBLIC_NODEOPS_CLIENT_ID` and `NODEOPS_CLIENT_SECRET` with their credentials from the NodeOps developer portal. If `.env.local` already exists, append the missing `NODEOPS_` vars only — do NOT overwrite existing values.

8. **Check `.gitignore`** — read `.gitignore` (if it exists). If `.env.local` is NOT listed, add it to prevent leaking secrets. Also ensure `.env` is listed. If no `.gitignore` exists, create one with at least:
   ```
   .env
   .env.local
   ```

9. **Show a summary** — print a clear summary:
   - Files created/modified (list each one)
   - Files skipped (if any were already present)
   - Remind user to fill in the 2 required env vars: `NEXT_PUBLIC_NODEOPS_CLIENT_ID` and `NODEOPS_CLIENT_SECRET`
   - Show how to use the hooks in any page:
     ```tsx
     import { useAuth, useUser } from '@nodeops-createos/integration-oauth';

     const { isAuthenticated, login, logout, loading, authError } = useAuth();
     const { user } = useUser();
     ```

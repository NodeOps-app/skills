# CreateOS Core Skills Reference

Detailed documentation for all CreateOS operations. Load this reference when you need specifics beyond the quick start.

---

## Project Management

### Create Projects

#### Project Types

| Type | Description | Best For |
|------|-------------|----------|
| `vcs` | GitHub-connected repository | Production apps with CI/CD |
| `image` | Docker container deployment | Pre-built images, complex deps |
| `upload` | Direct file upload | Quick prototypes, static sites |

#### VCS Project

```json
CreateProject({
  "uniqueName": "my-nextjs-app",
  "displayName": "My Next.js Application",
  "type": "vcs",
  "source": {
    "vcsName": "github",
    "vcsInstallationId": "12345678",
    "vcsRepoId": "98765432"
  },
  "settings": {
    "framework": "nextjs",
    "runtime": "node:20",
    "port": 3000,
    "directoryPath": ".",
    "installCommand": "npm install",
    "buildCommand": "npm run build",
    "runCommand": "npm start",
    "buildVars": {"NODE_ENV": "production"},
    "runEnvs": {"DATABASE_URL": "postgresql://..."},
    "ignoreBranches": ["develop", "feature/*"],
    "hasDockerfile": false,
    "useBuildAI": false
  },
  "appId": "optional-app-uuid",
  "enabledSecurityScan": true
})
```

**Prerequisites**: GitHub account connected, repository access granted

**Pitfalls**: Incorrect `vcsRepoId` causes failures; missing `port` fails health checks; `buildVars` (build-time) vs `runEnvs` (runtime)

#### Image Project

```json
CreateProject({
  "uniqueName": "my-api-service",
  "displayName": "My API Service",
  "type": "image",
  "source": {},
  "settings": {
    "port": 8080,
    "runEnvs": {"API_KEY": "secret", "LOG_LEVEL": "info"}
  }
})
```

#### Upload Project

```json
CreateProject({
  "uniqueName": "quick-prototype",
  "displayName": "Quick Prototype",
  "type": "upload",
  "source": {},
  "settings": {
    "framework": "express",
    "runtime": "node:20",
    "port": 3000,
    "installCommand": "npm install",
    "buildCommand": "npm run build",
    "buildDir": "dist",
    "useBuildAI": true
  }
})
```

### Update Project Settings

```json
UpdateProjectSettings(project_id, {
  "framework": "nextjs",
  "runtime": "node:22",
  "port": 3000,
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "runCommand": "npm start",
  "buildDir": ".next",
  "buildVars": {"NODE_ENV": "production"},
  "runEnvs": {"NEW_VAR": "value"},
  "ignoreBranches": ["wip/*"],
  "hasDockerfile": false,
  "useBuildAI": false
})
```

**Edge cases**: Changing `runtime` triggers rebuild; changing `port` requires redeployment; `ignoreBranches` affects future pushes only

### Project Lifecycle

| Operation | Tool |
|-----------|------|
| List | `ListProjects(limit?, offset?, name?, type?, status?, app?)` |
| Get | `GetProject(project_id)` |
| Update | `UpdateProject(project_id, {displayName, description?, enabledSecurityScan?})` |
| Delete | `DeleteProject(project_id)` — async |
| Check name | `CheckProjectUniqueName({uniqueName})` |

### Project Transfer

```
1. Owner: GetProjectTransferUri(project_id) → {uri, token} (valid 6 hours)
2. Owner: Share URI with recipient
3. Recipient: TransferProject(project_id, token)
4. Audit: ListProjectTransferHistory(project_id)
```

---

## Deployments

### Trigger Deployments

**VCS Projects** — Push to GitHub (auto) or manual:
```json
TriggerLatestDeployment(project_id, branch?)
```

**Image Projects**:
```json
CreateDeployment(project_id, {"image": "nginx:latest"})
```

**Upload Projects**:
```json
// Text files
UploadDeploymentFiles(project_id, {
  "files": [
    {"path": "package.json", "content": "{...}"},
    {"path": "index.js", "content": "..."}
  ]
})

// Binary files (base64)
UploadDeploymentBase64Files(project_id, {
  "files": [{"path": "logo.png", "content": "iVBORw0KGgo..."}]
})

// ZIP archive
UploadDeploymentZip(project_id, {file: zipBinaryData})
```

**Limits**: Max 100 files per upload; use ZIP for larger projects

### Deployment States

```
queued → building → deploying → deployed
              ↓                      ↓
           failed               sleeping
```

| State | Actions |
|-------|---------|
| `queued` | Cancel |
| `building` | Cancel, View logs |
| `deploying` | Wait |
| `deployed` | Assign to env |
| `failed` | Retry, View logs |
| `sleeping` | Wake up |

### Deployment Operations

| Operation | Tool |
|-----------|------|
| List | `ListDeployments(project_id, limit?, offset?)` |
| Get | `GetDeployment(project_id, deployment_id)` |
| Retry | `RetriggerDeployment(project_id, deployment_id, settings?)` |
| Cancel | `CancelDeployment(project_id, deployment_id)` |
| Delete | `DeleteDeployment(project_id, deployment_id)` |
| Wake | `WakeupDeployment(project_id, deployment_id)` |
| Download | `DownloadDeployment(project_id, deployment_id)` — upload only |

### Debug with Logs

```json
// Build logs
GetBuildLogs(project_id, deployment_id, skip?)

// Runtime logs
GetDeploymentLogs(project_id, deployment_id, since-seconds?)

// Environment logs
GetProjectEnvironmentLogs(project_id, environment_id, since-seconds?)
```

---

## Environments

### Create Environment

**VCS Project** (branch required):
```json
CreateProjectEnvironment(project_id, {
  "displayName": "Production",
  "uniqueName": "production",
  "description": "Live production environment",
  "branch": "main",
  "isAutoPromoteEnabled": true,
  "resources": {"cpu": 500, "memory": 1024, "replicas": 2},
  "settings": {
    "runEnvs": {
      "NODE_ENV": "production",
      "DATABASE_URL": "postgresql://..."
    }
  }
})
```

**Image Project** (no branch):
```json
CreateProjectEnvironment(project_id, {
  "displayName": "Production",
  "uniqueName": "production",
  "resources": {"cpu": 500, "memory": 1024, "replicas": 2},
  "settings": {"runEnvs": {"NODE_ENV": "production"}}
})
```

### Resource Limits

| Resource | Min | Max | Unit |
|----------|-----|-----|------|
| CPU | 200 | 500 | millicores |
| Memory | 500 | 1024 | MB |
| Replicas | 1 | 3 | instances |

```json
UpdateProjectEnvironmentResources(project_id, environment_id, {
  "cpu": 500, "memory": 1024, "replicas": 3
})
```

**Notes**: Replicas > 1 requires stateless app; memory exceeded = OOM kill; CPU exceeded = throttle

### Environment Variables

```json
UpdateProjectEnvironmentEnvironmentVariables(project_id, environment_id, {
  "runEnvs": {
    "DATABASE_URL": "postgresql://...",
    "API_KEY": "secret"
  },
  "port": 8080  // Image projects only
})
```

### Deployment Assignment

```json
AssignDeploymentToProjectEnvironment(project_id, environment_id, {
  "deploymentId": "deployment-uuid"
})
```

Use for: rollbacks, blue-green switching, canary releases

---

## Domains

### Add Custom Domain

```json
CreateDomain(project_id, {
  "name": "api.mycompany.com",
  "environmentId": "optional-env-uuid"
})
```

Response includes CNAME target for DNS configuration.

### Verification Flow

1. `CreateDomain` → Status: pending
2. Configure DNS CNAME at registrar
3. Wait for propagation (up to 48h)
4. `RefreshDomain(project_id, domain_id)` → Status: active

### Domain Operations

| Operation | Tool |
|-----------|------|
| List | `ListDomains(project_id)` |
| Verify | `RefreshDomain(project_id, domain_id)` |
| Assign | `UpdateDomainEnvironment(project_id, domain_id, {environmentId})` |
| Delete | `DeleteDomain(project_id, domain_id)` |

---

## GitHub Integration

### Connect Account

```json
InstallGithubApp({
  "installationId": 12345678,
  "code": "oauth-code-from-github"
})
```

### Repository Discovery

```json
ListConnectedGithubAccounts()
ListGithubRepositories(installation_id)
ListGithubRepositoryBranches(installation_id, "owner/repo")
GetGithubRepositoryContent(installation_id, {"repository": "owner/repo", "branch": "main"})
```

### Auto-Deploy Config

```json
// Ignore branches
UpdateProjectSettings(project_id, {"ignoreBranches": ["develop", "feature/*"]})

// Auto-promote to environment
CreateProjectEnvironment(project_id, {"branch": "main", "isAutoPromoteEnabled": true, ...})
```

---

## Analytics

### Comprehensive Analytics

```json
GetProjectEnvironmentAnalytics(project_id, environment_id, {
  "start": 1704067200, "end": 1704070800
})
```

### Individual Metrics

| Metric | Tool |
|--------|------|
| Overall | `GetProjectEnvironmentAnalyticsOverallRequests` |
| RPM | `GetProjectEnvironmentAnalyticsRPM` |
| Success % | `GetProjectEnvironmentAnalyticsSuccessPercentage` |
| Time series | `GetProjectEnvironmentAnalyticsRequestsOverTime` |
| Top paths | `GetProjectEnvironmentAnalyticsTopHitPaths` |
| Errors | `GetProjectEnvironmentAnalyticsTopErrorPaths` |
| Distribution | `GetEnvAnalyticsReqDistribution` |

---

## Security

### Vulnerability Scanning

```json
// Enable
UpdateProject(project_id, {"enabledSecurityScan": true})

// Trigger
TriggerSecurityScan(project_id, deployment_id)

// View
GetSecurityScan(project_id, deployment_id)

// Download report
GetSecurityScanDownloadUri(project_id, deployment_id)

// Retry
RetriggerSecurityScan(project_id, deployment_id)
```

---

## Apps (Organization)

### Group Projects

```json
CreateApp({"name": "E-Commerce Platform", "description": "...", "color": "#3B82F6"})
AddProjectsToApp(app_id, {"projectIds": ["uuid1", "uuid2"]})
RemoveProjectsFromApp(app_id, {"projectIds": ["uuid1"]})
ListProjectsByApp(app_id)
```

Deleting app unassigns projects (doesn't delete them).

---

## API Keys

```json
// Create (key shown only once!)
CreateAPIKey({"name": "prod-key", "description": "...", "expiryAt": "2025-12-31T23:59:59Z"})

// List
ListAPIKeys()

// Revoke
RevokeAPIKey(api_key_id)
```

---

## User & Quotas

```json
GetCurrentUser()
GetQuotas()  // {projects: {used, limit}, ...}
GetSupportedProjectTypes()
```

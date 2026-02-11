---
name: createos
description: "Deploy to CreateOS cloud platform. Use for: AI agents, APIs, MCP servers, bots, frontends, webhooks, workers. Supports Node.js, Python, Go, Rust, Bun, Docker. Three methods: GitHub auto-deploy, Docker images, file upload. Triggers: deploy, host, ship, go live, launch, publish, make accessible, put online, production, get URL, expose endpoint."
allowed-tools:
  - mcp__claude_ai_createos__*
  - Bash
  - Read
  - Write
---

# CreateOS Deployment Skill

> Ship anything to production — AI agents, APIs, MCP servers, bots, frontends, webhooks, workers.

## Table of Contents

1. [URL Handling](#url-handling)
2. [Authentication](#authentication)
3. [Quick Start](#quick-start)
4. [Choose Deployment Method](#choose-deployment-method)
5. [Available MCP Tools](#available-mcp-tools)
6. [Helper Scripts](#helper-scripts)
7. [References](#references)

---

## URL Handling

**NEVER construct URLs manually** like `https://{name}.createos.io`

**ALWAYS extract URLs from API responses:**
- `CreateProject` → `response.url`
- `GetProject` → `response.url`
- `GetDeployment` → `response.url`

The actual domain varies (`*.nodeops.app`, custom domains). Share the exact URL from responses.

---

## Authentication

### MCP Mode (Recommended)

No API key needed. Call tools directly:
```
CreateProject(...)
UploadDeploymentFiles(...)
GetDeployment(...)
```

MCP Endpoint: `https://api-createos.nodeops.network/mcp`

### REST API Mode

For scripts/external calls:
```
Header: X-Api-Key: <your-api-key>
Base URL: https://api-createos.nodeops.network
```

Create key via MCP: `CreateAPIKey({name: "my-key", expiryAt: "2025-12-31T23:59:59Z"})`

---

## Quick Start

### Deploy Files Directly (Fastest)

```json
// 1. Create upload project
CreateProject({
  "uniqueName": "my-app",
  "displayName": "My App",
  "type": "upload",
  "source": {},
  "settings": {"runtime": "node:20", "port": 3000}
})
// Response: {"id": "project-uuid", "url": "https://my-app.nodeops.app"}

// 2. Upload files
UploadDeploymentFiles(project_id, {
  "files": [
    {"path": "package.json", "content": "{\"name\":\"app\",\"scripts\":{\"start\":\"node index.js\"}}"},
    {"path": "index.js", "content": "require('http').createServer((req,res)=>res.end('Hello')).listen(3000)"}
  ]
})

// 3. Get actual URL from response
GetDeployment(project_id, deployment_id)
// Response: {"url": "https://my-app.nodeops.app", "status": "deployed"}
```

### Deploy from GitHub (Auto-deploy)

```json
// 1. Get GitHub installation
ListConnectedGithubAccounts()
// Returns: [{installationId: "12345", ...}]

// 2. Find repo
ListGithubRepositories("12345")
// Returns: [{id: "98765", fullName: "myorg/myrepo", ...}]

// 3. Create VCS project
CreateProject({
  "uniqueName": "my-app",
  "displayName": "My App",
  "type": "vcs",
  "source": {"vcsName": "github", "vcsInstallationId": "12345", "vcsRepoId": "98765"},
  "settings": {
    "runtime": "node:20",
    "port": 3000,
    "installCommand": "npm install",
    "buildCommand": "npm run build",
    "runCommand": "npm start"
  }
})
// Auto-deploys on git push
```

### Deploy Docker Image

```json
// 1. Create image project
CreateProject({
  "uniqueName": "my-service",
  "displayName": "My Service",
  "type": "image",
  "source": {},
  "settings": {"port": 8080}
})

// 2. Deploy image
CreateDeployment(project_id, {"image": "nginx:latest"})
```

---

## Choose Deployment Method

| Scenario | Method | Project Type |
|----------|--------|--------------|
| Quick prototype, no git | Upload files | `upload` |
| Production app with CI/CD | GitHub auto-deploy | `vcs` |
| Pre-built Docker image | Deploy image | `image` |
| Complex dependencies | Dockerfile in repo | `vcs` + `hasDockerfile: true` |
| Existing CI pipeline | Push to registry, deploy image | `image` |

### Supported Runtimes

`node:18`, `node:20`, `node:22`, `python:3.11`, `python:3.12`, `golang:1.22`, `golang:1.25`, `rust:1.75`, `bun:1.1`, `bun:1.3`, `static`

### Supported Frameworks

`nextjs`, `reactjs-spa`, `reactjs-ssr`, `vuejs-spa`, `vuejs-ssr`, `nuxtjs`, `astro`, `remix`, `express`, `fastapi`, `flask`, `django`, `gin`, `fiber`, `actix`

---

## Available MCP Tools

### Projects
`CreateProject`, `ListProjects`, `GetProject`, `UpdateProject`, `UpdateProjectSettings`, `DeleteProject`, `CheckProjectUniqueName`

### Deployments
`CreateDeployment`, `TriggerLatestDeployment`, `UploadDeploymentFiles`, `UploadDeploymentBase64Files`, `UploadDeploymentZip`, `ListDeployments`, `GetDeployment`, `GetBuildLogs`, `GetDeploymentLogs`, `RetriggerDeployment`, `CancelDeployment`, `WakeupDeployment`, `DeleteDeployment`

### Environments
`CreateProjectEnvironment`, `ListProjectEnvironments`, `UpdateProjectEnvironment`, `UpdateProjectEnvironmentEnvironmentVariables`, `UpdateProjectEnvironmentResources`, `AssignDeploymentToProjectEnvironment`, `DeleteProjectEnvironment`

### Domains
`CreateDomain`, `ListDomains`, `RefreshDomain`, `UpdateDomainEnvironment`, `DeleteDomain`

### GitHub
`ListConnectedGithubAccounts`, `ListGithubRepositories`, `ListGithubRepositoryBranches`, `GetGithubRepositoryContent`

### Analytics
`GetProjectEnvironmentAnalytics`, `GetProjectEnvironmentAnalyticsOverallRequests`, `GetProjectEnvironmentAnalyticsRPM`, `GetProjectEnvironmentAnalyticsSuccessPercentage`, `GetProjectEnvironmentAnalyticsTopHitPaths`, `GetProjectEnvironmentAnalyticsTopErrorPaths`

### Security
`TriggerSecurityScan`, `GetSecurityScan`, `GetSecurityScanDownloadUri`, `RetriggerSecurityScan`

### Apps
`CreateApp`, `ListApps`, `UpdateApp`, `DeleteApp`, `AddProjectsToApp`, `RemoveProjectsFromApp`

### User
`GetCurrentUser`, `GetQuotas`, `CreateAPIKey`, `ListAPIKeys`, `RevokeAPIKey`

---

## Helper Scripts

For REST API deployments (require `CREATEOS_API_KEY` env var):

### deploy.sh

```bash
# Create project
./scripts/deploy.sh create-project <name> <type> [repo]

# Trigger deployment
./scripts/deploy.sh deploy <project_id>

# View logs
./scripts/deploy.sh logs <project_id> <deployment_id>

# List projects
./scripts/deploy.sh list
```

### quick-deploy.sh

```bash
# Deploy AI agent
./scripts/quick-deploy.sh ai-agent <name> <owner/repo>

# Deploy MCP server
./scripts/quick-deploy.sh mcp <name> <owner/repo>

# Deploy FastAPI service
./scripts/quick-deploy.sh api <name> <owner/repo>
```

### createos.py

Python client library for programmatic access:
```python
from scripts.createos import CreateOSClient

client = CreateOSClient()
project = client.create_project("my-app", "upload", {"runtime": "node:20", "port": 3000})
client.upload_files(project["id"], [{"path": "index.js", "content": "..."}])
```

---

## Common Patterns

### AI Agent

```json
CreateProject({
  "uniqueName": "my-agent",
  "type": "vcs",
  "source": {"vcsName": "github", "vcsInstallationId": "...", "vcsRepoId": "..."},
  "settings": {
    "runtime": "python:3.12",
    "port": 8000,
    "installCommand": "pip install -r requirements.txt",
    "runCommand": "uvicorn main:app --host 0.0.0.0 --port 8000",
    "runEnvs": {"OPENAI_API_KEY": "${OPENAI_API_KEY}"}
  }
})
```

### MCP Server

```json
CreateProject({
  "uniqueName": "my-mcp",
  "type": "vcs",
  "source": {"vcsName": "github", "vcsInstallationId": "...", "vcsRepoId": "..."},
  "settings": {
    "runtime": "node:20",
    "port": 3000,
    "runEnvs": {"MCP_TRANSPORT": "sse"}
  }
})
// MCP endpoint: Fetch URL from GetProject response, append /mcp
```

### Multi-Environment Setup

```json
// Create production environment
CreateProjectEnvironment(project_id, {
  "uniqueName": "production",
  "displayName": "Production",
  "branch": "main",
  "isAutoPromoteEnabled": true,
  "resources": {"cpu": 500, "memory": 1024, "replicas": 2},
  "settings": {"runEnvs": {"NODE_ENV": "production"}}
})

// Create staging environment
CreateProjectEnvironment(project_id, {
  "uniqueName": "staging",
  "displayName": "Staging",
  "branch": "develop",
  "resources": {"cpu": 200, "memory": 500, "replicas": 1}
})
```

### Rollback

```json
// List deployments to find previous good one
ListDeployments(project_id, {limit: 10})

// Assign previous deployment to environment
AssignDeploymentToProjectEnvironment(project_id, environment_id, {
  "deploymentId": "previous-deployment-id"
})
```

---

## Naming Constraints

| Field | Min | Max | Pattern |
|-------|-----|-----|---------|
| Project uniqueName | 4 | 32 | `^[a-zA-Z0-9-]+$` |
| Project displayName | 4 | 48 | `^[a-zA-Z0-9 _-]+$` |
| Environment uniqueName | 4 | 32 | `^[a-zA-Z0-9-]+$` |
| API key name | 4 | 48 | `^[a-zA-Z0-9-]+$` |

---

## Resource Limits

| Resource | Min | Max | Unit |
|----------|-----|-----|------|
| CPU | 200 | 500 | millicores |
| Memory | 500 | 1024 | MB |
| Replicas | 1 | 3 | instances |

---

## References

For detailed documentation, load these references as needed:

- **Core Skills**: `references/core-skills.md` — Detailed API usage for all operations
- **Deployment Patterns**: `references/deployment-patterns.md` — Ready-to-use configs for agents, bots, APIs
- **API Reference**: `references/api-reference.md` — Complete REST API documentation
- **Troubleshooting**: `references/troubleshooting.md` — Common errors and solutions
- **Config**: `config/config.json` — Endpoints, runtimes, limits

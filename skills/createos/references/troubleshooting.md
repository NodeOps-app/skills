# CreateOS Troubleshooting Guide

Quick reference for diagnosing and resolving common issues.

---

## Common Errors

| Error | Diagnosis | Solution |
|-------|-----------|----------|
| Build failed | `GetBuildLogs` | Fix code errors, check dependencies |
| Runtime crash | `GetDeploymentLogs` | Check startup errors, missing env vars |
| Health check fail | App not responding on port | Verify `port` setting matches app |
| 502 Bad Gateway | App crashed after deploy | Check logs, increase memory if OOM |
| Domain pending | DNS not propagated | Wait 24-48h, verify CNAME record |
| Quota exceeded | `GetQuotas` | Upgrade plan or delete unused |
| Deployment sleeping | Idle timeout | `WakeupDeployment` or add keep-alive |

---

## Debugging Workflow

1. **Check deployment status**:
   ```json
   GetDeployment(project_id, deployment_id)
   ```

2. **If `building` or `failed`** — check build logs:
   ```json
   GetBuildLogs(project_id, deployment_id)
   ```

3. **If `deployed` but errors** — check runtime logs:
   ```json
   GetDeploymentLogs(project_id, deployment_id, 300)
   ```

4. **If 502/503 errors** — check resources:
   - Memory too low → OOM kills → increase memory
   - CPU throttled → slow responses → increase CPU

---

## Edge Cases

### High-Load Scenarios

- Max 3 replicas per environment
- Consider external load balancer for higher scale
- Monitor RPM via `GetProjectEnvironmentAnalyticsRPM`

### Monorepo Projects

- Set `directoryPath` to subdirectory in settings
- Use `GetGithubRepositoryContent` to explore structure

### Private npm/pip Packages

- Add auth tokens to `buildVars`:
  ```json
  "buildVars": {"NPM_TOKEN": "..."}
  ```
- Include `.npmrc` or `pip.conf` in repo

### Long-Running Builds

- Build timeout: 15 minutes
- Use `hasDockerfile: true` for complex builds
- Pre-build images and use image project type

### Sleeping Deployments

Deployments sleep after idle timeout. Options:
1. `WakeupDeployment(project_id, deployment_id)` — manual wake
2. Add health check endpoint that gets pinged regularly
3. Use external uptime monitor to keep alive

---

## Best Practices

### Security

1. Never hardcode secrets — use `runEnvs`
2. Enable security scanning on projects
3. Rotate API keys with reasonable expiry
4. Use environment isolation for different secrets

### Performance

1. Start small, scale based on metrics
2. Use 2+ replicas for production availability
3. Monitor analytics for error spikes
4. Use `npm ci` over `npm install` for faster builds

### Reliability

1. Test auto-promote in staging first
2. Keep previous deployments for rollbacks
3. Ensure `port` matches app's actual listen port
4. Handle sleeping deployments appropriately

### Organization

1. Group related projects with Apps
2. Use naming convention: `{app}-{service}-{env}`
3. Document environments clearly
4. Clean up unused projects and deployments

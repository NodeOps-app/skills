# SDK recipes

Use the section matching the application's language. These examples establish the API shape, not a fixed choice of shape, rootfs, or installed package version. Query the target catalog when selecting those values. Keep the source sandbox until the target behavior is verified.

## TypeScript

Daytona uses `@daytona/sdk` and `DAYTONA_API_KEY`. The CreateOS package is `@nodeops-createos/sandbox` and its client reads `CREATEOS_SANDBOX_API_KEY` by default. The inspected package is ESM-only and requires Node 20+ or a compatible runtime. `createSandbox` resolves when the sandbox is running; `runCommand` returns the exit code in `result.exit_code`.

```typescript
import { CreateosSandboxClient } from "@nodeops-createos/sandbox";

const client = new CreateosSandboxClient();
const sandbox = await client.createSandbox({
  shape: "s-1vcpu-1gb",
  rootfs: "devbox:1",
});
try {
  const { result } = await sandbox.runCommand("sh", ["-c", "echo hello"]);
  if (result.exit_code !== 0) throw new Error(result.stderr);
  console.log(result.stdout);
} finally {
  await sandbox.destroy();
}
```

Use `sandbox.files.upload(path, data)` and `download(path)` for files, `sandbox.sh(script)` when the source command needs shell behavior and should throw on failure, and `sandbox.previewUrl(port)` only after enabling public ingress. Daytona `codeRun` needs an installed interpreter and a command or uploaded script; preserve its timeout, arguments, environment, and output handling.

## Python

Daytona uses `daytona` and `DAYTONA_API_KEY`; CreateOS uses the `createos-sandbox` distribution, `createos` imports, and `CREATEOS_API_KEY`. The inspected SDK reads the key from the environment with `Client()`.

```python
from createos import Client, CreateSandboxRequest, RunCommandRequest

with Client() as client:
    sandbox = client.create_sandbox(
        CreateSandboxRequest(shape="s-4vcpu-4gb", rootfs="devbox:1")
    )
    try:
        sandbox.wait_until_running()
        response = sandbox.run_command(
            RunCommandRequest(command="sh", arguments=["-c", "echo hello"])
        )
        if response.result.exit_code:
            raise RuntimeError(response.result.standard_error)
        print(response.result.standard_output)
    finally:
        sandbox.destroy()
```

For file transfer use `sandbox.files.upload(path, bytes_or_binary_stream)` and `sandbox.files.download(path)` as a context manager. For durable tasks use `sandbox.processes.create(ManagedProcessCreateRequest(...))`. Set `ingress_enabled=True` only for an intended public service, then `sandbox.wait_for_port(port)` and `sandbox.preview_url(port)`. CreateOS command requests do not provide Daytona's `code_run`; invoke an installed interpreter through `RunCommandRequest`.

The documented top-level `createos` imports work at runtime. If a project runs mypy with implicit re-exports disabled and reports `attr-defined` for those names, import `Client` from `createos.client` and request types from `createos.models`, then rerun the project's typecheck against the installed SDK version.

## Go

Daytona's Go SDK calls differ from CreateOS's `github.com/NodeOps-app/createos-go-sdk` module. The supplied CreateOS Go SDK targets Go 1.25 and reads `CREATEOS_API_KEY` when no explicit key is passed. Use `strings.NewReader` or another `io.Reader` for uploads. Downloads return an `io.ReadCloser`; close it and use `io.ReadAll` when the application needs the bytes.

```go
client, err := sandbox.NewClient()
if err != nil { return err }
instance, err := client.CreateSandbox(ctx, structs.CreateSandboxRequest{
    Shape: "s-4vcpu-4gb", RootFS: "devbox:1",
})
if err != nil { return err }
defer instance.Destroy(context.Background())
result, err := instance.RunCommand(ctx, structs.RunCommandRequest{
    Command: "sh", Arguments: []string{"-c", "echo hello"},
}, structs.ExecOptions{})
if err != nil { return err }
if result.Result.ExitCode != 0 { return fmt.Errorf("command failed: %s", result.Result.StandardError) }

if err := instance.Files().Upload(ctx, "/tmp/note.txt", strings.NewReader("hello\n")); err != nil {
    return err
}
download, err := instance.Files().Download(ctx, "/tmp/note.txt")
if err != nil { return err }
defer download.Close()
contents, err := io.ReadAll(download)
if err != nil { return err }
```

Imports are `github.com/NodeOps-app/createos-go-sdk/sandbox` and `/structs`, plus the standard library packages the surrounding function needs. The file example needs `io` and `strings`. Use `instance.Processes()` for managed processes and `instance.PreviewURL(port)` for public ingress. Follow the repository's runnable Go examples when adding those features, and run `gofmt`, `go mod tidy`, and `go test ./...` so SDK signature errors are fixed before completion.

## Java

Daytona's Java package is `io.daytona:sdk` and targets Java 11+. CreateOS's Java package is `sh.createos:createos-java-sdk`, targets Java 17, and exposes `CreateOsClient`, `Sandbox`, and request builders. Confirm the application's Java version before replacing the dependency. Resolve the current published version from Maven Central; the inspected and compile-checked SDK version is `0.1.2`.

```xml
<dependency>
  <groupId>sh.createos</groupId>
  <artifactId>createos-java-sdk</artifactId>
  <version>0.1.2</version>
</dependency>
```

If the project relies on Maven's old default compiler plugin, configure a current `maven-compiler-plugin` and set its release to 17 before judging the migrated source.

```java
CreateOsClient client = CreateOsClient.builder().build();
Sandbox sandbox = client.createSandbox(
    CreateSandboxRequest.builder("s-4vcpu-4gb")
        .rootFileSystem("devbox:1")
        .build());
try {
  var result = sandbox.runCommand(RunCommandRequest.of("sh", "-c", "echo hello"));
  if (result.result().exitCode() != 0) {
    throw new IllegalStateException(result.result().standardError());
  }
} finally {
  sandbox.destroy();
}
```

Use imports `sh.createos.CreateOsClient`, `sh.createos.Sandbox`, `sh.createos.model.CreateSandboxRequest`, and `sh.createos.model.RunCommandRequest`. Use the installed Java SDK's types for files, processes, and ingress; the supplied SDK contains compile-checked examples for each.

## Rust

The Daytona skill contains no Rust SDK. Use this section when a Rust application calls Daytona over HTTP or through another integration, or when it is adopting CreateOS Sandbox. The CreateOS crate is `createos`; sandbox operations are async and the examples use Tokio. The inspected SDK is `createos` 0.1.1, uses Rust edition 2024, and requires Rust 1.85 or newer.

```rust
use createos::{Client, CreateSandboxRequest, RunCommandRequest};

#[tokio::main]
async fn main() -> createos::Result<()> {
    let client = Client::from_env()?;
    let sandbox = client.create_sandbox(CreateSandboxRequest {
        shape: "s-4vcpu-4gb".into(),
        rootfs: Some("devbox:1".into()),
        ..Default::default()
    }).await?;
    let result = sandbox.run_command(RunCommandRequest {
        command: "sh".into(),
        arguments: vec!["-c".into(), "echo hello".into()],
        ..Default::default()
    }, Default::default()).await;
    let cleanup = sandbox.destroy().await;
    let result = result?;
    cleanup?;
    if result.result.exit_code != 0 {
        return Err(std::io::Error::other(result.result.standard_error).into());
    }
    println!("{}", result.result.standard_output);
    Ok(())
}
```

The supplied Rust SDK examples also cover file transfer, managed processes, and public ingress. Run `cargo fmt --check`, `cargo check`, and the project's tests before completion; update the toolchain first when the dependency requires a newer Rust version.

## C#

Daytona's supplied skill contains no C# SDK. Use this section when a .NET application calls Daytona through HTTP, CLI, or another integration. CreateOS publishes the `CreateOS.Sandbox` NuGet package, targets .NET 8, and reads `CREATEOS_API_KEY` when no explicit key is supplied. The inspected and compile-checked package version is `0.1.3`; resolve the current compatible version when migrating a real project.

```csharp
using CreateOS.Sandbox;

var client = new SandboxClient();
var sandbox = await client.CreateSandboxAsync(new CreateSandboxRequest
{
    Shape = "s-4vcpu-4gb",
    RootFileSystem = "devbox:1"
});

try
{
    var response = await sandbox.RunCommandAsync(new RunCommandRequest
    {
        Command = "sh",
        Arguments = ["-c", "echo hello"]
    });
    if (response.Result.ExitCode != 0)
        throw new InvalidOperationException(response.Result.StandardError);
    Console.Write(response.Result.StandardOutput);
}
finally
{
    await sandbox.DestroyAsync(CancellationToken.None);
}
```

Use `sandbox.Files.UploadAsync` and `DownloadAsync` for streams, `sandbox.Processes` for managed processes, and `sandbox.GetPreviewUri(port)` only after enabling ingress. Preserve cancellation and timeout behavior and run `dotnet build` plus the project's tests before completion.

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { createKernelResearchManifest } from "../src/cli/kernel-research";
import { rememberKernelResearchRun, findKernelResearchRun } from "../src/kernel-research-runs";

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), "tue-kernel-research-"));
  mkdirSync(join(root, "kernels"), { recursive: true });
  writeFileSync(join(root, "kernels", "matmul.py"), "print('baseline')\n", "utf8");
  writeFileSync(join(root, "bench.py"), "print('bench')\n", "utf8");
  writeFileSync(
    join(root, "hotspot-map.json"),
    `${JSON.stringify({ mappings: { matmul: "kernels/matmul.py" } }, null, 2)}\n`,
    "utf8",
  );
  return root;
}

describe("kernel research manifest", () => {
  test("creates a manifest with bounded editable paths and command templates", () => {
    const projectRoot = makeProject();
    const manifest = createKernelResearchManifest(
      {
        user: "alice",
        gateway: "sshgw.example.org",
        machine: "cgpool1907",
        display: 1,
        localPort: 5901,
        dryRun: false,
      },
      {
        "project-root": projectRoot,
        "editable-paths": "kernels/matmul.py",
        "benchmark-cmd": "./build/bench --size 8192",
        "verify-cmd": "pytest -q tests/test_kernel.py",
        "build-cmd": "cmake -S . -B build && cmake --build build -j",
        "profile-cmd": "python bench.py --profile-report",
        "profile-report-path": "workspace/profile_report.json",
        "hotspot-map-path": "hotspot-map.json",
        "remote-root": "/home/alice",
        "project-name": "kernel-lab",
        "llm-model": "openrouter/openai/gpt-4.1",
      },
      {},
    );

    expect(manifest.workspace.projectRoot).toBe(projectRoot);
    expect(JSON.stringify(manifest.workspace.editablePaths)).toBe(
      JSON.stringify(["kernels/matmul.py"]),
    );
    expect(manifest.provider.kind).toBe("openrouter");
    expect(manifest.provider.model).toBe("openrouter/openai/gpt-4.1");
    expect(manifest.remote.remoteProjectPath).toBe("/home/alice/kernel-lab");
    expect(manifest.profiling.profileReportPath).toBe("workspace/profile_report.json");
    expect(manifest.profiling.hotspotMapPath).toBe("hotspot-map.json");
    expect(manifest.commands.sync.length > 0).toBe(true);
    expect(manifest.commands.verify.includes("tue cuda verify")).toBe(true);
    expect(manifest.commands.benchmark.includes("--runs 10")).toBe(true);
    expect((manifest.commands.projectProfile?.length ?? 0) > 0).toBe(true);
    expect(manifest.commands.profileReportFetch?.includes("cat workspace/profile_report.json")).toBe(true);
  });
});

describe("kernel research run store", () => {
  test("remembers and finds runs", () => {
    const env = {
      HOME: mkdtempSync(join(tmpdir(), "tue-kernel-store-")),
    };

    rememberKernelResearchRun(
      {
        id: "kr-123",
        manifestPath: "/tmp/manifest.json",
        runRoot: "/tmp/run",
        projectRoot: "/tmp/project",
        machine: "CGPOOL1907",
        editablePaths: ["kernels/matmul.py"],
        startedAt: "2026-03-11T12:00:00Z",
      },
      env,
    );

    const record = findKernelResearchRun("kr-123", env);
    expect(record?.machine).toBe("cgpool1907");
    expect(JSON.stringify(record?.editablePaths)).toBe(
      JSON.stringify(["kernels/matmul.py"]),
    );
  });
});

describe("kernel research python hotspot parsing", () => {
  test("parses structured hotspots and ranks editable targets", () => {
    const code = `
import json
from tue_kernel_research.hotspots import parse_hotspots_from_text, rank_targets

text = """
PROFILE_JSON_BEGIN
{
  "hotspots": [
    {"name": "triton_matmul_kernel", "pct_total": 61.2, "source_path": "kernels/matmul.py", "op_type": "matmul"},
    {"name": "layernorm_kernel", "pct_total": 11.5, "source_path": "kernels/layernorm.py", "op_type": "layernorm"}
  ]
}
PROFILE_JSON_END
"""

hotspots = parse_hotspots_from_text(text)
ranked = rank_targets(hotspots, ["kernels/matmul.py", "src/matmul.cu"], [{"match": "matmul", "path": "kernels/matmul.py"}])
print(json.dumps({"hotspots": hotspots, "ranked_targets": ranked["ranked_targets"]}))
`;

    const result = Bun.spawnSync(["python3", "-c", code], {
      cwd: "/Users/sebastianboehler/Documents/GitHub/tue-cli",
      env: {
        ...process.env,
        PYTHONPATH: "/Users/sebastianboehler/Documents/GitHub/tue-cli/python",
      },
      stdout: "pipe",
      stderr: "pipe",
    }) as { exitCode: number; stdout?: Uint8Array; stderr?: Uint8Array };

    expect(result.exitCode).toBe(0);
    const stdout = result.stdout
      ? new TextDecoder().decode(result.stdout)
      : "";
    const payload = JSON.parse(stdout) as {
      hotspots: Array<{ name: string }>;
      ranked_targets: Array<{ relative_path: string; score: number }>;
    };

    expect(payload.hotspots[0]?.name).toBe("triton_matmul_kernel");
    expect(payload.ranked_targets[0]?.relative_path).toBe("kernels/matmul.py");
    expect(payload.ranked_targets[0]?.score > 0).toBe(true);
  });
});

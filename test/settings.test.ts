import { describe, expect, test } from "bun:test";
import {
  buildCudaBenchmarkRemoteCommand,
  buildCudaProfileRemoteCommand,
  buildCudaVerifyRemoteCommand,
  normalizeCudaDevices,
  resolveBuildSettings,
  resolveCudaDevices,
  resolveRunSettings,
  resolveSyncSettings,
} from "../src/cli/settings";

describe("remote root policy", () => {
  test("allows home-rooted paths", () => {
    const settings = resolveBuildSettings({ "remote-root": "~" }, ".", {});

    expect(settings.remoteRoot).toBe("~");
  });

  test("defaults remote root to home when unset", () => {
    const buildSettings = resolveBuildSettings({}, ".", {});
    const runSettings = resolveRunSettings({ cmd: "echo ok" }, ".", {});
    const syncSettings = resolveSyncSettings({}, ".", {});

    expect(buildSettings.remoteRoot).toBe("~");
    expect(runSettings.remoteRoot).toBe("~");
    expect(syncSettings.remoteRoot).toBe("~");
  });

  test("allows scratch students paths", () => {
    const settings = resolveSyncSettings(
      { "remote-root": "/graphics/scratch2/students/my-user/work" },
      ".",
      {},
    );

    expect(settings.remoteRoot).toBe(
      "/graphics/scratch2/students/my-user/work",
    );
  });

  test("allows scratch staff paths", () => {
    const settings = resolveSyncSettings(
      { "remote-root": "/graphics/scratch3/staff/my-user/work" },
      ".",
      {},
    );

    expect(settings.remoteRoot).toBe("/graphics/scratch3/staff/my-user/work");
  });

  test("allows ceph and var/tmp paths", () => {
    const cephSettings = resolveBuildSettings(
      { "remote-root": "/ceph/my-user/work" },
      ".",
      {},
    );
    const tmpSettings = resolveBuildSettings(
      { "remote-root": "/var/tmp/my-user/work" },
      ".",
      {},
    );

    expect(cephSettings.remoteRoot).toBe("/ceph/my-user/work");
    expect(tmpSettings.remoteRoot).toBe("/var/tmp/my-user/work");
  });

  test("rejects disallowed remote root paths", () => {
    expect(() =>
      resolveBuildSettings({ "remote-root": "/tmp/work" }, ".", {}),
    ).toThrow(/Invalid remote root/);
  });

  test("run settings enforce same remote root policy", () => {
    expect(() =>
      resolveRunSettings(
        { "remote-root": "/srv/work", cmd: "echo ok" },
        ".",
        {},
      ),
    ).toThrow(/Invalid remote root/);
  });

  test("build settings support no-download from flags and env", () => {
    const fromFlag = resolveBuildSettings({ "no-download": "true" }, ".", {});
    const fromEnv = resolveBuildSettings({}, ".", { TUE_NO_DOWNLOAD: "1" });

    expect(fromFlag.noDownload).toBe(true);
    expect(fromEnv.noDownload).toBe(true);
  });
});

describe("cuda device parsing", () => {
  test("normalizes comma-separated cuda device lists", () => {
    expect(normalizeCudaDevices("0, 1 ,2")).toBe("0,1,2");
  });

  test("rejects invalid cuda device input", () => {
    expect(() => normalizeCudaDevices("0,a")).toThrow(/Invalid cuda-devices/);
  });

  test("resolves cuda devices from flags/env", () => {
    expect(resolveCudaDevices({ "cuda-devices": "2, 3" }, {})).toBe("2,3");
    expect(resolveCudaDevices({}, { TUE_CUDA_VISIBLE_DEVICES: "1" })).toBe("1");
  });

  test("run settings include resolved cuda devices", () => {
    const settings = resolveRunSettings(
      { cmd: "python3 train.py", "cuda-devices": "1, 2" },
      ".",
      {},
    );

    expect(settings.cudaDevices).toBe("1,2");
  });
});

describe("cuda verification/profiling commands", () => {
  test("requires explicit verification command", () => {
    expect(() => buildCudaVerifyRemoteCommand()).toThrow(/Missing cmd/);
  });

  test("builds verification command with workdir", () => {
    expect(
      buildCudaVerifyRemoteCommand({
        workdir: "/tmp/cuda-agent",
        command: "ctest --output-on-failure",
      }),
    ).toBe("set -e; cd '/tmp/cuda-agent' && ctest --output-on-failure");
  });

  test("requires explicit profiling command", () => {
    expect(() => buildCudaProfileRemoteCommand()).toThrow(/Missing cmd/);
  });

  test("builds profiling command with workdir", () => {
    const command = buildCudaProfileRemoteCommand({
      command: "./bench --size 1024",
      workdir: "/tmp/project",
    });

    expect(command.startsWith("set -e; cd '/tmp/project' && target_cmd=")).toBe(
      true,
    );
    expect(command.includes("explicit_nsys=''")).toBe(true);
    expect(command.includes("nsys_cmd=''")).toBe(true);
    expect(command.includes('if [ -n "$explicit_nsys" ]; then')).toBe(true);
    expect(
      command.includes(
        "/graphics/opt/opt_Ubuntu24.04/cuda/toolkit_*/cuda/bin/nsys",
      ),
    ).toBe(true);
    expect(
      command.includes(
        '"$nsys_cmd" profile --force-overwrite=true -o "$out_prefix" -t "$trace_targets" --stats="$stats_enabled" sh -lc "$target_cmd"',
      ),
    ).toBe(true);
    expect(command.includes('echo "[NSYS] binary: $nsys_cmd"')).toBe(true);
    expect(command.includes('trace_targets=\'cuda,nvtx,osrt\'')).toBe(true);
    expect(command.includes('stats_enabled=\'true\'')).toBe(true);
    expect(command.includes('echo "[NSYS] report: $out_prefix.nsys-rep"')).toBe(
      true,
    );
  });

  test("supports nsys profile options", () => {
    const command = buildCudaProfileRemoteCommand({
      command: "./bench",
      binaryPath: "/graphics/opt/opt_Ubuntu24.04/cuda/toolkit_12.4.1/cuda/bin/nsys",
      outputPrefix: "task2_profile",
      trace: "cuda,osrt",
      stats: false,
      exportSqlite: true,
    });

    expect(
      command.includes(
        "explicit_nsys='/graphics/opt/opt_Ubuntu24.04/cuda/toolkit_12.4.1/cuda/bin/nsys'",
      ),
    ).toBe(true);
    expect(command.includes("out_prefix='task2_profile'")).toBe(true);
    expect(command.includes("trace_targets='cuda,osrt'")).toBe(true);
    expect(command.includes("stats_enabled='false'")).toBe(true);
    expect(
      command.includes(
        '"$nsys_cmd" export --type sqlite --output "$out_prefix.sqlite" "$out_prefix.nsys-rep"',
      ),
    ).toBe(true);
    expect(
      command.includes('"$nsys_cmd" export --sqlite "$out_prefix.sqlite"'),
    ).toBe(true);
    expect(
      command.includes(
        'echo "nsys export to sqlite failed (unsupported CLI options)."',
      ),
    ).toBe(true);
  });
});

describe("cuda benchmark commands", () => {
  test("requires explicit benchmark command", () => {
    expect(() => buildCudaBenchmarkRemoteCommand()).toThrow(/Missing cmd/);
  });

  test("builds benchmark command with defaults", () => {
    const command = buildCudaBenchmarkRemoteCommand({
      command: "./bench",
    });

    expect(
      command.startsWith("set -e; cmd='./bench'; runs=10; warmup=2;"),
    ).toBe(true);
    expect(
      command.includes(
        "bench_shell='sh'; if command -v bash >/dev/null 2>&1; then bench_shell='bash'; fi;",
      ),
    ).toBe(true);
    expect(command.includes('"$bench_shell" -lc "$cmd"')).toBe(true);
    expect(command.includes('echo "[BENCH] summary:')).toBe(true);
  });

  test("validates benchmark iteration options", () => {
    expect(() =>
      buildCudaBenchmarkRemoteCommand({
        command: "./bench",
        runs: 0,
      }),
    ).toThrow(/Invalid runs/);

    expect(() =>
      buildCudaBenchmarkRemoteCommand({
        command: "./bench",
        warmup: -1,
      }),
    ).toThrow(/Invalid warmup/);
  });
});

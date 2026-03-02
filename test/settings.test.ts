import { describe, expect, test } from "bun:test";
import {
  normalizeCudaDevices,
  resolveBuildSettings,
  resolveCudaDevices,
  resolveRunSettings,
  resolveSyncSettings,
} from "../src/cli/settings";

describe("remote root policy", () => {
  test("allows home-rooted paths", () => {
    const settings = resolveBuildSettings(
      { "remote-root": "~/exercise00" },
      ".",
      {},
    );

    expect(settings.remoteRoot).toBe("~/exercise00");
  });

  test("allows scratch students paths", () => {
    const settings = resolveSyncSettings(
      { "remote-root": "/graphics/scratch2/students/my-user/work" },
      ".",
      {},
    );

    expect(settings.remoteRoot).toBe("/graphics/scratch2/students/my-user/work");
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
      resolveBuildSettings(
        { "remote-root": "/tmp/work" },
        ".",
        {},
      ),
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

import { describe, expect, test } from "bun:test";
import {
  formatPoolMachineStatus,
  parsePoolSmiSnapshot,
} from "../src/pool-smi";

describe("pool-smi parser", () => {
  test("parses machine headers and gpu lines", () => {
    const snapshot = `
 cgpool1905      MEM                       GPU   PWR   PID     User     Command                                                                            MEM       Runtime
 0: RTX 2080 Ti    526 / 11264 MiB (  4 %)   0 %   4 W
 cgpool1907      MEM                       GPU   PWR   PID     User     Command                                                                            MEM       Runtime
 0: RTX 2080 Ti   8058 / 11264 MiB ( 71 %)   0 %  17 W 1504532 zehnderj python3 train.py 7028 MiB 63d
 1: RTX 2080 Ti    317 / 11264 MiB (  2 %)   0 %  13 W
`;

    const parsed = parsePoolSmiSnapshot(snapshot);

    expect(parsed.length).toBe(2);
    expect(parsed[0].machine).toBe("cgpool1905");
    expect(parsed[0].gpuCount).toBe(1);
    expect(parsed[0].usedMiB).toBe(526);
    expect(parsed[0].totalMiB).toBe(11264);
    expect(parsed[0].maxGpuUtilPercent).toBe(0);
    expect(parsed[0].totalPowerW).toBe(4);

    expect(parsed[1].machine).toBe("cgpool1907");
    expect(parsed[1].gpuCount).toBe(2);
    expect(parsed[1].usedMiB).toBe(8375);
    expect(parsed[1].totalMiB).toBe(22528);
    expect(parsed[1].totalPowerW).toBe(30);
    expect(parsed[1].primaryGpuModel).toBe("RTX 2080 Ti");
  });

  test("formats machine status summary for CLI list", () => {
    const formatted = formatPoolMachineStatus({
      machine: "cgpool1905",
      gpuCount: 1,
      usedMiB: 526,
      totalMiB: 11264,
      maxGpuUtilPercent: 0,
      totalPowerW: 4,
      primaryGpuModel: "RTX 2080 Ti",
    });

    expect(formatted).toBe(
      "cgpool1905 | 1 GPU | RTX 2080 Ti | MEM 526/11264 MiB (5%) | GPU 0% | PWR 4W",
    );
  });
});

import { describe, expect, test } from "bun:test";
import {
  ALTERNATE_GATEWAY,
  COMPUTE_MACHINES,
  DEFAULT_GATEWAY,
  POOL_MACHINES,
  classifyMachine,
  sanitizeMachineName,
} from "../src/machines";

describe("machines catalog", () => {
  test("has expected gateway defaults", () => {
    expect(DEFAULT_GATEWAY).toBe("sshgw.cs.uni-tuebingen.de");
    expect(ALTERNATE_GATEWAY).toBe("cgcontact.cs.uni-tuebingen.de");
  });

  test("recognizes known pool machine", () => {
    expect(POOL_MACHINES.includes("cgpool1907")).toBe(true);
    expect(classifyMachine("cgpool1907")).toBe("pool");
  });

  test("recognizes known compute machine", () => {
    expect(COMPUTE_MACHINES.includes("cluster-gpu03")).toBe(true);
    expect(classifyMachine("cluster-gpu03")).toBe("compute");
  });

  test("normalizes and validates machine names", () => {
    expect(sanitizeMachineName(" CGPOOL1907 ")).toBe("cgpool1907");
    expect(() => sanitizeMachineName("cgpool1907; rm -rf /")).toThrow(
      "Invalid machine name",
    );
  });
});

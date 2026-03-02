import { describe, expect, test } from "bun:test";
import {
  createBuildCommands,
  createBuildCommandsWithMachineSelection,
  createRunCommands,
  createRunCommandsWithMachineSelection,
} from "../src/build";

describe("createBuildCommands", () => {
  test("creates upload/build/download command sequence", () => {
    const commands = createBuildCommands({
      user: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPath: "./deviceQuery",
      projectName: "deviceQuery",
      remoteRoot: "~/exercise00",
      buildCommand: "mkdir -p build && cd build && cmake .. && make -j",
      artifactPath: "build",
      outputDir: "./deviceQuery/.tue-artifacts",
    });

    expect(commands[0]).toBe(
      'ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "rm -rf ~/exercise00/deviceQuery && mkdir -p ~/exercise00"',
    );
    expect(commands[1]).toBe(
      "scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org './deviceQuery' test-user@cgpool1907:~/exercise00/deviceQuery",
    );
    expect(commands[2]).toBe(
      `ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "bash -lc 'cd ~/exercise00/deviceQuery && mkdir -p build && cd build && cmake .. && make -j'"`,
    );
    expect(commands[3]).toBe("mkdir -p './deviceQuery/.tue-artifacts'");
    expect(commands[4]).toBe(
      "scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org test-user@cgpool1907:~/exercise00/deviceQuery/build './deviceQuery/.tue-artifacts'",
    );
  });

  test("infers project name from non-dot path", () => {
    const commands = createBuildCommands({
      user: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPath: "./exercise00/deviceQuery",
      projectName: undefined,
      remoteRoot: "~/exercise00",
      buildCommand: "make",
      artifactPath: "build",
      outputDir: "./out",
    });

    expect(commands[0]).toBe(
      'ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "rm -rf ~/exercise00/deviceQuery && mkdir -p ~/exercise00"',
    );
  });

  test("creates interactive machine-selection build command", () => {
    const command = createBuildCommandsWithMachineSelection({
      user: "test-user",
      gateway: "gateway.example.org",
      selectorCommand: "ssh test-user@gateway.example.org pool-smi",
      localPath: "./deviceQuery",
      projectName: "deviceQuery",
      remoteRoot: "~/exercise00",
      buildCommand: "make -j",
      artifactPath: "build",
      outputDir: "./out",
    });

    expect(command).toBe(
      `ssh test-user@gateway.example.org pool-smi; printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n "$machine" ] || { echo 'No machine selected.' >&2; exit 1; }; ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@$machine "rm -rf ~/exercise00/deviceQuery && mkdir -p ~/exercise00" && scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org './deviceQuery' test-user@$machine:~/exercise00/deviceQuery && ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@$machine "bash -lc 'cd ~/exercise00/deviceQuery && make -j'" && mkdir -p './out' && scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org test-user@$machine:~/exercise00/deviceQuery/build './out'`,
    );
  });
});

describe("createRunCommands", () => {
  test("creates upload/run command sequence", () => {
    const commands = createRunCommands({
      user: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPath: "./cuda-job",
      projectName: "cuda-job",
      remoteRoot: "~/exercise00",
      runCommand: "nvcc -O3 kernel.cu -o kernel && ./kernel",
    });

    expect(commands[0]).toBe(
      'ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "rm -rf ~/exercise00/cuda-job && mkdir -p ~/exercise00"',
    );
    expect(commands[1]).toBe(
      "scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org './cuda-job' test-user@cgpool1907:~/exercise00/cuda-job",
    );
    expect(commands[2]).toBe(
      `ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "bash -lc 'cd ~/exercise00/cuda-job && nvcc -O3 kernel.cu -o kernel && ./kernel'"`,
    );
  });

  test("creates interactive machine-selection run command", () => {
    const command = createRunCommandsWithMachineSelection({
      user: "test-user",
      gateway: "gateway.example.org",
      selectorCommand: "ssh test-user@gateway.example.org pool-smi",
      localPath: "./cuda-job",
      projectName: "cuda-job",
      remoteRoot: "~/exercise00",
      runCommand: "python3 train.py",
    });

    expect(command).toBe(
      `ssh test-user@gateway.example.org pool-smi; printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n "$machine" ] || { echo 'No machine selected.' >&2; exit 1; }; ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@$machine "rm -rf ~/exercise00/cuda-job && mkdir -p ~/exercise00" && scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org './cuda-job' test-user@$machine:~/exercise00/cuda-job && ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@$machine "bash -lc 'cd ~/exercise00/cuda-job && python3 train.py'"`,
    );
  });
});

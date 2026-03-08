import { describe, expect, test } from "bun:test";
import {
  createBuildCommands,
  createBuildCommandsWithMachineSelection,
  createDetachedRunCommand,
  createRunCommands,
  createRunCommandsWithMachineSelection,
  createSyncCommands,
  createSyncCommandsWithMachineSelection,
} from "../src/build";

describe("createBuildCommands", () => {
  test("creates upload/build/download command sequence", () => {
    const commands = createBuildCommands({
      user: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPath: "./deviceQuery",
      projectName: "deviceQuery",
      remoteRoot: "~",
      buildCommand: "mkdir -p build && cd build && cmake .. && make -j",
      artifactPath: "build",
      outputDir: "./deviceQuery/.tue-artifacts",
    });

    expect(commands[0]).toBe(
      'ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "rm -rf ~/deviceQuery && mkdir -p ~"',
    );
    expect(commands[1]).toBe(
      "scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org './deviceQuery' test-user@cgpool1907:~/deviceQuery",
    );
    expect(commands[2]).toBe(
      `ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "bash -lc 'cd ~/deviceQuery && mkdir -p build && cd build && cmake .. && make -j'"`,
    );
    expect(commands[3]).toBe("mkdir -p './deviceQuery/.tue-artifacts'");
    expect(commands[4]).toBe(
      "scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org test-user@cgpool1907:~/deviceQuery/build './deviceQuery/.tue-artifacts'",
    );
  });

  test("infers project name from non-dot path", () => {
    const commands = createBuildCommands({
      user: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPath: "./exercise00/deviceQuery",
      projectName: undefined,
      remoteRoot: "~",
      buildCommand: "make",
      artifactPath: "build",
      outputDir: "./out",
    });

    expect(commands[0]).toBe(
      'ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "rm -rf ~/deviceQuery && mkdir -p ~"',
    );
  });

  test("skips local download commands when noDownload is enabled", () => {
    const commands = createBuildCommands({
      user: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPath: "./deviceQuery",
      projectName: "deviceQuery",
      remoteRoot: "~",
      buildCommand: "make -j",
      artifactPath: "build",
      outputDir: "./out",
      noDownload: true,
    });

    expect(commands.length).toBe(3);
    expect(commands[2]).toBe(
      `ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "bash -lc 'cd ~/deviceQuery && make -j'"`,
    );
  });

  test("creates interactive machine-selection build command", () => {
    const command = createBuildCommandsWithMachineSelection({
      user: "test-user",
      gateway: "gateway.example.org",
      selectorCommand: "ssh test-user@gateway.example.org pool-smi",
      localPath: "./deviceQuery",
      projectName: "deviceQuery",
      remoteRoot: "~",
      buildCommand: "make -j",
      artifactPath: "build",
      outputDir: "./out",
    });

    expect(command).toBe(
      `ssh test-user@gateway.example.org pool-smi; printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n "$machine" ] || { echo 'No machine selected.' >&2; exit 1; }; ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@$machine "rm -rf ~/deviceQuery && mkdir -p ~" && scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org './deviceQuery' test-user@$machine:~/deviceQuery && ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@$machine "bash -lc 'cd ~/deviceQuery && make -j'" && mkdir -p './out' && scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org test-user@$machine:~/deviceQuery/build './out'`,
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
      remoteRoot: "~",
      runCommand: "nvcc -O3 kernel.cu -o kernel && ./kernel",
    });

    expect(commands[0]).toBe(
      'ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "rm -rf ~/cuda-job && mkdir -p ~"',
    );
    expect(commands[1]).toBe(
      "scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org './cuda-job' test-user@cgpool1907:~/cuda-job",
    );
    expect(commands[2]).toBe(
      `ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "bash -lc 'cd ~/cuda-job && nvcc -O3 kernel.cu -o kernel && ./kernel'"`,
    );
  });

  test("creates interactive machine-selection run command", () => {
    const command = createRunCommandsWithMachineSelection({
      user: "test-user",
      gateway: "gateway.example.org",
      selectorCommand: "ssh test-user@gateway.example.org pool-smi",
      localPath: "./cuda-job",
      projectName: "cuda-job",
      remoteRoot: "~",
      runCommand: "python3 train.py",
    });

    expect(command).toBe(
      `ssh test-user@gateway.example.org pool-smi; printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n "$machine" ] || { echo 'No machine selected.' >&2; exit 1; }; ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@$machine "rm -rf ~/cuda-job && mkdir -p ~" && scp -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -r -o ProxyJump=test-user@gateway.example.org './cuda-job' test-user@$machine:~/cuda-job && ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@$machine "bash -lc 'cd ~/cuda-job && python3 train.py'"`,
    );
  });

  test("injects CUDA_VISIBLE_DEVICES into run command when provided", () => {
    const commands = createRunCommands({
      user: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPath: "./cuda-job",
      projectName: "cuda-job",
      remoteRoot: "~",
      runCommand: "python3 train.py",
      cudaDevices: "0,1",
    });

    expect(commands[2]).toBe(
      `ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "bash -lc 'cd ~/cuda-job && CUDA_VISIBLE_DEVICES=0,1 python3 train.py'"`,
    );
  });

  test("creates detached run command with metadata output", () => {
    const command = createDetachedRunCommand({
      user: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPath: "./cuda-job",
      projectName: "cuda-job",
      remoteRoot: "~",
      runCommand: "python3 train.py",
      cudaDevices: "1",
      runId: "run-123",
    });

    expect(command.includes("ssh -o ControlMaster=auto")).toBe(true);
    expect(command.includes("cd ~/cuda-job")).toBe(true);
    expect(command.includes("mkdir -p .tue-runs")).toBe(true);
    expect(command.includes("nohup CUDA_VISIBLE_DEVICES=1 python3 train.py")).toBe(true);
    expect(command.includes("TUE_RUN_ID=run-123")).toBe(true);
    expect(command.includes('echo "TUE_RUN_PID=$run_pid"')).toBe(true);
    expect(command.includes('echo "TUE_RUN_LOG=$log_file"')).toBe(true);
  });
});

describe("createSyncCommands", () => {
  test("creates remote mkdir + rsync commands", () => {
    const commands = createSyncCommands({
      user: "test-user",
      gateway: "gateway.example.org",
      machine: "cgpool1907",
      localPath: "./deviceQuery",
      projectName: "deviceQuery",
      remoteRoot: "~",
      keepRemote: false,
    });

    expect(commands[0]).toBe(
      'ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@cgpool1907 "mkdir -p ~/deviceQuery"',
    );
    expect(commands[1]).toBe(
      "rsync -az --delete -e 'ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org' './deviceQuery/' 'test-user@cgpool1907:~/deviceQuery/'",
    );
  });

  test("creates interactive machine-selection sync command", () => {
    const command = createSyncCommandsWithMachineSelection({
      user: "test-user",
      gateway: "gateway.example.org",
      selectorCommand: "ssh test-user@gateway.example.org pool-smi",
      localPath: "./deviceQuery",
      projectName: "deviceQuery",
      remoteRoot: "~",
      keepRemote: true,
    });

    expect(command).toBe(
      `ssh test-user@gateway.example.org pool-smi; printf 'Select machine (e.g. cgpool1907): '; read machine; [ -n "$machine" ] || { echo 'No machine selected.' >&2; exit 1; }; ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org test-user@$machine "mkdir -p ~/deviceQuery" && rsync -az -e 'ssh -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=~/.ssh/tue-cli-%C -J test-user@gateway.example.org' './deviceQuery/' 'test-user@$machine:~/deviceQuery/'`,
    );
  });
});

import { saveClusterProfile } from "../cluster-profiles";
import { DEFAULT_GATEWAY } from "../machines";
import { rememberUserProfile } from "../user-profiles";
import { promptInput, supportsInteractivePrompts } from "../ui";
import type { FlagMap } from "./types";

type EnvLike = Record<string, string | undefined>;
type Printer = (message: string) => void;

function parseMachineList(input: string): string[] {
  return input
    .split(",")
    .map((machine) => machine.trim())
    .filter(Boolean);
}

async function valueFromFlagOrPrompt(
  flags: FlagMap,
  key: string,
  question: string,
  defaultValue?: string,
): Promise<string> {
  if (flags[key]) {
    return flags[key];
  }

  if (!supportsInteractivePrompts()) {
    throw new Error(`Missing ${key}. Use --${key} <value>.`);
  }

  return promptInput(question, defaultValue);
}

export async function runInitCommand(
  flags: FlagMap,
  env: EnvLike = Bun.env,
  print: Printer = console.log,
): Promise<void> {
  const user = await valueFromFlagOrPrompt(flags, "user", "University username", env.TUE_USER);
  const name = await valueFromFlagOrPrompt(flags, "cluster", "Cluster profile name", "tuebingen");
  const gateway = await valueFromFlagOrPrompt(flags, "gateway", "SSH gateway", DEFAULT_GATEWAY);
  const machineInput = await valueFromFlagOrPrompt(
    flags,
    "machines",
    "Machine hostnames (comma-separated)",
    flags["default-machine"] ?? env.TUE_MACHINE,
  );
  const machines = parseMachineList(machineInput);

  if (machines.length === 0) {
    throw new Error("At least one machine is required.");
  }

  const defaultMachine = flags["default-machine"] ?? machines[0];
  rememberUserProfile(user, env);
  saveClusterProfile({
    name,
    gateway,
    machines,
    defaultMachine,
    remoteRoot: flags["remote-root"],
    vncVm: flags["vnc-vm"],
  }, env);

  print(`Saved username profile: ${user}`);
  print(`Saved cluster profile: ${name}`);
  print(`Next: tue doctor --cluster ${name}`);
}

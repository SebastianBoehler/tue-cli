import type { ResolvedConfig } from "../config";
import { warnOnRestrictedMachine } from "../machines";
import {
  buildPoolCommand,
  buildStorageCheckRemoteCommand,
} from "../ssh";
import { execute } from "./execution";
import { ensureMachine } from "./helpers";
import { selectMachine } from "./user";
import type { CommandRuntimeOptions } from "./types";

export async function runStorageCheck(
  config: ResolvedConfig,
  options?: CommandRuntimeOptions,
  machineOverride?: string,
): Promise<void> {
  const machine = machineOverride
    ? ensureMachine(machineOverride)
    : config.machine
      ? ensureMachine(config.machine)
      : await selectMachine();

  warnOnRestrictedMachine(machine);

  execute(
    buildPoolCommand({
      username: config.user,
      gateway: config.gateway,
      machine,
      remoteCommand: buildStorageCheckRemoteCommand(),
    }),
    config.dryRun,
    options,
  );
}

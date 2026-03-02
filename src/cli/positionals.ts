import { parseDisplayToken } from "./helpers";
import type { FlagMap } from "./types";

export function applyPositionalDisplayFlags(
  command: string | undefined,
  subcommand: string | undefined,
  positionals: string[],
  flags: FlagMap,
): void {
  if (command === "vnc" && !flags.display && positionals.length >= 3) {
    flags.display = parseDisplayToken(positionals[2]);
  }

  if (
    command === "tunnel" &&
    subcommand === "close" &&
    !flags.display &&
    positionals.length >= 3
  ) {
    flags.display = parseDisplayToken(positionals[2]);
  }
}

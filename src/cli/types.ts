import type { ResolvedConfig } from "../config";

export type FlagMap = Record<string, string>;

export type CommandRuntimeOptions = {
  logFile?: string;
};

export type CommandContext = {
  config: ResolvedConfig;
  flags: FlagMap;
};

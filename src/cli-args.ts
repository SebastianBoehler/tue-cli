export type ParsedArgs = {
  command?: string;
  subcommand?: string;
  positionals: string[];
  flags: Record<string, string>;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];

      if (!next || next.startsWith("--")) {
        flags[key] = "true";
        continue;
      }

      flags[key] = next;
      i += 1;
      continue;
    }

    positionals.push(token);
  }

  return {
    command: positionals[0],
    subcommand: positionals[1],
    positionals,
    flags,
  };
}

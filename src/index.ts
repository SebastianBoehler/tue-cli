#!/usr/bin/env bun

import { runCli } from "./cli/dispatch";

runCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(`tue-cli error: ${message}`);
  process.exit(1);
});

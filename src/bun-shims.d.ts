declare const Bun: {
  argv: string[];
  env: Record<string, string | undefined>;
  spawnSync(args: string[], options?: Record<string, unknown>): { exitCode: number };
  exit(code?: number): never;
};

declare module "bun:test" {
  export const describe: (name: string, fn: () => void) => void;
  export const test: (name: string, fn: () => void) => void;
  export const expect: (value: unknown) => {
    toBe: (expected: unknown) => void;
    toThrow: (expected?: string | RegExp) => void;
  };
}

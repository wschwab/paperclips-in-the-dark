// Type declarations for the BROWSER-02 browser journey loader
// (scripts/browser-journeys.mjs), consumed by the tooling tests in src/.
// Keep in sync with the exports and shapes in browser-journeys.mjs.

export interface Checkpoint {
  id: string;
  description?: string;
}

export interface ConsoleNoiseEntry {
  urlPattern: string;
  text: string;
}

export interface Journey {
  id: string;
  checkpoints: Checkpoint[];
  run: (page: unknown, ctx: unknown) => Promise<void>;
  file: string;
  expectedConsoleNoise: ConsoleNoiseEntry[];
}

export const suitesBrowserDir: string;

export function loadJourneys(): Promise<Journey[]>;

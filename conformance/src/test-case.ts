import { it, type TestFunction } from "vitest";

export function testCase(id: string, title: string, fn: TestFunction): void {
  it(`[${id}] ${title}`, fn);
}

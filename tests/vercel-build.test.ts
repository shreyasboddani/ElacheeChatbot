import { describe, expect, it, vi } from "vitest";

import {
  buildVercelCommandPlan,
  runVercelBuild,
} from "../scripts/vercel-build";

describe("Vercel build isolation", () => {
  it("validates the corpus without mutating Gemini during production builds", () => {
    expect(
      buildVercelCommandPlan({
        VERCEL_ENV: "production",
        GEMINI_API_KEY: "configured",
        GEMINI_FILE_SEARCH_STORE: "fileSearchStores/existing",
      }),
    ).toEqual([
      ["run", "knowledge:verify"],
      ["run", "build"],
    ]);
  });

  it("uses the same credential-free plan for preview and development builds", () => {
    expect(buildVercelCommandPlan({ VERCEL_ENV: "preview" })).toEqual([
      ["run", "knowledge:verify"],
      ["run", "build"],
    ]);
    expect(buildVercelCommandPlan({ VERCEL_ENV: "development" })).toEqual([
      ["run", "knowledge:verify"],
      ["run", "build"],
    ]);
  });

  it("does not require Gemini configuration to deploy", () => {
    expect(buildVercelCommandPlan({})).toEqual([
      ["run", "knowledge:verify"],
      ["run", "build"],
    ]);
  });

  it("runs every production command in order", async () => {
    const runner = vi.fn(async (args: string[]) => {
      void args;
    });
    await runVercelBuild(
      {
        VERCEL_ENV: "production",
        GEMINI_API_KEY: "configured",
        GEMINI_FILE_SEARCH_STORE: "fileSearchStores/existing",
      },
      runner,
    );
    expect(runner.mock.calls.map(([args]) => args)).toEqual([
      ["run", "knowledge:verify"],
      ["run", "build"],
    ]);
  });
});

import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

import { createGeminiClient } from "../src/lib/gemini/client";

async function main() {
  loadEnvConfig(process.cwd());
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const ai = createGeminiClient(apiKey);
  const stores = await ai.fileSearchStores.list({ config: { pageSize: 20 } });
  let count = 0;
  for await (const store of stores) {
    count += 1;
    process.stdout.write(
      `${store.name ?? "unnamed"}\t${store.displayName ?? "(no display name)"}\n`,
    );
  }
  if (count === 0) process.stdout.write("No File Search stores found.\n");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Could not list File Search stores: ${error instanceof Error ? error.message : "Unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}


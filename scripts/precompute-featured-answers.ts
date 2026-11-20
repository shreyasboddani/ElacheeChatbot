import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadEnvConfig } from "@next/env";

import {
  corpusFingerprint,
  precomputableQuestions,
  type FeaturedAnswerStore,
  type StoredFeaturedAnswer,
} from "@/lib/chat/featured-answers";
import { getRuntimeConfig } from "@/lib/config";
import { askGroundedQuestion } from "@/lib/gemini/chat";
import { createGroundedInteractionClient } from "@/lib/gemini/client";
import { getKnowledgeManifest } from "@/lib/knowledge/manifest";

const OUTPUT_PATH = path.join("src", "generated", "featured-answers.json");
const ATTEMPTS_PER_QUESTION = 3;

export async function precomputeFeaturedAnswers(options: {
  root?: string;
  force?: boolean;
} = {}): Promise<{ written: boolean; answered: number; total: number }> {
  const root = options.root ?? process.cwd();
  loadEnvConfig(root);
  const outputPath = path.join(root, OUTPUT_PATH);
  const fingerprint = corpusFingerprint();
  const questions = precomputableQuestions();

  const existing = JSON.parse(
    await readFile(outputPath, "utf8"),
  ) as FeaturedAnswerStore;
  const alreadyCurrent =
    existing.corpusFingerprint === fingerprint &&
    questions.every(({ language, question }) =>
      existing.answers.some(
        (entry) => entry.language === language && entry.question === question,
      ),
    );
  if (alreadyCurrent && !options.force) {
    process.stdout.write(
      "Featured answers already match the current knowledge; no Gemini calls made.\n",
    );
    return { written: false, answered: existing.answers.length, total: questions.length };
  }

  const config = getRuntimeConfig();
  if (!config.apiKey || !config.fileSearchStore) {
    throw new Error(
      "GEMINI_API_KEY and GEMINI_FILE_SEARCH_STORE are required to precompute featured answers.",
    );
  }
  const client = createGroundedInteractionClient(config.apiKey);
  const manifest = getKnowledgeManifest();

  const answers = (
    await Promise.all(
      questions.map(async ({ language, question }) => {
        for (let attempt = 1; attempt <= ATTEMPTS_PER_QUESTION; attempt += 1) {
          try {
            const response = await askGroundedQuestion(
              client,
              { message: question, history: [], language },
              {
                model: config.model,
                fileSearchStore: config.fileSearchStore!,
                manifest,
              },
            );
            if (response.status === "answered") {
              return { language, question, response } satisfies StoredFeaturedAnswer;
            }
          } catch {
            // Retry below; a persistent failure leaves this question live.
          }
        }
        process.stderr.write(
          `Could not precompute a verified answer for (${language}) "${question.slice(0, 60)}"; it will be answered live.\n`,
        );
        return undefined;
      }),
    )
  ).filter((entry): entry is StoredFeaturedAnswer => entry !== undefined);

  const store: FeaturedAnswerStore = {
    corpusFingerprint: fingerprint,
    generatedAt: new Date().toISOString(),
    answers,
  };
  await writeFile(outputPath, `${JSON.stringify(store, null, 2)}\n`);
  process.stdout.write(
    `Precomputed ${answers.length}/${questions.length} featured answers.\n`,
  );
  return { written: true, answered: answers.length, total: questions.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  precomputeFeaturedAnswers({ force: process.argv.includes("--force") }).catch(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      process.stderr.write(`Featured answer precompute failed: ${message}\n`);
      process.exitCode = 1;
    },
  );
}

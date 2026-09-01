import { existsSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";

import {
  runFileSearchSync,
  safeFileSearchErrorDetails,
} from "../../../../../scripts/sync-file-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INDEXING_TIMEOUT_MS = 240_000;
const MAX_PARALLEL_UPLOADS = 20;

export function isAuthorizedCronRequest(
  authorization: string | null,
  cronSecret: string | undefined,
): boolean {
  return Boolean(
    cronSecret && authorization === `Bearer ${cronSecret}`,
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const root = process.cwd();
    const sourcesPath = path.join(root, "knowledge/generated/sources.json");
    const preparedDirectory = path.join(root, "knowledge/generated/prepared");
    if (!existsSync(sourcesPath) || !existsSync(preparedDirectory)) {
      console.error("Knowledge corpus is unavailable to the Cron function", {
        root,
        sourcesAvailable: existsSync(sourcesPath),
        preparedDirectoryAvailable: existsSync(preparedDirectory),
      });
      return Response.json(
        { status: "retry" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const result = await runFileSearchSync({
      args: ["--reconcile", "--apply"],
      root,
      environment: process.env,
      maxUploads: MAX_PARALLEL_UPLOADS,
      uploadAttempts: 1,
      uploadConcurrency: MAX_PARALLEL_UPLOADS,
      operationTimeoutMs: INDEXING_TIMEOUT_MS,
      waitForIndexing: false,
      writeReport: false,
      verifySnapshot: false,
    });
    return Response.json(
      { status: result.pendingUploads > 0 ? "indexing" : "synchronized", ...result },
      {
        status: result.pendingUploads > 0 ? 202 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error: unknown) {
    console.error("Background File Search reconciliation failed", safeFileSearchErrorDetails(error));
    return Response.json(
      { status: "retry" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

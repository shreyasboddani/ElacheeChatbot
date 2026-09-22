import {
  APPROVED_ELACHEE_HOSTS,
  canonicalizeElacheeUrl,
  isApprovedWebsiteUrl,
} from "@/lib/security/source-url";

export const ELACHEE = {
  canonicalOrigin: "https://elachee.org",
  allowedHosts: APPROVED_ELACHEE_HOSTS,
  contact: {
    phone: "770-535-1976",
    url: "https://elachee.org/resources/contact-us/",
  },
} as const;

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export interface RuntimeConfig {
  apiKey?: string;
  fileSearchStore?: string;
  model: string;
  siteUrl: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
    fileSearchStore:
      process.env.GEMINI_FILE_SEARCH_STORE?.trim() || undefined,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    siteUrl:
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      "https://elachee-chatbot.vercel.app",
  };
}

export { canonicalizeElacheeUrl, isApprovedWebsiteUrl };

export type SourceType =
  | "official_website"
  | "official_reference"
  | "official_document"
  | "manager_faq";

export type FaqStatus =
  | "approved"
  | "pending"
  | "conflicting"
  | "needs_review";

export type KnowledgeConflictTopic = "visitor_center_hours";

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  status: FaqStatus;
  contacts: string[];
  relatedUrls: string[];
  notes: string[];
  sourceType: "manager_faq";
}

export interface WebsiteSource {
  id: string;
  title: string;
  canonicalUrl: string;
  fetchedAt: string;
  text: string;
  headings: string[];
  links: Array<{ label: string; url: string }>;
  sourceType: "official_website";
}

export interface OfficialDocumentSource {
  id: string;
  title: string;
  url: string;
  sourcePath: string;
  contentHash: string;
  sourceType: "official_document";
}

export interface PublicReferenceSource {
  id: string;
  title: string;
  url: string;
  sourcePath: string;
  contentHash: string;
  verifiedOn: string;
  verifiedAgainst: string[];
}

export interface SourceManifestEntry {
  id: string;
  fileName: string;
  documentPath: string;
  title: string;
  url?: string;
  fetchedAt?: string;
  sourceType: SourceType;
  priority: number;
  contentHash?: string;
  conflictingTopics?: KnowledgeConflictTopic[];
}

export interface ChatSource {
  id: string;
  title: string;
  url?: string;
  sourceType: SourceType;
}

export type ChatStatus =
  | "answered"
  | "not_found"
  | "conflicting_information"
  | "sensitive_information"
  | "service_unavailable"
  | "invalid_request";

export interface ChatResponse {
  status: ChatStatus;
  answer: string;
  sources: ChatSource[];
  contactRecommended: boolean;
}


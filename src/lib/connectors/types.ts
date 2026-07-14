export interface RawComplaint {
  source:
    | "reddit"
    | "hn"
    | "appstore"
    | "playstore"
    | "github"
    | "g2"
    | "trustpilot"
    | "web"
    | "demo";
  /** stable id within the source, used for dedupe hashing */
  externalId: string;
  url: string;
  author: string;
  title: string;
  body: string;
  postedAt: number | null;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ConnectorResult {
  items: RawComplaint[];
  /** non-fatal problems, surfaced in job logs */
  warnings: string[];
}

export interface NormocontrolReport {
  engine: string;
  checked_at: string;
  state: "ready" | "limited" | "unavailable";
  notice: string;
  findings: {
    category: string;
    severity: "low" | "medium" | "review";
    message: string;
    location: string;
    quote: string;
    suggestion: string;
  }[];
}

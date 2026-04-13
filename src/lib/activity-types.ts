export type ActivityEvent = {
  id: string;
  type: string;
  summary: string;
  details?: string;
  level: "info" | "warning";
  createdAt: string;
};
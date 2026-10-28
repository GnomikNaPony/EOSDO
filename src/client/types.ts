export interface User {
  id: string;
  name: string;
  role: string;
  department: string;
}
export interface RouteStep {
  user_id: string;
  kind: string;
  days: number;
}
export interface Profile {
  title: string;
  type: string;
  owner_id: string;
  due: string;
  priority: string;
  summary: string;
  case_id: string | null;
  recipients: string[];
  route: RouteStep[];
  profile_revision: number;
}
export interface Version {
  id: string;
  number: number;
  filename: string;
  created: string;
  text: string | null;
  sha256: string;
  size: number;
  parent_id: string | null;
  message: string;
  extraction_error?: string;
}
export interface Comment {
  id: string;
  version_id: string;
  author_id: string;
  text: string;
  anchor: string;
  severity: string;
  status: string;
  created: string;
  replies: { id: string; author_id: string; text: string; created: string }[];
}
export interface Check {
  id: string;
  version_id: string;
  status: string;
  error?: string;
  model: string;
  result: {
    items: {
      index: number;
      rule: string;
      status: string;
      reason: string;
      quote: string;
    }[];
    notice?: string;
  } | null;
}
export interface Document extends Profile {
  id: string;
  number: string;
  status: string;
  created: string;
  department: string;
  favorite: boolean;
  open_comments: number;
  next_action: string;
  latest: Version | null;
  versions: Version[];
  comments: Comment[];
  checks: Check[];
  history: { id: number; author_id: string; action: string; created: string }[];
  links: { id: string; title: string; number: string }[];
}
export interface Template {
  id: string;
  name: string;
  revision: number;
  config: Omit<Profile, "due" | "profile_revision"> & { due_days: number };
}
export interface Bootstrap {
  user: User | null;
  setup_required: boolean;
  auth_required: boolean;
  workspace: { organization: string } | null;
  document_types: string[];
  users: User[];
  documents: Document[];
  cases: { id: string; code: string; title: string }[];
  rules: { items: string[]; revision: number; demo: boolean };
  notifications: {
    id: string;
    title: string;
    body: string;
    read: boolean;
    created: string;
    document_id: string | null;
  }[];
  templates: Template[];
}

export function payload(form: HTMLFormElement) {
  const f = new FormData(form);
  return {
    ...Object.fromEntries(f.entries()),
    case_id: f.get("case_id") || "",
    recipients: f.getAll("recipients"),
    route: JSON.parse(String(f.get("route_config") || "[]")),
  };
}

import type { RecordData, Value } from "./schema";

export interface Directory {
  users: { id: string }[];
  cases: { id?: Value }[];
}
export const documentTypes = [
  "Служебная записка",
  "Отчёт",
  "План мероприятий",
  "Протокол",
  "Письмо",
  "Поручение",
];
export const defaultRules = { revision: 1, demo: false, items: [] };
export class Problem extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function required(
  value: Value | undefined,
  name: string,
  limit = 5000,
): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > limit)
    throw new Problem(
      400,
      `${name}: требуется текст от 1 до ${limit} символов`,
    );
  return value.trim();
}
export function date(value: Value | undefined): string {
  const text = required(value, "Срок", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(Date.parse(text)) ||
    new Date(text).toISOString().slice(0, 10) !== text
  )
    throw new Problem(400, "Укажите существующую дату ГГГГ-ММ-ДД");
  return text;
}
export function priority(value: Value | undefined): string {
  if (typeof value !== "string" || !["normal", "high", "low"].includes(value))
    throw new Problem(400, "Некорректный приоритет");
  return value;
}
export function days(value: Value | undefined): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 365
  )
    throw new Problem(400, "Срок должен быть целым числом от 1 до 365");
  return value;
}
export function profile(
  value: RecordData,
  directory: Directory = { users: [], cases: [] },
): RecordData {
  const { users, cases } = directory;
  const caseId = value.case_id ?? "";
  if (
    typeof caseId !== "string" ||
    (caseId && !cases.some((c) => c.id === caseId))
  )
    throw new Problem(400, "Выберите дело из справочника");
  const recipients = value.recipients ?? [];
  if (
    !Array.isArray(recipients) ||
    recipients.length > users.length ||
    new Set(recipients).size !== recipients.length ||
    recipients.some((id) => !users.some((u) => u.id === id))
  )
    throw new Problem(400, "Недопустимые адресаты");
  const route = value.route ?? [];
  if (!Array.isArray(route) || route.length > 20)
    throw new Problem(400, "Не больше 20 этапов маршрута");
  let signing = false;
  const steps = route.map((step) => {
    if (
      !step ||
      typeof step !== "object" ||
      Array.isArray(step) ||
      !users.some((u) => u.id === step.user_id) ||
      !["review", "sign"].includes(String(step.kind))
    )
      throw new Problem(400, "Недопустимый этап");
    if (signing && step.kind === "review")
      throw new Problem(400, "Согласование должно предшествовать подписанию");
    signing ||= step.kind === "sign";
    return { user_id: step.user_id!, kind: step.kind!, days: days(step.days) };
  });
  return { case_id: caseId, recipients, route: steps };
}
export function template(
  value: Value | undefined,
  directory: Directory = { users: [], cases: [] },
): RecordData {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Problem(400, "Настройки должны быть объектом");
  if (!documentTypes.includes(String(value.type)))
    throw new Problem(400, "Недопустимый вид документа");
  return {
    ...profile(value, directory),
    type: String(value.type),
    priority: priority(value.priority ?? "normal"),
    due_days: days(value.due_days),
    title: optionalText(value.title, 300),
    summary: optionalText(value.summary, 5000),
  };
}
export function optionalText(value: Value | undefined, limit: number): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > limit)
    throw new Problem(400, "Недопустимый текст");
  return value.trim();
}
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

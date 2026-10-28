export const labels: Record<string, string> = {
  new: "Проект",
  ai: "ИИ-проверка",
  review: "На рассмотрении",
  revision: "На доработке",
  approved: "Согласован",
  done: "Исполнено",
};
export const nav = [
  [
    "documents",
    "Документы",
    [
      ["all", "Все документы"],
      ["mine", "Созданные мной"],
      ["favorites", "Избранные"],
      ["done", "Обработанные"],
    ],
  ],
  [
    "tasks",
    "Задачи / уведомления",
    [
      ["active", "Мои задачи"],
      ["review", "Рассмотрение"],
      ["revision", "Доработка / исправление"],
      ["notifications", "Уведомления"],
    ],
  ],
  [
    "assignments",
    "Поручения",
    [
      ["active", "На исполнении у меня"],
      ["kanban", "Канбан куратора"],
    ],
  ],
  [
    "journals",
    "Журналы",
    [
      ["all", "Журнал документов"],
      ["templates", "Мои шаблоны"],
      ["rules", "Правила ИИ-проверки"],
    ],
  ],
] as const;
export const date = (s?: string) =>
  s
    ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString(
        "ru-RU",
      )
    : "—";

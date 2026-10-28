# oxlint: результат

Статус: завершено для подключения линтера. Источник и критерии: [task.md](task.md). Проверено рабочее дерево поверх 2cb8d23b79d3c396a7e9564e49072a1e01aa8ae8, включая незакоммиченный перенос. Предыдущая миграция приложения сохраняет остальные ограничения.

AC-01: oxlint 1.90.0 закреплён в package.json/bun.lock. `bun run lint` запускает `oxlint --deny-warnings src scripts tests vite.config.ts`. Стандартные правила не отключались. Исправлены 3 неиспользуемых импорта и неиспользуемая переменная при исключении object_key из ответа API; служебное поле по-прежнему исключается.

AC-02: scripts/lint.ts удалён. CI уже использовал bun run lint и автоматически применяет новую проверку; workflow не ослаблялся. README, verification, project и ADR обновлены по явному решению владельца. Старый completion дополнен ссылкой на изменение требования, исторические результаты не переписаны.

Проверки на финальном исходном коде (Bun 1.4.4, macOS arm64):

- bun run lint: exit 0, без ошибок и предупреждений.
- Отдельный временный TypeScript файл с unused variable: oxlint --deny-warnings вернул exit 1; fixture удалён.
- bun run check: exit 0, 14 файлов.
- bun run build: exit 0.
- bun run format:check: exit 0, 18 файлов.
- bun run test:integration: exit 0, 4 pass / 34 assertions с реальными PostgreSQL/Redis/MinIO.
- bun install --frozen-lockfile и git diff --check: exit 0.

Ревью: изменения относятся к разрешённой замене линтера и удалению unused code; runtime поведение и права не расширялись. Браузерный прогон не повторялся: UI и клиентский bundle не менялись. GitHub CI не запускался в этой задаче; локальные результаты не выдаются за CI run. Нативный lint больше не блокер, так как требование изменено владельцем.

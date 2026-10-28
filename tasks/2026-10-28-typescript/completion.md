Обновление: блокер native lint снят решением владельца использовать oxlint. Новые результаты — [oxlint/completion.md](../2026-10-28-oxlint/completion.md). Ниже сохранён исторический отчёт предыдущего запуска; прочие ограничения переноса остаются.

# Результат переноса

Статус: **реализовано, проверка не завершена**. Нативный lint Bun 1.4.4 отсутствует; полная функциональная эквивалентность предыдущей версии не подтверждена.

Основание: [task.md](task.md). База Git `2cb8d23b79d3c396a7e9564e49072a1e01aa8ae8` + незакоммиченные изменения. Проверенный исходный снимок: [source-sha256.txt](source-sha256.txt); дата 2026-10-28. Исходное дерево было чистым.

| AC | Реализация / свидетельство | Результат |
| --- | --- | --- |
| AC-01 | src/, scripts/, tests/ — TS/TSX; Python/JS удалены из текущей реализации, сохранены в Git | подтверждён |
| AC-02 | Bun 1.4.4, bun.lock, packageManager/engines/.bun-version; fmt/check работают, native lint недоступен | частично |
| AC-03 | Solid + Tailwind, структура/стили EOSDO1.0; build и Chromium smoke | перенос подтверждён, полная эквивалентность не заявлена |
| AC-04 | Fastify/Drizzle + real PostgreSQL/Redis/MinIO; интеграция 4 tests / 34 assertions | подтверждён для проверенных сценариев |
| AC-05 | Native SQL/Redis/S3/test/fmt/check; Vite для Solid compiler; Playwright только dev-проверки | подтверждён |
| AC-06 | AGENTS/.agent/docs/checks/evals, адаптированный контекст и task/evidence; независимое ревью конфигурации | документальный протокол подключён; внешние барьеры не подтверждены |

## Проверки финального исходного состояния

| Команда | Результат |
| --- | --- |
| `bun install --frozen-lockfile` | exit 0, lockfile воспроизводится |
| `bun run check` | exit 0, 15 файлов без ошибок |
| `bun run build` | exit 0, Solid/Tailwind bundle |
| `bun run format:check` | exit 0, 19 файлов |
| `bun run test:integration` | exit 0, 4 pass / 0 fail / 34 assertions |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<installed Chromium> bun run test:ui` | exit 0, реестр/создание/upload/reload/direct link, desktop 1440 и mobile 390, pageerror отсутствуют |
| `docker build -t eosdo-minio:2025-10-15 infra/minio` | exit 0; официальный release 2025-10-15, исходный commit 9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a |
| `bun run services:up` | exit 0, PostgreSQL/Redis/MinIO healthy, bucket init успешен |
| `docker compose config --quiet` и `git diff --check` | exit 0 |
| `bun run lint` | exit 1: встроенной команды нет в 1.4.4+38afee6c8 |

Интеграция проверяет оригинальные S3 bytes/hash, конфликт редактирования и загрузки, блокировку согласования замечанием, доступ другой роли, JSONB object storage, разрешённое обновление извлечённого текста и запрет изменения/удаления оригиналов, удаление шаблона, Origins, read-only импорт SQLite (реквизиты, маршрут, шаблоны, настройки, избранное, оригиналы). Импорт использует временную отдельную PostgreSQL БД; исходный SQLite fixture не изменён. Старые пользовательские data/ не читались и не менялись.

Chromium executable: локальный Playwright cache chromium-1248, Google Chrome for Testing, macOS arm64. Скриншоты — игнорируемые test-results/solid-desktop.png и solid-mobile.png. Это ограниченный smoke, не полное UI/AI тестирование.

В ходе браузерной проверки выявлена двойная JSONB-сериализация Bun SQL/Drizzle; исправлена параметризацией JSON и миграцией. Регрессия проверяет тип jsonb и изменение только text/extraction_error при неизменном оригинале. Миграция теперь транзакционна и синхронизирована advisory lock. Также исправлен trigger удаления обычных сущностей. После исправлений повторены типы, сборка, интеграция и UI smoke.

## Ревью и границы

Субагенты: отдельный аудит исходных UI/Swiss Clock/Bun; перенос backend; перенос frontend. Независимый от автора конфигурации субагент проверил AGENTS/docs/Compose/Railway: замечания об upstream ADR, неполном CI, CMD MinIO и устаревшем railway.toml исправлены. Саморевью прикладного кода не называется внешним аудитом.

Docker содержит только инфраструктуру; frontend/API запускаются снаружи. Railway: [параметры](../../docs/railway.md), публикация не выполнялась. Config as Code deprecated — railway.toml удалён. CI включает integration/UI, но ещё не исполнялся в GitHub; branch protection не проверялась.

Ограничения: PDF/DOCX/XLSX сохраняются и скачиваются, но их извлечение текста пока отсутствует; PDF viewer не перенесён; канбан меняет статус через карточку, без drag/drop. Настоящая Ollama-проверка на финальном состоянии не выполнялась. Авторизация остаётся демонстрационной. Полная совместимость всех прежних функций (включая deadline scheduler и персональные настройки UI) не доказана. Импорт реальной SQLite нужно проверить на копии перед применением.

Секреты в .env исключены из Git и отчёта. Полные логи с текстом документов не сохраняются в evidence. Исходники не коммитились и не публиковались.

Следующее необходимое действие для полной приемки: разрешить отсутствие native lint в закреплённом Bun (изменение требования/исправленный бинарник), перенести и проверить оставшиеся прежние сценарии, выполнить CI и проверку целевой Railway среды.

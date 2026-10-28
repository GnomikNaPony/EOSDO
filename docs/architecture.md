# Архитектура

Solid UI разделён по ответственности: main монтирует App; AppProvider хранит reactive state/API operations/navigation; WorkspaceShell отвечает за layout; components — общие элементы; features — реестр, профиль, настройки и карточка; features/document — отдельные вкладки. Компоненты находятся на уровне модулей и получают данные через типизированные props/context. HTTP клиент и типы отделены. Tailwind @theme/@apply и utilities задают общие токены/геометрию исходного UI.

Fastify index только запускает createApp. app собирает сервисы/hooks/errors/routes; routes разбиты по предметным API. domain содержит валидацию, document-service — запросы/операции документов, workspace — аккаунты/профили/сессии; store/schema — Drizzle через Bun SQL. Оригиналы — MinIO через Bun S3Client; сессии — Bun RedisClient; пароли — Bun.password. Worker Ollama отдельный от HTTP-модулей.

Документ: HTTP → session/validation → Drizzle/PostgreSQL; файл → проверка формата/размера → S3 → неизменяемая версия PostgreSQL → UI. Клиент не выбирает автора загрузки. S3/PG не имеют общей транзакции, поэтому ошибки компенсируются. Правила ИИ пусты до реальной настройки, ошибки не превращаются в положительный отчёт.

Папку templates backend не читает. Это только MD/TXT образцы; пользователь вручную загружает документ из своего профиля. Личные шаблоны реквизитов — отдельная доменная сущность PostgreSQL. Автоматических seed или mock adapters в runtime нет.

Vite нужен для специализированной компиляции Solid JSX и Tailwind, результат dist отдаётся Fastify на том же origin. Compose содержит только PostgreSQL, Redis, MinIO и bucket init. Railway — Bun/Railpack вне локального Compose, [параметры](railway.md).

Дальнейшие изменения можно делать в отдельных feature/route modules. Корпоративный identity provider и извлечение бинарных документов — явные ещё не реализованные границы, не fake stubs. Legacy импорт требует сопоставления владельцев с реальными аккаунтами и резервной копии. Тесты используют временные БД и объекты, не рабочие данные.

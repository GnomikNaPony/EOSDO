# TypeScript/Bun и разделение окружений

Дата: 2026-10-28. Источник: требования владельца в диалоге.

Весь прикладной код переносится на TypeScript. Bun 1.4.4 — runtime, package manager, test runner, formatter и type checker. Нативный linter отсутствует в установленном бинарнике; последующим явным решением владельца выбран oxlint. Команда bun run lint использует закреплённую dev-зависимость oxlint и отклоняет предупреждения.

Solid и Tailwind компилирует Vite. Это дополнительная dev-зависимость для специализированного Solid JSX compiler. Fastify и Drizzle используют PostgreSQL через Bun SQL; RedisClient и S3Client встроены в Bun.

Docker обязателен только для PostgreSQL, Redis и MinIO. Фронтенд/API работают вне Docker, Railway использует Railpack. Локально Compose создаёт MinIO bucket. Railway deployment конфигурация готовится, но публикация не выполняется.

MinIO historical images недоступны в публичных регистрах; Dockerfile собирает закреплённый официальный release из исходников. Локальный кеш допускается через MINIO_IMAGE. Это инфраструктура, Go исходники MinIO не добавляются в прикладной проект.

Старая SQLite не изменяется; отдельный TypeScript importer читает её read-only и требует пустую PostgreSQL. Перенос реальных данных требует проверки на копии.

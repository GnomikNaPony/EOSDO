# Контекст ЕОСДО

Рабочее пространство документов: реестр, карточки, версии файлов, замечания, согласование, канбан, уведомления и личные шаблоны реквизитов. Пользователи регистрируют реальные локальные аккаунты с email/паролем. Приложение не поставляет фиктивных пользователей/организацию/документы/дела/правила. SSO и настоящая ЭП отсутствуют.

Требования владельца 28.10.2026: TypeScript; Bun 1.4.4 runtime/package manager/formatter/type checker; oxlint (последующее явное уточнение) для lint; Solid JS/Tailwind; Fastify/Drizzle/PostgreSQL/Redis/MinIO. Docker — только инфраструктура. UI источник: EOSDO1.0 commit 15a3b97d34b7d0ad64f89194710552441e1b9873.

Новая задача: компонентная структура для развития; templates содержит только примеры документов для ручной загрузки из своих профилей, не автоматический каталог. Решение владельца: локальные аккаунты email/пароль.

Исходный Python/SQLite доступен в Git 2cb8d23b79d3c396a7e9564e49072a1e01aa8ae8. Существующие data/ и прежняя локальная PostgreSQL eosdo сохранены. Локальное приложение переведено на пустую eosdo_workspace. Legacy импорт не переносит учётные записи автоматически.

Swiss Clock источник: https://github.com/mikenoired/swiss-clock commit 190c5871a63d883c420c526559f96cf951dfd807. AGENTS, .agent, checks, rationale/ADR адаптированы. Внешняя защита слияния не подтверждена.

Карта: [architecture.md](architecture.md), [domain.md](domain.md), [verification.md](verification.md). Текущие критерии: [задача](../tasks/2026-10-28-components/task.md).

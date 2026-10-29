# ЕОСОД: работающие сайты Railway

Размещение выполнено 29.10.2026 по поручению владельца. Цель выбрана владельцем: Mike Noired's Projects → steadfast-rejoicing → production. Новые сервисы не используют базы/Redis существующих приложений.

| Назначение | Адрес | Service ID | Проверенный deployment |
| --- | --- | --- | --- |
| Итоговая ЕОСОД | https://eosdo-current-production.up.railway.app | 3d6657d7-de58-4e9d-8ce1-b6ceb20b7193 | 8583ebc1-7ee5-442b-bf35-5619fd42377c |
| Исходный демонстрационный интерфейс | https://eosdo-original-production.up.railway.app | ef861749-c4ad-4450-83d9-8ef366327ca4 | 94dc56b1-36d9-4b30-b2de-670e1a6888a2 |

Project ID: `9fc3f5f1-1ea4-4d2d-816b-8225dd610695`. Environment ID: `519dee81-ff21-4096-b29c-fa578aeb06a1`.

## Сервисы данных

- `eosdo-postgres`: `0bf011aa-3eb5-48d8-a5f7-275292fc56b2`, собственный постоянный том.
- `eosdo-redis`: `27f4155f-898f-42e7-b653-84af3b3be069`, собственный постоянный том.
- Приватный bucket `eosdo-files`: `bc856569-7205-4cc2-ab30-307ba264bb4d`, регион `ams`.

DATABASE_URL/REDIS_URL используют ссылки на переменные своих сервисов и private networking. Публичный TCP proxy PostgreSQL использовался только для начального переноса и удалён после проверки. Открытый пароль владельца не переносился: существующие профиль, workspace и хеш пароля скопированы и сравнены с локальной базой. Браузерные сессии не переносились, на новом домене нужен обычный вход с прежним паролем.

## Реальная конфигурация

Итоговый сайт: Railpack, Bun 1.4.4, стандартная установка `bun install --frozen-lockfile`, отдельная build-команда `bun run build:release`; pre-deploy `bun run db:migrate`, timeout120s; start `bun run start`; health `/api/health`, timeout120s. NODE_ENV=production, HOST=0.0.0.0, PORT=8080, APP_ORIGIN равен публичному HTTPS origin, RAILPACK_NO_SPA=1. S3_REGION=auto и S3_URL_STYLE=virtual. Поле urlStyle=virtual-host из Railway credentials приведено к поддерживаемому приложением значению virtual.

Исходный интерфейс: Railpack Node22, обычная npm-установка из package-lock, build `npm run build`, RAILPACK_SPA_OUTPUT_DIR=dist. Статику отдаёт штатный Caddy Railpack, собственный dev-server в production не используется. Повторный npm ci в build-команде не нужен: он конфликтовал с кешем `/app/node_modules/.vite` (EBUSY).

## Состояние публикации и ограничения

Это явно запрошенный ручной релиз проверенных снимков. GitHub push, merge и изменение существующего автоматического workflow не выполнялись. Новые сервисы используют CLI upload и не подключены к прямому GitHub autodeploy. Автоматический путь для будущих релизов описан в [railway.md](railway.md); его внешнее включение в GitHub Environment не подтверждено этим размещением. Нельзя выдавать текущую публикацию за проверку внешней защиты слияния или всех отрицательных сценариев Railway.

Исходный сайт содержит только демонстрационный интерфейс и данные браузера. Итоговый сайт сохраняет реальные аккаунты/данные в своих сервисах. Ollama в Railway не развёрнута; без отдельно настроенного доступного OLLAMA_URL ИИ-проверка недоступна. Извлечение PDF/DOCX/XLSX и электронная подпись не добавлялись.

Проверенный снимок, команды, результаты и ограничения: [completion.md](../tasks/2026-10-29-railway-sites/completion.md). Для последующего обновления сначала повторить проверки, зафиксировать точный снимок и выбрать только один из новых Service ID. Для восстановления использовать приведённый успешный deployment и согласованную резервную копию PG/S3; удаление общих ресурсов проекта не является процедурой отката.

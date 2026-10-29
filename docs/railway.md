# Railway: размещение и проверяемый релиз

Приложение запускается Bun/Railpack. PostgreSQL, Redis и приватный S3 bucket — отдельные ресурсы проекта. Docker Compose предназначен для локальной инфраструктуры; на Railway не запускается. Локальный MinIO и нативный Railway Bucket используют один Bun S3Client.

[Config as Code устарел](https://docs.railway.com/config-as-code): `railway.toml`/`railway.json` для новых сервисов не используются. Параметры ниже задаются в настройках сервиса или действующей Railway IaC. Наличие этого документа не означает, что внешний сервис уже настроен.

## Параметры приложения

| Поле | Значение |
| --- | --- |
| Builder | Railpack |
| Build command | `bun install --frozen-lockfile && bun run build:release` |
| Pre-deploy command | `bun run db:migrate`, timeout 120 секунд |
| Start command | `bun run start` |
| Healthcheck | `/api/health`, timeout 120 секунд |
| Bun | `RAILPACK_BUN_VERSION=1.4.4` |
| Listen | `HOST=0.0.0.0`; PORT задаёт Railway |
| Origin | `APP_ORIGIN=https://ваш-домен` без завершающего слеша; `NODE_ENV=production` |

`build:release` выполняет types, format, lint, unit и сборку; неуспех любого шага останавливает build. Интеграция и браузерные проверки выполняются полным GitHub CI до публикации. Версия Bun закреплена также в packageManager, engines.bun и .bun-version; [Railpack поддерживает эти поля](https://railpack.com/languages/bun/).

DATABASE_URL и REDIS_URL должны использовать private networking. PostgreSQL и Redis требуют постоянных томов; приложению том не нужен. До первого публичного доступа создайте рабочее пространство и профиль владельца: первый зарегистрированный аккаунт становится куратором. Это локальная регистрация, корпоративные приглашения/SSO не подключены.

## Файлы в приватном Railway Bucket

Создайте отдельный ресурс Bucket и используйте его **Credentials**. [Railway Buckets](https://docs.railway.com/storage-buckets) приватны; оригиналы выдаёт API приложения после проверки сессии и доступа. Имя ресурса в интерфейсе отличается от реального имени S3 bucket.

| Переменная приложения | Значение из Credentials / variable reference |
| --- | --- |
| S3_ENDPOINT | ENDPOINT: базовый URL, например `https://t3.storageapi.dev` |
| S3_BUCKET | BUCKET: полное глобально уникальное S3 имя |
| S3_ACCESS_KEY_ID | ACCESS_KEY_ID |
| S3_SECRET_ACCESS_KEY | SECRET_ACCESS_KEY |
| S3_REGION | REGION: для нового Railway Bucket обычно `auto` |
| S3_URL_STYLE | `virtual` для нового bucket; для старого смотрите Credentials |

В [Bun S3](https://bun.sh/docs/runtime/s3#using-buns-s3client-with-s3-virtual-hosted-style-endpoints) явный virtual endpoint должен содержать bucket hostname. `src/server/s3-config.ts` добавляет bucket к базовому endpoint ровно один раз и включает `virtualHostedStyle`; регион передаётся без подмены. Endpoint должен быть HTTP(S) origin без пароля, query, fragment или пути. Для локального MinIO оставьте `S3_URL_STYLE=path`, `S3_REGION=us-east-1` и адрес из `.env.example`.

[CLI bucket credentials](https://docs.railway.com/cli/bucket) печатает секреты: вывод сохраняйте в закрытый файл или передавайте непосредственно настройке сервиса. Не добавляйте их в Git, логи, скриншоты и презентацию. Bucket создаётся средствами Railway; MinIO init в cloud не требуется. Резервируйте PostgreSQL и оригиналы согласованно.

## Единственный автоматический путь публикации

Workflow `.github/workflows/checks.yml` содержит `check` и зависимый `deploy`. Публикация разрешена только для `push` в `main` и результата `needs.check.result == 'success'`. Для failure, skipped и cancelled job `deploy` не выполняется; PR также не публикуется. `always()` есть только у cleanup проверки, не у допуска к релизу. В production deployment concurrency не отменяет уже начатый релиз.

В GitHub Environment **production** настройте:

- Secret `RAILWAY_TOKEN`: Project Token нужного Railway environment.
- Variables `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT_ID`: явные ID цели.

Если параметров нет, job завершается с сообщением **Deployment blocked**, а не с фиктивным успешным релизом. CLI закреплён на `@railway/cli@5.71.0`.

`bun run release` повторно требует успешный check, main push, точное совпадение HEAD с GITHUB_SHA и чистое рабочее дерево. Только затем вызывает `railway up` с явными проектом/сервисом/окружением и меткой `git:<SHA>`. Передача аргументов не использует shell; token не попадает в аргументы. В дочернем Railway процессе `CI=false`: [CI-режим CLI](https://docs.railway.com/cli/up) ограничивается build logs, поэтому скрипт остаётся подключённым к полному релизу и сохраняет его ненулевой код отказа.

**Отключите прямой GitHub autodeploy для App**, чтобы он не запускал версию параллельно с зависимым job. Не добавляйте другой workflow/автообновление образа, обходящие этот допуск. Ручной deploy администратора вне pipeline также обходит его; именно workflow является проверенным автоматическим путём.

Альтернативный [Wait for CI](https://docs.railway.com/deployments/github-autodeploys) сам по себе недостаточен для строгого требования: skipped/neutral workflow не блокируют, а cancelled может не блокировать при успехе другого workflow. Поэтому используем строгую зависимость job.

## Активация и проверка отказов

[Pre-deploy](https://docs.railway.com/deployments/pre-deploy-command) выполняется до запуска App: ненулевой код миграции или timeout останавливает релиз. `/api/health` проверяет PostgreSQL, Redis и чтение bucket. [Railway healthcheck](https://docs.railway.com/deployments/healthchecks) должен получить 2xx до активации новой версии; иначе deployment не становится активным. Прежний App сохраняется до успешной активации. Это проверка запуска, не непрерывный мониторинг. [Сервисы с томами](https://docs.railway.com/volumes/reference) имеют отдельное ограничение краткого простоя; поэтому тома подключаются к сервисам данных, не к App.

Автоматические `tests/release.test.ts` запускают настоящий subprocess с безопасным локальным executable вместо Railway: при failure/skipped/cancelled/neutral/пустом check он вообще не вызывается. Положительный сценарий проверяет точный SHA/цель, отрицательные — другой SHA, PR/ветку, незафиксированные изменения, отсутствие token и ненулевой код процесса. Это проверяет скрипт, но не заменяет настройку и отрицательный прогон на Railway.

Для внешней приёмки зафиксируйте активный deployment/SHA и health; выполните контролируемую неуспешную проверку; убедитесь, что новая версия не опубликована и активный SHA прежний. На отдельном проверочном окружении проверьте отказ healthcheck без отключения рабочих сервисов. Состояние внешнего деплоя и результаты фиксируются в task completion, а не предполагаются по YAML.

## Локальная проверка на этом Mac

Для изоляции поддерживаются COMPOSE_PROJECT_NAME, POSTGRES_DB и отдельные POSTGRES_PORT/REDIS_PORT/MINIO_PORT/MINIO_CONSOLE_PORT. `.env` и Docker volumes не входят в Git. Новая проверочная среда использует отдельный проект и не изменяет прежние базы/тома.

Если Ollama находится вне Railway, OLLAMA_URL должен быть доступен серверу; loopback Railway не обращается к Mac. Без модели оригинал сохраняется, проверка даёт явную ошибку. Размещение модели и её ресурсы настраиваются отдельно.

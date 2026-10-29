# 2026-10-29-railway-sites: результат

Размещение двух сайтов выполнено. [Критерии](task.md), [адреса и настройки](../../docs/railway-sites.md).

## Источники и область

Итоговая версия: базовый commit e202a3f5a141c2341bbbd0a712dd0a532aaf6c71 плюс существовавшее при входе незакоммиченное состояние search-release. Собственная правка коду этой задачи — только стандартное форматирование src/client/app-store.tsx. Снимок64 файлов: current-manifest.json, составной SHA-256 ecb9d2de2b62209c96c77b1c7dffa34f5cea9860260776c024a5481d1452110a (SHA256 от JSON manifest с сортировкой ключей). Нельзя обозначать этот снимок как чистый Git commit.

Исходный интерфейс: EOSDO1.0 commit15a3b97d34b7d0ad64f89194710552441e1b9873, пакет8 runtime/build файлов: original-manifest.json, составной SHA-256 bbd734b3b58dd62fc72cee4ca9321a5685157015b081533e822ea8d671a349a2. Оба manifest повторно совпали после публикации. В upload нет .env, data, SQLite, пользовательских templates или секретов.

## Приёмка

| AC | Доказательство | Результат |
| --- | --- | --- |
| AC-01 | Оба deployment SUCCESS, публичные HTML/JS загружены Chromium; ожидаемые заголовки, исходный список8 строк, нет pageerror | Подтверждено |
| AC-02 | Публичный /api/health возвращает ok:true, до активации прошли pre-deploy/health; отдельно выполнены запись/чтение точных bytes и удаление временного S3 объекта | Подтверждено для доступных границ |
| AC-03 | Единственный существующий профиль и workspace перенесены до публикации; каноническое сравнение всех полей/хеша/настроек совпало; cloud bootstrap setup_required=false/auth_required=true/user=null | Перенос и защита первичной роли подтверждены; положительный вход владельца на новом домене отдельно не выполнялся |
| AC-04 | Исходная сборка,10 data tests и10 browser tests passed; публичный интерфейс показывает8 демонстрационных записей | Подтверждено |
| AC-05 | Локальный build:release/integration/UI прошли до upload; в облаке повторились frozen install, types, format, lint, unit и build; workflow не изменялся этой задачей | Подтверждено для ручного релиза; внешняя автоматическая CI policy не активировалась |
| AC-06 | docs/railway-sites.md, эта запись и manifests; public TCP proxy PG после переноса отсутствует | Подтверждено |

Публичные адреса: https://eosdo-current-production.up.railway.app и https://eosdo-original-production.up.railway.app.
Deployment IDs: current 8583ebc1-7ee5-442b-bf35-5619fd42377c; original 94dc56b1-36d9-4b30-b2de-670e1a6888a2.

## Выполненные проверки

- `npm exec --yes --package=bun@1.4.4 -- bun run build:release`: после исправления format:check exit0; types56 файлов, format60, lint0 warnings/errors,22 unit pass/3 integration skip,125 assertions; build успешен.
- `npm exec --yes --package=bun@1.4.4 -- bun run test:integration`: exit0,25 pass/0 fail/0 skip,214 assertions. Использовались временные локальные базы и S3 объекты.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<installed Chromium> npm exec --yes --package=bun@1.4.4 -- bun run test:ui`: exit0, регистрация/вход/выход, пустой workspace, ручная загрузка и точное скачивание, автор сессии, навигация с задержанными чтением/ответом, desktop/mobile, нет pageerror. Рабочий профиль не изменялся.
- В исходном checkout `node --test tests/data.test.js`:10 pass; `npm ci --ignore-scripts`: exit0; `npm run build`: exit0; `npm run test:e2e`:10 pass.
- Облачный текущий build: frozen Bun install1.4.4, types/format/lint/unit/build успешны;22 pass/3 skip/0 fail. Эти3 интеграционных теста отдельно выполнены локально, а не объявлены выполненными в cloud build.
- Миграция в отдельную новую PG18, guarded empty destination; скопирован1 профиль и1 workspace setting, password plaintext не использован. Первичная проверка через JSON.stringify дала ложное различие из-за порядка полей; отдельное каноническое сравнение полей вернуло recordMatch=true/settingsMatch=true/differences=[] без перезаписи данных.
- Cloud S3: list, запись/чтение неизменных bytes, удаление ровно собственного временного объекта, exists=false. Реальные документы в текущей базе отсутствовали, поэтому оригиналы пользователя переносить не требовалось.
- Публичный HTTPS: current health ok:true; bootstrap подтверждает уже созданный workspace и обязательность входа; original HTML200. Отдельный Chromium1440×900 загрузил оба сайта, ожидаемые заголовки; original8 rows, current login; pageerrors0.
- После переноса `railway tcp-proxy list` для нового PG: proxies=[]; новые PG/Redis и два App имеют SUCCESS.

## Отказы и решения

Первый OAuth вход не завершился, устройство авторизации потеряло соединение; повторный вход завершён. Workspace Mike Noired не позволяет пользователю создавать проекты; владелец явно выбрал добавление новых сервисов в доступный steadfast-rejoicing. Существующие8 сервисов, их variables/source/volumes не изменялись.

Первый original deployment c9e7c519-5349-463c-b06a-32fd4c933d07 FAILED из-за повторного npm ci поверх кеш-монтажа Vite. Исправлена только облачная build-команда: установка в штатном install step, npm run build в build step. Следующий deployment SUCCESS. Итоговый App впервые опубликован уже после успешного переноса владельца.

## Ревью и границы

Выполнены отдельные собственные проходы требований и реализации: конкретная цель/новые сервисы, отсутствие изменения соседних приложений, состав upload, сохранность профиля, private networking/credentials, успешный статус и HTTP/UI. Самопроверка не является независимым ревью; отдельное человеческое ревью не проводилось. Независимые ожидаемые результаты берутся из поручения, исходного README/контрактов и официальных Railway/Railpack docs.

Не подтверждались: полный аудит безопасности, внешняя GitHub branch protection/production environment, негативные сценарии отказа health в Railway с переключением трафика, работа Ollama, положительный вход владельца на новом домене. Эти свойства не заявлены как выполненные. Локальные данные сохранены, приложения остаются запущены. Секретные временные credential-файлы удаляются после проверки; в репозитории нет секретов или персональных данных этой миграции.

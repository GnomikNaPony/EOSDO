# Публикация текущей ЕОСОД: результаты

Критерии: [task.md](task.md). База приложения: `85085c82a0df8ee6fb71f085724f82c5be97c4f3`. Первый коммит `47e14c05fddb9ec647d8e766844091326448029d` добавил исходную пользовательскую презентацию и записи этого релиза без изменения исполняемого кода. Во время первого deploy появились параллельные правки названия; итоговый релиз включает их. Локальный Bun: `/tmp/eosdo-tools/bun-darwin-aarch64/bun`, версия 1.4.4; frozen install прошёл без изменения lock-файла.

## Проверки до публикации

| Команда | Результат |
| --- | --- |
| `PATH=/tmp/eosdo-tools/bun-darwin-aarch64:$PATH bun install --frozen-lockfile` | exit 0 |
| `PATH=/tmp/eosdo-tools/bun-darwin-aarch64:$PATH bun run build:release` | exit 0; types, format, lint, 36 unit pass / 5 integration skip, build |
| `PATH=/tmp/eosdo-tools/bun-darwin-aarch64:$PATH bun run test:integration` | exit 0; 41 pass, 0 fail, 0 skip |
| `PATH=/tmp/eosdo-tools/bun-darwin-aarch64:$PATH PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='<installed Chromium 1248 executable>' bun run test:ui` | exit 0; реальные аккаунты/upload/download, Knowledge pending-index, приватные демо, desktop/mobile 360/390px, QR; без page errors |
| `git diff --check` | exit 0 |

Тестовые БД/объекты очищены штатными finally тестов. Полные HTTP-логи хранятся вне Git; секреты в результат не включены. PPTX проверен как исправный ZIP, 7 слайдов, без вложенных файлов; байты презентации не изменялись. Два прохода самопроверки: состав коммита соответствует поручению; production ID/build/pre-deploy/health сверены с действующим Railway deployment. Это не независимое ревью. Новые функции, зависимости и новые миграции отсутствуют.

После параллельной правки названия все 27 изменённых файлов сравнены с HEAD: изменения были ровно заменой «ЕОСДО» → «ЕОСОД», иных добавлений не обнаружено. Изменённые Python-скрипты проверены через ast.parse без их запуска: исходные вложения другого компьютера для пересборки презентации отсутствуют. Повторно выполнены все три команды build:release, test:integration, test:ui — exit 0, 41 integration pass, UI без page errors. Bundle после переименования: `index-ChdY8AJ5.js`; CSS не менялся. После этих проверок изменялись только записи текущего релиза.

## Цель и восстановление

Подтверждён eosdo-current production, project `9fc3f5f1-1ea4-4d2d-816b-8225dd610695`, environment `519dee81-ff21-4096-b29c-fa578aeb06a1`, service `3d6657d7-de58-4e9d-8ce1-b6ceb20b7193`. До релиза активен SUCCESS deployment `8583ebc1-7ee5-442b-bf35-5619fd42377c`. Railpack Bun1.4.4/build:release, pre-deploy db:migrate и /api/health проверены по его manifest.

GitHub production variables/secrets для автоматического deploy отсутствуют. Используется прямо запрошенный ручной CLI-релиз; успешный автоматический deploy не заявляется, CI environment не подменяется. Существующий workflow не изменяется.

## Ограничения

На Railway все обязательные PG/Redis/S3/origin переменные присутствуют. OLLAMA_URL не настроен; приложение использует локальный loopback внутри Railway, который не обращается к модели на Mac. Обновление сайта само по себе не включает облачное извлечение метаданных/смысловой поиск. Развёртывание модельной инфраструктуры и настройка сетевого доступа к ней в этот релиз не входят. Это ограничение должно быть явно сообщено владельцу.

## Публикация

Статус: проверки пройдены, публикация выполняется. Commit/push, deployment ID и HTTP результаты будут внесены после завершения операций; успешная активация заранее не утверждается.

# Демо с версиями: результат

Статус: завершено.

## Поведение и исходники

[Критерии](task.md). Добавлены 7 оригиналов в каждое новое приватное демопространство: записка с 3 версиями, отчёт и план с 2 версиями. Показаны изменения срока/критериев пилота, состава участников, трудозатрат, очередности работ и регистрации. Есть открытое, заявленное исправленным и подтвержденное куратором замечания, цитаты с номерами строк, ответы и полная история переходов.

Исторический куратор — отдельный вымышленный профиль без password_hash и сессии. Роль посетителя не меняется. Артефакты изолированы demoScope; настоящие аккаунты не получают seed. Старые демо не изменяются; полный reload главной создает новый набор после запуска обновленного сервера. Публикация не выполнялась.

База main 9f78e12276a2c0d744a070189d7b84bac901295c, исходное дерево чистое, собственные изменения незакоммичены. Снимок затронутых исходников/тестов/docs: [source-manifest.sha256](source-manifest.sha256), SHA-256 манифеста `76ab61f0047a29dcf9d6efb30d10a48c73fff776f951e88746a602ea818f89f4`.

## Приемка

| AC | Доказательство | Результат |
|---|---|---|
| AC-01 | integration 3/2/2, номера/parent_id, все 7 downloads совпадают по bytes/text/size/SHA-256 и автору | подтвержден |
| AC-02 | API независимые ожидаемые строки deadline/criteria/effort/participants; UI открывает готовые v1→v3 без загрузки; desktop/mobile screenshots просмотрены | подтвержден |
| AC-03 | проверены anchor_line, авторы, resolved_version, последовательность и время событий; UI подтверждено closed в v2 и история; open на плане | подтвержден |
| AC-04 | два demo с 2 разными профилями каждый, обычный аккаунт, 12 concurrent bootstrap; чужие записи/файлы недоступны; PG rollback и S3 cleanup при втором/шестом write | подтвержден |

## Проверки на финальном состоянии

Среда: macOS arm64, Bun 1.4.4 через PATH prefix `/Users/aleksandrkiko/.bun/install/cache/@oven/bun-darwin-aarch64@1.4.4@@@1/bin`; healthy PostgreSQL/Redis/MinIO. Фикстуры в собственных временных БД и объектах, после тестов очищены. Рабочую базу вручную не заполняли.

| Команда | Результат |
|---|---|
| bun run check | exit 0, 69 файлов |
| bun run lint | exit 0, без warnings |
| bun run format:check | exit 0, 74 файла |
| bun run build | exit 0, 38 modules, index-BocoPcCE.js |
| bun test | exit 0, 39 pass / 5 integration skips / 0 fail, 276 assertions |
| bun run test:integration | exit 0, 44 pass / 0 skips / 0 fail, 609 assertions |
| PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Users/aleksandrkiko/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell bun run test:ui | exit 0, desktop/mobile, без pageerror |
| git diff --check | exit 0 |

Первый targeted demo integration: 1 pass, 185 assertions. В ходе реализации исправлена TS сигнатура тестового S3 mock (успешный write возвращает number), после этого check/lint и весь набор пройдены. После последней runtime правки разделителя даты/номера строки и этапа отчета повторены все перечисленные проверки. После запусков изменялись только task/completion/manifest. Полные request логи не сохранялись.

Скриншоты: test-results/demo-versions-diff-desktop.png, demo-versions-diff-mobile.png, demo-version-remark-desktop.png, demo-version-remark-mobile.png; просмотрены desktop diff и mobile remark, без горизонтального переполнения страницы. Это browser viewport проверка, физический телефон не проверялся.

## Самопроверка и ограничения

Отдельно проверены требования и реализация во всем diff: генерация parent/ID, соответствие S3/PG, участники/роли, хронология версии→замечание→исправление→подтверждение, изоляция, частичный отказ и компенсация всех attempted keys. События и общая история сортируются по предметному created, поскольку PG transaction timestamps у seed совпадают. У report с исправлением на проверке этап review, у семинара с открытым замечанием — revision.

Область изменений: demo.ts, document-service.ts (порядок исторических событий), DocumentComments.tsx (разделитель даты/строки), tests/demo.test.ts, scripts/verify-ui.ts, README и architecture/verification docs. Новых зависимостей, миграций, изменений ACL/правил приемки нет. Обычный риск не требует независимого ревью по применимой политике; выполнена самопроверка, независимым ревью она не называется.

Существующие демо сохраняют прежние данные до reload. Продолжает действовать прежнее ограничение хранения демо: автоматическая очистка PG/S3 по истечению сессии отсутствует. Публикация в эту задачу не входит.

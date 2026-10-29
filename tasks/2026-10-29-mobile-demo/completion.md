# 2026-10-29-mobile-demo: результат

Статус: завершено.

## Поведение и состояние

Реализованы телефонный реестр-карточки и крупные элементы управления; обновлены компоненты; / открывает новое приватное демо с тремя вымышленными документами и настоящими скачиваемыми TXT-оригиналами, замечанием, уведомлением и личным шаблоном. /login сохраняет обычные аккаунты. /demo показывает QR текущего origin, ссылку и копирование без внешнего сервиса. Деплой не выполнялся.

Основание: [task.md](task.md). База edbe66a4fd21dc54c0b42bc13aa1d04016129d7c плюс рабочее дерево, точные SHA-256 изменённых исходников — [manifest](source-manifest.sha256). Чужие artifacts и presentation tasks сохранены. Проверки проводились на незакоммиченном дереве; после финального UI изменён только tests/demo.test.ts (добавлена конкурентная проверка scope), затем повторены check/lint/format/integration.

## Приемка

| AC | Реализация | Доказательство | Результат |
| --- | --- | --- | --- |
| AC-01 | styles.css, Registry, WorkspaceShell | Playwright 360/390px меню, карточка, версии, modal; изображения test-results/demo-mobile-*.png; дополнительная fixture geometry 1440px | подтвержден |
| AC-02 | demo.ts, auth.ts, app-store | UI reload меняет user/doc ids; integration 3 оригинала, template | подтвержден |
| AC-03 | app.ts, store.ts, workspace.ts, intelligence.ts | 2 demo + обычный curator, чужие originals/templates/doc 404, cross-scope upsert/remove, 12 конкурентных bootstrap; обычный create/upload/login/reload UI | подтвержден |
| AC-04 | DemoPage.tsx, demo.css | /demo не создаёт профиль; QR локально SVG quiet zone 4; Apple Vision независимо декодировал итоговый PNG в http://127.0.0.1:58189/ — origin финального теста | подтвержден |
| AC-05 | components styles, mobile layout | существующие create/upload/download exact bytes/author, navigation race/direct links, Knowledge, без pageerror; diff review | подтвержден |

## Проверки

Среда: macOS, Bun 1.4.4; PostgreSQL/Redis/MinIO Docker healthy. Тесты используют временные БД и удаляют тестовые S3-оригиналы.

| Команда | Результат |
| --- | --- |
| bun run check | exit 0, 66 файлов |
| bun run lint | exit 0 |
| bun run format:check | exit 0, 71 файл |
| bun run build | exit 0, Vite 37 modules |
| bun test | exit 0, 36 pass / 5 skip / 0 fail; skips — интеграционные наборы без RUN_INTEGRATION |
| bun run test:integration | exit 0, 41 pass / 0 fail, 413 assertions; все пропуски обычного bun test исполнены |
| PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Users/mikevetkal/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell bun run test:ui | exit 0; финальный запуск агента demo_entry |
| git diff --check | exit 0 |

Исходные check и bun test: 36 pass, 4 integration skip, 0 fail. Первый integration до завершения реализации: 40 pass, 0 fail. Один новый UI сценарий первоначально падал из-за неподдерживаемого закрытия модалки через Escape; исправлена проверка на реальную кнопку закрытия, повторный и финальный прогоны прошли. Это исправление теста не меняет критерий пригодности формы. Отказ S3 проверен через контролируемую ошибку второго write с rollback PostgreSQL и компенсацией объектов. Реальный Ollama не нужен для этой задачи и его успешная работа не заявляется; демо не имитирует результаты ИИ.

Артефакты: test-results/demo-mobile-360.png, demo-mobile-390.png, demo-qr-mobile.png, demo-qr-code.png и существующие solid-desktop/mobile. Полные серверные логи с пользовательскими данными не сохранены. Чувствительные данные в фикстуры не включались.

## Ревью

Отдельный проход по требованиям и реализации выполнен основным агентом. Независимые проходы других авторов: [клиент](review-client.md), [backend](review-backend.md). Исправлены замечания: /login после demo теперь завершает demo session перед Auth, тест закрывает modal настоящей кнопкой, cases.code соответствует потребителю. После backend review дополнительно проверены конкурентные AsyncLocalStorage-контексты 12 запросами; интеграционный набор повторён. Блокирующих замечаний нет.

Новая зависимость qrcode-generator@2.0.4 нужна для стандартной QR-кодировки и коррекции ошибок без самописного алгоритма и отправки домена стороннему сервису. Миграции схемы нет, обычные данные сохранены. Обновлены README, project/domain/architecture/verification.

## Ограничения

Демоданные не удаляются автоматически: Redis-сессия имеет TTL суток, PG/S3 остаются. Вкладки одного браузера разделяют cookie и используют последнюю демосессию. Лимит 30 запусков/минуту по request.ip; за reverse proxy нужно проверить реальное определение IP до массовой публичной демонстрации (trustProxy без подтверждённой конфигурации не включён). QR берёт текущий домен: localhost пригоден для локальной проверки, для телефона требуется доступный сетевой/публичный домен. Работа на физическом телефоне не проверялась; автоматические mobile viewport сценарии пройдены.

Все обязательные локальные проверки подтверждены. Публикация и выбор срока хранения демонстрационных материалов — отдельные действия владельца.

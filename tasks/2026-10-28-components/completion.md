# Компоненты, локальные аккаунты и примеры документов

Статус: **завершено в согласованном объёме**. Критерии: [task.md](task.md). Уточнения владельца учтены: templates — только примеры для ручной загрузки, без автоматического каталога; авторизация — локальные email/пароль.

Предъявляемое состояние: база Git 2cb8d23b79d3c396a7e9564e49072a1e01aa8ae8 + незакоммиченные изменения предыдущих задач и этой задачи. Исходники запуска: [source-sha256.txt](source-sha256.txt). Рабочие данные, .env и секреты в снимок не входят.

| AC | Реализация | Доказательство |
| --- | --- | --- |
| AC-01 | Solid entry 5 строк, App 68, отдельные store/API/types/layout/shared/features и вкладки; Fastify index 15 строк, app77, routes/services/domain/storage | инвентаризация, независимое review, check/build/UI |
| AC-02 | TypeScript/Bun1.4.4/Solid/Tailwind/Fastify/Drizzle/PostgreSQL/Redis/MinIO/oxlint сохранены; Tailwind theme/@apply/utilities вместо монолитного raw CSS | package/config/code, lint/check/build |
| AC-03 | Реальные register/login/logout/me; Bun.password hash, уникальный нормализованный email PostgreSQL, Redis24h session, первый аккаунт curator, остальные author; фиктивные справочники/организация удалены | 3 интеграционных теста, 72 assertions; пустой runtime bootstrap users0/docs0/rules0/auth_required |
| AC-04 | templates содержит 3 MD/TXT примера с полями, backend папку не читает; ручной upload берёт автора из сессии, хранит оригинал в MinIO | Chromium manual upload/download exact bytes + author, интеграционный cross-account отказ |
| AC-05 | README, architecture/domain/project/verification и ADR обновлены; модули имеют отдельные предметные границы | source review, docs |

## Запуски 28.10.2026

Среда: macOS arm64, Bun1.4.4, PostgreSQL16/Redis7/MinIO2025-10-15 в Docker. UI/API вне Docker.

- `bun run check`: exit0, 49 файлов.
- `bun run lint`: exit0, без ошибок и предупреждений.
- `bun run format:check`: exit0, 53 файла.
- `bun run build`: exit0, 33 frontend модуля.
- `bun run test:integration`: exit0, 3 pass / 72 assertions; реальные сервисы, временные БД, без засорения рабочего реестра.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<installed Chromium> bun run test:ui`: exit0; регистрация, пустая база, создание, ручная загрузка templates/Служебная записка.md, скачивание неизменённых bytes, автор текущего аккаунта, logout/login/reload, desktop1440/mobile390, без pageerror. Проверки отложенного чтения файла при смене документа и запоздалого HTTP-ответа навигации также пройдены.
- `bun install --frozen-lockfile`, `git diff --check`: exit0.
- `bun scripts/start.ts`: сервисы healthy, миграция/сборка успешны, приложение слушает 127.0.0.1:8765. Health200; bootstrap auth_required=true/setup_required=true/users0/documents0/rules0.

UI проверка использует установленный Playwright Chromium1248. Скриншоты — игнорируемые test-results/solid-desktop.png и solid-mobile.png. Тесты используют отдельную временную PostgreSQL базу, удаляют её и оригиналы после проверки; пользовательская рабочая база не заполняется тестами.

## Ревью и исправления

Backend и frontend реализованы отдельными субагентами; независимый read-only reviewer проверил компонентность, UI и auth/ownership. Родитель выполнил самостоятельные проходы по требованиям и реализации.

Исправлены найденные проблемы:

1. Upload мог читать текущий doc после await file.arrayBuffer и уходить в другую карточку. ID/parent фиксируются до await; браузерный регрессионный сценарий подтверждён.
2. Запоздалый ответ старой навигации мог заменить текущую карточку. Добавлены generation/hash guards; browser regression пройден.
3. Фильтр на второй странице мог показывать пустую выборку. Страница сбрасывается при смене фильтров/раздела.
4. IP-only login limiter сбрасывался успешным входом другого аккаунта. Ключ теперь email-hash+IP и сбрасывается только для этого аккаунта. Добавлен тест: 9 неверных попыток, успешный вход другого аккаунта, десятая неверная, следующая429. До исправления тест падал (401 вместо429); после проходит. Правила проверок не ослаблялись.

## Данные и ограничения

Прежняя локальная БД eosdo сохранена; текущая eosdo_workspace пуста и ждёт первую регистрацию. Исходные data/ не изменялись. Профили, документы и шаблоны не мокируются. Примеры в templates — явно разрешённые владельцем статические документы, не runtime seed.

Локальная регистрация открытая: SSO/invitations/password reset/корпоративное администрирование — будущие задачи. Первый зарегистрированный пользователь — куратор. Роли не выбираются клиентом. Legacy SQLite импорт требует ручного сопоставления старых владельцев с новыми аккаунтами; автоматического переноса учётных записей нет.

PDF/DOCX/XLSX хранятся, но извлечение текста и embedded PDF viewer по-прежнему отсутствуют. Истинная Ollama проверка и Railway deployment не выполнялись. CI/branch protection не проверялись; успешные локальные проверки не выдаются за них. Коммиты, push и публикация не выполнялись.

# Railway: параметры размещения

Docker Compose запускает только локальную инфраструктуру. Frontend/API работают Bun вне Compose. На Railway выберите Railpack для приложения; PostgreSQL, Redis и MinIO — отдельные сервисы с постоянными томами.

[Config as Code устарел](https://docs.railway.com/config-as-code/reference): railway.toml поддерживается только для legacy services до 2026-12-01. Поэтому нового приложения не настраиваем через устаревший файл. Следующие параметры задаются в настройках сервиса Railway (или действующей IaC вашего проекта):

| Поле               | Значение                                                                     |
| ------------------ | ---------------------------------------------------------------------------- |
| Builder            | Railpack                                                                     |
| Build command      | `bun install --frozen-lockfile && bun run build`                             |
| Pre-deploy command | `bun run db:migrate`                                                         |
| Start command      | `bun run start`                                                              |
| Healthcheck        | `/api/health`, timeout 120 секунд                                            |
| Bun                | `RAILPACK_BUN_VERSION=1.4.4`                                                 |
| Listen             | `HOST=0.0.0.0`, PORT задаёт Railway                                          |
| Origin             | `APP_ORIGIN=https://ваш-домен` (без завершающего слеша), NODE_ENV=production |

Версия Bun также закреплена в packageManager, engines.bun и .bun-version; [Railpack их поддерживает](https://railpack.com/languages/bun/).

Используйте private URLs для DATABASE_URL/REDIS_URL. MinIO: Dockerfile `infra/minio/Dockerfile`, команда по умолчанию `server /data --console-address :9001`; обязательно подключите постоянный том `/data`, задайте MINIO_ROOT_USER/MINIO_ROOT_PASSWORD. В приложении им соответствуют S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY. S3_ENDPOINT указывает на private HTTP endpoint MinIO, S3_BUCKET должен существовать. Создайте bucket через mc с private endpoint перед первым healthcheck; локально это делает minio-init.

Если Ollama размещается отдельно, задайте доступный приложению OLLAMA_URL и OLLAMA_MODEL. Без модели загрузка сохраняется, проверка сообщает ошибку. Реальная Railway публикация, домен, права и переменные аккаунта в этой задаче не создавались и не проверялись.

import { demoScope, Store, type Services } from "./store";
import { now, uid, profile, template } from "./domain";

/** Fictional workspace, isolated from production records and settings. */
export async function createDemo(services: Services) {
  const id = uid();
  const keys: string[] = [];
  const baseTime = Date.now() - 7 * 86400000;
  const at = (hour: number) =>
    new Date(baseTime + hour * 3600000).toISOString();
  try {
    return await demoScope.run(id, async () => {
      return services.db.transaction(async (tx) => {
        const store = new Store(tx);
        const account = {
          id,
          demo_id: id,
          name: "Анна Соколова",
          department: "Отдел развития",
          email: `demo-${id}@example.invalid`,
          role: "author",
          created: at(0),
        };
        await store.put("account", account);
        const curatorId = uid();
        await store.put("account", {
          id: curatorId,
          name: "Илья Морозов",
          department: "Отдел развития",
          email: `demo-curator-${id}@example.invalid`,
          role: "curator",
          created: at(0),
        });
        await store.set("workspace", {
          organization: "Проектное бюро «Маяк» · демо",
        });
        const cases = [
          {
            id: "development",
            title: "Развитие клиентского сервиса",
            code: "02-14",
          },
        ];
        await store.set("directory", { cases });
        const directory = { users: [{ id }, { id: curatorId }], cases };
        const date = (days: number) =>
          new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
        const samples = [
          {
            title: "Запуск электронного архива обращений",
            type: "Служебная записка",
            status: "review",
            due: 3,
            priority: "high",
            summary:
              "Три редакции записки: сроки пилота, состав участников и резервный порядок. Откройте версии и сравните изменения.",
            text: "Проектное бюро «Маяк»\nСлужебная записка\nО запуске электронного архива обращений\n\nЗа последний месяц отдел обработал 146 обращений. Поиск вложений в общей почте занимает до 20 минут. Предлагаю провести пилот электронного архива в отделе развития.\n\nДля пилота нужны доступы для пяти сотрудников и перенос обращений за октябрь. Ответственный за подготовку — Анна Соколова.\nСрок пилота пока не определён.\nРезультаты предлагаю обсудить на ближайшей рабочей встрече.\n\nАнна Соколова, отдел развития\nУчебный документ. Все сведения вымышлены.",
          },
          {
            title: "Итоги встреч с региональными командами",
            type: "Отчёт",
            status: "review",
            due: 5,
            priority: "normal",
            summary:
              "Две редакции отчёта: оценки трудозатрат добавлены в v2, исправление замечания ожидает проверки куратора.",
            text: "Проектное бюро «Маяк»\nИтоги встреч с региональными командами\n\nПровели три рабочие встречи. Команды попросили единый шаблон ответа клиенту, справочник контактов и короткую инструкцию по передаче обращений.\n\nШаблон ответа подготовлен. Справочник проверяют руководители групп. Для инструкции требуется уточнить порядок действий при повторном обращении.\n\nТрудозатраты: не оценены.\nСледующий шаг: собрать оценки трудозатрат и согласовать очередность изменений.\n\nУчебный документ. Все сведения вымышлены.",
          },
          {
            title: "План подготовки клиентского семинара",
            type: "План мероприятий",
            status: "revision",
            due: 12,
            priority: "normal",
            summary:
              "Две редакции плана: число участников выросло с 25 до 40, добавлена проверка регистрации. Есть открытое замечание.",
            text: "Проектное бюро «Маяк»\nПлан подготовки клиентского семинара\n\n1. Уточнить темы выступлений и подтвердить участников.\n2. Подготовить приглашение и форму регистрации.\n3. Проверить звук и демонстрацию экрана за день до встречи.\n4. После семинара отправить материалы и короткую анкету.\n\nКоординатор — Анна Соколова. Ожидаем до 25 участников.\n\nУчебный документ. Все сведения вымышлены.",
          },
        ];
        for (const [index, sample] of samples.entries()) {
          const docId = uid();
          const revisions = [
            {
              text: sample.text,
              message: "Подготовлена первая рабочая редакция",
            },
          ];
          if (index === 0) {
            const second = sample.text
              .replace(
                "Срок пилота пока не определён.",
                "Срок пилота: 2–13 ноября 2026 года.",
              )
              .replace(
                "Результаты предлагаю обсудить",
                "Критерий успеха: поиск обращения занимает не больше 2 минут.\nРезультаты предлагаю обсудить",
              );
            revisions.push({
              text: second,
              message: "Уточнены сроки пилота и критерий успеха",
            });
            revisions.push({
              text: second
                .replace(
                  "доступы для пяти сотрудников",
                  "доступы для восьми сотрудников",
                )
                .replace(
                  "Результаты предлагаю обсудить на ближайшей рабочей встрече.",
                  "Итоги пилота: отчёт куратору 16 ноября 2026 года.\nРезервный порядок: при недоступности архива обращения регистрируются в журнале.",
                ),
              message:
                "Расширен состав участников и добавлен резервный порядок",
            });
          } else if (index === 1) {
            revisions.push({
              text: sample.text
                .replace(
                  "Трудозатраты: не оценены.",
                  "Трудозатраты: шаблон — 8 ч, справочник — 12 ч, инструкция — 6 ч.",
                )
                .replace(
                  "Следующий шаг: собрать оценки трудозатрат и согласовать очередность изменений.",
                  "Следующий шаг: согласовать очередность изменений.\nОчередность: шаблон ответа, справочник контактов, инструкция.",
                ),
              message: "Добавлены трудозатраты и очередность изменений",
            });
          } else {
            revisions.push({
              text: sample.text
                .replace(
                  "Ожидаем до 25 участников.",
                  "Ожидаем до 40 участников.",
                )
                .replace(
                  "3. Проверить звук и демонстрацию экрана за день до встречи.",
                  "3. Проверить звук, демонстрацию экрана и резервное подключение за день до встречи.",
                )
                .replace(
                  "4. После семинара отправить материалы и короткую анкету.",
                  "4. За два дня до семинара подтвердить регистрацию участников.\n5. После семинара отправить материалы и короткую анкету.",
                ),
              message:
                "Увеличено число участников и добавлена проверка регистрации",
            });
          }
          const versionIds = revisions.map(() => uid());
          await store.put(
            "document",
            {
              id: docId,
              title: sample.title,
              type: sample.type,
              summary: sample.summary,
              number: `МЯ-${String(index + 41).padStart(3, "0")}/${new Date().getFullYear() % 100}`,
              due: date(sample.due),
              priority: sample.priority,
              status: sample.status,
              owner_id: id,
              curator_id: curatorId,
              department: account.department,
              approved_version: null,
              profile_revision: 1,
              ...profile({ case_id: "development" }, directory),
              created: at(24),
              updated: at(24 + (revisions.length - 1) * 8),
            },
            undefined,
            id,
          );
          for (const [revision, version] of revisions.entries()) {
            const versionId = versionIds[revision]!;
            const key = `versions/${docId}/${versionId}`;
            const bytes = Buffer.from(version.text);
            keys.push(key);
            await services.s3.write(key, bytes, {
              type: "text/plain; charset=utf-8",
            });
            await store.put(
              "version",
              {
                id: versionId,
                document_id: docId,
                number: revision + 1,
                parent_id: versionIds[revision - 1] ?? null,
                filename: `${sample.title}.txt`,
                object_key: key,
                sha256: new Bun.CryptoHasher("sha256")
                  .update(bytes)
                  .digest("hex"),
                size: bytes.length,
                author_id: id,
                message: version.message,
                created: at(24 + revision * 8),
                text: version.text,
              },
              docId,
            );
            await store.put(
              "history",
              {
                id: uid(),
                document_id: docId,
                author_id: id,
                action: `Загружена v${revision + 1}: ${version.message}`,
                created: at(24 + revision * 8),
              },
              docId,
            );
          }
          const remark =
            index === 0
              ? {
                  version: 0,
                  anchor: "Срок пилота пока не определён.",
                  text: "Укажите точные сроки пилота и измеримый критерий успеха.",
                  status: "closed",
                  resolved: 1,
                  reply:
                    "В v2 указаны сроки 2–13 ноября и целевое время поиска до 2 минут.",
                }
              : index === 1
                ? {
                    version: 0,
                    anchor: "Трудозатраты: не оценены.",
                    text: "Добавьте оценку трудозатрат по каждому предложению.",
                    status: "addressed",
                    resolved: 1,
                    reply:
                      "В v2 добавлены оценки: 8, 12 и 6 часов. Прошу проверить.",
                  }
                : {
                    version: 1,
                    anchor:
                      "Координатор — Анна Соколова. Ожидаем до 40 участников.",
                    text: "Уточните вместимость площадки и подтвердите размещение 40 участников.",
                    status: "open",
                    resolved: null,
                    reply:
                      "Проверяю вместимость площадки; исправление пока не загружено.",
                  };
          const commentId = uid();
          const versionId = versionIds[remark.version]!;
          const created = at(25 + remark.version * 8);
          const resolvedVersion =
            remark.resolved === null ? null : versionIds[remark.resolved]!;
          await store.put(
            "comment",
            {
              id: commentId,
              document_id: docId,
              version_id: versionId,
              author_id: curatorId,
              text: remark.text,
              anchor: remark.anchor,
              anchor_line:
                revisions[remark.version]!.text.split("\n").indexOf(
                  remark.anchor,
                ) + 1,
              severity: "blocking",
              status: remark.status,
              created,
              resolved_version: resolvedVersion,
            },
            docId,
          );
          await store.put(
            "comment_event",
            {
              id: uid(),
              comment_id: commentId,
              author_id: curatorId,
              from_status: null,
              status: "open",
              version_id: versionId,
              created,
            },
            docId,
          );
          await store.put(
            "reply",
            {
              id: uid(),
              comment_id: commentId,
              author_id: id,
              text: remark.reply,
              created: at(
                remark.resolved === null
                  ? 26 + remark.version * 8
                  : 25 + remark.resolved * 8,
              ),
            },
            docId,
          );
          if (resolvedVersion && remark.resolved !== null) {
            await store.put(
              "comment_event",
              {
                id: uid(),
                comment_id: commentId,
                author_id: id,
                from_status: "open",
                status: "addressed",
                version_id: resolvedVersion,
                created: at(26 + remark.resolved * 8),
              },
              docId,
            );
            if (remark.status === "closed")
              await store.put(
                "comment_event",
                {
                  id: uid(),
                  comment_id: commentId,
                  author_id: curatorId,
                  from_status: "addressed",
                  status: "closed",
                  version_id: resolvedVersion,
                  created: at(27 + remark.resolved * 8),
                },
                docId,
              );
          }
          if (index === 0)
            await store.notify(
              id,
              docId,
              versionIds.at(-1)!,
              "comment",
              "Посмотрите историю изменений записки",
              "Откройте «Файлы и версии»: доступны три редакции, сравнение до/после и история устранения замечания.",
            );
        }
        await store.put(
          "template",
          {
            id: uid(),
            user_id: id,
            name: "Записка по развитию сервиса",
            revision: 1,
            updated: now(),
            config: template(
              {
                type: "Служебная записка",
                priority: "normal",
                due_days: 7,
                title: "",
                summary: "Предложение, ожидаемый результат и следующий шаг.",
                case_id: "development",
              },
              directory,
            ),
          },
          undefined,
          id,
        );
        return account;
      });
    });
  } catch (error) {
    await Promise.allSettled(keys.map((key) => services.s3.delete(key)));
    throw error;
  }
}

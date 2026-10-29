import { demoScope, Store, type Services } from "./store";
import { now, uid, profile, template } from "./domain";

/** Fictional workspace, isolated from production records and settings. */
export async function createDemo(services: Services) {
  const id = uid();
  const keys: string[] = [];
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
          created: now(),
        };
        await store.put("account", account);
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
        const directory = { users: [{ id }], cases };
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
              "Предложение перейти от общей почты к единому архиву. Нужно согласовать пилот на ноябрь и назначить ответственных.",
            text: "Проектное бюро «Маяк»\nСлужебная записка\nО запуске электронного архива обращений\n\nЗа последний месяц отдел обработал 146 обращений. Поиск вложений в общей почте занимает до 20 минут. Предлагаю провести пилот электронного архива в отделе развития.\n\nДля пилота нужны доступы для пяти сотрудников и перенос обращений за октябрь. Ответственный за подготовку — Анна Соколова. Результаты предлагаю обсудить на ближайшей рабочей встрече.\n\nАнна Соколова, отдел развития\nУчебный документ. Все сведения вымышлены.",
          },
          {
            title: "Итоги встреч с региональными командами",
            type: "Отчёт",
            status: "revision",
            due: 5,
            priority: "normal",
            summary:
              "Собраны запросы трёх команд. Осталось уточнить оценку трудозатрат перед передачей отчёта руководителю.",
            text: "Проектное бюро «Маяк»\nИтоги встреч с региональными командами\n\nПровели три рабочие встречи. Команды попросили единый шаблон ответа клиенту, справочник контактов и короткую инструкцию по передаче обращений.\n\nШаблон ответа подготовлен. Справочник проверяют руководители групп. Для инструкции требуется уточнить порядок действий при повторном обращении.\n\nСледующий шаг: собрать оценки трудозатрат и согласовать очередность изменений.\n\nУчебный документ. Все сведения вымышлены.",
          },
          {
            title: "План подготовки клиентского семинара",
            type: "План мероприятий",
            status: "new",
            due: 12,
            priority: "normal",
            summary:
              "Камерная встреча для клиентов: программа, приглашения, проверка оборудования и сбор обратной связи.",
            text: "Проектное бюро «Маяк»\nПлан подготовки клиентского семинара\n\n1. Уточнить темы выступлений и подтвердить участников.\n2. Подготовить приглашение и форму регистрации.\n3. Проверить звук и демонстрацию экрана за день до встречи.\n4. После семинара отправить материалы и короткую анкету.\n\nКоординатор — Анна Соколова. Ожидаем до 25 участников.\n\nУчебный документ. Все сведения вымышлены.",
          },
        ];
        for (const [index, sample] of samples.entries()) {
          const docId = uid(),
            versionId = uid();
          const key = `versions/${docId}/${versionId}`;
          const bytes = Buffer.from(sample.text);
          keys.push(key);
          await services.s3.write(key, bytes, {
            type: "text/plain; charset=utf-8",
          });
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
              curator_id: id,
              department: account.department,
              approved_version: null,
              profile_revision: 1,
              ...profile({ case_id: "development" }, directory),
              created: now(),
              updated: now(),
            },
            undefined,
            id,
          );
          await store.put(
            "version",
            {
              id: versionId,
              document_id: docId,
              number: 1,
              parent_id: null,
              filename: `${sample.title}.txt`,
              object_key: key,
              sha256: new Bun.CryptoHasher("sha256")
                .update(bytes)
                .digest("hex"),
              size: bytes.length,
              author_id: id,
              message: "Подготовлена рабочая редакция",
              created: now(),
              text: sample.text,
            },
            docId,
          );
          await store.log(
            docId,
            id,
            "Подготовлена карточка и первая редакция документа",
          );
          if (index === 1)
            await store.put(
              "comment",
              {
                id: uid(),
                document_id: docId,
                version_id: versionId,
                author_id: id,
                text: "Перед отправкой добавьте оценку трудозатрат по каждому предложению.",
                anchor: "собрать оценки трудозатрат",
                severity: "normal",
                status: "open",
                created: now(),
                resolved_version: null,
              },
              docId,
            );
          if (index === 0)
            await store.notify(
              id,
              docId,
              versionId,
              "deadline",
              "Подготовьте записку к обсуждению",
              "Проверьте сроки пилота и список участников перед рабочей встречей.",
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

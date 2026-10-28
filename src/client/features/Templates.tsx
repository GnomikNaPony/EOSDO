import { PersonalTemplates } from "./PersonalTemplates";
export function Templates() {
  return (
    <>
      <div class="title-row">
        <h1>Шаблоны документов</h1>
      </div>
      <div class="px-5 pt-4 text-slate-600">
        <p>
          Сохраните типовые реквизиты для новых документов. Файлы из папки
          templates можно вручную загрузить во вкладке «Файлы и версии» своей
          карточки документа.
        </p>
      </div>
      <PersonalTemplates />
    </>
  );
}

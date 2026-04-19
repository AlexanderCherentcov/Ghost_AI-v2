import Link from 'next/link';
import { GhostIcon } from '@/components/icons/GhostIcon';

export const metadata = {
  title: 'Условия использования — GhostLine AI',
  description: 'Пользовательское соглашение и условия использования сервиса GhostLine AI',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] py-4 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-[rgba(255,255,255,0.5)] hover:text-white transition-colors">
            <GhostIcon size={20} className="text-accent" />
            GhostLine AI
          </Link>
          <Link href="/login" className="text-sm text-accent hover:opacity-80 transition-opacity">
            Войти →
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-medium mb-2">Условия использования</h1>
        <p className="text-sm text-[rgba(255,255,255,0.3)] mb-10">
          Пользовательское соглашение (публичная оферта) · Последнее обновление: апрель 2025 г.
        </p>

        <div className="space-y-8 text-[rgba(255,255,255,0.7)] leading-relaxed text-sm">

          <section>
            <h2 className="text-base font-medium text-white mb-3">1. Стороны соглашения</h2>
            <p>
              Настоящее Пользовательское соглашение (далее — «Соглашение») является публичной офертой
              GhostLine AI (далее — «Исполнитель», «мы») в адрес любого физического лица (далее —
              «Пользователь»), использующего сервис GhostLine AI по адресу{' '}
              <a href="https://ghostlineai.ru" className="text-accent hover:opacity-80">ghostlineai.ru</a>{' '}
              (далее — «Сервис»).
            </p>
            <p className="mt-3">
              Регистрация или начало использования Сервиса означает безоговорочное принятие
              Пользователем условий настоящего Соглашения в порядке ст. 438 ГК РФ.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">2. Описание Сервиса</h2>
            <p>
              GhostLine AI — платформа для взаимодействия с различными ИИ-моделями, предоставляющая
              следующие возможности:
            </p>
            <ul className="mt-3 space-y-2 list-disc pl-5">
              <li>Текстовые диалоги с ИИ-ассистентом;</li>
              <li>Генерация изображений на основе текстовых запросов;</li>
              <li>Генерация видео на основе текстовых запросов и/или изображений;</li>
              <li>Синтез звука и музыки;</li>
              <li>Анализ изображений и документов.</li>
            </ul>
            <p className="mt-3">
              Сервис доступен через веб-интерфейс и Telegram Mini App.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">3. Регистрация и учётная запись</h2>
            <p>
              Для использования Сервиса необходима регистрация посредством OAuth-авторизации через
              сторонние сервисы (Яндекс, Google, Telegram). Пользователь несёт ответственность за
              сохранность доступа к своей учётной записи.
            </p>
            <p className="mt-3">
              Мы вправе приостановить или удалить учётную запись в случае нарушения настоящего Соглашения.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">4. Оплата и подписка</h2>
            <p>
              Сервис предоставляет бесплатный базовый доступ с ограничениями, а также платные тарифные
              планы. Условия тарифов, стоимость и период действия указаны на странице сервиса в момент
              оформления подписки.
            </p>
            <p className="mt-3">
              Платёж считается совершённым с момента его подтверждения платёжным провайдером.
              Возврат средств осуществляется по письменному обращению на{' '}
              <a href="mailto:xxghostlinex@gmail.com" className="text-accent hover:opacity-80">
                xxghostlinex@gmail.com
              </a>{' '}
              в течение 14 дней с даты оплаты, при условии что платная функциональность не была
              использована в полном объёме.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">5. Правила использования контента и ИИ</h2>
            <div className="rounded-xl border border-[rgba(123,92,240,0.3)] bg-[rgba(123,92,240,0.06)] px-4 py-3 mb-4">
              <p className="text-[rgba(255,255,255,0.6)] text-[13px]">
                ⚠ Контент создаётся нейросетевыми моделями. Результаты могут быть неточными,
                неполными или не соответствовать ожиданиям. GhostLine AI не несёт ответственности
                за достоверность, качество или содержание сгенерированных материалов.
              </p>
            </div>
            <p>При использовании Сервиса запрещается:</p>
            <ul className="mt-3 space-y-2 list-disc pl-5">
              <li>Генерировать контент, нарушающий законодательство РФ и международное право;</li>
              <li>
                Создавать материалы с изображением сексуального насилия, эксплуатации
                несовершеннолетних, пропагандой терроризма, экстремизма и ненависти;
              </li>
              <li>Распространять дезинформацию, направленную на введение в заблуждение третьих лиц;</li>
              <li>Нарушать права интеллектуальной собственности третьих лиц;</li>
              <li>Загружать вредоносное программное обеспечение и эксплойты;</li>
              <li>Предпринимать попытки обойти ограничения Сервиса или навредить его инфраструктуре;</li>
              <li>Использовать Сервис в автоматизированном режиме без письменного согласия.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">6. Права на контент</h2>
            <p>
              Пользователь сохраняет права на загружаемые им материалы. Передавая контент в Сервис,
              Пользователь предоставляет GhostLine AI неисключительное право на использование данного
              контента исключительно в целях предоставления услуг Сервиса.
            </p>
            <p className="mt-3">
              Права на сгенерированный ИИ контент (тексты, изображения, видео) принадлежат
              Пользователю в той мере, в которой это допускается применимым законодательством и
              условиями лицензий используемых ИИ-провайдеров.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">7. Ограничение ответственности</h2>
            <p>
              Сервис предоставляется «как есть» (as is). GhostLine AI не гарантирует:
            </p>
            <ul className="mt-3 space-y-2 list-disc pl-5">
              <li>точность, достоверность или актуальность генерируемого контента;</li>
              <li>бесперебойную работу Сервиса и отсутствие ошибок;</li>
              <li>соответствие результатов работы ИИ конкретным целям Пользователя.</li>
            </ul>
            <p className="mt-3">
              GhostLine AI не несёт ответственности за прямые или косвенные убытки, возникшие
              в связи с использованием Сервиса или невозможностью его использования, за исключением
              случаев, прямо предусмотренных законодательством РФ.
            </p>
            <p className="mt-3">
              Максимальная совокупная ответственность GhostLine AI перед Пользователем ограничена
              суммой, уплаченной Пользователем за использование Сервиса в течение последних
              3 (трёх) месяцев.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">8. Конфиденциальность</h2>
            <p>
              Обработка персональных данных осуществляется в соответствии с{' '}
              <Link href="/privacy" className="text-accent hover:opacity-80">
                Политикой конфиденциальности
              </Link>
              , являющейся неотъемлемой частью настоящего Соглашения.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">9. Изменение условий</h2>
            <p>
              GhostLine AI вправе в одностороннем порядке изменять настоящее Соглашение. Актуальная
              версия публикуется по адресу{' '}
              <a href="/terms" className="text-accent hover:opacity-80">ghostlineai.ru/terms</a>.
              Продолжение использования Сервиса после публикации изменений означает принятие
              новых условий.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">10. Применимое право и споры</h2>
            <p>
              Настоящее Соглашение регулируется законодательством Российской Федерации. Все споры
              подлежат разрешению в судах по месту нахождения Исполнителя, если законодательством
              РФ не предусмотрено иное.
            </p>
            <p className="mt-3">
              До обращения в суд стороны обязуются предпринять попытку урегулирования спора
              в претензионном порядке. Срок ответа на претензию — 30 (тридцать) дней.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">11. Контакты</h2>
            <p>
              По всем вопросам, связанным с настоящим Соглашением, обращайтесь:{' '}
              <a href="mailto:xxghostlinex@gmail.com" className="text-accent hover:opacity-80">
                xxghostlinex@gmail.com
              </a>
            </p>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-6 px-6 mt-12">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[rgba(255,255,255,0.2)]">
          <span>© {new Date().getFullYear()} GhostLine AI</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-white transition-colors">Политика</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Условия</Link>
            <a href="mailto:xxghostlinex@gmail.com" className="hover:text-white transition-colors">
              xxghostlinex@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

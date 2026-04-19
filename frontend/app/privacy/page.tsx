import Link from 'next/link';
import { GhostIcon } from '@/components/icons/GhostIcon';

export const metadata = {
  title: 'Политика конфиденциальности — GhostLine AI',
  description: 'Политика обработки персональных данных GhostLine AI',
};

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-medium mb-2">Политика конфиденциальности</h1>
        <p className="text-sm text-[rgba(255,255,255,0.3)] mb-10">
          Последнее обновление: апрель 2025 г.
        </p>

        <div className="space-y-8 text-[rgba(255,255,255,0.7)] leading-relaxed text-sm">

          <section>
            <h2 className="text-base font-medium text-white mb-3">1. Общие положения</h2>
            <p>
              Настоящая Политика конфиденциальности (далее — «Политика») определяет порядок обработки
              персональных данных пользователей сервиса GhostLine AI (далее — «Сервис», «мы»),
              расположенного по адресу{' '}
              <a href="https://ghostlineai.ru" className="text-accent hover:opacity-80">ghostlineai.ru</a>.
            </p>
            <p className="mt-3">
              Политика разработана в соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ
              «О персональных данных» и иных применимых актов законодательства Российской Федерации.
            </p>
            <p className="mt-3">
              Используя Сервис, вы подтверждаете, что ознакомились с настоящей Политикой и даёте согласие
              на обработку ваших персональных данных в указанных ниже целях.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">2. Оператор персональных данных</h2>
            <p>Оператором персональных данных является:</p>
            <ul className="mt-2 space-y-1 list-none pl-0">
              <li><span className="text-[rgba(255,255,255,0.4)]">Наименование:</span> GhostLine AI</li>
              <li>
                <span className="text-[rgba(255,255,255,0.4)]">Электронная почта:</span>{' '}
                <a href="mailto:xxghostlinex@gmail.com" className="text-accent hover:opacity-80">
                  xxghostlinex@gmail.com
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">3. Какие данные мы собираем</h2>
            <p>При использовании Сервиса мы можем обрабатывать следующие данные:</p>
            <ul className="mt-3 space-y-2 list-disc pl-5">
              <li>
                <strong className="text-white">Данные учётной записи</strong> — имя пользователя,
                адрес электронной почты, идентификатор Telegram-аккаунта, ссылка на аватар.
                Получаются при авторизации через OAuth-провайдеров (Яндекс, Google, Telegram).
              </li>
              <li>
                <strong className="text-white">История переписки</strong> — текстовые сообщения,
                отправленные вами в чате, а также ответы ИИ-ассистента.
              </li>
              <li>
                <strong className="text-white">Загружаемые файлы</strong> — изображения, документы
                и иные файлы, которые вы прикрепляете в рамках диалога с ИИ.
              </li>
              <li>
                <strong className="text-white">Технические данные</strong> — IP-адрес, тип браузера,
                сведения об устройстве, данные журналов доступа.
              </li>
              <li>
                <strong className="text-white">Платёжные данные</strong> — информация о подписке и
                статусе оплаты. Данные банковских карт не хранятся нами и обрабатываются
                платёжным провайдером.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">4. Цели обработки данных</h2>
            <p>Персональные данные обрабатываются в следующих целях:</p>
            <ul className="mt-3 space-y-2 list-disc pl-5">
              <li>Идентификация и аутентификация пользователей;</li>
              <li>Предоставление функциональности Сервиса (ИИ-чат, генерация изображений и видео);</li>
              <li>Хранение истории диалогов в рамках установленных сроков;</li>
              <li>Обработка платежей и управление подпиской;</li>
              <li>Обеспечение безопасности и предотвращение мошенничества;</li>
              <li>Улучшение качества Сервиса и устранение технических неисправностей;</li>
              <li>Ответы на обращения пользователей.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">5. Передача данных третьим лицам</h2>
            <p>
              Для предоставления Сервиса мы передаём данные (в первую очередь содержимое сообщений)
              следующим категориям партнёров:
            </p>
            <ul className="mt-3 space-y-2 list-disc pl-5">
              <li>
                <strong className="text-white">Поставщики ИИ-моделей</strong> — Anthropic, OpenAI,
                Stability AI, Kling AI и иные провайдеры, обеспечивающие генерацию текста,
                изображений и видео. Передача осуществляется в объёме, необходимом для
                обработки запроса.
              </li>
              <li>
                <strong className="text-white">Платёжные системы</strong> — для обработки транзакций.
              </li>
              <li>
                <strong className="text-white">Инфраструктурные провайдеры</strong> — облачные сервисы,
                используемые для хостинга и хранения данных.
              </li>
            </ul>
            <p className="mt-3">
              Мы не продаём и не передаём ваши данные третьим лицам в маркетинговых целях.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">6. Сроки хранения данных</h2>
            <ul className="mt-2 space-y-2 list-disc pl-5">
              <li>История сообщений — до 60 дней с момента создания;</li>
              <li>Сгенерированные видеофайлы — до 60 дней с момента создания;</li>
              <li>Данные учётной записи — в течение всего срока использования Сервиса;</li>
              <li>Технические журналы — до 30 дней.</li>
            </ul>
            <p className="mt-3">
              По истечении указанных сроков данные автоматически удаляются.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">7. Права пользователей</h2>
            <p>В соответствии с ФЗ-152 вы вправе:</p>
            <ul className="mt-3 space-y-2 list-disc pl-5">
              <li>получить информацию об обработке ваших персональных данных;</li>
              <li>потребовать исправления неточных или устаревших данных;</li>
              <li>потребовать удаления персональных данных;</li>
              <li>отозвать согласие на обработку персональных данных;</li>
              <li>обратиться с жалобой в Роскомнадзор.</li>
            </ul>
            <p className="mt-3">
              Для реализации указанных прав направьте запрос на{' '}
              <a href="mailto:xxghostlinex@gmail.com" className="text-accent hover:opacity-80">
                xxghostlinex@gmail.com
              </a>
              . Мы обработаем ваш запрос в течение 30 дней.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">8. Файлы cookie</h2>
            <p>
              Сервис использует сессионные файлы cookie, необходимые для обеспечения аутентификации
              и корректной работы функций. Мы не используем сторонние рекламные cookie.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">9. Безопасность данных</h2>
            <p>
              Мы применяем технические и организационные меры для защиты персональных данных:
              шифрование данных при передаче (TLS), шифрование сообщений в базе данных (AES-256-GCM),
              разграничение прав доступа. Несмотря на принятые меры, мы не можем гарантировать
              абсолютную защиту от несанкционированного доступа.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">10. Изменения Политики</h2>
            <p>
              Мы вправе обновлять настоящую Политику. Актуальная версия всегда доступна по адресу{' '}
              <a href="/privacy" className="text-accent hover:opacity-80">ghostlineai.ru/privacy</a>.
              Продолжение использования Сервиса после публикации изменений означает ваше согласие
              с обновлённой Политикой.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">11. Контакты</h2>
            <p>
              По всем вопросам, связанным с обработкой персональных данных, обращайтесь:{' '}
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

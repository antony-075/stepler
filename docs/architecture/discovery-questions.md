EventDrop — Discovery Questions

Дата: 2026-09-29
Статус: закрыт — решения перенесены в `mvp-architecture-spec.md` и ADR 0004–0013

Часть 1. Блокируют bootstrap
Q1. Источник правды по scope

Ответ:

docs/product/PRODUCT.md является каноническим источником правды по продукту и scope.

Post-MVP функциональность не должна автоматически попадать в MVP.

BOOTSTRAP.md должен описывать только технический bootstrap и архитектурные решения, необходимые для MVP.

Пункты Folder, Billing, Retention, Analytics и Downloads/ZIP в MVP не реализуем.

Submission/Form Builder:

(a) обычная форма текстового вклада гостя.

Полноценный конструктор произвольных полей формы не входит в MVP и является post-MVP.

PRODUCT.md добавить в CLAUDE.md как обязательный документ для прочтения перед работой над продуктовой функциональностью.

Q2. Аутентификация admin
2.1. Способы входа

Ответ:

Magic Link на email;
Google OAuth.

Email + пароль в MVP не нужен.

Архитектура должна позволять добавить другие OAuth-провайдеры в будущем без переделки модели пользователя.

2.2. Регистрация

Ответ:

Открытая регистрация с жёсткими лимитами на аккаунт.

Не использовать allowlist.

Причина: продукт должен быть пригоден для публичного запуска и свободного тестирования пользователями.

Пока billing отсутствует, необходимо предусмотреть защиту инфраструктуры:

лимиты количества коллекций;
лимиты storage;
лимиты upload;
rate limiting;
abuse protection.

Точные лимиты должны быть конфигурационными.

Q3. Хостинг и CI/CD
3.1. Код и CI

Ответ:

GitHub + GitHub Actions.

3.2. Хостинг

Ответ:

Пока не фиксируем конкретного провайдера.

На этапе bootstrap:

Docker;
Docker Compose для локальной разработки;
production-ready Docker images;
CI для lint/typecheck/test/build.

CD не должен блокировать bootstrap.

Хостинг выбрать отдельным архитектурным решением после оценки стоимости, простоты эксплуатации и требований staging/production.

3.3. Регион

Ответ:

EU.

PostgreSQL и object storage должны по возможности размещаться в EU-регионе.

Архитектура не должна быть жёстко связана с конкретным cloud provider без необходимости.

3.4. Домен

Ответ:

Пока не фиксируем.

Домен будет подключён позже.

Q4. Языки интерфейса

Ответ:

Украинский + английский.

Язык по умолчанию:

украинский.

i18n закладываем сразу, даже если на первом этапе большая часть контента будет только на одном языке.

Не использовать hardcoded пользовательские строки в компонентах.

Часть 2. D1–D15
D1. Обработка медиа

Ответ:

(a) минимальный worker + PostgreSQL-backed queue / pg-boss.

MVP:

thumbnails для изображений;
poster/preview frame для видео.

Не делать полноценный video transcoding в MVP.

Обработка должна быть асинхронной.

Основной API не должен выполнять тяжёлую обработку медиа синхронно.

Архитектура должна позволять позже добавить:

transcoding;
compression;
дополнительные preview formats;
image optimization.
D2. Лимиты файлов и квота коллекции

Ответ:

фото: ≤ 50 MB;
видео: ≤ 2 GB;
документы: ≤ 50 MB;
квота коллекции: 10 GB;
максимум файлов в одной операции загрузки: 100.

Ограничение длительности видео в MVP не вводим.

Все лимиты должны быть конфигурационными.

При этом необходимо заложить возможность в будущем задавать разные лимиты в зависимости от тарифа/entitlement.

D3. Допустимые типы файлов

Ответ:

Оставляем предложенный список.

Фото
JPEG
PNG
WebP
HEIC
HEIF
GIF
Видео
MP4
MOV
WebM
Документы
PDF
DOCX
XLSX
PPTX
TXT
Запрещены
SVG
HTML
executable files
archives

Проверять необходимо не только extension, но и MIME/content signature там, где это технически возможно.

Нельзя доверять исключительно значению Content-Type, отправленному браузером.

D4. Воспроизведение видео

Ответ:

Ок.

MVP:

сохраняем оригинальный video file;
генерируем poster;
воспроизводим видео нативными возможностями браузера;
если браузер не поддерживает конкретный codec/container — предлагаем скачать оригинал.

Полноценный transcoding:

post-MVP.

Не пытаться решить все codec compatibility проблемы в MVP.

D5. Текстовый вклад

Ответ:

Ок.

Plain text:

максимум 5000 символов;
без Markdown;
без HTML;
без rich text.

Текст должен храниться как обычный текст, а при отображении экранироваться/рендериться безопасно.

Подпись гостя необязательна.

D6. Имя гостя

Ответ:

(b) необязательное поле «Как вас зовут?»

Гость может оставить имя пустым.

Если имя указано:

оно сохраняется вместе с submission/content metadata;
admin видит его;
оно не должно автоматически становиться публичным, если это не предусмотрено настройкой guest UI.

Не использовать имя как механизм идентификации или авторизации.

D7. Права гостевой ссылки

Ответ:

Ок.

Каждая guest link/capability имеет:

canUploadFiles;
canSubmitText;
canViewGallery;
canDeleteOwn.

Дополнительное правило:

хотя бы одно из canUploadFiles или canSubmitText должно быть включено для активной contribution-ссылки.

canViewGallery является отдельным permission.

В режиме без gallery guest не видит чужой контент.

В contribution-only режиме гость может видеть только собственные submissions, если это необходимо для UX удаления/контроля.

Права проверяются на backend при каждом защищённом запросе.

Изменение permissions действует на следующих запросах.

D8. Отзыв и ротация ссылок

Ответ:

Ок.

Дополнительную ссылку можно:

revoke;
deactivate.

Default link можно rotate.

При rotation:

создаётся новый token;
старый token немедленно становится недействительным;
старый QR больше не работает.

Уже открытая guest session не сохраняет доступ после revoke.

Следующий API request должен быть отклонён.

Активный upload через revoked capability:

upload может физически завершиться в storage;
но complete должен быть отклонён;
orphaned object должен попасть в cleanup flow.

Это должно быть предусмотрено архитектурой.

D9. Срок действия ссылок

Ответ:

В MVP ссылки бессрочные до revoke.

Expiration date/time не реализуем.

При этом модель данных должна позволять добавить:

expiresAt;
scheduled activation/deactivation.

Это post-MVP.

D10. Модерация

Ответ:

В MVP без pre-moderation.

Контент становится доступным сразу согласно permissions.

Admin может удалить его постфактум.

Риск:

в canViewGallery режиме потенциально неподобающий контент может быть виден другим гостям.

Это принимаем как ограничение MVP.

Архитектура должна позволять в будущем добавить:

pending;
approved;
rejected;
hidden;
moderation queue.
D11. Удаление и хранение

Ответ:

Удаление контента

При удалении:

контент немедленно становится недоступным пользователям;
DB record помечается как deleted;
физический объект в storage удаляется асинхронно;
cleanup job может безопасно повторяться.

Не полагаться на успешность storage deletion для мгновенного изменения пользовательского состояния.

Удаление коллекции

Необратимое удаление с подтверждением.

Все связанные guest links становятся недействительными.

Контент становится недоступным.

Физическое удаление storage выполняется асинхронно.

Архивирование

Архивная коллекция:

не доступна гостям;
guest links не работают;
admin продолжает видеть коллекцию и её содержимое.
Automatic retention

В MVP автоматического удаления старых коллекций нет.

Требование хранения: без ограничения по времени в MVP.

Retention policy — post-MVP.

D12. Удаление своего контента гостем

Ответ:

Использовать отдельную guest session.

При первом входе через guest link backend создаёт случайный криптографически безопасный guest-session token.

Token хранится в:

HttpOnly;
Secure;
подходящем SameSite

cookie.

Ownership guest submission связывается с этой session.

Не использовать для этой цели:

IP;
User-Agent;
browser fingerprint;
localStorage как единственный источник авторизации.

Гость может удалить собственный контент без ограничения по времени, пока collection/link/session permissions это позволяют.

Важно:

guest session не является полноценной учётной записью пользователя.

D13. Платежи в первом запуске

Ответ:

(a) не в первом запуске.

Первый публичный запуск:

бесплатный;
фиксированные лимиты;
без Stripe/LiqPay/MonoPay billing flow.

Однако architecture должна предусматривать будущие:

quotas;
entitlements;
plans;
payments;
refunds;
provider webhooks.

Не реализовывать billing заранее.

D14. Загрузка admin

Ответ:

Ок.

В MVP admin не загружает контент через admin UI.

Основной content contribution flow — guest-side.

Однако модель данных и storage architecture не должны искусственно запрещать admin uploads в будущем.

D15. Юридическое

Ответ:

Да, для публичного запуска нужны:

Terms of Service;
Privacy Policy.

Также нужен механизм запроса на удаление персональных данных.

Для MVP достаточно простой формы/канала запроса, не обязательно строить полноценный privacy management center.

Content complaints

Да, нужен базовый механизм жалобы на контент.

MVP:

guest может пожаловаться на конкретный content item;
backend создаёт complaint/report;
admin может увидеть жалобу;
admin может удалить контент.

Полноценная moderation system — post-MVP.

Privacy

Не хранить больше персональных данных, чем необходимо.

Guest name является optional.

Guest session должна быть технической сущностью, а не скрытым профилем пользователя.
---

# Часть 3. Уточнения по ответам

## F1. Лимиты на аккаунт

**Ответ:**

Ок, но значения должны быть конфигурационными и легко изменяемыми без миграции БД.

Начальные значения MVP:

* активных коллекций на аккаунт: **3**;
* суммарный storage на аккаунт: **20 GB**;
* запросов Magic Link: **5 в час на email**;
* запросов Magic Link: **20 в час на IP**;
* создание guest session: **30 в минуту на IP**;
* инициализация upload sessions: **300 в час на guest session**.

Также необходимо предусмотреть:

* rate limiting на API;
* защиту от массового создания коллекций;
* защиту от массовых upload initialization requests;
* лимиты на размер каждого upload;
* лимиты на количество одновременно активных upload sessions;
* возможность временно заблокировать account.

Важно:

лимит `20 GB` на аккаунт должен считаться по фактически используемому storage, а не только по сумме логических размеров файлов.

Значения не должны быть hardcoded в бизнес-логике.

---

## F2. Кто видит жалобы на контент

**Ответ:**

Ок по архитектуре, но не фиксируем заранее юридическую квалификацию EventDrop по DSA.

Нужен отдельный abuse/reporting flow, позволяющий оператору сервиса получать и обрабатывать жалобы на потенциально незаконный контент.

В MVP:

* жалобу может создать любой пользователь, имеющий доступ к соответствующему content item;
* complaint содержит:

  * content ID;
  * collection ID;
  * причину;
  * optional description;
  * timestamp;
  * технические данные, необходимые для расследования;
* жалобу видит admin коллекции;
* жалобу также должен иметь возможность увидеть оператор платформы;
* оператор может:

  * удалить/скрыть контент;
  * заблокировать collection;
  * заблокировать account;
  * оставить контент доступным;
  * изменить статус complaint.

Отдельную admin-панель для оператора в MVP не строим.

Оператор определяется через конфигурацию приложения, например список разрешённых operator email.

При этом архитектура должна позволять в будущем сделать полноценную internal moderation/admin panel.

Также нужен публичный abuse/contact канал, указанный в юридических документах.

Для публичного запуска желательно отдельно проверить у юриста применимость конкретных требований DSA к EventDrop с учётом страны установления, размера сервиса и фактической модели распространения пользовательского контента. DSA предусматривает notice-and-action механизм для сообщений о незаконном контенте, а требования пропорциональны роли и размеру сервиса.

---

## F3. Ссылки «только просмотр»

**Ответ:**

**(a) да.**

В MVP разрешаем view-only links.

Для такой ссылки достаточно:

`canViewGallery = true`

при:

`canUploadFiles = false`

`canSubmitText = false`

`canDeleteOwn = false`

Это важный сценарий после завершения мероприятия:

> собрать контент → обработать коллекцию → поделиться готовой галереей.

Такая ссылка должна работать как полноценная guest capability.

Admin может:

* создать её;
* изменить её permissions, если это разрешено моделью;
* deactivate;
* revoke.

---

## F4. Deactivate и revoke

**Ответ:**

Ок.

Разделяем два состояния:

### Deactivate

Обратимая пауза.

* token сохраняется;
* QR продолжает ссылаться на тот же token;
* guest access временно блокируется;
* admin может снова активировать ссылку.

### Revoke

Необратимое отключение конкретного token.

* token навсегда недействителен;
* повторно активировать его нельзя;
* для продолжения использования создаётся новая ссылка.

### Default link

Default link:

* можно deactivate;
* можно rotate;
* нельзя окончательно revoke без создания replacement link.

При rotation:

```text
old token → revoked
new token → active
```

Старый QR после rotation больше не работает.

---

## F5. Владение контентом после rotation

**Ответ:**

**Ок.**

Guest session принадлежит **collection**, а не конкретной guest link.

Guest link является capability, через которую session получает доступ к collection.

Следовательно:

```text
Guest Session
      ↓
Collection
      ↑
Guest Link / Capability
```

Если пользователь уже имеет валидную guest session и открывает новую действующую ссылку той же коллекции:

* его guest session сохраняется;
* ownership его предыдущего контента сохраняется;
* permissions применяются согласно новой ссылке.

При этом guest session **не должна автоматически получать более широкие права**, чем разрешает новая capability.

Например:

```text
Старая ссылка:
canUploadFiles = true
canDeleteOwn = true

Новая ссылка:
canUploadFiles = false
canDeleteOwn = false
canViewGallery = true
```

После перехода на новую ссылку пользователь не должен продолжать пользоваться upload/delete permissions старой ссылки.

Permissions должны определяться текущим authorization context.

---

## F6. Запрос на удаление персональных данных

**Ответ:**

**(a) email-канал для MVP.**

В Privacy Policy указывается официальный privacy/contact email.

Пользователь может отправить запрос на:

* удаление персональных данных;
* уточнение данных;
* иные privacy-related requests.

В MVP обработка выполняется вручную оператором.

Не строим отдельный privacy request management system.

При этом в архитектуре желательно иметь возможность определить связанные с запросом данные:

* admin account;
* guest session;
* guest submissions;
* guest name;
* technical metadata.

Не хранить данные дольше, чем необходимо для работы продукта и выполнения юридических обязательств.

---

## F7. Bot protection

**Ответ:**

**Ок.**

Используем Cloudflare Turnstile как опциональный механизм защиты.

Обязательный Turnstile:

* на Magic Link request;
* при необходимости на регистрацию;
* при обнаружении подозрительной активности.

На guest upload flow **по умолчанию не включаем**, чтобы не создавать лишнего friction.

Но архитектура должна позволять включить challenge для guest-side при необходимости.

Важно:

Turnstile является допустимым исключением из общего правила:

> сторонние сервисы подключаются через backend, если нет требования browser-side integration.

То есть:

```text
Browser
   ↓
Turnstile
   ↓ token
Backend
   ↓
Cloudflare verification API
```

Backend обязан проверять token.

Нельзя считать факт наличия client-side Turnstile успешной проверкой.

---

## F8. Согласие с условиями

**Ответ:**

Ок, с небольшим уточнением.

### Admin

При регистрации admin:

* принимает Terms of Service;
* принимает Privacy Policy;
* сохраняем:

  * document version;
  * timestamp;
  * user ID;
  * при необходимости IP/technical metadata в пределах юридически обоснованной необходимости.

Если документы обновляются, не заставлять автоматически всех существующих пользователей повторно соглашаться без отдельного product/legal решения.

### Guest

Не делать обязательный checkbox в MVP.

На guest page отображать короткое уведомление со ссылками на:

* Terms of Service;
* Privacy Policy.

Например:

> By uploading content, you agree to our Terms and acknowledge our Privacy Policy.

Для украинской версии — соответствующий украинский текст.

При этом юридические тексты должны предоставляться владельцем продукта/юристом.

Разработка отвечает за:

* отображение;
* versioning;
* ссылки;
* доступность документов.

Разработка не должна самостоятельно придумывать юридические формулировки.

---

# Итог

После F1–F8 discovery для bootstrap можно считать закрытым.

### Зафиксировано

**Product**

* MVP scope;
* guest/admin roles;
* collections;
* guest links;
* permissions;
* uploads;
* text;
* guest name;
* gallery;
* QR;
* deletion;
* reporting;
* responsive/i18n.

**Authentication**

* Magic Link;
* Google OAuth;
* open registration;
* configurable limits.

**Storage**

* 10 GB/collection;
* 20 GB/account;
* R2/S3-compatible abstraction;
* signed upload;
* async deletion;
* thumbnails/posters.

**Media**

* images;
* videos;
* documents;
* text;
* no transcoding in MVP.

**Security**

* backend authorization;
* guest sessions;
* capability links;
* revoke/rotate;
* rate limits;
* abuse protection;
* optional Turnstile.

**Infrastructure**

* GitHub;
* GitHub Actions;
* Docker;
* Docker Compose;
* staging;
* production;
* EU region;
* provider still open.

**Legal**

* Terms;
* Privacy Policy;
* privacy requests;
* content reporting;
* operator abuse flow.

**Payments**

* отсутствуют в MVP;
* архитектурная готовность к billing сохраняется.

---

# Что остаётся открытым

Эти вещи уже **не должны блокировать bootstrap**:

1. Конкретный cloud provider.
2. Email provider.
3. Конкретная auth implementation.
4. Production deployment architecture.
5. Финальные публичные тарифы.
6. Billing provider.
7. Transcoding provider.
8. Финальная юридическая проверка ToS/Privacy/DSA/GDPR.
9. Финальные тексты интерфейса.

Claude должен **не додумывать эти решения молча**, а фиксировать их как open decisions или предлагать варианты.

После этого можно переходить к архитектурному bootstrap.


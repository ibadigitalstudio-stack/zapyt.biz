// Тексти сторінок «Політика конфіденційності» та «Правила користування» двома мовами.
// Це шаблон: перед запуском його має перевірити юрист, а в розділі контактів — стояти дані власника сайту.
const PAGES = {
  uk: {
    privacy: {
      title: 'Політика конфіденційності',
      updated: 'Оновлено 14 жовтня 2026 р.',
      html: `
        <h2>1. Хто обробляє дані</h2>
        <p>Сайт zapyt.biz (далі — «платформа») обробляє персональні дані користувачів, щоб вони могли публікувати запити та надсилати на них пропозиції. Із питань щодо даних пишіть на <a href="mailto:info@zapyt.biz">info@zapyt.biz</a>.</p>
        <h2>2. Які дані ми збираємо</h2>
        <ul>
          <li><b>Дані з Telegram</b> під час входу: ідентифікатор акаунта, нік, ім’я та фото профілю.</li>
          <li><b>Номер телефону</b> — лише для SMS-підтвердження під час реєстрації. Номер не публікується, не показується іншим користувачам і не використовується для реклами.</li>
          <li><b>Те, що ви публікуєте:</b> запити, фото, пропозиції на запити інших користувачів.</li>
          <li><b>Технічні дані:</b> файл cookie сесії, а також вибрані мова й тема, які зберігаються у вашому браузері.</li>
        </ul>
        <h2>3. Навіщо ми їх використовуємо</h2>
        <ul>
          <li>щоб створити акаунт і впізнавати вас під час входу;</li>
          <li>щоб підтвердити, що акаунт належить реальній людині, і захистити платформу від шахрайства та спаму;</li>
          <li>щоб показувати ваші запити й передавати ваші пропозиції авторам запитів;</li>
          <li>щоб надсилати сповіщення про нові пропозиції в Telegram, якщо ви запустили нашого бота.</li>
        </ul>
        <h2>4. Що бачать інші користувачі</h2>
        <p>У запиті видно ваше ім’я, фото профілю та текст запиту. Ваш нік у Telegram бачать лише зареєстровані користувачі з підтвердженим номером. Автор запиту бачить вашу пропозицію і ваш нік. Ваші коментарі разом з ім’ям і фото профілю бачать усі відвідувачі. Номер телефону не бачить ніхто з користувачів.</p>
        <h2>5. Кому ми передаємо дані</h2>
        <p>Ми не продаємо персональні дані. Вони передаються лише сервісам, без яких платформа не працює: Telegram (вхід і сповіщення), оператору SMS-розсилки (надсилання коду) та хостинг-провайдеру (зберігання даних).</p>
        <h2>6. Скільки зберігаються дані</h2>
        <p>Дані зберігаються, доки існує ваш акаунт. Після видалення запиту його текст і фото видаляються. Код із SMS діє 10 хвилин і зберігається лише в зашифрованому вигляді.</p>
        <h2>7. Ваші права</h2>
        <p>Ви можете отримати копію своїх даних, виправити їх, обмежити обробку або повністю видалити акаунт — для цього напишіть нам. Користувачі з ЄС мають права, передбачені Загальним регламентом про захист даних (GDPR), зокрема право подати скаргу до наглядового органу.</p>
        <h2>8. Файли cookie</h2>
        <p>Платформа використовує один обов’язковий файл cookie — для збереження сесії після входу. Рекламних і аналітичних cookie немає.</p>
        <h2>9. Зміни</h2>
        <p>Якщо політика зміниться, ми оновимо дату вгорі цієї сторінки.</p>`,
    },
    terms: {
      title: 'Правила користування',
      updated: 'Оновлено 14 жовтня 2026 р.',
      html: `
        <h2>1. Загальні положення</h2>
        <p>zapyt.biz — це платформа, де користувачі публікують запити про те, що шукають, а інші користувачі надсилають їм свої пропозиції. Платформа не є стороною угод між користувачами й не продає товари чи послуги від свого імені. Користуючись сайтом, ви погоджуєтеся з цими правилами.</p>
        <h2>2. Реєстрація</h2>
        <ul>
          <li>Публікувати запити й надсилати пропозиції можуть лише зареєстровані користувачі віком від 18 років.</li>
          <li>Реєстрація відбувається через Telegram і підтверджується кодом із SMS.</li>
          <li>Одна людина — один акаунт. Один номер телефону можна прив’язати лише до одного акаунта.</li>
        </ul>
        <h2>3. Дозволені категорії</h2>
        <p>Користувачі публікують запити про те, що вони шукають, а інші користувачі надсилають на них свої пропозиції. Запити приймаються лише в п’яти категоріях — Авто/мото, Нерухомість, Допомога, Робота, Знайомства — та в їхніх підкатегоріях, перелік яких наведено на <a href="#/sitemap">карті сайту</a>.</p>
        <h2>4. Контакти</h2>
        <p>Єдиний спосіб зв’язку між користувачами — Telegram. Вказувати номери телефонів у заголовку, описі запиту чи в пропозиції заборонено: такі тексти автоматично відхиляються.</p>
        <h2>5. Що заборонено</h2>
        <ul>
          <li>неправдиві, оманливі запити та шахрайство;</li>
          <li>товари й послуги, заборонені законом України або Польщі;</li>
          <li>спам, однакові запити та публікація не у своїй категорії;</li>
          <li>чужі фото й тексти без дозволу власника;</li>
          <li>образи, погрози, дискримінація;</li>
          <li>у розділі «Знайомства» — відверті матеріали, платні інтимні послуги та анкети неповнолітніх;</li>
          <li>у розділі «Допомога» — вимагати оплату за допомогу, запропоновану безкоштовно.</li>
        </ul>
        <h2>6. Пропозиції на запити</h2>
        <p>На один запит можна надіслати одну пропозицію. Пропозицію бачить тільки автор запиту. Лайкати запити й залишати коментарі можуть лише зареєстровані користувачі; коментарі бачать усі відвідувачі, тому в них теж не можна вказувати номери телефонів. Подальше спілкування відбувається в Telegram.</p>
        <h2>7. Платні пакети</h2>
        <p>Базове розміщення запитів безкоштовне. Умови платних пакетів описані на сторінці <a href="#/pricing">«Тарифи»</a>.</p>
        <h2>8. Модерація</h2>
        <p>Адміністрація може закрити або видалити запит, що порушує правила, і заблокувати акаунт порушника без попередження.</p>
        <h2>9. Відповідальність</h2>
        <p>За зміст запиту відповідає його автор. Платформа не гарантує якість товарів і послуг та не відповідає за дії користувачів. Будьте обережні: не надсилайте передоплату незнайомим людям і зустрічайтеся в людних місцях.</p>
        <h2>10. Зв’язок з нами</h2>
        <p>Скарги та питання надсилайте на <a href="mailto:info@zapyt.biz">info@zapyt.biz</a>.</p>`,
    },
  },

  pl: {
    privacy: {
      title: 'Polityka prywatności',
      updated: 'Aktualizacja: 14 października 2026 r.',
      html: `
        <h2>1. Kto przetwarza dane</h2>
        <p>Serwis zapyt.biz (dalej „platforma”) przetwarza dane osobowe użytkowników, aby mogli publikować zapytania i wysyłać na nie oferty. W sprawach dotyczących danych napisz na <a href="mailto:info@zapyt.biz">info@zapyt.biz</a>.</p>
        <h2>2. Jakie dane zbieramy</h2>
        <ul>
          <li><b>Dane z Telegrama</b> podczas logowania: identyfikator konta, nick, imię i zdjęcie profilowe.</li>
          <li><b>Numer telefonu</b> — wyłącznie do potwierdzenia SMS przy rejestracji. Numer nie jest publikowany, nie widzą go inni użytkownicy i nie służy do reklamy.</li>
          <li><b>To, co publikujesz:</b> zapytania, zdjęcia, oferty na zapytania innych użytkowników.</li>
          <li><b>Dane techniczne:</b> plik cookie sesji oraz wybrany język i motyw zapisane w Twojej przeglądarce.</li>
        </ul>
        <h2>3. Po co ich używamy</h2>
        <ul>
          <li>aby założyć konto i rozpoznawać Cię przy logowaniu;</li>
          <li>aby potwierdzić, że konto należy do prawdziwej osoby, i chronić platformę przed oszustwami i spamem;</li>
          <li>aby wyświetlać Twoje zapytania i przekazywać Twoje oferty autorom zapytań;</li>
          <li>aby wysyłać powiadomienia o nowych ofertach na Telegramie, jeśli uruchomisz naszego bota.</li>
        </ul>
        <h2>4. Co widzą inni użytkownicy</h2>
        <p>W zapytaniu widać Twoje imię, zdjęcie profilowe i treść zapytania. Twój nick na Telegramie widzą tylko zarejestrowani użytkownicy z potwierdzonym numerem. Autor zapytania widzi Twoją ofertę i Twój nick. Twoje komentarze wraz z imieniem i zdjęciem profilowym widzą wszyscy odwiedzający. Numeru telefonu nie widzi żaden użytkownik.</p>
        <h2>5. Komu przekazujemy dane</h2>
        <p>Nie sprzedajemy danych osobowych. Trafiają one tylko do usług, bez których platforma nie działa: Telegram (logowanie i powiadomienia), operator wysyłki SMS (wysłanie kodu) oraz dostawca hostingu (przechowywanie danych).</p>
        <h2>6. Jak długo przechowujemy dane</h2>
        <p>Dane przechowujemy tak długo, jak istnieje Twoje konto. Po usunięciu zapytania jego treść i zdjęcia są usuwane. Kod z SMS jest ważny 10 minut i przechowywany wyłącznie w postaci zaszyfrowanej.</p>
        <h2>7. Twoje prawa</h2>
        <p>Możesz otrzymać kopię swoich danych, poprawić je, ograniczyć przetwarzanie albo całkowicie usunąć konto — napisz do nas. Użytkownikom z UE przysługują prawa wynikające z RODO, w tym prawo wniesienia skargi do organu nadzorczego.</p>
        <h2>8. Pliki cookie</h2>
        <p>Platforma używa jednego niezbędnego pliku cookie — do utrzymania sesji po zalogowaniu. Nie ma cookie reklamowych ani analitycznych.</p>
        <h2>9. Zmiany</h2>
        <p>Jeśli polityka się zmieni, zaktualizujemy datę na górze tej strony.</p>`,
    },
    terms: {
      title: 'Regulamin',
      updated: 'Aktualizacja: 14 października 2026 r.',
      html: `
        <h2>1. Postanowienia ogólne</h2>
        <p>zapyt.biz to platforma, na której użytkownicy publikują zapytania o to, czego szukają, a inni użytkownicy wysyłają im swoje oferty. Platforma nie jest stroną umów między użytkownikami i nie sprzedaje towarów ani usług we własnym imieniu. Korzystając z serwisu, akceptujesz ten regulamin.</p>
        <h2>2. Rejestracja</h2>
        <ul>
          <li>Publikować zapytania i wysyłać oferty mogą tylko zarejestrowani użytkownicy, którzy ukończyli 18 lat.</li>
          <li>Rejestracja odbywa się przez Telegram i jest potwierdzana kodem SMS.</li>
          <li>Jedna osoba — jedno konto. Jeden numer telefonu można przypisać tylko do jednego konta.</li>
        </ul>
        <h2>3. Dozwolone kategorie</h2>
        <p>Użytkownicy publikują zapytania o to, czego szukają, a inni użytkownicy wysyłają im swoje oferty. Zapytania przyjmujemy tylko w pięciu kategoriach — Auto/moto, Nieruchomości, Pomoc, Praca, Znajomości — oraz w ich podkategoriach, których listę zawiera <a href="#/sitemap">mapa strony</a>.</p>
        <h2>4. Kontakt</h2>
        <p>Jedynym sposobem kontaktu między użytkownikami jest Telegram. Podawanie numerów telefonów w tytule, opisie zapytania lub w ofercie jest zabronione: takie treści są automatycznie odrzucane.</p>
        <h2>5. Czego nie wolno</h2>
        <ul>
          <li>publikować nieprawdziwych lub wprowadzających w błąd zapytań ani oszukiwać;</li>
          <li>oferować towarów i usług zakazanych przez prawo Ukrainy lub Polski;</li>
          <li>spamować, powielać zapytań i publikować w niewłaściwej kategorii;</li>
          <li>używać cudzych zdjęć i tekstów bez zgody właściciela;</li>
          <li>obrażać, grozić, dyskryminować;</li>
          <li>w dziale „Znajomości” — publikować treści erotycznych, płatnych usług intymnych i profili osób niepełnoletnich;</li>
          <li>w dziale „Pomoc” — żądać zapłaty za pomoc zaoferowaną bezpłatnie.</li>
        </ul>
        <h2>6. Oferty na zapytania</h2>
        <p>Na jedno zapytanie można wysłać jedną ofertę. Ofertę widzi tylko autor zapytania. Polubienia i komentarze mogą dodawać tylko zarejestrowani użytkownicy; komentarze widzą wszyscy odwiedzający, dlatego w nich również nie wolno podawać numerów telefonów. Dalsza rozmowa odbywa się na Telegramie.</p>
        <h2>7. Płatne pakiety</h2>
        <p>Podstawowe dodawanie zapytań jest bezpłatne. Warunki płatnych pakietów opisuje strona <a href="#/pricing">„Cennik”</a>.</p>
        <h2>8. Moderacja</h2>
        <p>Administracja może zamknąć lub usunąć zapytanie naruszające regulamin i zablokować konto bez uprzedzenia.</p>
        <h2>9. Odpowiedzialność</h2>
        <p>Za treść zapytania odpowiada jego autor. Platforma nie gwarantuje jakości towarów i usług i nie odpowiada za działania użytkowników. Zachowaj ostrożność: nie wysyłaj przedpłat nieznajomym i spotykaj się w miejscach publicznych.</p>
        <h2>10. Kontakt z nami</h2>
        <p>Skargi i pytania wysyłaj na <a href="mailto:info@zapyt.biz">info@zapyt.biz</a>.</p>`,
    },
  },
};

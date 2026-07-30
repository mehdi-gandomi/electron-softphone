import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Locale = 'fa' | 'en'

type Dict = Record<string, string>

const fa: Dict = {
  // App
  'app.notConnected': 'اتصال برقرار نیست. یک حساب SIP در تنظیمات اضافه کنید.',

  // Shell / brand
  'shell.brand': 'امدادفون',
  'shell.tagline': 'کنسول ارتباطی مرکز پاسخگویی',
  'shell.themeLight': 'تم روشن هلال احمر',
  'shell.themeDark': 'تم تیره اضطراری',
  'shell.alwaysOnTop': 'همیشه رو',
  'shell.extension': 'داخلی {ext}',
  'shell.noSipAccount': 'حساب SIP تنظیم نشده',
  'shell.ready': 'آماده',

  // Nav
  'nav.dialpad': 'شماره‌گیر',
  'nav.contacts': 'مخاطبین',
  'nav.history': 'سوابق',
  'nav.settings': 'تنظیمات',
  'nav.autofill': 'فرم',

  // Status bar
  'status.defaultDevice': 'پیش‌فرض سیستم',
  'status.headset': 'هدست — {name}',
  'status.activeCalls': '{count} تماس',
  'status.online': 'آنلاین',
  'status.connecting': 'اتصال…',
  'status.offline': 'آفلاین',
  'status.connectingDetail': 'در حال اتصال به سرور SIP…',
  'status.offlineDetail': 'اتصال SIP برقرار نیست. آدرس سرور، پورت و فایروال را بررسی کنید.',
  'status.clickForDetails': 'برای مشاهده جزئیات کلیک کنید',
  'status.sipConnected': 'SIP متصل است',
  'status.volume': 'بلندی صدا',
  'status.mic': 'میکروفون',
  'status.errorTitle': 'جزئیات وضعیت',
  'status.close': 'بستن',
  'status.gotIt': 'متوجه شدم',

  // Dialpad
  'dialpad.placeholder': 'شماره را وارد کنید',
  'dialpad.clear': 'پاک کردن',
  'dialpad.backspace': 'پاک کردن رقم',
  'dialpad.call': 'برقراری تماس',
  'dialpad.registerFirst': 'ابتدا در سرور SIP ثبت شوید',
  'dialpad.callFailed': 'برقراری تماس ناموفق بود',

  // Phone tabs
  'phone.dialpad': 'شماره‌گیر',
  'phone.recent': 'تماس‌های اخیر',

  // Active call
  'call.activeTitle': 'تماس فعال اضطراری',
  'call.onHold': 'در انتظار · {duration}',
  'call.calling': 'در حال تماس…',
  'call.ringing': 'زنگ می‌خورد…',
  'call.connecting': 'در حال اتصال…',
  'call.transferring': 'در حال انتقال…',
  'call.transferringWithMsg': 'در حال انتقال… {message}',
  'call.transferFailed': 'انتقال ناموفق بود',
  'call.transferComplete': 'انتقال انجام شد',
  'call.transferPlaceholder': 'شماره مقصد انتقال…',
  'call.transfer': 'انتقال',
  'call.cancel': 'انصراف',
  'call.mute': 'بی‌صدا',
  'call.hold': 'انتظار',
  'call.keypad': 'صفحه‌کلید',
  'call.hangup': 'قطع تماس',

  // Incoming
  'incoming.channel': 'CH-1 · SIP',
  'incoming.title': 'تماس ورودی اضطراری',
  'incoming.identified': 'تماس‌گیرنده شناسایی شد · داخلی {ext}',
  'incoming.answer': 'پاسخ',
  'incoming.reject': 'رد تماس',

  // Contacts
  'contacts.title': 'مخاطبین',
  'contacts.add': '+ افزودن',
  'contacts.call': 'تماس',
  'contacts.search': 'جستجوی مخاطبین…',
  'contacts.empty': 'هنوز مخاطبی ندارید',
  'contacts.notFound': 'مخاطبی یافت نشد',

  // Contact form
  'contactForm.edit': 'ویرایش مخاطب',
  'contactForm.new': 'مخاطب جدید',
  'contactForm.name': 'نام *',
  'contactForm.namePlaceholder': 'علی رضایی',
  'contactForm.number': 'شماره *',
  'contactForm.numberPlaceholder': '1001',
  'contactForm.email': 'ایمیل',
  'contactForm.emailPlaceholder': 'ali@company.com',
  'contactForm.company': 'شرکت',
  'contactForm.companyPlaceholder': 'نام شرکت',
  'contactForm.notes': 'یادداشت',
  'contactForm.notesPlaceholder': 'یادداشت‌های بیشتر…',
  'contactForm.cancel': 'انصراف',
  'contactForm.save': 'ذخیره',
  'contactForm.add': 'افزودن مخاطب',

  // History
  'history.title': 'تماس‌های اخیر',
  'history.clearAll': 'حذف همه',
  'history.all': 'همه',
  'history.missed': 'بی‌پاسخ',
  'history.dialed': 'گرفته‌شده',
  'history.received': 'دریافتی',
  'history.empty': 'هنوز تماسی ثبت نشده است',
  'history.missedBadge': 'بی‌پاسخ',

  // Autofill
  'autofill.title': 'فرم تماس',
  'autofill.autoFilled': 'پر شده از تماس',
  'autofill.callInfo': 'اطلاعات تماس',
  'autofill.callerId': 'شناسه تماس‌گیرنده',
  'autofill.extension': 'داخلی',
  'autofill.callerName': 'نام تماس‌گیرنده',
  'autofill.timestamp': 'زمان',
  'autofill.autoPlaceholder': 'خودکار',
  'autofill.ticketDetails': 'جزئیات تیکت',
  'autofill.department': 'بخش',
  'autofill.selectDepartment': 'انتخاب بخش…',
  'autofill.dept.sales': 'فروش',
  'autofill.dept.support': 'پشتیبانی',
  'autofill.dept.billing': 'مالی',
  'autofill.dept.technical': 'فنی',
  'autofill.dept.hr': 'منابع انسانی',
  'autofill.reason': 'دلیل تماس',
  'autofill.selectReason': 'انتخاب دلیل…',
  'autofill.reason.inquiry': 'پرسش عمومی',
  'autofill.reason.complaint': 'شکایت',
  'autofill.reason.support': 'پشتیبانی فنی',
  'autofill.reason.followup': 'پیگیری',
  'autofill.reason.other': 'سایر',
  'autofill.priority': 'اولویت',
  'autofill.priority.low': 'کم',
  'autofill.priority.normal': 'عادی',
  'autofill.priority.high': 'بالا',
  'autofill.priority.urgent': 'فوری',
  'autofill.status': 'وضعیت',
  'autofill.status.new': 'جدید',
  'autofill.status.inProgress': 'در حال انجام',
  'autofill.status.resolved': 'حل‌شده',
  'autofill.status.pending': 'در انتظار',
  'autofill.notes': 'یادداشت',
  'autofill.notesPlaceholder': 'یادداشت‌های بیشتر درباره این تماس…',
  'autofill.cancel': 'انصراف',
  'autofill.submit': 'ارسال فرم',

  // Debug
  'debug.title': 'لاگ اشکال‌زدایی',
  'debug.subtitle': 'پیام‌ها و خطاهای SIP برای ثبت و تماس‌ها',
  'debug.reconnect': 'اتصال مجدد',
  'debug.copy': 'کپی',
  'debug.copied': 'کپی شد',
  'debug.save': 'ذخیره…',
  'debug.openFolder': 'باز کردن پوشه',
  'debug.clear': 'پاک کردن',
  'debug.refresh': 'بازخوانی',
  'debug.copyFailed': 'کپی ناموفق بود',
  'debug.saved': 'ذخیره شد: {path}',
  'debug.autoLog': 'لاگ خودکار (با فعال بودن لاگ اشکال‌زدایی):',
  'debug.registration': 'ثبت: {status}',
  'debug.errorsInLog': '{count} خطا در لاگ',
  'debug.filter.all': 'همه',
  'debug.filter.sent': 'ارسال',
  'debug.filter.recv': 'دریافت',
  'debug.filter.error': 'خطا',
  'debug.filter.info': 'اطلاعات',
  'debug.autoRefresh': 'بازخوانی خودکار',
  'debug.entries': '{count} مورد',
  'debug.empty': 'هنوز فعالیت SIP نیست. حساب را ذخیره کنید و اتصال مجدد بزنید — خطاها اینجا ظاهر می‌شوند.',
  'debug.noMatch': 'موردی با این فیلتر نیست',
  'debug.hideRaw': 'مخفی کردن خام',
  'debug.showRaw': 'نمایش پیام خام SIP',
  'debug.reconnectFailed': 'اتصال مجدد ناموفق بود',

  // Settings
  'settings.title': 'تنظیمات',
  'settings.loading': 'در حال بارگذاری…',
  'settings.tab.account': 'حساب',
  'settings.tab.audio': 'صدا',
  'settings.tab.advanced': 'پیشرفته',
  'settings.tab.api': 'API',
  'settings.tab.debug': 'اشکال‌زدایی',

  'settings.account.active': 'فعال',
  'settings.account.register': 'ثبت',
  'settings.account.unregister': 'لغو ثبت',
  'settings.account.edit': 'ویرایش',
  'settings.account.delete': 'حذف',
  'settings.account.add': '+ افزودن حساب',
  'settings.account.editTitle': 'ویرایش حساب',
  'settings.account.newTitle': 'حساب جدید',
  'settings.account.displayName': 'نام نمایشی',
  'settings.account.displayNamePlaceholder': 'علی رضایی',
  'settings.account.username': 'داخلی / نام کاربری *',
  'settings.account.usernamePlaceholder': '1001',
  'settings.account.authUser': 'کاربر احراز هویت',
  'settings.account.authUserPlaceholder': 'همان نام کاربری',
  'settings.account.password': 'رمز عبور *',
  'settings.account.passwordPlaceholder': 'رمز عبور',
  'settings.account.sipServer': 'سرور SIP *',
  'settings.account.sipServerPlaceholder': '192.168.1.100',
  'settings.account.domain': 'دامنه',
  'settings.account.optional': 'اختیاری',
  'settings.account.sipProxy': 'پروکسی SIP',
  'settings.account.transport': 'پروتکل',
  'settings.account.port': 'پورت سرور SIP',
  'settings.account.expiry': 'مدت ثبت (ثانیه)',
  'settings.account.cancel': 'انصراف',
  'settings.account.save': 'ذخیره',

  'settings.audio.devices': 'دستگاه‌ها',
  'settings.audio.input': 'ورودی (میکروفون)',
  'settings.audio.output': 'خروجی (بلندگو)',
  'settings.audio.systemDefault': 'پیش‌فرض سیستم',
  'settings.audio.volume': 'بلندی صدا',
  'settings.audio.mic': 'میکروفون',
  'settings.audio.speaker': 'بلندگو',
  'settings.audio.ringtone': 'زنگ',
  'settings.audio.ringtoneSection': 'زنگ تماس',
  'settings.audio.ringtoneHelp': 'یک زنگ داخلی انتخاب کنید یا فایل MP3 / WAV / OGG / M4A بارگذاری کنید.',
  'settings.audio.builtin': 'داخلی',
  'settings.audio.customFile': 'فایل سفارشی',
  'settings.audio.classicBeep': 'بوق کلاسیک',
  'settings.audio.upload': 'بارگذاری…',
  'settings.audio.preview': 'پیش‌نمایش',
  'settings.audio.stop': 'توقف',
  'settings.audio.imported': 'وارد شد: {name}',
  'settings.audio.playingClassic': 'در حال پخش بوق کلاسیک…',
  'settings.audio.playing': 'در حال پخش…',
  'settings.audio.previewFailed': 'پیش‌نمایش ناموفق',
  'settings.audio.noFile': 'فایل زنگ یافت نشد',
  'settings.audio.loadFailed': 'بارگذاری زنگ ممکن نیست',

  'settings.advanced.theme': 'ظاهر / تم هلال احمر',
  'settings.advanced.themeHelp': 'تم پیش‌فرض: کنسول اضطراری تیره هلال احمر. می‌توانید بین تم تیره و روشن جابه‌جا شوید.',
  'settings.advanced.themeDark': 'تیره اضطراری',
  'settings.advanced.themeDarkSub': 'کنسول پاسخگویی',
  'settings.advanced.themeLight': 'روشن هلال',
  'settings.advanced.themeLightSub': 'روز / اداری',
  'settings.advanced.language': 'زبان / Language',
  'settings.advanced.languageHelp': 'زبان رابط کاربری را انتخاب کنید.',
  'settings.advanced.langFa': 'فارسی',
  'settings.advanced.langEn': 'English',
  'settings.advanced.behavior': 'رفتار',
  'settings.advanced.dnd': 'فعال‌سازی مزاحم نشوید (DND)',
  'settings.advanced.autoAnswer': 'پاسخ خودکار',
  'settings.advanced.minimizeTray': 'حداقل‌سازی به سینی',
  'settings.advanced.debugLogging': 'فعال‌سازی لاگ اشکال‌زدایی SIP',
  'settings.advanced.debugHelp': 'با فعال بودن، تب اشکال‌زدایی ترافیک REGISTER / INVITE را نشان می‌دهد و لاگ‌ها در فایل روزانه ذخیره می‌شوند.',
  'settings.advanced.forwarding': 'انتقال تماس',
  'settings.advanced.enableForward': 'فعال‌سازی انتقال تماس',
  'settings.advanced.forwardPlaceholder': 'شماره مقصد انتقال',
  'settings.advanced.developer': 'حالت توسعه‌دهنده',
  'settings.advanced.developerHelp': 'با وارد کردن کلید، تب‌های API و اشکال‌زدایی نمایش داده می‌شوند و می‌توانید مقادیر یکپارچه‌سازی را تغییر دهید.',
  'settings.advanced.devKey': 'کلید توسعه‌دهنده',
  'settings.advanced.devKeyPlaceholder': 'کلید را وارد کنید',
  'settings.advanced.devUnlock': 'باز کردن',
  'settings.advanced.devLock': 'قفل کردن',
  'settings.advanced.devKeyInvalid': 'کلید نامعتبر است',
  'settings.advanced.devUnlocked': 'حالت توسعه‌دهنده فعال است',
  'settings.advanced.devReset': 'بازنشانی به پیش‌فرض ساخت',
  'settings.advanced.devResetting': 'در حال بازنشانی…',
  'settings.advanced.devOverridesActive': 'مقادیر ذخیره‌شده شما به‌جای config/build.json استفاده می‌شوند.',

  'settings.api.webhook': 'یکپارچه‌سازی وب‌هوک',
  'settings.api.enable': 'فعال‌سازی یکپارچه‌سازی API',
  'settings.api.webhookUrl': 'آدرس وب‌هوک',
  'settings.api.webhookPlaceholder': 'https://api.example.com/webhook',
  'settings.api.apiKey': 'کلید API (Bearer Token)',
  'settings.api.events': 'رویدادها',
  'settings.api.eventIncoming': 'تماس ورودی',
  'settings.api.eventAnswered': 'پاسخ داده شد',
  'settings.api.eventEnded': 'پایان تماس',
  'settings.api.eventMissed': 'بی‌پاسخ',
  'settings.api.autofill': 'فیلدهای تکمیل خودکار',
  'settings.api.autofillHelp': 'فیلدهای موجود در payload وب‌هوک برای تماس‌های ورودی',
  'settings.api.screenPop': 'پاپ صفحه',
  'settings.api.screenPopHelp': 'با پاسخ به تماس، یک URL در مرورگر پیش‌فرض باز می‌شود. پارامترهای GET را تنظیم کنید. شناسه Issabel از هدر SIP خوانده می‌شود.',
  'settings.api.enableScreenPop': 'فعال‌سازی پاپ صفحه',
  'settings.api.baseUrl': 'آدرس پایه',
  'settings.api.baseUrlPlaceholder': 'https://crm.example.com/pop',
  'settings.api.issabelHeader': 'هدر SIP Issabel',
  'settings.api.getParams': 'پارامترهای GET',
  'settings.api.addParam': 'افزودن پارامتر',
  'settings.api.paramPlaceholder': 'param',
  'settings.api.customValue': 'مقدار سفارشی',
  'settings.api.remove': 'حذف',
  'settings.api.src.caller_id': 'شناسه تماس‌گیرنده',
  'settings.api.src.caller_name': 'نام تماس‌گیرنده',
  'settings.api.src.extension': 'داخلی',
  'settings.api.src.issabel_id': 'شناسه Issabel',
  'settings.api.src.call_id': 'شناسه تماس',
  'settings.api.src.direction': 'جهت',
  'settings.api.src.answer_date': 'تاریخ پاسخ',
  'settings.api.src.answer_time': 'زمان پاسخ',
  'settings.api.src.answer_datetime': 'تاریخ‌زمان پاسخ',
  'settings.api.src.custom': 'سفارشی',
  'settings.api.src.timestamp': 'زمان',
  'settings.api.socket': 'سرور سوکت',
  'settings.api.socketHelp': 'سرور Socket.IO محلی. کلاینت‌ها به آدرس زیر وصل می‌شوند و رویداد incoming_call را دریافت می‌کنند.',
  'settings.api.enableSocket': 'فعال‌سازی سرور سوکت',
  'settings.api.socketHost': 'آدرس میزبان',
  'settings.api.socketPort': 'پورت',
  'settings.api.socketToken': 'توکن احراز هویت (اختیاری)',
  'settings.api.socketConnectHint': 'اتصال',
  'settings.api.socketEventHint': 'رویداد',
}

const en: Dict = {
  'app.notConnected': 'Not connected. Add a SIP account in Settings.',

  'shell.brand': 'EmdaadPhone',
  'shell.tagline': 'Emergency response communications console',
  'shell.themeLight': 'Helal Ahmar light theme',
  'shell.themeDark': 'Emergency dark theme',
  'shell.alwaysOnTop': 'Always on top',
  'shell.extension': 'Ext {ext}',
  'shell.noSipAccount': 'No SIP account configured',
  'shell.ready': 'Ready',

  'nav.dialpad': 'Dialpad',
  'nav.contacts': 'Contacts',
  'nav.history': 'History',
  'nav.settings': 'Settings',
  'nav.autofill': 'Form',

  'status.defaultDevice': 'System default',
  'status.headset': 'Headset — {name}',
  'status.activeCalls': '{count} call(s)',
  'status.online': 'Online',
  'status.connecting': 'Connecting…',
  'status.offline': 'Offline',
  'status.connectingDetail': 'Connecting to SIP server…',
  'status.offlineDetail': 'SIP is not connected. Check server address, port, and firewall.',
  'status.clickForDetails': 'Click for details',
  'status.sipConnected': 'SIP connected',
  'status.volume': 'Volume',
  'status.mic': 'Microphone',
  'status.errorTitle': 'Status details',
  'status.close': 'Close',
  'status.gotIt': 'Got it',

  'dialpad.placeholder': 'Enter number',
  'dialpad.clear': 'Clear',
  'dialpad.backspace': 'Delete digit',
  'dialpad.call': 'Call',
  'dialpad.registerFirst': 'Register with the SIP server first',
  'dialpad.callFailed': 'Call failed',

  'phone.dialpad': 'Dialpad',
  'phone.recent': 'Recent calls',

  'call.activeTitle': 'Active emergency call',
  'call.onHold': 'On hold · {duration}',
  'call.calling': 'Calling…',
  'call.ringing': 'Ringing…',
  'call.connecting': 'Connecting…',
  'call.transferring': 'Transferring…',
  'call.transferringWithMsg': 'Transferring… {message}',
  'call.transferFailed': 'Transfer failed',
  'call.transferComplete': 'Transfer complete',
  'call.transferPlaceholder': 'Transfer destination…',
  'call.transfer': 'Transfer',
  'call.cancel': 'Cancel',
  'call.mute': 'Mute',
  'call.hold': 'Hold',
  'call.keypad': 'Keypad',
  'call.hangup': 'Hang up',

  'incoming.channel': 'CH-1 · SIP',
  'incoming.title': 'Incoming emergency call',
  'incoming.identified': 'Caller identified · Ext {ext}',
  'incoming.answer': 'Answer',
  'incoming.reject': 'Decline',

  'contacts.title': 'Contacts',
  'contacts.add': '+ Add',
  'contacts.call': 'Call',
  'contacts.search': 'Search contacts…',
  'contacts.empty': 'No contacts yet',
  'contacts.notFound': 'No contacts found',

  'contactForm.edit': 'Edit Contact',
  'contactForm.new': 'New Contact',
  'contactForm.name': 'Name *',
  'contactForm.namePlaceholder': 'John Smith',
  'contactForm.number': 'Number *',
  'contactForm.numberPlaceholder': '1001',
  'contactForm.email': 'Email',
  'contactForm.emailPlaceholder': 'john@company.com',
  'contactForm.company': 'Company',
  'contactForm.companyPlaceholder': 'Company name',
  'contactForm.notes': 'Notes',
  'contactForm.notesPlaceholder': 'Additional notes…',
  'contactForm.cancel': 'Cancel',
  'contactForm.save': 'Save',
  'contactForm.add': 'Add Contact',

  'history.title': 'Recent calls',
  'history.clearAll': 'Clear all',
  'history.all': 'All',
  'history.missed': 'Missed',
  'history.dialed': 'Dialed',
  'history.received': 'Received',
  'history.empty': 'No calls recorded yet',
  'history.missedBadge': 'Missed',

  'autofill.title': 'Call Form',
  'autofill.autoFilled': 'Auto-filled from call',
  'autofill.callInfo': 'Call Information',
  'autofill.callerId': 'Caller ID',
  'autofill.extension': 'Extension',
  'autofill.callerName': 'Caller Name',
  'autofill.timestamp': 'Timestamp',
  'autofill.autoPlaceholder': 'Auto-filled',
  'autofill.ticketDetails': 'Ticket Details',
  'autofill.department': 'Department',
  'autofill.selectDepartment': 'Select department…',
  'autofill.dept.sales': 'Sales',
  'autofill.dept.support': 'Support',
  'autofill.dept.billing': 'Billing',
  'autofill.dept.technical': 'Technical',
  'autofill.dept.hr': 'Human Resources',
  'autofill.reason': 'Reason for Call',
  'autofill.selectReason': 'Select reason…',
  'autofill.reason.inquiry': 'General Inquiry',
  'autofill.reason.complaint': 'Complaint',
  'autofill.reason.support': 'Technical Support',
  'autofill.reason.followup': 'Follow-up',
  'autofill.reason.other': 'Other',
  'autofill.priority': 'Priority',
  'autofill.priority.low': 'Low',
  'autofill.priority.normal': 'Normal',
  'autofill.priority.high': 'High',
  'autofill.priority.urgent': 'Urgent',
  'autofill.status': 'Status',
  'autofill.status.new': 'New',
  'autofill.status.inProgress': 'In Progress',
  'autofill.status.resolved': 'Resolved',
  'autofill.status.pending': 'Pending',
  'autofill.notes': 'Notes',
  'autofill.notesPlaceholder': 'Additional notes about this call…',
  'autofill.cancel': 'Cancel',
  'autofill.submit': 'Submit Form',

  'debug.title': 'Debug Log',
  'debug.subtitle': 'SIP messages and errors for registration and calls',
  'debug.reconnect': 'Reconnect',
  'debug.copy': 'Copy',
  'debug.copied': 'Copied',
  'debug.save': 'Save…',
  'debug.openFolder': 'Open folder',
  'debug.clear': 'Clear',
  'debug.refresh': 'Refresh',
  'debug.copyFailed': 'Copy failed',
  'debug.saved': 'Saved: {path}',
  'debug.autoLog': 'Auto-log (when Debug Logging enabled):',
  'debug.registration': 'Registration: {status}',
  'debug.errorsInLog': '{count} error(s) in log',
  'debug.filter.all': 'All',
  'debug.filter.sent': 'Sent',
  'debug.filter.recv': 'Recv',
  'debug.filter.error': 'Error',
  'debug.filter.info': 'Info',
  'debug.autoRefresh': 'Auto-refresh',
  'debug.entries': '{count} entries',
  'debug.empty': 'No SIP activity yet. Save an account and click Reconnect — errors will appear here.',
  'debug.noMatch': 'No entries match filter',
  'debug.hideRaw': 'Hide Raw',
  'debug.showRaw': 'Show Raw SIP Message',
  'debug.reconnectFailed': 'Reconnect failed',

  'settings.title': 'Settings',
  'settings.loading': 'Loading...',
  'settings.tab.account': 'Account',
  'settings.tab.audio': 'Audio',
  'settings.tab.advanced': 'Advanced',
  'settings.tab.api': 'API',
  'settings.tab.debug': 'Debug',

  'settings.account.active': 'Active',
  'settings.account.register': 'Register',
  'settings.account.unregister': 'Unregister',
  'settings.account.edit': 'Edit',
  'settings.account.delete': 'Delete',
  'settings.account.add': '+ Add Account',
  'settings.account.editTitle': 'Edit Account',
  'settings.account.newTitle': 'New Account',
  'settings.account.displayName': 'Display Name',
  'settings.account.displayNamePlaceholder': 'John Smith',
  'settings.account.username': 'Extension / Username *',
  'settings.account.usernamePlaceholder': '1001',
  'settings.account.authUser': 'Auth User',
  'settings.account.authUserPlaceholder': 'Same as username',
  'settings.account.password': 'Password *',
  'settings.account.passwordPlaceholder': 'Password',
  'settings.account.sipServer': 'SIP Server *',
  'settings.account.sipServerPlaceholder': '192.168.1.100',
  'settings.account.domain': 'Domain',
  'settings.account.optional': 'Optional',
  'settings.account.sipProxy': 'SIP Proxy',
  'settings.account.transport': 'Transport',
  'settings.account.port': 'SIP Server Port',
  'settings.account.expiry': 'Register Expiry (seconds)',
  'settings.account.cancel': 'Cancel',
  'settings.account.save': 'Save',

  'settings.audio.devices': 'Devices',
  'settings.audio.input': 'Input Device (Microphone)',
  'settings.audio.output': 'Output Device (Speaker)',
  'settings.audio.systemDefault': 'System Default',
  'settings.audio.volume': 'Volume',
  'settings.audio.mic': 'Microphone',
  'settings.audio.speaker': 'Speaker',
  'settings.audio.ringtone': 'Ringtone',
  'settings.audio.ringtoneSection': 'Ringtone',
  'settings.audio.ringtoneHelp': 'Choose a built-in tone or upload MP3 / WAV / OGG / M4A.',
  'settings.audio.builtin': 'Built-in',
  'settings.audio.customFile': 'Custom file',
  'settings.audio.classicBeep': 'Classic Beep',
  'settings.audio.upload': 'Upload…',
  'settings.audio.preview': 'Preview',
  'settings.audio.stop': 'Stop',
  'settings.audio.imported': 'Imported {name}',
  'settings.audio.playingClassic': 'Playing classic beep…',
  'settings.audio.playing': 'Playing…',
  'settings.audio.previewFailed': 'Preview failed',
  'settings.audio.noFile': 'No ringtone file',
  'settings.audio.loadFailed': 'Could not load ringtone',

  'settings.advanced.theme': 'Appearance / Helal Ahmar theme',
  'settings.advanced.themeHelp': 'Default: Helal Ahmar dark emergency console. Switch between dark and light themes.',
  'settings.advanced.themeDark': 'Emergency dark',
  'settings.advanced.themeDarkSub': 'Response console',
  'settings.advanced.themeLight': 'Helal light',
  'settings.advanced.themeLightSub': 'Day / office',
  'settings.advanced.language': 'Language / زبان',
  'settings.advanced.languageHelp': 'Choose the interface language.',
  'settings.advanced.langFa': 'فارسی',
  'settings.advanced.langEn': 'English',
  'settings.advanced.behavior': 'Behavior',
  'settings.advanced.dnd': 'Enable DND (Do Not Disturb)',
  'settings.advanced.autoAnswer': 'Auto Answer',
  'settings.advanced.minimizeTray': 'Minimize to Tray',
  'settings.advanced.debugLogging': 'Enable SIP Debug Logging',
  'settings.advanced.debugHelp': 'When enabled, the Debug tab shows REGISTER / INVITE traffic, and logs are also appended to a daily file (Open folder from Debug).',
  'settings.advanced.forwarding': 'Call Forwarding',
  'settings.advanced.enableForward': 'Enable Call Forwarding',
  'settings.advanced.forwardPlaceholder': 'Forward to number',
  'settings.advanced.developer': 'Developer mode',
  'settings.advanced.developerHelp': 'Enter the developer key to show the API and Debug tabs and edit integration settings.',
  'settings.advanced.devKey': 'Developer key',
  'settings.advanced.devKeyPlaceholder': 'Enter key',
  'settings.advanced.devUnlock': 'Unlock',
  'settings.advanced.devLock': 'Lock',
  'settings.advanced.devKeyInvalid': 'Invalid key',
  'settings.advanced.devUnlocked': 'Developer mode is active',
  'settings.advanced.devReset': 'Reset to build defaults',
  'settings.advanced.devResetting': 'Resetting…',
  'settings.advanced.devOverridesActive': 'Your saved values are used instead of config/build.json.',

  'settings.api.webhook': 'Webhook Integration',
  'settings.api.enable': 'Enable API Integration',
  'settings.api.webhookUrl': 'Webhook URL',
  'settings.api.webhookPlaceholder': 'https://api.example.com/webhook',
  'settings.api.apiKey': 'API Key (Bearer Token)',
  'settings.api.events': 'Events',
  'settings.api.eventIncoming': 'Incoming Call',
  'settings.api.eventAnswered': 'Call Answered',
  'settings.api.eventEnded': 'Call Ended',
  'settings.api.eventMissed': 'Call Missed',
  'settings.api.autofill': 'Auto-fill Fields',
  'settings.api.autofillHelp': 'Fields included in webhook payload for incoming calls',
  'settings.api.screenPop': 'Screen Pop',
  'settings.api.screenPopHelp': 'Opens a URL in your default browser when a call is answered. Configure GET params below. Issabel ID is read from the SIP header you name.',
  'settings.api.enableScreenPop': 'Enable Screen Pop',
  'settings.api.baseUrl': 'Base URL',
  'settings.api.baseUrlPlaceholder': 'https://crm.example.com/pop',
  'settings.api.issabelHeader': 'Issabel SIP Header',
  'settings.api.getParams': 'GET Parameters',
  'settings.api.addParam': 'Add param',
  'settings.api.paramPlaceholder': 'param',
  'settings.api.customValue': 'Custom value',
  'settings.api.remove': 'Remove',
  'settings.api.src.caller_id': 'Caller ID',
  'settings.api.src.caller_name': 'Caller Name',
  'settings.api.src.extension': 'Extension',
  'settings.api.src.issabel_id': 'Issabel ID',
  'settings.api.src.call_id': 'Call ID',
  'settings.api.src.direction': 'Direction',
  'settings.api.src.answer_date': 'Answer Date',
  'settings.api.src.answer_time': 'Answer Time',
  'settings.api.src.answer_datetime': 'Answer DateTime',
  'settings.api.src.custom': 'Custom',
  'settings.api.src.timestamp': 'Timestamp',
  'settings.api.socket': 'Socket Server',
  'settings.api.socketHelp': 'Local Socket.IO server. Clients connect to the URL below and listen for the incoming_call event.',
  'settings.api.enableSocket': 'Enable Socket Server',
  'settings.api.socketHost': 'Host',
  'settings.api.socketPort': 'Port',
  'settings.api.socketToken': 'Auth Token (optional)',
  'settings.api.socketConnectHint': 'Connect',
  'settings.api.socketEventHint': 'Event',
}

const dictionaries: Record<Locale, Dict> = { fa, en }

function applyDocumentLocale(locale: Locale) {
  const root = document.documentElement
  root.lang = locale
  root.dir = locale === 'fa' ? 'rtl' : 'ltr'
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`
  )
}

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const primary = dictionaries[locale]?.[key]
  const fallback = locale === 'fa' ? en[key] : fa[key]
  return interpolate(primary ?? fallback ?? key, params)
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
  isRtl: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

function isLocale(value: unknown): value is Locale {
  return value === 'fa' || value === 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fa')

  useEffect(() => {
    let cancelled = false
    window.api?.settings
      ?.get()
      .then((s) => {
        if (cancelled) return
        const saved = (s as { locale?: unknown })?.locale
        if (isLocale(saved)) setLocaleState(saved)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    applyDocumentLocale(locale)
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    applyDocumentLocale(next)
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  )

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, isRtl: locale === 'fa' }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

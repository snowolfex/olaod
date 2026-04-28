import type { VoiceTranscriptionLanguage } from "@/lib/user-types";
import uiLiteralTranslations from "@/lib/ui-language-literals.json";

export type ResolvedUiLanguage = Exclude<VoiceTranscriptionLanguage, "auto" | "united-states" | "united-kingdom">;

const UI_LITERAL_TRANSLATIONS = uiLiteralTranslations as Record<string, Partial<Record<ResolvedUiLanguage, string>>>;


type UiTranslationKey =
  | "access"
  | "accountAndAccess"
  | "accessScope"
  | "activity"
  | "admin"
  | "adminPage"
  | "archive"
  | "archiving"
  | "assistant"
  | "attentionNeeded"
  | "audioWhileHeld"
  | "autoDetect"
  | "beforeSignOut"
  | "chat"
  | "chooseSiteTheme"
  | "clear"
  | "commandDeck"
  | "commandDeckDestinationsIntro"
  | "comms"
  | "conversationSafety"
  | "currentArea"
  | "currentBriefing"
  | "currentConversation"
  | "currentFocus"
  | "currentDestination"
  | "currentlyActive"
  | "currentlyArchived"
  | "defaultModel"
  | "downloadPdfManual"
  | "doNotAskAgain"
  | "endpoint"
  | "execution"
  | "fullDeck"
  | "gatewayOffline"
  | "gatewayOnline"
  | "gatewayPosture"
  | "gatewayStatus"
  | "glossary"
  | "glossaryTerms"
  | "guide"
  | "help"
  | "helpManualSubtitle"
  | "helpManualTitle"
  | "helpPageIntro"
  | "hide"
  | "hideIdeas"
  | "holdToRecord"
  | "holdToTalk"
  | "identity"
  | "installedNotRunning"
  | "jobs"
  | "keepConversationReady"
  | "limitedDeck"
  | "liveRoute"
  | "localAccount"
  | "localWhisperMode"
  | "manualAvailableWithoutSignIn"
  | "manualSections"
  | "modelUnavailable"
  | "models"
  | "modelsReady"
  | "modelsTab"
  | "navigation"
  | "no"
  | "noModelSelected"
  | "offline"
  | "online"
  | "operationsAndAccessControl"
  | "overview"
  | "plainLanguage"
  | "operator"
  | "ops"
  | "operational"
  | "operationalSteps"
  | "pickModelLater"
  | "pushToTalkNeedsSupport"
  | "recordingRelease"
  | "replyStyle"
  | "references"
  | "referencesIntro"
  | "referencesTitle"
  | "running"
  | "runtime"
  | "runtimeLive"
  | "saveProfile"
  | "saving"
  | "savingProfile"
  | "secureEntry"
  | "send"
  | "sending"
  | "showCommandDeck"
  | "showIdeas"
  | "signInToEnterOload"
  | "signOut"
  | "signedInRole"
  | "signingOut"
  | "stop"
  | "streaming"
  | "technicalDetail"
  | "technicalSummary"
  | "theme"
  | "thinkingOfItAs"
  | "transcribing"
  | "typeYourMessage"
  | "unableSaveVoicePreference"
  | "useFirstAvailableLocalModel"
  | "voice"
  | "voiceTranscription"
  | "waitingForModelOutput"
  | "workspacePages"
  | "workspaceStaysHidden"
  | "yourAccount"
  | "yes";

const UI_TRANSLATIONS: Record<ResolvedUiLanguage, Partial<Record<UiTranslationKey, string>>> = {
  english: {
    access: "Access",
    accountAndAccess: "Account and access",
    accessScope: "Access scope",
    activity: "Activity",
    admin: "Admin",
    adminPage: "Admin page",
    archive: "Archive",
    archiving: "Archiving...",
    assistant: "Assistant",
    attentionNeeded: "Attention needed",
    audioWhileHeld: "Audio is only being recorded while the talk button is held down.",
    autoDetect: "Auto-detect",
    beforeSignOut: "Before you sign out",
    chat: "Chat",
    chooseSiteTheme: "Choose site theme",
    clear: "Clear",
    commandDeck: "Command deck",
    comms: "Comms",
    conversationSafety: "Conversation safety",
    currentArea: "Current area",
    currentBriefing: "Current briefing",
    currentConversation: "Current conversation",
    currentDestination: "Current destination",
    currentlyActive: "Currently active",
    currentlyArchived: "Currently archived",
    defaultModel: "Default model",
    doNotAskAgain: "Do not ask again on this device",
    endpoint: "Endpoint",
    execution: "Execution",
    fullDeck: "Full deck",
    gatewayOffline: "Gateway offline",
    gatewayOnline: "Gateway online",
    gatewayPosture: "Gateway posture",
    gatewayStatus: "Gateway status",
    guide: "Guide",
    help: "Help",
    hide: "Hide",
    hideIdeas: "Hide ideas",
    holdToRecord: "Hold the talk button to record. Release it to stop recording, transcribe, and send.",
    holdToTalk: "Hold to talk",
    identity: "Identity",
    installedNotRunning: "Installed, not running",
    jobs: "Jobs",
    keepConversationReady: "Do you want to keep this conversation ready for next time?",
    limitedDeck: "Limited deck",
    liveRoute: "Live route",
    localWhisperMode: "A local Whisper model is transcribing the recorded audio in {language} mode now.",
    modelUnavailable: "Model unavailable",
    models: "Models",
    modelsReady: "Models ready",
    modelsTab: "Models",
    navigation: "Navigation",
    no: "No",
    noModelSelected: "No model selected",
    offline: "Offline",
    online: "Online",
    operationsAndAccessControl: "Operations and access control",
    operator: "Operator",
    ops: "Ops",
    operational: "Operational",
    pickModelLater: "Pick a model later",
    pushToTalkNeedsSupport: "Push-to-talk needs microphone access and Web Audio support in the browser.",
    recordingRelease: "Recording... release to send",
    replyStyle: "Reply style",
    running: "Running",
    runtime: "Runtime",
    runtimeLive: "Runtime live",
    saveProfile: "Save profile",
    saving: "Saving...",
    savingProfile: "Saving...",
    secureEntry: "Secure entry",
    send: "Send",
    sending: "Sending...",
    showCommandDeck: "Show command deck",
    showIdeas: "Show ideas",
    signInToEnterOload: "Sign in to enter oload",
    signOut: "Sign out",
    signedInRole: "Signed-in role",
    signingOut: "Signing out...",
    stop: "Stop",
    streaming: "Streaming...",
    theme: "Theme",
    transcribing: "Transcribing...",
    typeYourMessage: "Type your message...",
    unableSaveVoicePreference: "Unable to save the voice transcription preference.",
    useFirstAvailableLocalModel: "Use the first available local model",
    voice: "Voice",
    voiceTranscription: "Voice transcription",
    waitingForModelOutput: "Waiting for model output...",
    workspacePages: "Workspace pages",
    workspaceStaysHidden: "The workspace stays hidden until you sign in. Choose stay logged in if you want this device to keep a persistent session.",
    yes: "Yes",
  },
  arabic: {
    access: "الوصول", accountAndAccess: "الحساب والوصول", accessScope: "نطاق الوصول", activity: "النشاط", admin: "الإدارة", adminPage: "صفحة الإدارة", archive: "أرشفة", archiving: "جارٍ الأرشفة...", assistant: "المساعد", attentionNeeded: "يلزم الانتباه", audioWhileHeld: "يتم تسجيل الصوت فقط أثناء الضغط على زر التحدث.", autoDetect: "اكتشاف تلقائي", beforeSignOut: "قبل تسجيل الخروج", chat: "الدردشة", chooseSiteTheme: "اختر سمة الموقع", clear: "مسح", commandDeck: "لوحة الأوامر", comms: "اتصال", conversationSafety: "سلامة المحادثة", currentArea: "المنطقة الحالية", currentBriefing: "الملخص الحالي", currentConversation: "المحادثة الحالية", currentDestination: "الوجهة الحالية", currentlyActive: "نشطة حالياً", currentlyArchived: "مؤرشفة حالياً", defaultModel: "النموذج الافتراضي", doNotAskAgain: "لا تسأل مرة أخرى على هذا الجهاز", endpoint: "النقطة النهائية", execution: "التنفيذ", fullDeck: "لوحة كاملة", gatewayOffline: "البوابة غير متصلة", gatewayOnline: "البوابة متصلة", gatewayPosture: "حالة البوابة", gatewayStatus: "حالة البوابة", guide: "الدليل", help: "المساعدة", hide: "إخفاء", hideIdeas: "إخفاء الأفكار", holdToRecord: "اضغط مطولاً على زر التحدث للتسجيل. حرره لإيقاف التسجيل والنسخ والإرسال.", holdToTalk: "اضغط للتحدث", identity: "الهوية", installedNotRunning: "مثبت لكنه غير قيد التشغيل", jobs: "المهام", keepConversationReady: "هل تريد إبقاء هذه المحادثة جاهزة للمرة القادمة؟", limitedDeck: "لوحة محدودة", liveRoute: "مسار مباشر", localWhisperMode: "يقوم نموذج Whisper المحلي بنسخ الصوت الآن في وضع {language}.", modelUnavailable: "النموذج غير متاح", models: "النماذج", modelsReady: "النماذج الجاهزة", modelsTab: "النماذج", navigation: "التنقل", no: "لا", noModelSelected: "لم يتم اختيار نموذج", offline: "غير متصل", online: "متصل", operationsAndAccessControl: "العمليات والتحكم في الوصول", operator: "المشغّل", ops: "عمليات", operational: "تعمل", pickModelLater: "اختر نموذجاً لاحقاً", pushToTalkNeedsSupport: "ميزة الضغط للتحدث تحتاج إلى إذن الميكروفون ودعم Web Audio في المتصفح.", recordingRelease: "جارٍ التسجيل... حرر للإرسال", replyStyle: "أسلوب الرد", running: "قيد التشغيل", runtime: "وقت التشغيل", runtimeLive: "وقت التشغيل المباشر", saveProfile: "حفظ الملف الشخصي", saving: "جارٍ الحفظ...", savingProfile: "جارٍ الحفظ...", secureEntry: "دخول آمن", send: "إرسال", sending: "جارٍ الإرسال...", showCommandDeck: "إظهار لوحة الأوامر", showIdeas: "إظهار الأفكار", signInToEnterOload: "سجّل الدخول للدخول إلى oload", signOut: "تسجيل الخروج", signedInRole: "الدور الحالي", signingOut: "جارٍ تسجيل الخروج...", stop: "إيقاف", streaming: "جارٍ البث...", theme: "السمة", transcribing: "جارٍ النسخ...", typeYourMessage: "اكتب رسالتك...", unableSaveVoicePreference: "تعذر حفظ تفضيل نسخ الصوت.", useFirstAvailableLocalModel: "استخدم أول نموذج محلي متاح", voice: "الصوت", voiceTranscription: "نسخ الصوت", waitingForModelOutput: "بانتظار مخرجات النموذج...", workspacePages: "صفحات مساحة العمل", workspaceStaysHidden: "تبقى مساحة العمل مخفية حتى تسجل الدخول. اختر البقاء مسجلاً إذا أردت جلسة دائمة على هذا الجهاز.", yes: "نعم"
  },
  bengali: {
    access: "অ্যাক্সেস", accountAndAccess: "অ্যাকাউন্ট ও অ্যাক্সেস", activity: "কার্যকলাপ", admin: "অ্যাডমিন", adminPage: "অ্যাডমিন পেজ", archive: "আর্কাইভ", archiving: "আর্কাইভ করা হচ্ছে...", assistant: "সহকারী", attentionNeeded: "মনোযোগ প্রয়োজন", audioWhileHeld: "টক বোতাম চেপে ধরে রাখার সময়ই শুধু অডিও রেকর্ড করা হয়।", autoDetect: "স্বয়ংক্রিয় সনাক্তকরণ", beforeSignOut: "সাইন আউট করার আগে", chat: "চ্যাট", chooseSiteTheme: "সাইট থিম বেছে নিন", clear: "মুছুন", commandDeck: "কমান্ড ডেক", comms: "যোগাযোগ", conversationSafety: "কথোপকথন সুরক্ষা", currentArea: "বর্তমান অংশ", currentBriefing: "বর্তমান সারাংশ", currentConversation: "বর্তমান কথোপকথন", currentDestination: "বর্তমান গন্তব্য", currentlyActive: "বর্তমানে সক্রিয়", currentlyArchived: "বর্তমানে আর্কাইভ করা", defaultModel: "ডিফল্ট মডেল", doNotAskAgain: "এই ডিভাইসে আর জিজ্ঞেস করবেন না", endpoint: "এন্ডপয়েন্ট", execution: "এক্সিকিউশন", fullDeck: "পূর্ণ ডেক", gatewayOffline: "গেটওয়ে অফলাইন", gatewayOnline: "গেটওয়ে অনলাইন", gatewayPosture: "গেটওয়ে অবস্থা", gatewayStatus: "গেটওয়ে স্ট্যাটাস", guide: "গাইড", help: "সহায়তা", hide: "লুকান", hideIdeas: "আইডিয়া লুকান", holdToRecord: "রেকর্ড করতে টক বোতাম চেপে ধরুন। ছেড়ে দিলে রেকর্ড থামবে, ট্রান্সক্রাইব হবে এবং পাঠানো হবে।", holdToTalk: "কথা বলতে চেপে ধরুন", identity: "পরিচয়", installedNotRunning: "ইনস্টল করা আছে, চলছে না", jobs: "জবস", keepConversationReady: "পরেরবারের জন্য এই কথোপকথন প্রস্তুত রাখতে চান?", limitedDeck: "সীমিত ডেক", liveRoute: "লাইভ রুট", localWhisperMode: "লোকাল Whisper মডেল এখন {language} মোডে অডিও ট্রান্সক্রাইব করছে।", modelUnavailable: "মডেল উপলভ্য নয়", models: "মডেল", modelsReady: "মডেল প্রস্তুত", modelsTab: "মডেল", navigation: "নেভিগেশন", no: "না", noModelSelected: "কোনো মডেল নির্বাচিত নয়", offline: "অফলাইন", online: "অনলাইন", operationsAndAccessControl: "অপারেশনস ও অ্যাক্সেস নিয়ন্ত্রণ", operator: "অপারেটর", ops: "অপস", operational: "চলমান", pickModelLater: "পরে মডেল বেছে নিন", pushToTalkNeedsSupport: "পুশ-টু-টক ব্যবহারের জন্য মাইক্রোফোন অনুমতি এবং ব্রাউজারে Web Audio সমর্থন দরকার।", recordingRelease: "রেকর্ড হচ্ছে... ছেড়ে দিন পাঠাতে", replyStyle: "উত্তরের ধরন", running: "চলমান", runtime: "রানটাইম", runtimeLive: "লাইভ রানটাইম", saveProfile: "প্রোফাইল সংরক্ষণ", saving: "সংরক্ষণ করা হচ্ছে...", savingProfile: "সংরক্ষণ করা হচ্ছে...", secureEntry: "নিরাপদ প্রবেশ", send: "পাঠান", sending: "পাঠানো হচ্ছে...", showCommandDeck: "কমান্ড ডেক দেখান", showIdeas: "আইডিয়া দেখান", signInToEnterOload: "oload-এ প্রবেশ করতে সাইন ইন করুন", signOut: "সাইন আউট", signedInRole: "সাইন-ইন ভূমিকা", signingOut: "সাইন আউট করা হচ্ছে...", stop: "থামান", streaming: "স্ট্রিমিং...", theme: "থিম", transcribing: "ট্রান্সক্রাইব করা হচ্ছে...", typeYourMessage: "আপনার বার্তা লিখুন...", unableSaveVoicePreference: "ভয়েস ট্রান্সক্রিপশন পছন্দ সংরক্ষণ করা যায়নি।", useFirstAvailableLocalModel: "প্রথম উপলভ্য লোকাল মডেল ব্যবহার করুন", voice: "ভয়েস", voiceTranscription: "ভয়েস ট্রান্সক্রিপশন", waitingForModelOutput: "মডেল আউটপুটের অপেক্ষায়...", workspacePages: "ওয়ার্কস্পেস পেজ", workspaceStaysHidden: "সাইন ইন না করা পর্যন্ত ওয়ার্কস্পেস লুকানো থাকবে। এই ডিভাইসে স্থায়ী সেশন রাখতে চাইলে লগইন অবস্থায় থাকুন নির্বাচন করুন।", yes: "হ্যাঁ"
  },
  chinese: {
    access: "访问", accountAndAccess: "账户与访问", activity: "活动", admin: "管理", adminPage: "管理页面", archive: "归档", archiving: "正在归档...", assistant: "助手", attentionNeeded: "需要注意", audioWhileHeld: "只有按住讲话按钮时才会录音。", autoDetect: "自动检测", beforeSignOut: "退出之前", chat: "聊天", chooseSiteTheme: "选择站点主题", clear: "清除", commandDeck: "命令面板", comms: "沟通", conversationSafety: "会话保护", currentArea: "当前区域", currentBriefing: "当前摘要", currentConversation: "当前会话", currentDestination: "当前目标", currentlyActive: "当前活动", currentlyArchived: "当前已归档", defaultModel: "默认模型", doNotAskAgain: "在此设备上不再询问", endpoint: "端点", execution: "执行", fullDeck: "完整面板", gatewayOffline: "网关离线", gatewayOnline: "网关在线", gatewayPosture: "网关状态", gatewayStatus: "网关状态", guide: "指南", help: "帮助", hide: "隐藏", hideIdeas: "隐藏建议", holdToRecord: "按住讲话按钮进行录音。松开后停止录音、转写并发送。", holdToTalk: "按住说话", identity: "身份", installedNotRunning: "已安装，未运行", jobs: "任务", keepConversationReady: "下次要保留此会话为就绪状态吗？", limitedDeck: "受限面板", liveRoute: "实时路由", localWhisperMode: "本地 Whisper 模型正在以 {language} 模式转写录音。", modelUnavailable: "模型不可用", models: "模型", modelsReady: "模型就绪", modelsTab: "模型", navigation: "导航", no: "否", noModelSelected: "未选择模型", offline: "离线", online: "在线", operationsAndAccessControl: "操作与访问控制", operator: "操作员", ops: "运维", operational: "运行正常", pickModelLater: "稍后选择模型", pushToTalkNeedsSupport: "按住说话需要浏览器提供麦克风权限和 Web Audio 支持。", recordingRelease: "正在录音... 松开发送", replyStyle: "回复风格", running: "运行中", runtime: "运行时", runtimeLive: "实时运行", saveProfile: "保存资料", saving: "正在保存...", savingProfile: "正在保存...", secureEntry: "安全入口", send: "发送", sending: "正在发送...", showCommandDeck: "显示命令面板", showIdeas: "显示建议", signInToEnterOload: "登录以进入 oload", signOut: "退出登录", signedInRole: "当前角色", signingOut: "正在退出...", stop: "停止", streaming: "流式输出中...", theme: "主题", transcribing: "正在转写...", typeYourMessage: "输入你的消息...", unableSaveVoicePreference: "无法保存语音转写偏好。", useFirstAvailableLocalModel: "使用第一个可用的本地模型", voice: "语音", voiceTranscription: "语音转写", waitingForModelOutput: "正在等待模型输出...", workspacePages: "工作区页面", workspaceStaysHidden: "在你登录之前，工作区会保持隐藏。如果你希望此设备保持持久会话，请选择保持登录。", yes: "是"
  },
  farsi: {
    access: "دسترسی", accountAndAccess: "حساب و دسترسی", activity: "فعالیت", admin: "مدیریت", adminPage: "صفحه مدیریت", archive: "بایگانی", archiving: "در حال بایگانی...", assistant: "دستیار", attentionNeeded: "نیاز به توجه", audioWhileHeld: "صدا فقط زمانی ضبط می‌شود که دکمه صحبت را نگه دارید.", autoDetect: "تشخیص خودکار", beforeSignOut: "قبل از خروج", chat: "چت", chooseSiteTheme: "تم سایت را انتخاب کنید", clear: "پاک کردن", commandDeck: "پنل فرمان", comms: "ارتباط", conversationSafety: "ایمنی گفتگو", currentArea: "بخش فعلی", currentBriefing: "خلاصه فعلی", currentConversation: "گفتگوی فعلی", currentDestination: "مقصد فعلی", currentlyActive: "اکنون فعال", currentlyArchived: "اکنون بایگانی‌شده", defaultModel: "مدل پیش‌فرض", doNotAskAgain: "روی این دستگاه دوباره نپرس", endpoint: "نقطه پایانی", execution: "اجرا", fullDeck: "پنل کامل", gatewayOffline: "درگاه آفلاین", gatewayOnline: "درگاه آنلاین", gatewayPosture: "وضعیت درگاه", gatewayStatus: "وضعیت درگاه", guide: "راهنما", help: "راهنما", hide: "پنهان کردن", hideIdeas: "پنهان کردن ایده‌ها", holdToRecord: "برای ضبط، دکمه صحبت را نگه دارید. با رها کردن، ضبط متوقف می‌شود، تبدیل انجام می‌شود و پیام ارسال می‌شود.", holdToTalk: "برای صحبت نگه دارید", identity: "هویت", installedNotRunning: "نصب شده، اما اجرا نمی‌شود", jobs: "کارها", keepConversationReady: "می‌خواهید این گفتگو برای دفعه بعد آماده بماند؟", limitedDeck: "پنل محدود", liveRoute: "مسیر زنده", localWhisperMode: "مدل محلی Whisper اکنون صدا را در حالت {language} تبدیل می‌کند.", modelUnavailable: "مدل در دسترس نیست", models: "مدل‌ها", modelsReady: "مدل‌های آماده", modelsTab: "مدل‌ها", navigation: "ناوبری", no: "خیر", noModelSelected: "مدلی انتخاب نشده", offline: "آفلاین", online: "آنلاین", operationsAndAccessControl: "عملیات و کنترل دسترسی", operator: "اپراتور", ops: "عملیات", operational: "عملیاتی", pickModelLater: "بعداً مدل را انتخاب کنید", pushToTalkNeedsSupport: "فشار برای صحبت به اجازه میکروفون و پشتیبانی Web Audio در مرورگر نیاز دارد.", recordingRelease: "در حال ضبط... برای ارسال رها کنید", replyStyle: "سبک پاسخ", running: "در حال اجرا", runtime: "ران‌تایم", runtimeLive: "ران‌تایم زنده", saveProfile: "ذخیره پروفایل", saving: "در حال ذخیره...", savingProfile: "در حال ذخیره...", secureEntry: "ورود امن", send: "ارسال", sending: "در حال ارسال...", showCommandDeck: "نمایش پنل فرمان", showIdeas: "نمایش ایده‌ها", signInToEnterOload: "برای ورود به oload وارد شوید", signOut: "خروج", signedInRole: "نقش واردشده", signingOut: "در حال خروج...", stop: "توقف", streaming: "در حال پخش...", theme: "تم", transcribing: "در حال تبدیل...", typeYourMessage: "پیام خود را بنویسید...", unableSaveVoicePreference: "ذخیره ترجیح تبدیل صدا ممکن نشد.", useFirstAvailableLocalModel: "از اولین مدل محلی موجود استفاده کن", voice: "صدا", voiceTranscription: "تبدیل گفتار", waitingForModelOutput: "در انتظار خروجی مدل...", workspacePages: "صفحات فضای کار", workspaceStaysHidden: "فضای کار تا زمانی که وارد نشوید پنهان می‌ماند. اگر می‌خواهید این دستگاه جلسه پایدار داشته باشد، گزینه ورود مداوم را انتخاب کنید.", yes: "بله"
  },
  french: {
    access: "Accès", accountAndAccess: "Compte et accès", activity: "Activité", admin: "Admin", adminPage: "Page admin", archive: "Archiver", archiving: "Archivage...", assistant: "Assistant", attentionNeeded: "Attention requise", audioWhileHeld: "L'audio est enregistré uniquement pendant que le bouton est maintenu.", autoDetect: "Détection automatique", beforeSignOut: "Avant de vous déconnecter", chat: "Chat", chooseSiteTheme: "Choisir le thème du site", clear: "Effacer", commandDeck: "Panneau de commandes", comms: "Comms", conversationSafety: "Sécurité de conversation", currentArea: "Zone actuelle", currentBriefing: "Résumé actuel", currentConversation: "Conversation actuelle", currentDestination: "Destination actuelle", currentlyActive: "Actuellement active", currentlyArchived: "Actuellement archivée", defaultModel: "Modèle par défaut", doNotAskAgain: "Ne plus demander sur cet appareil", endpoint: "Point de terminaison", execution: "Exécution", fullDeck: "Panneau complet", gatewayOffline: "Passerelle hors ligne", gatewayOnline: "Passerelle en ligne", gatewayPosture: "État de la passerelle", gatewayStatus: "Statut de la passerelle", guide: "Guide", help: "Aide", hide: "Masquer", hideIdeas: "Masquer les idées", holdToRecord: "Maintenez le bouton de parole pour enregistrer. Relâchez pour arrêter, transcrire et envoyer.", holdToTalk: "Maintenir pour parler", identity: "Identité", installedNotRunning: "Installé, non lancé", jobs: "Tâches", keepConversationReady: "Voulez-vous garder cette conversation prête pour la prochaine fois ?", limitedDeck: "Panneau limité", liveRoute: "Route active", localWhisperMode: "Un modèle Whisper local transcrit l'audio en mode {language}.", modelUnavailable: "Modèle indisponible", models: "Modèles", modelsReady: "Modèles prêts", modelsTab: "Modèles", navigation: "Navigation", no: "Non", noModelSelected: "Aucun modèle sélectionné", offline: "Hors ligne", online: "En ligne", operationsAndAccessControl: "Opérations et contrôle d'accès", operator: "Opérateur", ops: "Ops", operational: "Opérationnel", pickModelLater: "Choisir un modèle plus tard", pushToTalkNeedsSupport: "Le mode push-to-talk nécessite l'accès au micro et la prise en charge Web Audio dans le navigateur.", recordingRelease: "Enregistrement... relâchez pour envoyer", replyStyle: "Style de réponse", running: "En cours", runtime: "Runtime", runtimeLive: "Runtime actif", saveProfile: "Enregistrer le profil", saving: "Enregistrement...", savingProfile: "Enregistrement...", secureEntry: "Entrée sécurisée", send: "Envoyer", sending: "Envoi...", showCommandDeck: "Afficher le panneau de commandes", showIdeas: "Afficher les idées", signInToEnterOload: "Connectez-vous pour entrer dans oload", signOut: "Se déconnecter", signedInRole: "Rôle connecté", signingOut: "Déconnexion...", stop: "Arrêter", streaming: "Streaming...", theme: "Thème", transcribing: "Transcription...", typeYourMessage: "Tapez votre message...", unableSaveVoicePreference: "Impossible d'enregistrer la préférence de transcription vocale.", useFirstAvailableLocalModel: "Utiliser le premier modèle local disponible", voice: "Voix", voiceTranscription: "Transcription vocale", waitingForModelOutput: "En attente de la sortie du modèle...", workspacePages: "Pages d'espace de travail", workspaceStaysHidden: "L'espace de travail reste caché tant que vous n'êtes pas connecté. Choisissez de rester connecté si vous voulez conserver une session persistante sur cet appareil.", yes: "Oui"
  },
  hindi: {
    access: "एक्सेस", accountAndAccess: "खाता और एक्सेस", activity: "गतिविधि", admin: "एडमिन", adminPage: "एडमिन पेज", archive: "संग्रहित करें", archiving: "संग्रहित किया जा रहा है...", assistant: "सहायक", attentionNeeded: "ध्यान आवश्यक", audioWhileHeld: "ऑडियो केवल तभी रिकॉर्ड होता है जब टॉक बटन दबाकर रखा जाता है।", autoDetect: "स्वतः पहचान", beforeSignOut: "साइन आउट करने से पहले", chat: "चैट", chooseSiteTheme: "साइट थीम चुनें", clear: "साफ़ करें", commandDeck: "कमांड डेक", comms: "संचार", conversationSafety: "वार्तालाप सुरक्षा", currentArea: "वर्तमान क्षेत्र", currentBriefing: "वर्तमान सार", currentConversation: "वर्तमान वार्तालाप", currentDestination: "वर्तमान गंतव्य", currentlyActive: "अभी सक्रिय", currentlyArchived: "अभी संग्रहित", defaultModel: "डिफ़ॉल्ट मॉडल", doNotAskAgain: "इस डिवाइस पर दोबारा न पूछें", endpoint: "एंडपॉइंट", execution: "निष्पादन", fullDeck: "पूर्ण डेक", gatewayOffline: "गेटवे ऑफलाइन", gatewayOnline: "गेटवे ऑनलाइन", gatewayPosture: "गेटवे स्थिति", gatewayStatus: "गेटवे स्थिति", guide: "गाइड", help: "सहायता", hide: "छिपाएँ", hideIdeas: "विचार छिपाएँ", holdToRecord: "रिकॉर्ड करने के लिए टॉक बटन दबाकर रखें। छोड़ने पर रिकॉर्डिंग रुकेगी, ट्रांसक्राइब होगी और भेजी जाएगी।", holdToTalk: "बोलने के लिए दबाकर रखें", identity: "पहचान", installedNotRunning: "इंस्टॉल है, चल नहीं रहा", jobs: "जॉब्स", keepConversationReady: "क्या आप अगली बार के लिए इस वार्तालाप को तैयार रखना चाहते हैं?", limitedDeck: "सीमित डेक", liveRoute: "लाइव रूट", localWhisperMode: "एक स्थानीय Whisper मॉडल अब {language} मोड में ऑडियो ट्रांसक्राइब कर रहा है।", modelUnavailable: "मॉडल उपलब्ध नहीं", models: "मॉडल", modelsReady: "तैयार मॉडल", modelsTab: "मॉडल", navigation: "नेविगेशन", no: "नहीं", noModelSelected: "कोई मॉडल चयनित नहीं", offline: "ऑफलाइन", online: "ऑनलाइन", operationsAndAccessControl: "ऑपरेशन्स और एक्सेस नियंत्रण", operator: "ऑपरेटर", ops: "ऑप्स", operational: "संचालित", pickModelLater: "मॉडल बाद में चुनें", pushToTalkNeedsSupport: "पुश-टू-टॉक के लिए माइक्रोफ़ोन अनुमति और ब्राउज़र में Web Audio समर्थन चाहिए।", recordingRelease: "रिकॉर्ड हो रहा है... भेजने के लिए छोड़ें", replyStyle: "जवाब शैली", running: "चल रहा है", runtime: "रनटाइम", runtimeLive: "लाइव रनटाइम", saveProfile: "प्रोफ़ाइल सहेजें", saving: "सहेजा जा रहा है...", savingProfile: "सहेजा जा रहा है...", secureEntry: "सुरक्षित प्रवेश", send: "भेजें", sending: "भेजा जा रहा है...", showCommandDeck: "कमांड डेक दिखाएँ", showIdeas: "विचार दिखाएँ", signInToEnterOload: "oload में प्रवेश करने के लिए साइन इन करें", signOut: "साइन आउट", signedInRole: "साइन-इन भूमिका", signingOut: "साइन आउट हो रहा है...", stop: "रोकें", streaming: "स्ट्रीमिंग...", theme: "थीम", transcribing: "ट्रांसक्राइब हो रहा है...", typeYourMessage: "अपना संदेश लिखें...", unableSaveVoicePreference: "वॉइस ट्रांसक्रिप्शन वरीयता सहेजी नहीं जा सकी।", useFirstAvailableLocalModel: "पहला उपलब्ध लोकल मॉडल उपयोग करें", voice: "वॉइस", voiceTranscription: "वॉइस ट्रांसक्रिप्शन", waitingForModelOutput: "मॉडल आउटपुट की प्रतीक्षा में...", workspacePages: "वर्कस्पेस पेज", workspaceStaysHidden: "वर्कस्पेस तब तक छिपा रहेगा जब तक आप साइन इन नहीं करते। यदि आप चाहते हैं कि यह डिवाइस स्थायी सत्र रखे, तो लॉग इन रहना चुनें।", yes: "हाँ"
  },
  japanese: {
    access: "アクセス", accountAndAccess: "アカウントとアクセス", activity: "アクティビティ", admin: "管理", adminPage: "管理ページ", archive: "アーカイブ", archiving: "アーカイブ中...", assistant: "アシスタント", attentionNeeded: "注意が必要", audioWhileHeld: "音声はトークボタンを押している間だけ録音されます。", autoDetect: "自動検出", beforeSignOut: "サインアウトする前に", chat: "チャット", chooseSiteTheme: "サイトテーマを選択", clear: "クリア", commandDeck: "コマンドデッキ", comms: "連絡", conversationSafety: "会話の保護", currentArea: "現在の領域", currentBriefing: "現在の概要", currentConversation: "現在の会話", currentDestination: "現在の移動先", currentlyActive: "現在アクティブ", currentlyArchived: "現在アーカイブ済み", defaultModel: "既定のモデル", doNotAskAgain: "この端末では今後確認しない", endpoint: "エンドポイント", execution: "実行", fullDeck: "フルデッキ", gatewayOffline: "ゲートウェイ オフライン", gatewayOnline: "ゲートウェイ オンライン", gatewayPosture: "ゲートウェイ状態", gatewayStatus: "ゲートウェイ状態", guide: "ガイド", help: "ヘルプ", hide: "隠す", hideIdeas: "アイデアを隠す", holdToRecord: "録音するにはトークボタンを押し続けてください。離すと録音停止、文字起こし、送信を行います。", holdToTalk: "押して話す", identity: "認証", installedNotRunning: "インストール済み、未起動", jobs: "ジョブ", keepConversationReady: "次回のためにこの会話を準備状態にしておきますか？", limitedDeck: "制限付きデッキ", liveRoute: "ライブ経路", localWhisperMode: "ローカル Whisper モデルが {language} モードで音声を文字起こししています。", modelUnavailable: "モデル利用不可", models: "モデル", modelsReady: "準備済みモデル", modelsTab: "モデル", navigation: "ナビゲーション", no: "いいえ", noModelSelected: "モデル未選択", offline: "オフライン", online: "オンライン", operationsAndAccessControl: "運用とアクセス制御", operator: "オペレーター", ops: "運用", operational: "稼働中", pickModelLater: "後でモデルを選択", pushToTalkNeedsSupport: "プッシュトゥトークにはマイク権限とブラウザーの Web Audio 対応が必要です。", recordingRelease: "録音中... 離して送信", replyStyle: "返信スタイル", running: "実行中", runtime: "ランタイム", runtimeLive: "稼働ランタイム", saveProfile: "プロフィールを保存", saving: "保存中...", savingProfile: "保存中...", secureEntry: "安全な入口", send: "送信", sending: "送信中...", showCommandDeck: "コマンドデッキを表示", showIdeas: "アイデアを表示", signInToEnterOload: "oload に入るにはサインインしてください", signOut: "サインアウト", signedInRole: "サインイン中の役割", signingOut: "サインアウト中...", stop: "停止", streaming: "ストリーミング中...", theme: "テーマ", transcribing: "文字起こし中...", typeYourMessage: "メッセージを入力...", unableSaveVoicePreference: "音声文字起こし設定を保存できませんでした。", useFirstAvailableLocalModel: "最初に利用可能なローカルモデルを使う", voice: "音声", voiceTranscription: "音声文字起こし", waitingForModelOutput: "モデル出力を待機中...", workspacePages: "ワークスペースページ", workspaceStaysHidden: "サインインするまでワークスペースは表示されません。この端末で継続セッションを保持するには、ログイン状態を維持を選んでください。", yes: "はい"
  },
  korean: {
    access: "접근", accountAndAccess: "계정 및 접근", activity: "활동", admin: "관리", adminPage: "관리 페이지", archive: "보관", archiving: "보관 중...", assistant: "도우미", attentionNeeded: "주의 필요", audioWhileHeld: "말하기 버튼을 누르고 있는 동안에만 오디오가 녹음됩니다.", autoDetect: "자동 감지", beforeSignOut: "로그아웃하기 전에", chat: "채팅", chooseSiteTheme: "사이트 테마 선택", clear: "지우기", commandDeck: "명령 패널", comms: "통신", conversationSafety: "대화 보호", currentArea: "현재 영역", currentBriefing: "현재 요약", currentConversation: "현재 대화", currentDestination: "현재 대상", currentlyActive: "현재 활성", currentlyArchived: "현재 보관됨", defaultModel: "기본 모델", doNotAskAgain: "이 기기에서 다시 묻지 않기", endpoint: "엔드포인트", execution: "실행", fullDeck: "전체 패널", gatewayOffline: "게이트웨이 오프라인", gatewayOnline: "게이트웨이 온라인", gatewayPosture: "게이트웨이 상태", gatewayStatus: "게이트웨이 상태", guide: "가이드", help: "도움말", hide: "숨기기", hideIdeas: "아이디어 숨기기", holdToRecord: "녹음하려면 말하기 버튼을 길게 누르세요. 놓으면 녹음이 멈추고 전사 후 전송됩니다.", holdToTalk: "눌러서 말하기", identity: "신원", installedNotRunning: "설치됨, 실행 안 됨", jobs: "작업", keepConversationReady: "다음에 사용할 수 있도록 이 대화를 준비 상태로 유지할까요?", limitedDeck: "제한된 패널", liveRoute: "실시간 경로", localWhisperMode: "로컬 Whisper 모델이 현재 {language} 모드로 오디오를 전사하고 있습니다.", modelUnavailable: "모델 사용 불가", models: "모델", modelsReady: "준비된 모델", modelsTab: "모델", navigation: "탐색", no: "아니요", noModelSelected: "선택된 모델 없음", offline: "오프라인", online: "온라인", operationsAndAccessControl: "운영 및 접근 제어", operator: "운영자", ops: "운영", operational: "정상", pickModelLater: "나중에 모델 선택", pushToTalkNeedsSupport: "푸시투톡에는 마이크 권한과 브라우저의 Web Audio 지원이 필요합니다.", recordingRelease: "녹음 중... 놓으면 전송", replyStyle: "응답 스타일", running: "실행 중", runtime: "런타임", runtimeLive: "활성 런타임", saveProfile: "프로필 저장", saving: "저장 중...", savingProfile: "저장 중...", secureEntry: "보안 प्रवेश", send: "보내기", sending: "보내는 중...", showCommandDeck: "명령 패널 표시", showIdeas: "아이디어 보기", signInToEnterOload: "oload에 들어가려면 로그인하세요", signOut: "로그아웃", signedInRole: "로그인 역할", signingOut: "로그아웃 중...", stop: "중지", streaming: "스트리밍 중...", theme: "테마", transcribing: "전사 중...", typeYourMessage: "메시지를 입력하세요...", unableSaveVoicePreference: "음성 전사 설정을 저장할 수 없습니다.", useFirstAvailableLocalModel: "첫 번째 사용 가능한 로컬 모델 사용", voice: "음성", voiceTranscription: "음성 전사", waitingForModelOutput: "모델 출력 대기 중...", workspacePages: "워크스페이스 페이지", workspaceStaysHidden: "로그인하기 전까지 워크스페이스는 숨겨집니다. 이 기기에서 세션을 유지하려면 로그인 상태 유지를 선택하세요.", yes: "예"
  },
  portuguese: {
    access: "Acesso", accountAndAccess: "Conta e acesso", activity: "Atividade", admin: "Admin", adminPage: "Página admin", archive: "Arquivar", archiving: "Arquivando...", assistant: "Assistente", attentionNeeded: "Atenção necessária", audioWhileHeld: "O áudio só é gravado enquanto o botão de falar estiver pressionado.", autoDetect: "Detecção automática", beforeSignOut: "Antes de sair", chat: "Chat", chooseSiteTheme: "Escolher tema do site", clear: "Limpar", commandDeck: "Painel de comandos", comms: "Comms", conversationSafety: "Segurança da conversa", currentArea: "Área atual", currentBriefing: "Resumo atual", currentConversation: "Conversa atual", currentDestination: "Destino atual", currentlyActive: "Atualmente ativa", currentlyArchived: "Atualmente arquivada", defaultModel: "Modelo padrão", doNotAskAgain: "Não perguntar novamente neste dispositivo", endpoint: "Endpoint", execution: "Execução", fullDeck: "Painel completo", gatewayOffline: "Gateway offline", gatewayOnline: "Gateway online", gatewayPosture: "Estado do gateway", gatewayStatus: "Status do gateway", guide: "Guia", help: "Ajuda", hide: "Ocultar", hideIdeas: "Ocultar ideias", holdToRecord: "Segure o botão de fala para gravar. Solte para parar, transcrever e enviar.", holdToTalk: "Segure para falar", identity: "Identidade", installedNotRunning: "Instalado, sem execução", jobs: "Tarefas", keepConversationReady: "Quer manter esta conversa pronta para a próxima vez?", limitedDeck: "Painel limitado", liveRoute: "Rota ativa", localWhisperMode: "Um modelo Whisper local está transcrevendo o áudio no modo {language}.", modelUnavailable: "Modelo indisponível", models: "Modelos", modelsReady: "Modelos prontos", modelsTab: "Modelos", navigation: "Navegação", no: "Não", noModelSelected: "Nenhum modelo selecionado", offline: "Offline", online: "Online", operationsAndAccessControl: "Operações e controle de acesso", operator: "Operador", ops: "Ops", operational: "Operacional", pickModelLater: "Escolher modelo depois", pushToTalkNeedsSupport: "O push-to-talk precisa de acesso ao microfone e suporte a Web Audio no navegador.", recordingRelease: "Gravando... solte para enviar", replyStyle: "Estilo de resposta", running: "Em execução", runtime: "Runtime", runtimeLive: "Runtime ativo", saveProfile: "Salvar perfil", saving: "Salvando...", savingProfile: "Salvando...", secureEntry: "Entrada segura", send: "Enviar", sending: "Enviando...", showCommandDeck: "Mostrar painel de comandos", showIdeas: "Mostrar ideias", signInToEnterOload: "Entre para acessar o oload", signOut: "Sair", signedInRole: "Papel conectado", signingOut: "Saindo...", stop: "Parar", streaming: "Transmitindo...", theme: "Tema", transcribing: "Transcrevendo...", typeYourMessage: "Digite sua mensagem...", unableSaveVoicePreference: "Não foi possível salvar a preferência de transcrição de voz.", useFirstAvailableLocalModel: "Usar o primeiro modelo local disponível", voice: "Voz", voiceTranscription: "Transcrição de voz", waitingForModelOutput: "Aguardando saída do modelo...", workspacePages: "Páginas do workspace", workspaceStaysHidden: "O workspace fica oculto até você entrar. Escolha permanecer conectado se quiser manter uma sessão persistente neste dispositivo.", yes: "Sim"
  },
  russian: {
    access: "Доступ", accountAndAccess: "Аккаунт и доступ", activity: "Активность", admin: "Админ", adminPage: "Страница админа", archive: "Архив", archiving: "Архивация...", assistant: "Ассистент", attentionNeeded: "Требуется внимание", audioWhileHeld: "Аудио записывается только пока кнопка разговора удерживается.", autoDetect: "Автоопределение", beforeSignOut: "Перед выходом", chat: "Чат", chooseSiteTheme: "Выбрать тему сайта", clear: "Очистить", commandDeck: "Панель команд", comms: "Связь", conversationSafety: "Безопасность диалога", currentArea: "Текущая область", currentBriefing: "Текущая сводка", currentConversation: "Текущий диалог", currentDestination: "Текущий раздел", currentlyActive: "Сейчас активен", currentlyArchived: "Сейчас в архиве", defaultModel: "Модель по умолчанию", doNotAskAgain: "Больше не спрашивать на этом устройстве", endpoint: "Эндпоинт", execution: "Выполнение", fullDeck: "Полная панель", gatewayOffline: "Шлюз офлайн", gatewayOnline: "Шлюз онлайн", gatewayPosture: "Состояние шлюза", gatewayStatus: "Статус шлюза", guide: "Руководство", help: "Помощь", hide: "Скрыть", hideIdeas: "Скрыть идеи", holdToRecord: "Удерживайте кнопку разговора для записи. Отпустите, чтобы остановить запись, распознать и отправить.", holdToTalk: "Удерживать для разговора", identity: "Идентичность", installedNotRunning: "Установлено, не запущено", jobs: "Задачи", keepConversationReady: "Оставить этот диалог готовым к следующему разу?", limitedDeck: "Ограниченная панель", liveRoute: "Живой маршрут", localWhisperMode: "Локальная модель Whisper распознаёт аудио в режиме {language}.", modelUnavailable: "Модель недоступна", models: "Модели", modelsReady: "Готовые модели", modelsTab: "Модели", navigation: "Навигация", no: "Нет", noModelSelected: "Модель не выбрана", offline: "Офлайн", online: "Онлайн", operationsAndAccessControl: "Операции и контроль доступа", operator: "Оператор", ops: "Операции", operational: "Работает", pickModelLater: "Выбрать модель позже", pushToTalkNeedsSupport: "Для push-to-talk нужны разрешение на микрофон и поддержка Web Audio в браузере.", recordingRelease: "Запись... отпустите для отправки", replyStyle: "Стиль ответа", running: "Запущено", runtime: "Среда выполнения", runtimeLive: "Активная среда", saveProfile: "Сохранить профиль", saving: "Сохранение...", savingProfile: "Сохранение...", secureEntry: "Безопасный вход", send: "Отправить", sending: "Отправка...", showCommandDeck: "Показать панель команд", showIdeas: "Показать идеи", signInToEnterOload: "Войдите, чтобы открыть oload", signOut: "Выйти", signedInRole: "Роль пользователя", signingOut: "Выход...", stop: "Стоп", streaming: "Поток...", theme: "Тема", transcribing: "Распознавание...", typeYourMessage: "Введите сообщение...", unableSaveVoicePreference: "Не удалось сохранить настройку распознавания речи.", useFirstAvailableLocalModel: "Использовать первую доступную локальную модель", voice: "Голос", voiceTranscription: "Распознавание речи", waitingForModelOutput: "Ожидание ответа модели...", workspacePages: "Страницы рабочего пространства", workspaceStaysHidden: "Рабочее пространство скрыто, пока вы не войдёте. Выберите сохранение входа, если хотите постоянную сессию на этом устройстве.", yes: "Да"
  },
  spanish: {
    access: "Acceso", accountAndAccess: "Cuenta y acceso", activity: "Actividad", admin: "Admin", adminPage: "Página admin", archive: "Archivar", archiving: "Archivando...", assistant: "Asistente", attentionNeeded: "Se necesita atención", audioWhileHeld: "El audio solo se graba mientras mantienes pulsado el botón de hablar.", autoDetect: "Detección automática", beforeSignOut: "Antes de cerrar sesión", chat: "Chat", chooseSiteTheme: "Elegir tema del sitio", clear: "Limpiar", commandDeck: "Panel de comandos", comms: "Comms", conversationSafety: "Seguridad de la conversación", currentArea: "Área actual", currentBriefing: "Resumen actual", currentConversation: "Conversación actual", currentDestination: "Destino actual", currentlyActive: "Actualmente activa", currentlyArchived: "Actualmente archivada", defaultModel: "Modelo predeterminado", doNotAskAgain: "No volver a preguntar en este dispositivo", endpoint: "Endpoint", execution: "Ejecución", fullDeck: "Panel completo", gatewayOffline: "Gateway sin conexión", gatewayOnline: "Gateway en línea", gatewayPosture: "Estado del gateway", gatewayStatus: "Estado del gateway", guide: "Guía", help: "Ayuda", hide: "Ocultar", hideIdeas: "Ocultar ideas", holdToRecord: "Mantén pulsado el botón de hablar para grabar. Suéltalo para detener, transcribir y enviar.", holdToTalk: "Mantén para hablar", identity: "Identidad", installedNotRunning: "Instalado, sin ejecutar", jobs: "Trabajos", keepConversationReady: "¿Quieres dejar esta conversación lista para la próxima vez?", limitedDeck: "Panel limitado", liveRoute: "Ruta activa", localWhisperMode: "Un modelo Whisper local está transcribiendo el audio en modo {language}.", modelUnavailable: "Modelo no disponible", models: "Modelos", modelsReady: "Modelos listos", modelsTab: "Modelos", navigation: "Navegación", no: "No", noModelSelected: "Ningún modelo seleccionado", offline: "Sin conexión", online: "En línea", operationsAndAccessControl: "Operaciones y control de acceso", operator: "Operador", ops: "Ops", operational: "Operativo", pickModelLater: "Elegir modelo después", pushToTalkNeedsSupport: "Push-to-talk necesita acceso al micrófono y soporte Web Audio en el navegador.", recordingRelease: "Grabando... suelta para enviar", replyStyle: "Estilo de respuesta", running: "En ejecución", runtime: "Runtime", runtimeLive: "Runtime activo", saveProfile: "Guardar perfil", saving: "Guardando...", savingProfile: "Guardando...", secureEntry: "Entrada segura", send: "Enviar", sending: "Enviando...", showCommandDeck: "Mostrar panel de comandos", showIdeas: "Mostrar ideas", signInToEnterOload: "Inicia sesión para entrar en oload", signOut: "Cerrar sesión", signedInRole: "Rol conectado", signingOut: "Cerrando sesión...", stop: "Detener", streaming: "Transmitiendo...", theme: "Tema", transcribing: "Transcribiendo...", typeYourMessage: "Escribe tu mensaje...", unableSaveVoicePreference: "No se pudo guardar la preferencia de transcripción de voz.", useFirstAvailableLocalModel: "Usar el primer modelo local disponible", voice: "Voz", voiceTranscription: "Transcripción de voz", waitingForModelOutput: "Esperando la salida del modelo...", workspacePages: "Páginas del espacio de trabajo", workspaceStaysHidden: "El espacio de trabajo permanece oculto hasta que inicies sesión. Elige mantener la sesión si quieres conservar una sesión persistente en este dispositivo.", yes: "Sí"
  },
};

const EXTRA_UI_TRANSLATIONS: Record<ResolvedUiLanguage, Partial<Record<UiTranslationKey, string>>> = {
  english: {
    commandDeckDestinationsIntro: "Chat, Admin, and Help each open as their own desktop destination.",
    currentFocus: "Current focus",
    downloadPdfManual: "Download PDF manual",
    glossary: "Glossary",
    glossaryTerms: "Glossary terms",
    helpManualSubtitle: "Technical reference for the AI stack, local runtime, provider routing, retrieval, prompting, jobs, and administrative controls.",
    helpManualTitle: "oload Operator Guide",
    helpPageIntro: "Technical reference first, plain-language translation second, and free outside reading links at the bottom.",
    localAccount: "Local account",
    manualAvailableWithoutSignIn: "Manual is available without a signed-in identity.",
    manualSections: "Manual sections",
    overview: "Overview",
    plainLanguage: "In plain language",
    operationalSteps: "Operational steps",
    references: "References",
    referencesIntro: "Official docs come first for accuracy. The blog and course links are useful when you want the same ideas explained in a more human teaching voice.",
    referencesTitle: "Free docs, courses, and blog-style explainers",
    technicalDetail: "Technical detail",
    technicalSummary: "Technical summary",
    thinkingOfItAs: "Think of it as:",
    yourAccount: "Your account",
  },
  arabic: { commandDeckDestinationsIntro: "تفتح الدردشة والإدارة والمساعدة كل منها كوجهة مستقلة على سطح المكتب.", currentFocus: "التركيز الحالي", downloadPdfManual: "تنزيل دليل PDF", glossary: "المصطلحات", glossaryTerms: "مصطلحات الدليل", helpManualSubtitle: "مرجع تقني لحزمة الذكاء الاصطناعي ووقت التشغيل المحلي وتوجيه المزودين والاسترجاع والتوجيه والمهام وعناصر التحكم الإدارية.", helpManualTitle: "دليل تشغيل oload", helpPageIntro: "المرجع التقني أولاً، ثم الشرح المبسط، ثم روابط القراءة المجانية في الأسفل.", localAccount: "حساب محلي", manualAvailableWithoutSignIn: "الدليل متاح حتى بدون تسجيل الدخول.", manualSections: "أقسام الدليل", overview: "نظرة عامة", plainLanguage: "بلغة بسيطة", operationalSteps: "خطوات التشغيل", references: "المراجع", referencesIntro: "تأتي الوثائق الرسمية أولاً للدقة. المدونات والدورات مفيدة عندما تريد شرحاً أكثر بشرية للأفكار نفسها.", referencesTitle: "وثائق ودورات وشروحات مجانية", technicalDetail: "التفاصيل التقنية", technicalSummary: "الملخص التقني", thinkingOfItAs: "فكر فيها كالتالي:", yourAccount: "حسابك" },
  bengali: { commandDeckDestinationsIntro: "Chat, Admin, এবং Help প্রতিটিই নিজস্ব ডেস্কটপ গন্তব্য হিসেবে খোলে।", currentFocus: "বর্তমান ফোকাস", downloadPdfManual: "PDF ম্যানুয়াল ডাউনলোড", glossary: "শব্দকোষ", glossaryTerms: "শব্দকোষের শব্দ", helpManualSubtitle: "AI স্ট্যাক, লোকাল রানটাইম, প্রোভাইডার রাউটিং, রিট্রিভাল, প্রম্পটিং, জবস, এবং অ্যাডমিন কন্ট্রোলের টেকনিক্যাল রেফারেন্স।", helpManualTitle: "oload অপারেটর গাইড", helpPageIntro: "প্রথমে টেকনিক্যাল রেফারেন্স, তারপর সহজ ভাষার ব্যাখ্যা, আর নিচে ফ্রি রিডিং লিংক।", localAccount: "লোকাল অ্যাকাউন্ট", manualAvailableWithoutSignIn: "সাইন ইন ছাড়াই ম্যানুয়াল পাওয়া যায়।", manualSections: "ম্যানুয়াল সেকশন", overview: "ওভারভিউ", plainLanguage: "সহজ ভাষায়", operationalSteps: "অপারেশনাল ধাপ", references: "রেফারেন্স", referencesIntro: "সঠিকতার জন্য অফিসিয়াল ডকস আগে রাখা হয়েছে। একই ধারণা আরও সহজভাবে বুঝতে ব্লগ ও কোর্স লিংকগুলো কাজে লাগে।", referencesTitle: "ফ্রি ডকস, কোর্স, আর ব্লগ-ধরনের ব্যাখ্যা", technicalDetail: "টেকনিক্যাল বিস্তারিত", technicalSummary: "টেকনিক্যাল সারাংশ", thinkingOfItAs: "এভাবে ভাবুন:", yourAccount: "আপনার অ্যাকাউন্ট" },
  chinese: { commandDeckDestinationsIntro: "聊天、管理和帮助都会作为各自独立的桌面目标打开。", currentFocus: "当前重点", downloadPdfManual: "下载 PDF 手册", glossary: "术语表", glossaryTerms: "术语数量", helpManualSubtitle: "面向 AI 栈、本地运行时、提供方路由、检索、提示、任务和管理控制的技术参考。", helpManualTitle: "oload 操作指南", helpPageIntro: "先看技术参考，再看通俗解释，底部还有免费的延伸阅读链接。", localAccount: "本地账户", manualAvailableWithoutSignIn: "无需登录也可查看手册。", manualSections: "手册章节", overview: "概览", plainLanguage: "通俗解释", operationalSteps: "操作步骤", references: "参考资料", referencesIntro: "官方文档优先保证准确性。如果你想用更自然的教学语气理解相同概念，博客和课程链接会更有帮助。", referencesTitle: "免费文档、课程和博客式讲解", technicalDetail: "技术细节", technicalSummary: "技术摘要", thinkingOfItAs: "可以把它理解为：", yourAccount: "你的账户" },
  farsi: { commandDeckDestinationsIntro: "چت، مدیریت و راهنما هر کدام به‌صورت مقصد مستقل دسکتاپ باز می‌شوند.", currentFocus: "تمرکز فعلی", downloadPdfManual: "دانلود راهنمای PDF", glossary: "واژه‌نامه", glossaryTerms: "اصطلاحات واژه‌نامه", helpManualSubtitle: "مرجع فنی برای پشته هوش مصنوعی، ران‌تایم محلی، مسیریابی ارائه‌دهنده، بازیابی، پرامپت، کارها و کنترل‌های مدیریتی.", helpManualTitle: "راهنمای اپراتور oload", helpPageIntro: "ابتدا مرجع فنی، سپس توضیح ساده، و در پایین پیوندهای رایگان برای مطالعه بیشتر.", localAccount: "حساب محلی", manualAvailableWithoutSignIn: "راهنما بدون ورود هم در دسترس است.", manualSections: "بخش‌های راهنما", overview: "نمای کلی", plainLanguage: "به زبان ساده", operationalSteps: "گام‌های عملیاتی", references: "منابع", referencesIntro: "برای دقت، ابتدا مستندات رسمی آمده‌اند. پیوندهای وبلاگ و دوره زمانی مفیدند که همان ایده‌ها را با توضیح انسانی‌تر بخواهید.", referencesTitle: "مستندات، دوره‌ها و توضیح‌های وبلاگی رایگان", technicalDetail: "جزئیات فنی", technicalSummary: "خلاصه فنی", thinkingOfItAs: "این‌طور تصورش کنید:", yourAccount: "حساب شما" },
  french: { commandDeckDestinationsIntro: "Chat, Admin et Help s'ouvrent chacun comme une destination bureau distincte.", currentFocus: "Focus actuel", downloadPdfManual: "Télécharger le manuel PDF", glossary: "Glossaire", glossaryTerms: "Termes du glossaire", helpManualSubtitle: "Référence technique pour la pile IA, l'exécution locale, le routage des fournisseurs, la récupération, le prompting, les tâches et les contrôles administratifs.", helpManualTitle: "Guide opérateur oload", helpPageIntro: "Référence technique d'abord, explication en langage clair ensuite, puis des liens gratuits de lecture en bas.", localAccount: "Compte local", manualAvailableWithoutSignIn: "Le manuel est disponible sans connexion.", manualSections: "Sections du manuel", overview: "Vue d'ensemble", plainLanguage: "En langage clair", operationalSteps: "Étapes opérationnelles", references: "Références", referencesIntro: "Les documents officiels passent en premier pour l'exactitude. Les liens de blog et de cours sont utiles si vous voulez une explication plus humaine des mêmes idées.", referencesTitle: "Docs, cours et explications de blog gratuits", technicalDetail: "Détail technique", technicalSummary: "Résumé technique", thinkingOfItAs: "Pensez-y comme à :", yourAccount: "Votre compte" },
  hindi: { commandDeckDestinationsIntro: "Chat, Admin, और Help हर एक अपना अलग डेस्कटॉप गंतव्य खोलते हैं।", currentFocus: "वर्तमान फोकस", downloadPdfManual: "PDF मैनुअल डाउनलोड करें", glossary: "शब्दावली", glossaryTerms: "शब्दावली शब्द", helpManualSubtitle: "AI स्टैक, लोकल रनटाइम, प्रदाता रूटिंग, रिट्रीवल, प्रॉम्प्टिंग, जॉब्स और प्रशासनिक नियंत्रणों के लिए तकनीकी संदर्भ।", helpManualTitle: "oload ऑपरेटर गाइड", helpPageIntro: "पहले तकनीकी संदर्भ, फिर सरल भाषा की व्याख्या, और नीचे मुफ्त पढ़ने के लिंक।", localAccount: "लोकल अकाउंट", manualAvailableWithoutSignIn: "बिना साइन इन के भी मैनुअल उपलब्ध है।", manualSections: "मैनुअल अनुभाग", overview: "सारांश", plainLanguage: "सरल भाषा में", operationalSteps: "ऑपरेशनल स्टेप्स", references: "संदर्भ", referencesIntro: "सटीकता के लिए आधिकारिक दस्तावेज़ पहले आते हैं। ब्लॉग और कोर्स लिंक तब उपयोगी होते हैं जब आप वही बातें अधिक मानवीय अंदाज़ में समझना चाहते हैं।", referencesTitle: "मुफ्त डॉक्स, कोर्स और ब्लॉग-स्टाइल व्याख्याएँ", technicalDetail: "तकनीकी विवरण", technicalSummary: "तकनीकी सारांश", thinkingOfItAs: "इसे ऐसे समझें:", yourAccount: "आपका खाता" },
  japanese: { commandDeckDestinationsIntro: "Chat、Admin、Help はそれぞれ独立したデスクトップ画面として開きます。", currentFocus: "現在の焦点", downloadPdfManual: "PDF マニュアルをダウンロード", glossary: "用語集", glossaryTerms: "用語数", helpManualSubtitle: "AI スタック、ローカルランタイム、プロバイダールーティング、検索、プロンプト、ジョブ、管理操作の技術リファレンスです。", helpManualTitle: "oload オペレーターガイド", helpPageIntro: "まず技術リファレンス、次に平易な説明、最後に無料の参考リンクです。", localAccount: "ローカルアカウント", manualAvailableWithoutSignIn: "サインインしなくてもマニュアルを利用できます。", manualSections: "マニュアル項目", overview: "概要", plainLanguage: "平易な説明", operationalSteps: "運用ステップ", references: "参考資料", referencesIntro: "正確さのために公式ドキュメントを先に置いています。同じ内容をもっと人間的な説明で理解したいときは、ブログやコースが役立ちます。", referencesTitle: "無料ドキュメント、コース、ブログ解説", technicalDetail: "技術詳細", technicalSummary: "技術概要", thinkingOfItAs: "たとえるなら：", yourAccount: "あなたのアカウント" },
  korean: { commandDeckDestinationsIntro: "채팅, 관리자, 도움말은 각각 독립된 데스크톱 목적지로 열립니다.", currentFocus: "현재 초점", downloadPdfManual: "PDF 설명서 다운로드", glossary: "용어집", glossaryTerms: "용어집 항목", helpManualSubtitle: "AI 스택, 로컬 런타임, 공급자 라우팅, 검색, 프롬프팅, 작업, 관리 제어를 위한 기술 참고서입니다.", helpManualTitle: "oload 운영자 가이드", helpPageIntro: "기술 참고를 먼저, 쉬운 설명을 다음에, 아래에는 무료 읽을거리를 둡니다.", localAccount: "로컬 계정", manualAvailableWithoutSignIn: "로그인하지 않아도 설명서를 볼 수 있습니다.", manualSections: "설명서 섹션", overview: "개요", plainLanguage: "쉬운 설명", operationalSteps: "운영 단계", references: "참고 자료", referencesIntro: "정확성을 위해 공식 문서를 먼저 둡니다. 같은 내용을 더 사람답게 설명한 자료가 필요하면 블로그와 코스 링크가 도움이 됩니다.", referencesTitle: "무료 문서, 코스, 블로그형 설명", technicalDetail: "기술 세부사항", technicalSummary: "기술 요약", thinkingOfItAs: "이렇게 생각해 보세요:", yourAccount: "내 계정" },
  portuguese: { commandDeckDestinationsIntro: "Chat, Admin e Help abrem cada um como seu próprio destino no desktop.", currentFocus: "Foco atual", downloadPdfManual: "Baixar manual em PDF", glossary: "Glossário", glossaryTerms: "Termos do glossário", helpManualSubtitle: "Referência técnica para a pilha de IA, runtime local, roteamento de provedores, recuperação, prompting, tarefas e controles administrativos.", helpManualTitle: "Guia do operador oload", helpPageIntro: "Primeiro a referência técnica, depois a explicação em linguagem simples, e no fim links gratuitos para leitura externa.", localAccount: "Conta local", manualAvailableWithoutSignIn: "O manual está disponível sem entrar na conta.", manualSections: "Seções do manual", overview: "Visão geral", plainLanguage: "Em linguagem simples", operationalSteps: "Passos operacionais", references: "Referências", referencesIntro: "A documentação oficial vem primeiro pela precisão. Os links de blog e curso ajudam quando você quer as mesmas ideias explicadas de forma mais humana.", referencesTitle: "Docs, cursos e explicações em estilo blog gratuitos", technicalDetail: "Detalhe técnico", technicalSummary: "Resumo técnico", thinkingOfItAs: "Pense nisso como:", yourAccount: "Sua conta" },
  russian: { commandDeckDestinationsIntro: "Чат, Админ и Помощь открываются как отдельные настольные разделы.", currentFocus: "Текущий фокус", downloadPdfManual: "Скачать PDF-руководство", glossary: "Глоссарий", glossaryTerms: "Термины глоссария", helpManualSubtitle: "Технический справочник по AI-стеку, локальной среде выполнения, маршрутизации провайдеров, извлечению контекста, промптам, заданиям и административным элементам управления.", helpManualTitle: "Руководство оператора oload", helpPageIntro: "Сначала технический справочник, затем объяснение простым языком, а внизу бесплатные ссылки для чтения.", localAccount: "Локальный аккаунт", manualAvailableWithoutSignIn: "Руководство доступно и без входа.", manualSections: "Разделы руководства", overview: "Обзор", plainLanguage: "Простым языком", operationalSteps: "Операционные шаги", references: "Ссылки", referencesIntro: "Для точности сначала идут официальные документы. Блоги и курсы полезны, когда те же идеи нужны в более человеческом объяснении.", referencesTitle: "Бесплатные доки, курсы и блоговые объяснения", technicalDetail: "Технические детали", technicalSummary: "Техническое резюме", thinkingOfItAs: "Думайте об этом так:", yourAccount: "Ваш аккаунт" },
  spanish: { commandDeckDestinationsIntro: "Chat, Admin y Help se abren cada uno como su propio destino de escritorio.", currentFocus: "Enfoque actual", downloadPdfManual: "Descargar manual PDF", glossary: "Glosario", glossaryTerms: "Términos del glosario", helpManualSubtitle: "Referencia técnica para la pila de IA, el runtime local, el enrutamiento de proveedores, la recuperación, el prompting, los trabajos y los controles administrativos.", helpManualTitle: "Guía del operador de oload", helpPageIntro: "Primero la referencia técnica, después la explicación en lenguaje claro, y abajo enlaces gratuitos para seguir leyendo.", localAccount: "Cuenta local", manualAvailableWithoutSignIn: "El manual está disponible sin iniciar sesión.", manualSections: "Secciones del manual", overview: "Resumen", plainLanguage: "En lenguaje claro", operationalSteps: "Pasos operativos", references: "Referencias", referencesIntro: "La documentación oficial va primero por precisión. Los enlaces de blogs y cursos sirven cuando quieres las mismas ideas explicadas con una voz más humana.", referencesTitle: "Docs, cursos y explicaciones tipo blog gratis", technicalDetail: "Detalle técnico", technicalSummary: "Resumen técnico", thinkingOfItAs: "Piénsalo así:", yourAccount: "Tu cuenta" },
};

export function resolveUiLanguage(language?: VoiceTranscriptionLanguage | null): ResolvedUiLanguage {
  if (!language || language === "auto" || language === "united-states" || language === "united-kingdom" || language === "english") {
    return "english";
  }

  return language;
}

export function translateUi(
  language: VoiceTranscriptionLanguage | null | undefined,
  key: UiTranslationKey,
  variables?: Record<string, string | number>,
) {
  const resolved = resolveUiLanguage(language);
  let text = EXTRA_UI_TRANSLATIONS[resolved][key]
    ?? UI_TRANSLATIONS[resolved][key]
    ?? EXTRA_UI_TRANSLATIONS.english[key]
    ?? UI_TRANSLATIONS.english[key]
    ?? key;

  for (const [name, value] of Object.entries(variables ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value));
  }

  return text;
}

export function translateUiText(
  language: VoiceTranscriptionLanguage | null | undefined,
  sourceText: string,
  variables?: Record<string, string | number>,
) {
  const resolved = resolveUiLanguage(language);
  let text = UI_LITERAL_TRANSLATIONS[sourceText]?.[resolved] ?? sourceText;

  for (const [name, value] of Object.entries(variables ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value));
  }

  return text;
}
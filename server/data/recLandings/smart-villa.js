"use strict";

/**
 * /rec/smart-villa — the villa-owner landing page.
 *
 * Same porting rule as smart-home.js: the Arabic is the pre-rebuild wording the
 * printed material was written against, so treat copy edits as a client
 * decision rather than a code decision.
 *
 * Differences from the developer page that are deliberate, not oversights:
 *
 *   `sections` puts `journey` ahead of `roi` and `proof` after both. A villa
 *   owner is making an emotional B2C purchase and wants to know who turns up at
 *   their house and when, before they are told about returns.
 *
 *   `proof.testimonials` reuses the developer quotes (owner decision). They are
 *   real, but they are from property companies, so `proof.lede` frames them as
 *   project references — it must not be dropped, or the section starts implying
 *   these are homeowner quotes.
 */

const { withEmphasis } = require("./emphasis");
const { HERO_VIDEO, PARTNER_LOGOS, SALES_PHONE, TESTIMONIALS, WHATSAPP_NUMBER } = require("./shared");

const title = "حلول المنزل الذكي لملاك الفلل";

module.exports = {
  slug: "smart-villa",
  audience: "villa-owners",
  audienceLabel: "ملاك الفلل",
  title,
  englishTitle: "Smart Home Automation for Villa Owners",

  metaTitle: "أتمتة الفلل الذكية لملاك الفلل | معاينة منزلية مجانية | اتكس",
  metaDescription:
    "جهّز فيلتك مع اتكس: تحكم بالبوابة، الإضاءة، المكيفات، وكاميرات المحيط من تطبيق عربي واحد. تركيب نظيف خلال 48 ساعة ودعم محلي 24/7، مع معاينة منزلية مجانية.",
  ogImage: "/assets/solutions/smart-home.webp",

  wa: { number: WHATSAPP_NUMBER, phone: SALES_PHONE },

  sections: ["hero", "products", "journey", "roi", "proof", "sustainability", "integration", "faq", "quote"],

  hero: {
    badge: "لملاك الفلل",
    h1: "فيلتك كلها من جوالك",
    h1Highlight: "من جوالك",
    lede: "تحكّم بالبوابة والإضاءة والمكيفات والكاميرات من تطبيق عربي واحد. تركيب نظيف خلال 48 ساعة ودعم محلي.",
    chips: [
      "تحكم بالبوابة الرئيسية",
      "مشاهد للإضاءة والمكيف",
      "أمان للأطفال والضيوف",
      "تنبيهات فورية للهاتف",
      "توافق مع HomeKit وAlexa",
    ],
    stats: [
      { value: "5 دقائق", label: "لتفعيل وضعيات المنزل" },
      { value: "30%", label: "توفير في استهلاك الطاقة" },
      { value: "24/7", label: "دعم فني محلي" },
    ],
    video: { ...HERO_VIDEO, caption: "شاهد كيف تتحول الفيلا إلى منزل متصل بالكامل" },
  },

  primaryCta: {
    label: "احجز معاينة مجانية",
    waText: "السلام عليكم، أرغب في حجز معاينة مجانية لتجهيز فيلتي بأنظمة ATEX.",
  },
  secondaryCta: { label: "أو اترك رقمك", target: "quote" },

  filterTabs: [
    { key: "all", label: "الكل" },
    { key: "intercom", label: "بوابة واستقبال الضيوف" },
    { key: "screens", label: "لوحة إدارة المنزل" },
    { key: "locks", label: "حماية الأبواب والدخول" },
    { key: "switches", label: "إضاءة ومشاهد المعيشة" },
    { key: "doorbell", label: "حديقة ومحيط الفيلا" },
    { key: "vacuum", label: "تنظيف وخدمات ذكية" },
    { key: "sound", label: "ترفيه متعدد الغرف" },
  ],

  productsSection: {
    kicker: "الأنظمة",
    title: "ما نركّبه في فيلتك",
    lede: "اختر نظاماً، أو تصفّح الكل.",
  },

  products: [
    {
      key: "intercom",
      category: "intercom",
      tag: "Villa Entry",
      title: "بوابة استقبال الضيوف الذكية",
      image: "/assets/products/banners/intercom.webp",
      imageAlt: "بوابة استقبال الضيوف الذكية من ATEX",
      desc: "شاهد الضيف وافتح البوابة من جوالك، وامنح رموز دخول مؤقتة.",
      bullets: [
        "فتح البوابة أو الباب الخارجي من التطبيق أو عبر بصمة أفراد العائلة.",
        "سجل فيديو كامل لكل زيارة مع تنبيه فوري على الهاتف عند الضغط على الجرس.",
      ],
      extra:
        "ربط الانتركوم بكاميرا البوابة والأبواب الجانبية يمنحك رؤية مباشرة وتحكمًا سريعًا حتى أثناء السفر.",
    },
    {
      key: "screens",
      category: "screens",
      tag: "Home Tablet",
      title: "لوحة مركزية لإدارة البيت",
      image: "/assets/products/banners/screens.webp",
      imageAlt: "لوحة مركزية لإدارة الفيلا",
      desc: "شاشة واحدة تعرض الإضاءة والأبواب وحرارة الغرف والتنبيهات.",
      bullets: [
        "مؤقتات وسيناريوهات جاهزة مثل «رجعنا للبيت» أو «وقت النوم».",
        "حسابات منفصلة للأبناء مع صلاحيات محددة وإشعارات للوالدين.",
      ],
      extra:
        "تجمع الإضاءة، المكيفات، الصوتيات، وأنظمة الأمان في شاشة واحدة قابلة للتخصيص لكل فرد من العائلة.",
    },
    {
      key: "locks",
      category: "locks",
      tag: "Secure Access",
      title: "أقفال الأبواب الذكية للفيلا",
      image: "/assets/products/banners/locks.webp",
      imageAlt: "أقفال ذكية تناسب أبواب الفلل",
      desc: "دخول بالبصمة أو رقم سري أو الجوال، ورموز مؤقتة للضيوف.",
      bullets: [
        "تنبيهات مباشرة عند محاولات الدخول غير المصرح بها مع صفارة إنذار مدمجة.",
        "بطاريات طويلة العمر مع إشعار مبكر بانخفاض الطاقة وخيار النسخ الاحتياطي بالمفتاح التقليدي.",
      ],
      extra:
        "تحكم عن بعد أو عبر بصمة أفراد الأسرة، مع سجل دخول لحظي يرسل إشعارات فورية عند وصول الأبناء أو فرق الصيانة.",
    },
    {
      key: "switches",
      category: "switches",
      tag: "Mood Lighting",
      title: "مفاتيح مشاهد الراحة",
      image: "/assets/products/banners/switches.webp",
      imageAlt: "مفاتيح مشاهد الإضاءة داخل الفيلا",
      desc: "تُركّب مكان المفتاح العادي، وتتحكم بالإضاءة والمكيف والستائر.",
      bullets: [
        "زر واحد لتفعيل مشاهد مثل «سهرة عائلية» أو «إغلاق كامل قبل النوم».",
        "إضاءة خلفية خافتة مع إمكانية إيقافها لراحة النوم، وتحكم صوتي عبر Siri أو Alexa.",
      ],
      extra:
        "تتكامل مع حساسات الحركة والإضاءة الطبيعية لتعديل السطوع تلقائياً وتوفير استهلاك الطاقة دون التضحية بالأجواء.",
    },
    {
      key: "doorbell",
      category: "doorbell",
      tag: "Outdoor Welcome",
      title: "كاميرا المدخل والحديقة",
      image: "/assets/products/banners/doorplates.webp",
      imageAlt: "كاميرا جرس ذكية لمحيط الفيلا",
      desc: "كاميرا جرس تصوّر المدخل والحديقة وترسل تنبيهاً على جوالك.",
      bullets: [
        "إضاءة تلقائية للمدخل مع إخطار صوتي عند اقتراب أحد أفراد العائلة.",
        "رسائل صوتية للضيوف تُشغّل في حال عدم وجود أحد بالمنزل مع حفظ التسجيل في السحابة.",
      ],
      extra:
        "تتصل بالانتركوم وتضيء تلقائياً عند استشعار الحركة، مع إشعار فوري إذا تعرضت البوابة لمحاولة عبث.",
    },
    {
      key: "vacuum",
      category: "vacuum",
      tag: "Central Vacuum",
      title: "نظام الشفط المركزي للفلة",
      image: "/assets/solutions/central-vacuum.webp",
      imageAlt: "نظام شفط مركزي للفيلا",
      desc: "منافذ شفط مخفية في كل دور، والوحدة خارج البيت فلا يوجد ضجيج.",
      bullets: [
        "خرطوم خفيف بطول يصل إلى 12 مترًا يغطي كل غرفة مع إمكانية تشغيله من المقبس.",
        "جدولة دورات التنظيف ومتابعة امتلاء الحاوية عبر التطبيق دون الحاجة لفتح الخزان.",
      ],
      extra:
        "توضع الوحدة المركزية في غرفة الخدمات لتقليل الضوضاء، مع فلترة دقيقة للغبار تلائم العائلات التي تعاني من الحساسية والربو.",
    },
    {
      key: "sound",
      category: "sound",
      tag: "Whole-Home Audio",
      title: "ترفيه صوتي لكل زاوية",
      image: "/assets/rec/sound-systems.webp",
      imageAlt: "نظام صوتيات متعدد المناطق",
      desc: "سماعات مخفية في الأسقف توزّع الصوت على الغرف والحديقة.",
      bullets: [
        "اختيار قوائم تشغيل مختلفة لكل منطقة أو توحيد الصوت في لحظة واحدة للحفلات.",
        "تكامل مع Spotify وApple Music وتحكم صوتي بالمساعدات الذكية.",
      ],
      extra:
        "قسّم الفيلا إلى مناطق صوتية متعددة وربطها بمشاهد المنزل الذكي لمناسبات العائلة أو الضيوف، مع إمكانية البث من الهاتف مباشرة.",
    },
  ],

  proof: {
    kicker: "مشاريع سبقتك",
    title: "نفس التقنيات في مشاريع سكنية راقية",
    lede: "نفس التقنيات الذكية اعتمدتها مشاريع سكنية راقية في المملكة – والآن نوفرها لفيلتك الخاصة.",
    logos: PARTNER_LOGOS,
    testimonials: TESTIMONIALS,
  },

  journey: {
    kicker: "خطوات العمل",
    title: "كيف نجهّز فيلتك",
    steps: [
      {
        n: "1",
        title: "معاينة مجانية",
        body: withEmphasis("نزور الفيلا أو نتواصل بمكالمة فيديو لنفهم احتياج العائلة وتوزيع الغرف."),
      },
      {
        n: "2",
        title: "التصميم",
        body: withEmphasis("نعطيك مخططاً يوضّح أماكن الأجهزة والإضاءة والشبكة قبل أي تنفيذ."),
      },
      {
        n: "3",
        title: "تركيب خلال 48 ساعة",
        body: withEmphasis("نركّب بلا تكسير، مع حماية للأثاث، ونختبر كل جهاز أمامك."),
      },
      {
        n: "4",
        title: "التسليم والدعم",
        body: withEmphasis("نضبط التطبيق لكل فرد، ويبقى الدعم المحلي متاح 24/7 مع صيانة دورية."),
      },
    ],
  },

  roi: {
    kicker: "الفائدة",
    title: "ماذا تستفيد؟",
    cards: [
      {
        icon: "bolt",
        title: "راحة للعائلة",
        body: withEmphasis("وضعيات جاهزة بضغطة واحدة، وإشعارات تطمئنك على البيت."),
      },
      {
        icon: "shield-halved",
        title: "أمان طوال اليوم",
        body: withEmphasis("كاميرات وأقفال وحساسات حركة تغطي البوابة والحديقة، بسجل دخول واحد."),
      },
      {
        icon: "building",
        title: "فاتورة أقل",
        body: withEmphasis("المكيف والإضاءة يعملان حسب وجودكم، فتنزل الفاتورة حتى 30%.", "30%"),
      },
    ],
  },

  sustainability: {
    kicker: "راحة مستدامة",
    title: "طاقة ذكية وأجهزة جاهزة للمستقبل في فيلتك",
    items: [
      {
        title: "توفير استهلاك الطاقة",
        body: withEmphasis("تشغيل تلقائي للتكييف والإضاءة، وتقارير تبيّن أين توفّر حتى 30%.", "30%"),
      },
      {
        title: "جاهزية النظام للمستقبل",
        body: withEmphasis("الأجهزة تتحدّث تلقائياً وتدعم Matter و Thread، فتقبل أي إضافة لاحقاً."),
      },
    ],
  },

  integration: {
    kicker: "ATEX Home Stack",
    title: "منصة واحدة تتحكم في كل تفاصيل فيلتك",
    lede: "نربط الأجهزة الداخلية والخارجية مع السحابة والتطبيقات اليومية، لتتحكم في الإضاءة، الأمن، والطاقة من مكان واحد دون تعقيد أو تعدد أنظمة.",
    layers: [
      {
        name: "طبقة الأجهزة",
        title: "شبكة موحدة تغطي كل زاوية",
        body: "تدعم أجهزة ATEX WiFi، Zigbee، BLE، وMatter في نفس الوقت، لتبقى الحساسات والأقفال والكاميرات متصلة في الطابقين والحديقة دون انقطاع.",
        bullets: [
          "شبكة Mesh تكافح النقاط الميتة وتضمن استجابة فورية للمشاهد والإشعارات في الطابق الأرضي والعلوي والملحق الخارجي.",
          "مصادقة مشفرة لكل جهاز جديد مع إشعارات عند محاولة إضافة جهاز غير مصرح به.",
        ],
      },
      {
        name: "طبقة المنصة",
        title: "منصة منزلية واحدة لكل الأجهزة",
        body: "لوحة ATEX Home تجمع الأجهزة، الحساسات، وجداول التشغيل في مكان واحد، مع نسخ احتياطي سحابي يضمن استمرار المشاهد حتى عند السفر.",
        bullets: [
          "مزامنة فورية بين التطبيق، الشاشة الجدارية، وأوامر الصوت مع وضعيات أوفلاين تعمل محليًا للسيناريوهات الأساسية.",
          "تكامل مباشر مع Apple Home وGoogle Home وAlexa لتفعيل الأوامر الصوتية والتحكم عن بعد.",
        ],
      },
      {
        name: "تجربة المستخدم",
        title: "تطبيقات موحدة للعائلة",
        body: "واجهة عربية بالكامل بإشعارات فورية، ملفات لكل فرد من العائلة، ووصول سريع للمشاهد اليومية مثل العودة للمنزل أو قفل البيت الكامل.",
        bullets: [],
        platformsTitle: "المنصات المدعومة",
        platforms: ["Android", "iOS", "Web Console"],
      },
    ],
    sidecard: {
      kicker: "Privacy First",
      title: "خصوصية بيانات عائلتك محمية 100%",
      lede: "السحابة مستضافة داخل المملكة، مع نسخ محلي مشفر في شاشة الفيلا لضمان استمرار الخدمة حتى عند انقطاع الإنترنت، وواجهة شفافة للتحكم فيما تتم مشاركته.",
      items: [
        {
          title: "تشفير شامل",
          body: "تشفير AES-256 لكل التسجيلات مع مفاتيح تخزين محلية لا تغادر الفيلا إلا بإذنك.",
        },
        {
          title: "وضع الخصوصية الفوري",
          body: "إيقاف الكاميرات الداخلية مؤقتًا بضغطة زر وتفعيل ستائر الخصوصية مع إشعار بالتفعيل على هواتف العائلة.",
        },
        {
          title: "لوحة مراقبة شفافة",
          body: "سجل واضح لكل من دخل الفيلا أو غيّر الإعدادات مع تنبيهات ذكية عند النشاط غير المألوف.",
        },
      ],
    },
  },

  faq: {
    title: "أسئلة ملاك الفلل الشائعة",
    items: [
      {
        q: "هل يحتاج التركيب إلى تكسير أو تمديدات جديدة؟",
        a: "80% من الأجهزة تركب مباشرة مكان المفاتيح والأقفال الحالية دون تكسير. نستخدم حلولاً لاسلكية ودعائم مخفية، وإذا احتاجت منطقة محددة سلكاً إضافيًا ننجزها بشكل مخفي ضمن مسارات مخصصة.",
      },
      {
        q: "ماذا يحدث عند انقطاع الإنترنت؟",
        a: "الأنظمة الأساسية مثل الأقفال الذكية ومفاتيح الإضاءة تستمر في العمل يدوياً وعبر الشبكة المحلية (Local Network) حتى بدون إنترنت. فقط ميزات التحكم عن بعد خارج المنزل ستتوقف مؤقتاً.",
      },
      {
        q: "هل تقدمون ضمان وخدمة ما بعد البيع؟",
        a: "نعم، تحصل على ضمان استبدال فوري لمدة سنتين لجميع الأجهزة مع زيارتين صيانة وقائية سنويًا، بالإضافة إلى خط دعم واتساب يعمل على مدار الساعة.",
      },
      {
        q: "هل يمكن ربط النظام بالمساعدات الصوتية والأجهزة التي أملكها؟",
        a: "بالتأكيد، المنصة متوافقة مع Apple Home وGoogle Home وAlexa، ويمكننا ربطها مع أجهزة مثبتة مسبقًا مثل كاميرات المراقبة أو أنظمة الري الذكية متى ما كانت تدعم البروتوكولات الشائعة.",
      },
      {
        q: "هل توجد رسوم شهرية ثابتة؟",
        a: "لا توجد اشتراكات مفاجئة؛ فقط رسوم خدمة سحابية رمزية تغطي تحديثات البرمجيات والدعم على مدار الساعة، ويمكن تعليقها في أي وقت إذا اكتفيت بالعمل المحلي.",
      },
      {
        q: "كيف يتم ضمان أمان وخصوصية بيانات السكان؟",
        a: "نطبق تشفير AES-256 على الاتصالات مع استضافة داخل المملكة، ويمكنك تشغيل وضع الخصوصية لإيقاف التسجيل الداخلي مؤقتًا، كما تبقى مفاتيح فك التشفير لديك فقط.",
      },
    ],
  },

  quote: {
    title: "اترك رقمك ونرد عليك",
    desc: "عبّئ بياناتك ونتواصل معك على واتساب.",
    submitLabel: "إرسال",
    fields: [
      {
        name: "name",
        apiField: "name",
        label: "اسم صاحب الفيلا",
        placeholder: "مثال: عبدالله بن محمد",
        type: "text",
        required: true,
        autocomplete: "name",
      },
      {
        name: "whatsapp",
        apiField: "whatsapp",
        label: "رقم الواتساب",
        placeholder: "05XXXXXXXX",
        type: "tel",
        required: true,
        dir: "ltr",
        inputmode: "tel",
        autocomplete: "tel",
      },
      {
        name: "companyName",
        apiField: "companyName",
        label: "الحي أو المدينة",
        placeholder: "مثال: حي الياسمين - الرياض",
        type: "text",
        required: false,
        autocomplete: "address-level2",
      },
      {
        name: "projectType",
        label: "نوع الفيلا",
        messageLabel: "نوع الفيلا",
        type: "select",
        required: false,
        options: [
          { value: "", label: "اختر نوع الفيلا" },
          { value: "فيلا مستقلة", label: "فيلا مستقلة" },
          { value: "فيلا دوبلكس متصلة", label: "فيلا دوبلكس متصلة" },
          { value: "قصر أو سكن فاخر", label: "قصر أو سكن فاخر" },
          { value: "فيلا شاطئية / استراحة", label: "فيلا شاطئية / استراحة" },
          { value: "أخرى", label: "أخرى" },
        ],
      },
      {
        name: "notes",
        label: "ملاحظات (اختياري)",
        messageLabel: "ملاحظات",
        placeholder: "عدد الأدوار، وهل الفيلا جاهزة أم تحت الإنشاء.",
        type: "textarea",
        required: false,
      },
    ],
  },
};

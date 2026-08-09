"use strict";

/**
 * /rec/smart-home — the real-estate developer landing page.
 *
 * Copy is ported verbatim from the pre-rebuild standalone page that the printed
 * brochures and QR codes point at. Do not "improve" the Arabic here without the
 * client asking: this wording is what the sales team quotes in the field.
 *
 * Two constraints the copy has to keep satisfying:
 *
 *   The H1 and metaTitle must lead with developer/project language. The site
 *   already ranks /solutions/smart-home ("أنظمة المنازل الذكية") and
 *   /industries/residential ("حلول المنازل الذكية في المملكة العربية السعودية")
 *   — a third page saying "منزل ذكي" in the same shape competes with both and
 *   Google picks one.
 *
 *   `sections` is the render order, and it differs from the villa page on
 *   purpose: a procurement manager wants proof that peers already bought before
 *   they will read a spec sheet, so `proof` sits directly under the hero here.
 */

const { withEmphasis } = require("./emphasis");
const { HERO_VIDEO, PARTNER_LOGOS, SALES_PHONE, TESTIMONIALS, WHATSAPP_NUMBER } = require("./shared");

const title = "حلول المنزل الذكي للمطورين العقاريين";

module.exports = {
  slug: "smart-home",
  audience: "developers",
  audienceLabel: "المطورون العقاريون",
  title,
  englishTitle: "Smart Home Systems for Real Estate Developers",

  metaTitle: "أنظمة المنزل الذكي للمطورين العقاريين والمشاريع السكنية | اتكس",
  metaDescription:
    "منظومة اتكس المتكاملة للمطورين العقاريين: انتركوم، شاشات، أقفال، مفاتيح ولوحات جرس رقمية ترفع القيمة الإيجارية وتسرّع بيع الوحدات، مع تركيب بلا تكسير ودعم فني محلي.",
  ogImage: "/assets/solutions/residential.webp",

  wa: { number: WHATSAPP_NUMBER, phone: SALES_PHONE },

  // Render order. Every key here must have a matching partial in views/partials/rec/.
  sections: ["hero", "proof", "products", "journey", "roi", "sustainability", "integration", "faq", "quote"],

  hero: {
    badge: "شريك المطورين العقاريين",
    h1: "وحدات ذكية تُباع أسرع وبقيمة أعلى",
    h1Highlight: "قيمة أعلى",
    lede: "نجهّز مشروعك بأنظمة المنزل الذكي: انتركوم، شاشات، أقفال، مفاتيح ولوحات جرس. تركيب بلا تكسير ودعم محلي.",
    chips: [
      "أنظمة الانتركوم الذكية",
      "شاشات ذكية للوحدات",
      "الأقفال الذكية",
      "مفاتيح الإنارة الذكية",
      "لوحات الجرس الرقمية",
    ],
    stats: [
      { value: "+15%", label: "قيمة إيجارية" },
      { value: "0%", label: "تعقيد في التركيب" },
      { value: "24/7", label: "دعم فني محلي" },
    ],
    video: { ...HERO_VIDEO, caption: "شاهد منظومة ATEX الذكية أثناء العمل" },
  },

  /**
   * The zero-friction primary action.
   *
   * A developer scanning a brochure QR is standing in an office or on a site
   * with one hand free. `waText` opens WhatsApp with the request already typed,
   * so the whole conversion is one tap — no fields. The quote form further down
   * is the secondary path, for anyone who would rather leave details than chat.
   */
  primaryCta: {
    label: "اطلب عرض سعر",
    waText: "السلام عليكم، أنا مطوّر عقاري وأرغب في عرض سعر لأنظمة ATEX لمشروعنا.",
  },
  secondaryCta: { label: "أو اترك رقمك", target: "quote" },

  filterTabs: [
    { key: "all", label: "الكل" },
    { key: "intercom", label: "أنظمة الانتركوم الذكية" },
    { key: "screens", label: "شاشات ذكية" },
    { key: "locks", label: "الأقفال الذكية" },
    { key: "switches", label: "مفاتيح الإنارة الذكية" },
    { key: "doorbell", label: "لوحات الجرس" },
    { key: "vacuum", label: "أنظمة الشفط المركزي" },
    { key: "sound", label: "أنظمة الصوت" },
  ],

  productsSection: {
    kicker: "الأنظمة",
    title: "ما نركّبه في مشروعك",
    lede: "اختر نظاماً، أو تصفّح الكل.",
  },

  products: [
    {
      key: "intercom",
      category: "intercom",
      tag: "Smart Intercom",
      title: "أنظمة الانتركوم الذكية",
      image: "/assets/products/banners/intercom.webp",
      imageAlt: "أنظمة الانتركوم الذكية من ATEX",
      desc: "الساكن يرى الزائر ويفتح الباب من جواله، مع تسجيل لكل زيارة.",
      bullets: ["تكامل كامل مع الأقفال الذكية وأنظمة الأمن.", "تسجيل تلقائي عالي الدقة مع تخزين آمن سحابي."],
      extra: "يتيح إدارة الصلاحيات للمشرفين والأنظمة الأمنية مع سجل دخول قابل للتتبع عبر السحابة.",
    },
    {
      key: "screens",
      category: "screens",
      tag: "Smart Screens",
      title: "شاشات ذكية للوحدات",
      image: "/assets/products/banners/screens.webp",
      imageAlt: "شاشات التحكم الذكية للوحدات",
      desc: "شاشة على الجدار تجمع أجهزة الوحدة في واجهة عربية واحدة.",
      bullets: ["تصميم زجاجي فاخر مع إضاءة محيطية.", "دعم سيناريوهات السكن الذكي مثل «الخروج» و«الاستقبال»."],
      extra: "يمكن ربط الشاشات بمستشعرات الطاقة وتوزيع التنبيهات على فرق الصيانة آنياً.",
    },
    {
      key: "locks",
      category: "locks",
      tag: "Smart Locks",
      title: "الأقفال الذكية",
      image: "/assets/products/banners/locks.webp",
      imageAlt: "أقفال ATEX الذكية متعددة طرق الدخول",
      desc: "دخول بالبصمة أو رمز أو الجوال، مع سجل يوضّح من دخل ومتى.",
      bullets: [
        "تنبيهات فورية عند محاولات الفتح غير المصرح به.",
        "تشغيل على بطاريات طويلة العمر مع إشعارات انخفاض الشحن.",
      ],
      extra: "يدعم إنشاء رموز مؤقتة للعمالة المؤقتة مع تسجيل دقيق لكل محاولة دخول.",
    },
    {
      key: "switches",
      category: "switches",
      tag: "Smart Switches",
      title: "مفاتيح الإنارة الذكية",
      image: "/assets/products/banners/switches.webp",
      imageAlt: "مفاتيح الإضاءة الذكية من ATEX",
      desc: "تُركّب مكان المفتاح العادي مباشرة، وتعمل باللمس والصوت.",
      bullets: [
        "تفعيل سيناريوهات مخصصة مثل «الترحيب» و«الخروج».",
        "إضاءة خلفية خافتة لإرشاد المستخدم ليلاً.",
      ],
      extra: "تتكامل مع حساسات الحركة والإضاءة الطبيعية لتخفيض الاستهلاك تلقائياً.",
    },
    {
      key: "doorbell",
      category: "doorbell",
      tag: "Doorbell Signs",
      title: "لوحات الجرس الذكية",
      image: "/assets/products/banners/doorplates.webp",
      imageAlt: "لوحات الجرس الرقمية المضيئة",
      desc: "لوحة مضيئة بشعار المشروع وأسماء السكان، مربوطة بالانتركوم.",
      bullets: ["مقاومة للعوامل الجوية مع إضاءة LED متدرجة.", "قابلة للتخصيص بخطوط وشعارات المشروع."],
      extra: "يرسل تنبيهات فورية للسكان مع إمكانية تسجيل الرسائل الصوتية والمرئية للزوار.",
    },
    {
      key: "vacuum",
      category: "vacuum",
      tag: "Central Vacuum",
      title: "أنظمة الشفط المركزي",
      image: "/assets/solutions/central-vacuum.webp",
      imageAlt: "أنظمة الشفط المركزي من ATEX",
      desc: "شفط مركزي هادئ داخل الوحدات، بدل المكانس التقليدية.",
      bullets: [
        "منافذ توزيع مخفية مع فلاتر هواء عالية الكفاءة.",
        "إدارة ذكية لاستهلاك الطاقة وجدولة التشغيل عبر التطبيق.",
      ],
      extra: "توضع الوحدة المركزية في غرفة الخدمات لتقليل الضوضاء وتسهيل الصيانة الدورية.",
    },
    {
      key: "sound",
      category: "sound",
      tag: "Sound Systems",
      title: "أنظمة الصوت الموزعة",
      image: "/assets/rec/sound-systems.webp",
      imageAlt: "أنظمة الصوت من ATEX",
      desc: "سماعات مخفية توزّع الصوت على الغرف، وتُدار من التطبيق.",
      bullets: [
        "سماعات عالية الدقة مخفية في الأسقف والجدران.",
        "تحكم صوتي وتكامل مع خدمات البث السحابي والمساعدات الذكية.",
      ],
      extra: "تتيح تقسيم المناطق الصوتية وربطها بمشاهد المنزل الذكي لمناسبات مختلفة.",
    },
  ],

  proof: {
    kicker: "شهادات موثوقة",
    title: "قصص نجاح من شركائنا المطورين",
    lede: "",
    logos: PARTNER_LOGOS,
    testimonials: TESTIMONIALS,
  },

  journey: {
    kicker: "خطوات العمل",
    title: "كيف ننفّذ المشروع",
    steps: [
      {
        n: "1",
        title: "دراسة المخططات",
        body: withEmphasis(
          "نراجع مخططات مشروعك ونصمم أفضل تغطية بأقل عدد أجهزة، وهذا يوفّر 10% من تكلفة النظام.",
          "10%"
        ),
      },
      {
        n: "2",
        title: "التوريد والتركيب",
        body: withEmphasis("توريد على مراحل مشروعك، وتركيب بفنيين معتمدين بلا تكسير ولا تمديدات."),
      },
      {
        n: "3",
        title: "البرمجة والتشغيل",
        body: withEmphasis("نبرمج وضعيات جاهزة مثل «الخروج من المنزل»، ونختبر كل جهاز قبل التسليم."),
      },
      {
        n: "4",
        title: "التسليم والدعم",
        body: withEmphasis("ندرّب فريقك على النظام، والدعم المحلي متاح 24/7 مع استبدال فوري للقطع."),
      },
    ],
  },

  roi: {
    kicker: "العائد",
    title: "ماذا يعود عليك؟",
    cards: [
      {
        icon: "bolt",
        title: "بيع أسرع للوحدات",
        body: withEmphasis("الوحدات الذكية تُباع أسرع بنسبة 20% من الوحدات العادية.", "20%"),
      },
      {
        icon: "building",
        title: "زيادة العائد الإيجاري",
        body: withEmphasis("الشاشات والأقفال ولوحات الجرس ترفع قيمة الإيجار 10-15%.", "10-15%"),
      },
      {
        icon: "shield-halved",
        title: "تشغيل أقل تكلفة",
        body: withEmphasis("الأنظمة تعمل تلقائياً، فتقل تكاليف التشغيل والأمن."),
      },
    ],
  },

  sustainability: {
    kicker: "الموثوقية والمستقبل",
    title: "الريادة في كفاءة الطاقة والاستدامة",
    items: [
      {
        title: "توفير استهلاك الطاقة",
        body: withEmphasis("التحكم الذكي بالتكييف والإضاءة يخفّض فواتير الكهرباء حتى 30%.", "30%"),
      },
      {
        title: "جاهزية النظام للمستقبل",
        body: withEmphasis("الأجهزة قابلة للتحديث وتدعم Matter و Thread، فلا تحتاج استبدالها لاحقاً."),
      },
    ],
  },

  integration: {
    kicker: "ATEX Integration Stack",
    title: "التكامل الذكي الذي يربط كل جهاز في مشروعك",
    lede: "نربط الطبقة الميدانية، والمنصة السحابية، وتجربة المستخدم في مسار واحد موثوق، لتبسيط التشغيل وتوفير البيانات للمنظومات العقارية الأخرى بدون تعقيد.",
    layers: [
      {
        name: "طبقة الأجهزة",
        title: "بروتوكولات اتصال متعددة الآمان",
        body: "تشغيل موحد للأجهزة عبر WiFi، Zigbee، BLE، وMatter لضمان تغطية كاملة حتى في الأبراج عالية الكثافة، مع تصميم Mesh يقلل نقاط التعطل.",
        bullets: [
          "واجهات جاهزة للانتركوم، الأقفال، الشاشات، المفاتيح، وأنظمة الأمن المحيطي.",
          "مصادقة وتشفير TLS للأجهزة السلكية واللاسلكية مع مراقبة دورية للحزم.",
        ],
      },
      {
        name: "طبقة المنصة",
        title: "سحابة موحدة بمداخل تكامل جاهزة",
        body: "لوحة تحكم مبنية على بنية Tuya، تدير الأجهزة، الأحداث، وسيناريوهات التشغيل مع بوابة API موثقة للمطورين.",
        bullets: [
          "مزامنة آنية للبيانات مع دعم العمل أوفلاين عبر لوحات التحكم المحلية.",
          "واجهات REST وWebhook لربط PMS، BMS، وأنظمة CRM دون تطوير من الصفر.",
        ],
      },
      {
        name: "تجربة المستخدم",
        title: "تطبيقات موحدة للسكان والإدارة",
        body: "واجهة عربية بالكامل بإشعارات فورية، تحكم بالوحدات، وصلاحيات متدرجة تناسب اتحادات الملاك والمطورين.",
        bullets: [],
        platformsTitle: "المنصات المدعومة",
        platforms: ["Android", "iOS", "Web Console"],
      },
    ],
    sidecard: {
      kicker: "Reliability",
      title: "ضمان استقرار تشغيلي بنسبة 99.9%",
      lede: "مراكز بيانات موزعة داخل المملكة مع مراقبة أمنية على مدار الساعة، ونظام تنبيهات استباقي يضمن جاهزية كاملة لكل مشروع.",
      items: [
        { title: "تشفير شامل", body: "تشفير AES-256 لبيانات المستخدم مع مفاتيح إدارة محلية لضمان الامتثال." },
        {
          title: "حماية سيبرانية",
          body: "اختبارات اختراق دورية وتوافق مع معايير الهيئة الوطنية للأمن السيبراني.",
        },
        { title: "مؤشرات فورية", body: "لوحة مراقبة لحظية للأداء مع تنبيهات تصعيدية حسب أولويات المشروع." },
      ],
    },
  },

  faq: {
    title: "أسئلة المطورين الشائعة",
    items: [
      {
        q: "هل يحتاج النظام إلى تمديدات أسلاك خاصة؟",
        a: "معظم أجهزتنا (مثل المفاتيح والأقفال) تعمل لاسلكياً (Wireless) وتستبدل المفاتيح التقليدية مباشرة دون الحاجة لتكسير الجدران أو تغيير البنية التحتية للكهرباء. الأنظمة السلكية (PoE) متاحة للمشاريع الكبيرة حسب الطلب.",
      },
      {
        q: "ماذا يحدث عند انقطاع الإنترنت؟",
        a: "الأنظمة الأساسية مثل الأقفال الذكية ومفاتيح الإضاءة تستمر في العمل يدوياً وعبر الشبكة المحلية (Local Network) حتى بدون إنترنت. فقط ميزات التحكم عن بعد خارج المنزل ستتوقف مؤقتاً.",
      },
      {
        q: "هل تقدمون ضمان وخدمة ما بعد البيع؟",
        a: "نعم، نقدم ضمان استبدال فوري لمدة سنتين على جميع المنتجات، بالإضافة إلى عقود صيانة سنوية للمشاريع لضمان راحة السكان وإدارة الاتحاد.",
      },
      {
        q: "هل يدعم النظام التكامل مع أنظمة إدارة الممتلكات (PMS)؟",
        a: "نعم، نوفر واجهات برمجة تطبيقات (APIs) متكاملة تتيح ربط منظومة ATEX بسلاسة مع أنظمة PMS الشائعة (مثل عقار و فلكس) وأنظمة إدارة المباني (BMS)، لتبسيط تسجيل الدخول وإدارة الوحدات.",
      },
      {
        q: "ما هي التكلفة طويلة الأجل (TCO) للنظام؟",
        a: "نظامنا مصمم لتقليل التكلفة الإجمالية للملكية (TCO). التكاليف السنوية تقتصر على رسوم الخدمة السحابية والدعم الفني، وهي رسوم تنافسية جداً مقارنة بتكاليف التشغيل اليدوية والصيانة للأجهزة التقليدية.",
      },
      {
        q: "كيف يتم ضمان أمان وخصوصية بيانات السكان؟",
        a: "نحن نستخدم تشفيرًا من الدرجة العسكرية (AES-256) لجميع الاتصالات السحابية وتخزين البيانات. بيانات السكان محفوظة ضمن إطار تشريعات الخصوصية المحلية، مع ضمان عدم مشاركتها مع أي طرف ثالث.",
      },
    ],
  },

  /**
   * The secondary, lead-persisting path.
   *
   * `apiField` maps each input onto the /api/contact contract. Fields with no
   * `apiField` are folded into the composed `message` instead — that endpoint
   * takes name / whatsapp / companyName / commercialRegister / message and
   * nothing else, so anything extra has to travel as prose.
   *
   * Only name and whatsapp are required. Every additional required field on a
   * phone-typed form costs leads, and project type is a nice-to-have that sales
   * will ask about in the WhatsApp thread anyway.
   */
  quote: {
    title: "اترك رقمك ونرد عليك",
    desc: "عبّئ بياناتك ونرسل لك عرض سعر على واتساب.",
    submitLabel: "إرسال",
    fields: [
      {
        name: "name",
        apiField: "name",
        label: "الاسم الكامل",
        placeholder: "الاسم هنا",
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
        label: "الشركة",
        placeholder: "اسم الشركة",
        type: "text",
        required: false,
        autocomplete: "organization",
      },
      {
        name: "projectType",
        label: "نوع المشروع",
        messageLabel: "نوع المشروع",
        type: "select",
        required: false,
        options: [
          { value: "", label: "اختر نوع المشروع" },
          { value: "مبنى شقق سكنية", label: "مبنى شقق سكنية" },
          { value: "مجمع فلل", label: "مجمع فلل" },
          { value: "مبنى تجاري/مكتبي", label: "مبنى تجاري/مكتبي" },
          { value: "مشروع متعدد الاستخدامات", label: "مشروع متعدد الاستخدامات" },
          { value: "أخرى", label: "أخرى" },
        ],
      },
      {
        name: "notes",
        label: "ملاحظات (اختياري)",
        messageLabel: "ملاحظات",
        placeholder: "عدد الوحدات أو مرحلة المشروع.",
        type: "textarea",
        required: false,
      },
    ],
  },
};

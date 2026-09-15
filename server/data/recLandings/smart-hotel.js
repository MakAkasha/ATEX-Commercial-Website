"use strict";

/**
 * /rec/smart-hotel — the hotel engineering landing page.
 *
 * Unlike smart-home.js and smart-villa.js, this page is not ported from a
 * pre-rebuild brochure page: it is written for one reader, the Director of
 * Engineering of a 40-120 key hotel in Jeddah — the person who holds the
 * technical veto — with hotel owners and MEP consultants reading over his
 * shoulder. So the copy rules here are different from the other two:
 *
 *   No adjective does the work of a fact. This reader has been let down by an
 *   integrator before and discounts marketing language on sight.
 *
 *   The spine of the page is the one durable differentiator: KNX is an open
 *   international standard (ISO/IEC 14543-3), the programming file is handed
 *   over unlocked, and the room operates with no internet. That is the answer
 *   to the question he actually has — what happens to my building if this
 *   contractor disappears. It sits in `sustainability`, which renders in the
 *   loud navy band, and is restated concretely in `integration.sidecard`.
 *   No competitor is named or attacked anywhere; the argument only has to be
 *   made, not aimed.
 *
 *   `sections` puts `integration` third, before the commercial sections. A
 *   procurement manager wants proof, a villa owner wants the visit process, and
 *   an engineering director wants to know what it talks to before he will read
 *   anything about returns.
 *
 * Claim guardrails this file is written against (see the marketing brief):
 *   no price, ever; no certifying body named (فنيين معتمدين is allowed, naming
 *   the certifier is not); no hotel client named and no wording that implies a
 *   hotel reference list exists; Western digits only; and the 48-hour
 *   installation figure is a villa claim that must not appear here.
 */

const { withEmphasis } = require("./emphasis");
const { PARTNER_LOGOS, SALES_PHONE, TESTIMONIALS, WHATSAPP_NUMBER } = require("./shared");

const title = "نظام إدارة غرف الفنادق GRMS في جدة";

module.exports = {
  slug: "smart-hotel",
  audience: "hotels",
  audienceLabel: "الإدارة الهندسية في الفنادق",
  title,
  englishTitle: "Guest Room Management System (GRMS) for Hotels",

  metaTitle: "نظام إدارة غرف الفنادق GRMS على KNX في جدة | اتكس",
  metaDescription:
    "نظام إدارة غرف الفنادق GRMS على معيار KNX المفتوح في جدة: منطق الإشغال، منظم الحرارة الذكي، تكامل PMS و BMS، وتسليم ملف البرمجة مفتوحاً بلا قفل.",
  ogImage: "/assets/solutions/smart-hotel.webp",

  wa: { number: WHATSAPP_NUMBER, phone: SALES_PHONE },

  // Render order. Every key here must have a matching partial in views/partials/rec/.
  sections: ["hero", "products", "integration", "journey", "roi", "sustainability", "proof", "faq", "quote"],

  hero: {
    badge: "للإدارة الهندسية والاستشاريين",
    // Non-breaking spaces bind the Latin tokens to the Arabic word they belong
    // to. Without them the wrap strands "GRMS" at the head of line two, which
    // reads as a new clause rather than the end of the noun phrase.
    h1: "نظام إدارة غرف الفنادق GRMS بمعيار مفتوح",
    h1Highlight: "بمعيار مفتوح",
    lede: "أتمتة الفنادق على KNX لفنادق 40-120 غرفة في جدة: منطق الإشغال، الإضاءة، التكييف، وتكامل PMS. الغرفة تعمل كاملة بدون إنترنت.",
    chips: [
      "بطاقة الغرفة ومنطق الإشغال",
      "منظم الحرارة الذكي لكل غرفة",
      "تكامل PMS و BMS",
      "KNX — ISO/IEC 14543-3",
      "ملف البرمجة يُسلَّم مفتوحاً",
    ],
    stats: [
      { value: "0", label: "اعتماد على الإنترنت في تشغيل الغرفة" },
      { value: "+40%", label: "تحسين في كفاءة التشغيل" },
      { value: "24/7", label: "دعم فني محلي من جدة" },
    ],
    // A still, not the shared hero footage: the video is 2.2-2.9MB and this
    // page's audience arrives on cellular. The poster carries the frame on its
    // own, so the sources list is left empty and nothing is ever fetched.
    video: { poster: "/assets/hero-video/hotel-room.webp", sources: [] },
  },

  /**
   * The zero-friction primary action, and the one offer that needs no pending
   * commercial decision: a free 20-minute site survey. The drawing review — the
   * offer aimed at consultants rather than owners — is carried in the quote
   * section copy, since a consultant arrives with a PDF, not with a building.
   */
  primaryCta: {
    label: "احجز معاينة موقع مجانية",
    waText: "السلام عليكم، أنا من الإدارة الهندسية في فندق بجدة وأرغب في حجز معاينة موقع مجانية لنظام GRMS.",
  },
  secondaryCta: { label: "أو اترك رقمك", target: "quote" },

  filterTabs: [
    { key: "all", label: "الكل" },
    { key: "room", label: "لوحة الغرفة" },
    { key: "occupancy", label: "الإشغال والطاقة" },
    { key: "hvac", label: "التكييف" },
    { key: "door", label: "الباب والدخول" },
    { key: "service", label: "طلبات الخدمة" },
    { key: "lighting", label: "الإضاءة" },
    { key: "dashboard", label: "لوحة التشغيل" },
    { key: "public", label: "المناطق العامة" },
  ],

  productsSection: {
    kicker: "مكوّنات النظام",
    title: "ماذا يفعل نظام GRMS داخل الغرفة فعلياً",
    lede: "ثمانية أجزاء تعمل على ناقل واحد داخل الغرفة. اختر جزءاً، أو تصفّح الكل.",
  },

  products: [
    {
      key: "room",
      category: "room",
      tag: "Room Panel",
      title: "لوحة التحكم بالغرفة",
      image: "/assets/products/banners/screens.webp",
      imageAlt: "لوحة التحكم بغرفة الفندق من اتكس",
      desc: "لوحة واحدة بجانب السرير تجمع الإضاءة ودرجة الحرارة والستائر وطلبات الخدمة.",
      bullets: [
        "واجهة بلغتين بأيقونات ثابتة لا تحتاج شرحاً من موظف الاستقبال.",
        "حدود عليا ودنيا لدرجة الحرارة تضبطها الإدارة الهندسية، لا النزيل.",
      ],
      extra:
        "اللوحة طرف على الناقل وليست دماغ النظام، فتعطّلها لا يوقف الغرفة: الإضاءة والتكييف يستمران على المفاتيح الميدانية، وتُستبدل اللوحة خلال دقائق بلا إعادة برمجة.",
    },
    {
      key: "occupancy",
      category: "occupancy",
      tag: "Occupancy Logic",
      title: "بطاقة الغرفة ومنطق الإشغال",
      image: "/assets/products/banners/keycard.webp",
      imageAlt: "قارئ بطاقة الغرفة على قفل الباب في الفندق",
      desc: "حامل البطاقة وحساس الحضور وتماس الباب يقررون معاً متى تكون الغرفة مشغولة فعلاً.",
      bullets: [
        "سحب البطاقة يرفع درجة الحرارة إلى وضع التوفير بدل إطفاء التكييف فجأة.",
        "حساس حضور يمنع إطفاء الغرفة على نزيل نائم أو داخل دورة المياه.",
      ],
      extra:
        "غرفة غير مباعة تُدار بوضع ثالث مختلف عن «مشغولة» و«مغادرة»: تبريد صيانة خفيف يحمي الأثاث والرطوبة دون تشغيل كامل، وهذا هو المصدر الأكبر لتوفير الطاقة في الفنادق لأن معظم ساعات السنة في فندق 40-120 غرفة ليست ساعات إشغال.",
    },
    {
      key: "hvac",
      category: "hvac",
      tag: "HVAC Control",
      title: "التحكم بالتكييف داخل الغرفة",
      image: "/assets/solutions/smart-hotel.webp",
      imageAlt: "لوحة التحكم بالمناخ داخل غرفة الفندق",
      desc: "تحكم بوحدة المناولة داخل الغرفة: سرعات المروحة وصمام الماء البارد ونطاق الضبط.",
      bullets: [
        "نطاق ميت مبرمج يمنع تذبذب الصمام وتآكل المحرك وشكاوى الضجيج.",
        "إيقاف التبريد تلقائياً عند فتح باب الشرفة عبر تماس مغناطيسي.",
      ],
      extra:
        "نعمل على وحدات المناولة القائمة كما هي في الغالب، فالتجديد لا يبدأ باستبدال ميكانيكي: نستبدل منظم الحرارة ونعيد ربط الصمام والسرعات على الناقل، ويبقى المخطط الميكانيكي للفندق دون تغيير.",
    },
    {
      key: "door",
      category: "door",
      tag: "Door & Access",
      title: "القفل وحالة الباب",
      image: "/assets/products/banners/locks.webp",
      imageAlt: "أقفال غرف الفنادق وحالة الباب",
      desc: "قفل الغرفة وتماس الباب يغذيان النظام بحالة الدخول، لا بمجرد فتح وإغلاق.",
      bullets: [
        "سجل دخول لكل غرفة يميّز بين النزيل وفريق الإشراف الداخلي والصيانة.",
        "تنبيه للإدارة الهندسية عند بقاء باب مفتوحاً مدة غير معتادة.",
      ],
      extra:
        "نتكامل مع منظومة الأقفال التي يعتمدها الفندق بدل فرض بديل، ويبقى الفتح الميكانيكي الاحتياطي قائماً كما هو لأن أي نظام يشترط الكهرباء لفتح باب غرفة هو مخاطرة تشغيلية لا ميزة.",
    },
    {
      key: "service",
      category: "service",
      tag: "Guest Service",
      title: "لوحة الخدمة الخارجية DND و MUR",
      image: "/assets/products/banners/doorplates.webp",
      imageAlt: "لوحة عدم الإزعاج وطلب تنظيف الغرفة",
      desc: "لوحة مضيئة خارج الباب: عدم الإزعاج، طلب التنظيف، والجرس.",
      bullets: [
        "حالة الغرفة تصل إلى الإشراف الداخلي مباشرة بدل الطرق على الأبواب.",
        "إلغاء تلقائي لطلب التنظيف بعد تنفيذه من داخل الغرفة.",
      ],
      extra:
        "هذه اللوحة هي أكثر جزء يلمسه النزيل ويقرأه المدير العام في تقارير الشكاوى، وربطها بحالة الغرفة في PMS يختصر جولة الإشراف الداخلي الصباحية ويقلل دخول الغرف في غير وقتها.",
    },
    {
      key: "lighting",
      category: "lighting",
      tag: "Lighting Control",
      title: "إضاءة الغرفة والمشاهد",
      image: "/assets/solutions/smart-ligting.webp",
      imageAlt: "التحكم بإضاءة غرف الفندق",
      desc: "مشاهد إضاءة جاهزة: الاستقبال، القراءة، المشاهدة، والممر الليلي.",
      bullets: [
        "إضاءة ممر ليلية خافتة تعمل بالحركة بين السرير ودورة المياه.",
        "تعتيم DALI للدوائر التي تحتمله، وتشغيل تقليدي لما لا يحتمله.",
      ],
      extra:
        "المشاهد تُبرمج مرة وتُعدّل لاحقاً من ملف المشروع نفسه، فتغيير هوية الإضاءة بعد تجديد الأثاث لا يحتاج استبدال أجهزة ولا زيارة مصنع.",
    },
    {
      key: "dashboard",
      category: "dashboard",
      tag: "Engineering Dashboard",
      title: "لوحة التشغيل للإدارة الهندسية",
      image: "/assets/solutions/ICT-Systems.webp",
      imageAlt: "لوحة تشغيل مركزية لغرف الفندق",
      desc: "شاشة واحدة تعرض حالة كل غرفة: الإشغال، درجة الحرارة، الأعطال، والاستهلاك.",
      bullets: [
        "تنبيه عند صمام لا يستجيب أو مروحة متوقفة قبل أن يتصل النزيل.",
        "تقرير استهلاك لكل غرفة يكشف الغرف الشاذة بدل متوسط المبنى.",
      ],
      extra:
        "اللوحة تعمل على خادم محلي داخل الفندق، والوصول عن بعد خيار إضافي يُفعَّل أو يُغلق بقرار الإدارة الهندسية، فالتشغيل اليومي لا يعتمد على اتصال خارجي ولا على منصة يملكها المورّد.",
    },
    {
      key: "public",
      category: "public",
      tag: "Public Areas",
      title: "الممرات والمناطق العامة والواجهة",
      image: "/assets/solutions/security-Systems.webp",
      imageAlt: "التحكم بإضاءة الممرات والمناطق العامة في الفندق",
      desc: "الممرات والبهو والقاعات والواجهة على المنظومة نفسها، بجدولة زمنية ومشاهد.",
      bullets: [
        "جدولة فلكية تتبع الشروق والغروب بدل مؤقت يُضبط يدوياً كل فصل.",
        "تحكم DMX للإنارة المعمارية للواجهة في المناسبات الوطنية والمواسم.",
      ],
      extra:
        "توحيد المناطق العامة مع الغرف على ناقل واحد يعني فريق صيانة واحداً وقطع غيار واحدة ومصدر تقارير واحداً، بدل ثلاثة أنظمة منفصلة لكل منها مورّد وعقد صيانة مختلف.",
    },
  ],

  integration: {
    // Latin kicker, rendered dir="ltr" like the other two pages. It is also the
    // page's one natural English mention of the phrase MEP consultants search
    // in English — the Arabic body carries the term as GRMS everywhere else.
    kicker: "Guest Room Management System",
    title: "ما الذي يتكامل معه النظام، وكيف",
    lede: "نظام إدارة غرف الفنادق لا يعيش وحده: هو طبقة تجلس بين الغرفة وبين PMS و BMS ومنظومة الدخول والتكييف. هذه هي الطبقات الثلاث التي نسلّمها، وما تتحدث به كل طبقة.",
    layers: [
      {
        name: "الطبقة الميدانية",
        title: "ناقل KNX داخل الغرفة",
        body: "كل غرفة وحدة تشغيل مستقلة: وحدات التحكم ومنظم الحرارة وحامل البطاقة وتماس الباب على ناقل KNX واحد. المنطق مخزّن داخل أجهزة الغرفة نفسها، فلا خادم مركزي يوقف مئة غرفة إذا توقف.",
        bullets: [
          "عطل في غرفة يبقى داخل تلك الغرفة ولا ينتقل إلى الدور أو المبنى.",
          "توسعة لاحقة بإضافة أجهزة على الناقل نفسه دون استبدال ما رُكّب.",
        ],
      },
      {
        name: "طبقة التكامل",
        title: "PMS و BMS والدخول والتكييف",
        body: "بوابة تكامل تربط الغرف بأنظمة الفندق القائمة: تسجيل الدخول والمغادرة وحالة الغرفة من PMS، أنظمة المبنى عبر BACnet أو Modbus، ومنظومة الأقفال والتحكم بالدخول.",
        bullets: [
          "تسجيل دخول النزيل في PMS يهيّئ الغرفة قبل وصوله إليها.",
          "حالة الإشراف الداخلي وعدم الإزعاج ترتد إلى PMS في اللحظة نفسها.",
          "ربط HVAC المركزي و BMS لقراءة الأحمال الفعلية لا التقديرية.",
        ],
      },
      {
        name: "طبقة التشغيل",
        title: "لوحة الإدارة الهندسية والتقارير",
        body: "خادم محلي داخل الفندق يجمع حالة الغرف والأعطال والاستهلاك ويصدر تقارير دورية، مع صلاحيات متدرجة للإدارة الهندسية والاستقبال والإشراف الداخلي.",
        bullets: [],
        platformsTitle: "الواجهات المدعومة",
        platforms: ["KNX", "BACnet/IP", "Modbus TCP", "DALI", "DMX"],
      },
    ],
    sidecard: {
      kicker: "Handover",
      title: "ما تستلمه عند التسليم",
      lede: "التسليم عندنا ملف ومفتاح، لا وعد بخدمة. هذه القائمة هي ما يجعل الفندق قادراً على تشغيل النظام وتعديله وتوسعته بأي جهة أخرى لاحقاً.",
      items: [
        {
          title: "ملف البرمجة مفتوحاً",
          body: "مشروع KNX كاملاً بلا قفل ولا كلمة مرور، مع جدول عناوين الأجهزة والمجموعات. أي جهة تعمل على KNX تستطيع فتحه والتعديل عليه.",
        },
        {
          title: "مخططات كما نُفّذت",
          body: "مخططات as-built لمسارات الناقل ولوحات الأدوار، وقائمة الأجهزة بأرقامها ومواقعها غرفة غرفة.",
        },
        {
          title: "تدريب ودعم وضمان",
          body: "تدريب للإدارة الهندسية والاستقبال والإشراف الداخلي، ضمان استبدال فوري لمدة سنتين، ودعم واتساب على مدار الساعة بفنيين معتمدين.",
        },
      ],
    },
  },

  journey: {
    kicker: "خطوات التنفيذ",
    title: "كيف ننفّذ في فندق يعمل ولا يستطيع إغلاق أدوار",
    steps: [
      {
        n: "1",
        title: "معاينة ومراجعة مخططات",
        body: withEmphasis(
          "معاينة موقع مجانية مدتها 20 دقيقة، ومراجعة مجانية للمخططات إذا كان معك استشاري.",
          "20 دقيقة"
        ),
      },
      {
        n: "2",
        title: "غرفة نموذجية أولاً",
        body: withEmphasis("ننفّذ غرفة واحدة كاملة وتعتمدها الإدارة الهندسية قبل أن نلمس بقية الأدوار."),
      },
      {
        n: "3",
        title: "تنفيذ غرفة غرفة",
        body: withEmphasis(
          "نعمل داخل علب الكهرباء القائمة بلا تكسير، فتخرج الغرفة من الخدمة يوم عمل واحد لا أسبوعاً."
        ),
      },
      {
        n: "4",
        title: "تشغيل وتدريب وتسليم",
        body: withEmphasis("اختبار لكل غرفة بمحضر، تدريب الفرق الثلاثة، ثم تسليم الملف والمخططات."),
      },
    ],
  },

  roi: {
    kicker: "العائد التشغيلي",
    title: "ماذا يتغيّر في تشغيل الفندق",
    cards: [
      {
        icon: "bolt",
        title: "طاقة تتبع الإشغال",
        body: withEmphasis(
          "التكييف والإضاءة يتبعان حالة الغرفة الفعلية، والغرف غير المباعة تتوقف عن استهلاك تشغيل كامل."
        ),
      },
      {
        icon: "building",
        title: "كفاءة تشغيل أعلى",
        body: withEmphasis(
          "حالة الغرف تصل للفرق تلقائياً، وقد سجّلنا تحسناً في كفاءة التشغيل يصل إلى +40%.",
          "+40%"
        ),
      },
      {
        icon: "shield-halved",
        title: "أصل تملكه لا تستأجره",
        body: withEmphasis("النظام أصل في دفاتر الفندق، لا اشتراك يتوقف بتوقف العلاقة مع مورّد."),
      },
    ],
  },

  sustainability: {
    kicker: "المعيار المفتوح",
    title: "ماذا يحدث لمبناك إذا اختفى المقاول",
    items: [
      {
        title: "KNX معيار دولي مفتوح",
        body: withEmphasis(
          "KNX موثّق كمعيار دولي ISO/IEC 14543-3، ولا يملكه مورّد واحد. نسلّمك ملف البرمجة مفتوحاً بلا قفل، فتستطيع أي جهة تعمل على KNX متابعة الصيانة والتوسعة بعدنا. هذا ليس وعداً بحسن النية، بل خاصية في المعيار نفسه.",
          "ISO/IEC 14543-3"
        ),
      },
      {
        title: "الغرفة تعمل بلا إنترنت",
        body: withEmphasis(
          "منطق الغرفة يعمل على الناقل المحلي: انقطاع الإنترنت أو توقف أي منصة سحابية لا يمنع نزيلاً من تشغيل الإضاءة أو التكييف. الاتصال الخارجي خيار للوصول عن بعد والتقارير، لا شرط للتشغيل."
        ),
      },
    ],
  },

  proof: {
    kicker: "مراجع معلنة",
    title: "19 عميلاً بأسمائهم على موقعنا",
    // Load-bearing and must not be dropped: these are property-development
    // clients, not hotels. ATEX has hotel experience but it is not cleared to
    // name, and the page must not leave a reader believing a hotel reference
    // list exists behind this section.
    lede: "الشهادات أدناه من شركات تطوير عقاري نفّذنا لها مشاريع، وليست من فنادق. نعرضها كمرجع على طريقة عملنا وعلى أننا جهة قائمة في جدة بعملاء يمكن التحقق منهم، لا كقائمة مراجع فندقية.",
    logos: PARTNER_LOGOS,
    testimonials: TESTIMONIALS,
  },

  faq: {
    title: "أسئلة الإدارة الهندسية",
    items: [
      {
        q: "ماذا يحدث لنظامنا إذا توقف التعاقد معكم أو اختفت الشركة؟",
        a: "تبقى تملك النظام كاملاً. نحن نبني على KNX وهو معيار دولي مفتوح (ISO/IEC 14543-3) لا يملكه مورّد بعينه، ونسلّمك عند التسليم ملف برمجة المشروع مفتوحاً بلا قفل ولا كلمة مرور، مع جدول عناوين الأجهزة ومخططات كما نُفّذت. أي جهة تعمل على KNX تستطيع فتح الملف ومتابعة الصيانة والتوسعة دون العودة إلينا. هذا هو الفرق العملي بين نظام مبني على معيار مفتوح ونظام مربوط بمنصة مغلقة.",
      },
      {
        q: "هل تعمل الغرفة إذا انقطع الإنترنت أو توقفت الشبكة؟",
        a: "نعم. منطق الغرفة مخزّن داخل أجهزة الغرفة على ناقل KNX محلي، والإضاءة والتكييف وبطاقة الغرفة تعمل كلها دون أي اتصال خارجي. الإنترنت مطلوب فقط للوصول عن بعد ولإرسال التقارير خارج الفندق. كذلك لا يوجد خادم مركزي واحد إذا توقف توقفت معه الغرف: كل غرفة وحدة مستقلة، والعطل يبقى داخل حدودها.",
      },
      {
        q: "فندقنا يعمل ولا نستطيع إخراج أدوار من الخدمة. كيف تنفّذون؟",
        a: "نعمل غرفة غرفة داخل علب الكهرباء القائمة بلا تكسير في الغالب، فتخرج الغرفة من الخدمة يوم عمل واحد لا أسبوعاً. نبدأ بغرفة نموذجية واحدة تعتمدها الإدارة الهندسية، ثم نجدول التنفيذ حسب خريطة الإشغال ورأس الدور والواجهة الأقل بيعاً في الموسم. الممرات والمناطق العامة تُنفّذ في نوافذ ليلية متفق عليها مع إدارة الفندق.",
      },
      {
        q: "هل يتكامل النظام مع نظام PMS الموجود عندنا؟",
        a: "نبدأ بمراجعة واجهة PMS لديكم وما تدعمه فعلياً، ثم نربط عبر بوابة التكامل: تسجيل الدخول والمغادرة، حالة الغرفة، وحالة الإشراف الداخلي وعدم الإزعاج في الاتجاهين. إذا كان PMS الحالي لا يوفّر واجهة مناسبة، يعمل النظام مستقلاً بكامل وظائفه ويُربط لاحقاً عند تحديث PMS دون تغيير في أجهزة الغرف. نربط كذلك مع BMS عبر BACnet أو Modbus ومع منظومة التحكم بالدخول القائمة.",
      },
      {
        q: "لدينا وحدات مناولة قائمة. هل يفرض النظام استبدالها؟",
        a: "لا. في أغلب مشاريع التجديد نتحكم بوحدة المناولة كما هي: سرعات المروحة وصمام الماء البارد ونطاق الضبط، عبر استبدال منظم الحرارة وإعادة الربط على الناقل. نضيف نطاقاً ميتاً مبرمجاً يمنع تذبذب الصمام، وحدوداً عليا ودنيا لدرجة الحرارة تضبطها الإدارة الهندسية. المخطط الميكانيكي للفندق يبقى كما هو.",
      },
      {
        q: "كيف تُقاس نسبة التوفير في الطاقة؟ لا نقبل رقماً عاماً.",
        a: "لا نعطي نسبة قبل القياس. المصدر الحقيقي للتوفير معروف ويمكن حسابه من بياناتكم: عدد ساعات السنة التي تكون فيها الغرفة غير مباعة أو فارغة، والفرق بين تشغيل كامل ووضع توفير خلال تلك الساعات. في المعاينة نأخذ نسبة الإشغال الشهرية وعدد الغرف وإعدادات التكييف الحالية، ونعرض الحساب على بياناتكم أنتم. بعد التشغيل تصدر لوحة الإدارة الهندسية استهلاكاً لكل غرفة، فيصبح الرقم مقيساً لا مقدّراً.",
      },
      {
        q: "من يشغّل النظام بعد التسليم؟",
        a: "فريقكم. ندرّب ثلاث جهات بشكل منفصل: الإدارة الهندسية على لوحة التشغيل والأعطال والتعديل، الاستقبال على تهيئة الغرفة وحالات PMS، والإشراف الداخلي على حالات الخدمة. يبقى بعدها ضمان استبدال فوري لمدة سنتين ودعم واتساب على مدار الساعة، والتركيب والتشغيل بفنيين معتمدين. الدعم عقد خدمة اختياري، وليس شرطاً لاستمرار عمل النظام.",
      },
      {
        q: "هل لديكم مرجع فندقي في جدة يمكننا زيارته؟",
        a: "نكون صريحين: عملاؤنا المعلنون بأسمائهم على موقعنا 19 شركة تطوير عقاري، وهؤلاء ليسوا فنادق. لدينا خبرة فندقية منفّذة لكن تفاصيلها لم تُصرَّح للنشر بعد، ولن نذكر اسم عميل قبل موافقته. ما نقترحه بدل ذلك هو الأمر الذي يثبت فعلاً: غرفة نموذجية واحدة في فندقكم، تختبرها إدارتكم الهندسية بنفسها قبل أي التزام على بقية الغرف.",
      },
    ],
  },

  /**
   * The secondary, lead-persisting path. Same /api/contact contract as the
   * other two pages: only name and whatsapp are required, and any field with no
   * `apiField` is folded into the composed message text.
   *
   * `companyName` is relabelled for this audience — the sender is as likely to
   * be a consulting office writing a specification as the hotel itself, and the
   * free drawing review is the offer aimed at that reader.
   */
  quote: {
    title: "احجز المعاينة المجانية",
    desc: "معاينة موقع مجانية مدتها 20 دقيقة للفنادق، ومراجعة مجانية للمخططات للمكاتب الاستشارية ومكاتب التصميم.",
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
        label: "الفندق أو المكتب الاستشاري",
        placeholder: "اسم الجهة",
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
          { value: "فندق قائم - تجديد", label: "فندق قائم - تجديد" },
          { value: "فندق تحت الإنشاء", label: "فندق تحت الإنشاء" },
          { value: "شقق فندقية", label: "شقق فندقية" },
          { value: "مراجعة مخططات لمكتب استشاري", label: "مراجعة مخططات لمكتب استشاري" },
          { value: "أخرى", label: "أخرى" },
        ],
      },
      {
        name: "notes",
        label: "ملاحظات (اختياري)",
        messageLabel: "ملاحظات",
        placeholder: "عدد الغرف، ونظام PMS المستخدم، ومرحلة المشروع.",
        type: "textarea",
        required: false,
      },
    ],
  },
};

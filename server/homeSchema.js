const HOME_SCHEMA_VERSION = 4;

// NOTE ON `iconClass` (solutions.cards / why.cards)
//
// These are Font Awesome class strings, and no template renders them. The
// solutions grid draws photo cards from the solutions registry
// (views/partials/solutions-grid.ejs), and the "why" section maps each card to
// title + desc only (views/home.ejs). The field is still read, normalised and
// stored, and the admin panel still exposes a text input for it, so the
// database holds real values — they just have no render path.
//
// They are left as-is rather than migrated to sprite names precisely because
// nothing renders them: changing stored data to match a format no code reads
// would be churn. If a card icon is ever brought back, note that the icon()
// helper takes a bare sprite name ("circle"), not a class string, and returns
// the empty string for anything the sprite does not define — so these values
// would need mapping, and would degrade to no icon until they were.

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

// The "كيف نعمل" steps, current wording. Held in a function rather than inline
// in getDefaultHomeContent() so the retired-boilerplate check below can compare
// against the previous wording without duplicating this one.
function PROCESS_DEFAULT() {
  return {
    heading: "كيف نعمل",
    subheading: "من مخططات المشروع إلى التسليم والضمان، بخطوات تتبع جدول المطوّر.",
    steps: [
      {
        title: "زيارة الموقع ودراسة المخططات",
        desc: "نطّلع على مخططات المشروع ونماذج الوحدات، ثم نحدد ما يناسب كل نموذج من أنظمة المنزل الذكي والاتصال الداخلي والتحكم بالدخول وشواحن المركبات الكهربائية.",
      },
      {
        title: "التصميم والتنسيق مع الاستشاري",
        desc: "مخططات تنفيذية للمسارات والكهرباء والشبكة، وتنسيق مبكر مع المقاول والاستشاري قبل إغلاق الجدران.",
      },
      {
        title: "التوريد والتركيب ضمن جدول المشروع",
        desc: "توريد الأجهزة وتركيبها على مراحل تتبع تقدّم البناء: التمديدات أولاً، ثم التركيب النهائي دون تعطيل بقية الأعمال.",
      },
      {
        title: "الاختبار والتشغيل وتسليم الوحدات",
        desc: "اختبارات قبول لكل وحدة، تشغيل تجريبي، وتدريب فريق الإدارة والملّاك على استخدام الأنظمة.",
      },
      {
        title: "الضمان والدعم بعد التسليم",
        desc: "ضمان على المكونات وخطة صيانة واتفاقية مستوى خدمة (SLA)، مع فريق فني داخل المملكة.",
      },
    ],
  };
}

// The "التقنيات الذكية التي ندعمها" strip. IoT first — the protocols and radios
// the smart-home, building, intercom, access, CCTV and EV-charging work actually
// runs on — then the business systems the platform integrates with, which is
// what the v2 list held on its own.
function INTEGRATION_CHIPS() {
  return [
    "Matter 1.5",
    "KNX",
    "Zigbee 3.0",
    "Z-Wave",
    "Thread 1.4",
    "Wi-Fi 7",
    "بلوتوث LE 5.4",
    "PoE IEEE 802.3bt",
    "BACnet/IP",
    "Modbus TCP",
    "DALI-2",
    "ONVIF",
    "RTSP 2.0",
    "SIP",
    "OSDP",
    "OCPP 2.0.1",
    "MQTT 5.0",
    "CoAP 1.0",
    "LoRaWAN 1.1",
    "NB-IoT",
    "LTE-M",
    "WPA3",
    "TLS 1.3",
    "REST API",
    "Webhooks",
    "ERP",
    "CRM",
    "Power BI",
    "GIS",
    "WhatsApp",
    "SMS",
    "Email",
  ];
}

// The v2 integrations block. Ten business systems under a heading that promises
// smart technologies, with MQTT the only nod to IoT.
const RETIRED_INTEGRATIONS_V2 = {
  heading: "التكاملات",
  subheading: "ربط سلس مع الأنظمة وأدوات العمل—مع واجهات API جاهزة للتوسع.",
  chips: ["ERP", "CRM", "Email", "SMS", "WhatsApp", "Webhooks", "Power BI", "GIS", "MQTT", "REST API"],
};

function isRetiredIntegrationsBoilerplate(p) {
  if (!p || typeof p !== "object") return false;
  const chips = Array.isArray(p.chips) ? p.chips : [];
  if (asString(p.heading) !== RETIRED_INTEGRATIONS_V2.heading) return false;
  if (asString(p.subheading) !== RETIRED_INTEGRATIONS_V2.subheading) return false;
  if (chips.length !== RETIRED_INTEGRATIONS_V2.chips.length) return false;
  return chips.every((c, i) => asString(c) === RETIRED_INTEGRATIONS_V2.chips[i]);
}

// The v2 wording. It described a sensor-monitoring consultancy rather than what
// أتكس sells, and it shipped identical to every database row — nobody ever
// edited it, because the section did not read stored content at all (the view
// rendered its own copy of this array). Rows still carrying it verbatim are
// moved forward to PROCESS_DEFAULT(); a row an admin has since edited is left
// alone.
const RETIRED_PROCESS_V2 = {
  heading: "كيف نعمل",
  subheading: "خطوات واضحة من الفكرة إلى التشغيل ثم التحسين المستمر.",
  steps: [
    { title: "تحليل حالة الاستخدام", desc: "تعريف الهدف، المؤشرات، نطاق الأجهزة، ومتطلبات التكامل." },
    { title: "اختيار الأجهزة والاتصال", desc: "ترشيح الحساسات/الأجهزة والبروتوكولات المناسبة للبيئة." },
    { title: "التركيب والتهيئة", desc: "تركيب ميداني، إعداد تنبيهات أولية، واختبارات قبول." },
    { title: "لوحات وتقارير", desc: "لوحات تشغيلية وتقارير دورية للمديرين وفرق العمليات." },
    { title: "تحسين مستمر", desc: "تحسين القواعد، تقليل الإنذارات الخاطئة، وتوسيع النطاق." },
  ],
};

function isRetiredProcessBoilerplate(p) {
  if (!p || typeof p !== "object") return false;
  const steps = Array.isArray(p.steps) ? p.steps : [];
  if (steps.length !== RETIRED_PROCESS_V2.steps.length) return false;
  if (asString(p.heading) !== RETIRED_PROCESS_V2.heading) return false;
  if (asString(p.subheading) !== RETIRED_PROCESS_V2.subheading) return false;
  return steps.every((s, i) => {
    const was = RETIRED_PROCESS_V2.steps[i];
    return asString(s?.title) === was.title && asString(s?.desc) === was.desc;
  });
}

// Single fields whose default wording changed in v4, kept verbatim as they read
// in v3. Same intent as the two retired-block predicates above, at field
// granularity: these live beside fields an admin may well have edited (hero
// title and desc are edited in production), so the whole block cannot be
// discarded — only the individual value, and only while it is still untouched.
//
// Every one of them was a field the admin panel offered but no template
// rendered, so a stored value here is by definition a default nobody could have
// seen take effect.
const RETIRED_FIELDS_V3 = {
  // Production's row holds "+966 11 000 0000" — a placeholder from an early
  // schema that was never visible, because the header printed the real number
  // instead of reading this field. Wiring the field up would have put the
  // placeholder in the header and pointed the WhatsApp link at it.
  topbarPhone: "+966 11 000 0000",
  topbarCtaText: "اطلب عرضاً",
  topbarCtaHref: "#contact",
  heroKicker: "بيانات لحظية • تنبيهات ذكية • قرارات أسرع",
  heroCtaPrimary: "اطلب عرضاً",
  heroCtaSecondary: "استعرض المنصة",
  solutionsHeading: "حلول ATEX",
};

// Returns the stored value, unless it is empty or still the retired default —
// in which case the new default wins.
function forwardField(stored, retired, fallback) {
  const s = asString(stored);
  if (!s) return fallback;
  if (s === retired) return fallback;
  return s;
}

function getDefaultHomeContent() {
  return {
    version: HOME_SCHEMA_VERSION,

    topbar: {
      supportText: "الدعم والمبيعات:",
      phone: "+966580102121",
      tagline: "حلول إنترنت الأشياء للمطورين العقاريين والشركات في المملكة",
      ctaText: "بوابة العملاء",
      ctaHref: "https://portal.atex-ksa.com",
    },

    hero: {
      kicker: "IoT Solutions · المملكة العربية السعودية",
      title: "نصمم أنظمة المباني الذكية ونركّبها في المملكة",
      desc:
        "نركّب أنظمة التحكم بالإضاءة والتكييف والطاقة والدخول في المنازل والفنادق والمباني، ونربطها بتطبيق ولوحة متابعة تدير منها وحداتك.\nنعمل مع المطورين العقاريين والشركات من مرحلة المخططات حتى التسليم والصيانة.",
      ctaPrimary: "ابدأ مشروعك الآن",
      ctaSecondary: "استكشف الحلول",
    },

    heroVideo: {
      sourceType: "youtube",
      youtubeUrl: "https://www.youtube.com/watch?v=-wvs4H_Ujxk",
      uploadedVideoUrl: "",
    },

    solutions: {
      heading: "حلول نقدمها",
      subheading: "أنظمة نركّبها في مشاريع المطورين العقاريين والشركات في المملكة.",
      cards: [
        {
          iconClass: "fa-solid fa-location-crosshairs",
          title: "تتبّع الأصول",
          desc: "تعقّب المعدات والحاويات والأصول المتنقلة مع تنبيهات فورية وخرائط.",
        },
        {
          iconClass: "fa-solid fa-truck-fast",
          title: "إدارة الأساطيل",
          desc: "مراقبة الحركة، تحسين المسارات، وتقارير تشغيل تساعد على خفض التكاليف.",
        },
        {
          iconClass: "fa-solid fa-snowflake",
          title: "سلسلة التبريد",
          desc: "حساسات حرارة ورطوبة مع توثيق وتقارير امتثال للأغذية والدواء.",
        },
      ],
    },

    platform: {
      kicker: "من الجهاز إلى لوحة المتابعة",
      title: "منصة واحدة للأجهزة والاتصال والبيانات",
      desc:
        "نوفّر إدارة الأجهزة وقواعد التنبيه ولوحات المتابعة والتقارير، ونربطها بأنظمتك عبر REST API وWebhooks.",
      ctaPrimary: "استكشف المنتجات",
      ctaSecondary: "ناقش مشروعك",
    },

    stats: [
      { value: 24, label: "مراقبة وتنبيهات", suffix: "/7" },
      { value: 14, label: "نوع حساس", suffix: "+" },
      { value: 60, label: "تقرير جاهز", suffix: "+" },
    ],

    why: {
      heading: "لماذا أتكس؟",
      subheading: "نتولى التصميم والتركيب والصيانة بفريق داخل المملكة، ونربط الأنظمة الجديدة بما لديك من BMS وأنظمة أمن.",
      cards: [
        {
          iconClass: "fa-solid fa-chart-line",
          title: "عائد استثماري قابل للقياس",
          desc: "نحدد مع فريقك مؤشرات الطاقة والصيانة قبل التركيب، ونقيسها بعد التشغيل.",
        },
        {
          iconClass: "fa-solid fa-diagram-project",
          title: "تنفيذ وتسليم من جهة واحدة",
          desc: "نغطي التصميم، التوريد، التنفيذ، الاختبارات، والتشغيل المبدئي.",
        },
        {
          iconClass: "fa-solid fa-link",
          title: "تكامل مع أنظمة المبنى الحالية",
          desc: "نربط الأنظمة الجديدة بـ BMS وكاميرات المراقبة والتحكم بالدخول الموجودة في المبنى.",
        },
        {
          iconClass: "fa-solid fa-headset",
          title: "دعم وصيانة بعد التسليم",
          desc: "فريق فني داخل المملكة، واتفاقية مستوى خدمة (SLA)، وخطة صيانة دورية.",
        },
      ],
    },

    process: PROCESS_DEFAULT(),

    integrations: {
      heading: "التقنيات الذكية التي ندعمها",
      subheading: "البروتوكولات والمعايير التي نركّب عليها أنظمتنا ونربطها بأنظمتك.",
      chips: INTEGRATION_CHIPS(),
    },

    faq: {
      heading: "أسئلة شائعة",
      subheading: "أسئلة يطرحها المطورون العقاريون والشركات قبل اعتماد النظام.",
      items: [
        {
          q: "كيف نقيس العائد الاستثماري (ROI) قبل التعميم؟",
          a: "نحدد معكم في البداية مؤشرات تقيسونها: استهلاك الطاقة، وعدد الأعطال، ووقت معالجة البلاغات. ثم نرسل لكم تقارير دورية بالنتائج تبنون عليها قرار التوسع.",
        },
        {
          q: "ما متطلبات الموقع والجدول الزمني للتنفيذ؟",
          a: "نربط خطة التنفيذ بمرحلة المشروع: الجاهزية الكهربائية والشبكية ونقاط التركيب، ثم جدول زمني للتوريد والتركيب والاختبار والتسليم.",
        },
        {
          q: "ما الضمان ومستوى الدعم بعد التسليم؟",
          a: "نقدم ضماناً على المكونات وخطة دعم بعد البيع تشمل الصيانة الوقائية والتصحيحية، مع اتفاقية مستوى خدمة (SLA) حسب احتياج المشروع.",
        },
        {
          q: "هل يمكن التكامل مع الأنظمة الحالية مثل BMS وCCTV والتحكم بالوصول؟",
          a: "نعم. نربط النظام بالأنظمة القائمة على مراحل، فلا تعيد تركيب ما يعمل، ونرتب الربط بحيث يستمر تشغيل المبنى أثناءه.",
        },
        {
          q: "هل يمكن التوسع على عدة مبانٍ أو مراحل تطوير؟",
          a: "نعم. تبدأ بمبنى واحد وتضيف المباني والمراحل لاحقاً، وتدير صلاحيات كل موقع من لوحة مركزية.",
        },
        {
          q: "كيف تحمون خصوصية البيانات وصلاحيات الوصول؟",
          a: "نضبط صلاحيات الوصول حسب دور كل مستخدم، ونحتفظ بسجل تدقيق لعمليات الدخول، فلا يرى البيانات إلا من تخوّله.",
        },
        {
          q: "كيف تسلّمون التشغيل لفريق إدارة المرافق (FM)؟",
          a: "نسلّم فريقكم خطة Handover تشمل التوثيق والتدريب العملي وإجراءات التشغيل القياسية.",
        },
        {
          q: "ماذا يحدث عند انقطاع الشبكة أو ضعف الاتصال؟",
          a: "يشغّل النظام الوظائف الأساسية محلياً وفق تصميم المشروع، ثم يزامن البيانات والتنبيهات عند عودة الاتصال.",
        },
      ],
    },

    blogTeaser: {
      heading: "المدونة",
      subheading: "آخر المقالات وأفضل الممارسات في إنترنت الأشياء.",
      ctaText: "فتح المدونة",
      ctaHref: "/blog",
    },

    sections: {
      productsEnabled: true,
      blogEnabled: false,
    },

    contact: {
      heading: "جاهز لبدء مشروع إنترنت الأشياء؟",
      subheading: "أرسل لنا نوع المبنى وما تريد التحكم فيه، ونقترح عليك الأجهزة وطريقة الاتصال والربط مع خطة للتنفيذ.",
      email: "info@atex.sa",
      phone: "+966580102121",
      address: "جدة، المملكة العربية السعودية",
      backToTopText: "العودة للأعلى",
    },
  };
}

function asString(x) {
  if (typeof x !== "string") return "";
  return x;
}

function asNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function asBoolean(x, fallback = false) {
  return typeof x === "boolean" ? x : fallback;
}

function normalizeHomeContent(input) {
  const base = getDefaultHomeContent();
  const out = clone(base);

  const src = input && typeof input === "object" ? input : {};
  out.version = HOME_SCHEMA_VERSION;

  // Simple deep-ish merge with type guards
  if (src.topbar && typeof src.topbar === "object") {
    out.topbar.supportText = asString(src.topbar.supportText) || out.topbar.supportText;
    out.topbar.phone = forwardField(src.topbar.phone, RETIRED_FIELDS_V3.topbarPhone, out.topbar.phone);
    out.topbar.tagline = asString(src.topbar.tagline) || out.topbar.tagline;
    out.topbar.ctaText = forwardField(src.topbar.ctaText, RETIRED_FIELDS_V3.topbarCtaText, out.topbar.ctaText);
    out.topbar.ctaHref = forwardField(src.topbar.ctaHref, RETIRED_FIELDS_V3.topbarCtaHref, out.topbar.ctaHref);
  }

  if (src.hero && typeof src.hero === "object") {
    out.hero.kicker = forwardField(src.hero.kicker, RETIRED_FIELDS_V3.heroKicker, out.hero.kicker);
    out.hero.title = asString(src.hero.title) || out.hero.title;
    out.hero.desc = asString(src.hero.desc) || out.hero.desc;
    out.hero.ctaPrimary = forwardField(src.hero.ctaPrimary, RETIRED_FIELDS_V3.heroCtaPrimary, out.hero.ctaPrimary);
    out.hero.ctaSecondary = forwardField(src.hero.ctaSecondary, RETIRED_FIELDS_V3.heroCtaSecondary, out.hero.ctaSecondary);
  }

  if (src.heroVideo && typeof src.heroVideo === "object") {
    // Preserve hero video configuration from database if provided
    out.heroVideo.sourceType = asString(src.heroVideo.sourceType) || out.heroVideo.sourceType;
    out.heroVideo.youtubeUrl = asString(src.heroVideo.youtubeUrl) || out.heroVideo.youtubeUrl;
    out.heroVideo.uploadedVideoUrl = asString(src.heroVideo.uploadedVideoUrl) || out.heroVideo.uploadedVideoUrl;
  }

  if (src.solutions && typeof src.solutions === "object") {
    out.solutions.heading = forwardField(src.solutions.heading, RETIRED_FIELDS_V3.solutionsHeading, out.solutions.heading);
    out.solutions.subheading = asString(src.solutions.subheading) || out.solutions.subheading;
    if (Array.isArray(src.solutions.cards)) {
      out.solutions.cards = src.solutions.cards
        .filter((c) => c && typeof c === "object")
        .map((c) => ({
          iconClass: asString(c.iconClass) || "fa-solid fa-circle",
          title: asString(c.title) || "",
          desc: asString(c.desc) || "",
        }))
        .filter((c) => c.title || c.desc);
    }
  }

  if (src.platform && typeof src.platform === "object") {
    out.platform.kicker = asString(src.platform.kicker) || out.platform.kicker;
    out.platform.title = asString(src.platform.title) || out.platform.title;
    out.platform.desc = asString(src.platform.desc) || out.platform.desc;
    out.platform.ctaPrimary = asString(src.platform.ctaPrimary) || out.platform.ctaPrimary;
    out.platform.ctaSecondary = asString(src.platform.ctaSecondary) || out.platform.ctaSecondary;
  }

  if (Array.isArray(src.stats)) {
    out.stats = src.stats
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        value: asNumber(s.value),
        label: asString(s.label) || "",
        suffix: asString(s.suffix) || "",
      }))
      .filter((s) => s.label);
  }

  if (src.why && typeof src.why === "object") {
    out.why.heading = asString(src.why.heading) || out.why.heading;
    out.why.subheading = asString(src.why.subheading) || out.why.subheading;
    if (Array.isArray(src.why.cards)) {
      out.why.cards = src.why.cards
        .filter((c) => c && typeof c === "object")
        .map((c) => ({
          iconClass: asString(c.iconClass) || "fa-solid fa-circle",
          title: asString(c.title) || "",
          desc: asString(c.desc) || "",
        }))
        .filter((c) => c.title || c.desc);
    }
  }

  if (src.process && typeof src.process === "object" && !isRetiredProcessBoilerplate(src.process)) {
    out.process.heading = asString(src.process.heading) || out.process.heading;
    out.process.subheading = asString(src.process.subheading) || out.process.subheading;
    // Steps were previously dropped here, so anything an admin saved was reset
    // to the defaults on the next normalise pass.
    if (Array.isArray(src.process.steps)) {
      out.process.steps = src.process.steps
        .filter((s) => s && typeof s === "object")
        .map((s) => ({ title: asString(s.title) || "", desc: asString(s.desc) || "" }))
        .filter((s) => s.title || s.desc);
    }
  }

  if (src.integrations && typeof src.integrations === "object" && !isRetiredIntegrationsBoilerplate(src.integrations)) {
    out.integrations.heading = asString(src.integrations.heading) || out.integrations.heading;
    out.integrations.subheading = asString(src.integrations.subheading) || out.integrations.subheading;
    if (Array.isArray(src.integrations.chips)) {
      out.integrations.chips = src.integrations.chips.map((x) => asString(x)).filter(Boolean);
    }
  }

  if (src.faq && typeof src.faq === "object") {
    out.faq.heading = asString(src.faq.heading) || out.faq.heading;
    out.faq.subheading = asString(src.faq.subheading) || out.faq.subheading;
    if (Array.isArray(src.faq.items)) {
      out.faq.items = src.faq.items
        .filter((i) => i && typeof i === "object")
        .map((i) => ({ q: asString(i.q) || "", a: asString(i.a) || "" }))
        .filter((i) => i.q || i.a);
    }
  }

  if (src.blogTeaser && typeof src.blogTeaser === "object") {
    out.blogTeaser.heading = asString(src.blogTeaser.heading) || out.blogTeaser.heading;
    out.blogTeaser.subheading = asString(src.blogTeaser.subheading) || out.blogTeaser.subheading;
    out.blogTeaser.ctaText = asString(src.blogTeaser.ctaText) || out.blogTeaser.ctaText;
    out.blogTeaser.ctaHref = asString(src.blogTeaser.ctaHref) || out.blogTeaser.ctaHref;
  }

  if (src.sections && typeof src.sections === "object") {
    out.sections.productsEnabled = asBoolean(src.sections.productsEnabled, out.sections.productsEnabled);
    out.sections.blogEnabled = asBoolean(src.sections.blogEnabled, out.sections.blogEnabled);
  }

  if (src.contact && typeof src.contact === "object") {
    out.contact.heading = asString(src.contact.heading) || out.contact.heading;
    out.contact.subheading = asString(src.contact.subheading) || out.contact.subheading;
    out.contact.email = asString(src.contact.email) || out.contact.email;
    out.contact.phone = asString(src.contact.phone) || out.contact.phone;
    out.contact.address = asString(src.contact.address) || out.contact.address;
    out.contact.backToTopText = asString(src.contact.backToTopText) || out.contact.backToTopText;
  }

  return out;
}

module.exports = {
  HOME_SCHEMA_VERSION,
  getDefaultHomeContent,
  normalizeHomeContent,
};

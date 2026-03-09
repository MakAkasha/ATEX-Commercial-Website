const HOME_SCHEMA_VERSION = 2;

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function getDefaultHomeContent() {
  return {
    version: HOME_SCHEMA_VERSION,

    topbar: {
      supportText: "الدعم والمبيعات:",
      phone: "+966580102121",
      tagline: "حلول إنترنت الأشياء للشركات داخل المملكة",
      ctaText: "اطلب عرضاً",
      ctaHref: "#contact",
    },

    hero: {
      kicker: "بيانات لحظية • تنبيهات ذكية • قرارات أسرع",
      title: "أتكس… مباني أذكى",
      desc:
        "نحوّل المنازل والفنادق والمباني إلى منظومة متصلة تُظهر لك ما يحدث الآن وتُمكّنك من التحكم بكل التفاصيل بسهولة.\nمن الأجهزة والاتصال إلى المنصة, لتشغيل الإضاءة والتكييف والطاقة والمشاهد، إدارة الغرف والوصول الذكي، ورفع الكفاءة وتقليل التكاليف مع تجربة ضيوف وسكان أكثر رفاهية.",
      ctaPrimary: "اطلب عرضاً",
      ctaSecondary: "استعرض المنصة",
    },

    heroVideo: {
      sourceType: "youtube",
      youtubeUrl: "https://www.youtube.com/watch?v=-wvs4H_Ujxk",
      uploadedVideoUrl: "",
    },

    solutions: {
      heading: "حلول ATEX",
      subheading: "حالات استخدام جاهزة قابلة للتوسع في مشاريع الشركات داخل السعودية.",
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
      kicker: "من جهاز إلى لوحة متابعة خلال وقت قياسي",
      title: "منصة واحدة للأجهزة والاتصال والبيانات",
      desc:
        "نوفّر طبقة إدارة أجهزة، قواعد تنبيهات، لوحات، وتقارير—مع إمكانيات تكامل عبر واجهات برمجية.",
      ctaPrimary: "استكشف المنتجات",
      ctaSecondary: "ناقش مشروعك",
    },

    stats: [
      { value: 24, label: "مراقبة وتنبيهات", suffix: "/7" },
      { value: 14, label: "نوع حساس", suffix: "+" },
      { value: 60, label: "تقرير جاهز", suffix: "+" },
    ],

    why: {
      heading: "لماذا ATEX؟",
      subheading: "مزايا تنفيذية واضحة تساعد المطورين وفرق التشغيل على اتخاذ قرار استثماري أسرع وأدق.",
      cards: [
        {
          iconClass: "fa-solid fa-chart-line",
          title: "عائد استثماري قابل للقياس",
          desc: "نربط الحلول بمؤشرات تشغيل ووفورات واضحة في الطاقة والصيانة.",
        },
        {
          iconClass: "fa-solid fa-diagram-project",
          title: "تنفيذ وتسليم من جهة واحدة",
          desc: "نغطي التصميم، التوريد، التنفيذ، الاختبارات، والتشغيل المبدئي.",
        },
        {
          iconClass: "fa-solid fa-link",
          title: "تكامل جاهز مع الأنظمة الحالية",
          desc: "ربط مرن مع BMS وأنظمة الأمن والتحكم بالوصول دون تعقيد تشغيلي.",
        },
        {
          iconClass: "fa-solid fa-headset",
          title: "دعم تشغيلي محلي طويل المدى",
          desc: "فرق فنية داخل المملكة مع SLA واضحة وخطة صيانة مستمرة.",
        },
      ],
    },

    process: {
      heading: "كيف نعمل",
      subheading: "خطوات واضحة من الفكرة إلى التشغيل ثم التحسين المستمر.",
      steps: [
        { title: "تحليل حالة الاستخدام", desc: "تعريف الهدف، المؤشرات، نطاق الأجهزة، ومتطلبات التكامل." },
        { title: "اختيار الأجهزة والاتصال", desc: "ترشيح الحساسات/الأجهزة والبروتوكولات المناسبة للبيئة." },
        { title: "التركيب والتهيئة", desc: "تركيب ميداني، إعداد تنبيهات أولية، واختبارات قبول." },
        { title: "لوحات وتقارير", desc: "لوحات تشغيلية وتقارير دورية للمديرين وفرق العمليات." },
        { title: "تحسين مستمر", desc: "تحسين القواعد، تقليل الإنذارات الخاطئة، وتوسيع النطاق." },
      ],
    },

    integrations: {
      heading: "التكاملات",
      subheading: "ربط سلس مع الأنظمة وأدوات العمل—مع واجهات API جاهزة للتوسع.",
      chips: ["ERP", "CRM", "Email", "SMS", "WhatsApp", "Webhooks", "Power BI", "GIS", "MQTT", "REST API"],
    },

    faq: {
      heading: "أسئلة شائعة",
      subheading: "إجابات مختصرة لأسئلة المطورين العقاريين قبل اعتماد الحل.",
      items: [
        {
          q: "كيف نقيس العائد الاستثماري (ROI) قبل التعميم؟",
          a: "نبدأ بنطاق واضح للمشروع ونحدد مؤشرات قابلة للقياس مثل خفض استهلاك الطاقة وتقليل الأعطال وسرعة الاستجابة التشغيلية، ثم نعرض نتائج دورية تساعدكم في قرار التوسع.",
        },
        {
          q: "ما متطلبات الموقع والجدول الزمني للتنفيذ؟",
          a: "نعتمد خطة تنفيذ مرتبطة بمرحلة المشروع، تشمل الجاهزية الكهربائية والشبكية ونقاط التركيب، مع جدول زمني واضح للتوريد والتركيب والاختبار والتسليم.",
        },
        {
          q: "ما الضمان ومستوى الدعم بعد التسليم؟",
          a: "نقدم ضماناً على المكونات وخطة دعم ما بعد البيع تشمل الصيانة الوقائية والتصحيحية مع اتفاقية مستوى خدمة (SLA) حسب احتياج المشروع.",
        },
        {
          q: "هل يمكن التكامل مع الأنظمة الحالية مثل BMS وCCTV والتحكم بالوصول؟",
          a: "نعم، الحل مصمم للتكامل التدريجي مع الأنظمة القائمة لتقليل إعادة العمل وضمان استمرارية التشغيل دون تعطيل.",
        },
        {
          q: "هل يمكن التوسع على عدة مبانٍ أو مراحل تطوير؟",
          a: "بكل تأكيد، التصميم قابل للتوسع من مبنى واحد إلى محفظة مشاريع كاملة مع حوكمة مركزية وصلاحيات تشغيل مناسبة لكل موقع.",
        },
        {
          q: "كيف تتم إدارة خصوصية البيانات وصلاحيات الوصول؟",
          a: "يتم تطبيق سياسات وصول حسب الأدوار مع سجلات تدقيق واضحة، بما يضمن حماية البيانات وإتاحة المعلومات للجهات المخولة فقط.",
        },
        {
          q: "كيف يتم تسليم التشغيل لفريق إدارة المرافق (FM)؟",
          a: "نوفر خطة Handover تشمل التوثيق، التدريب العملي، وإجراءات التشغيل القياسية لضمان انتقال سلس للفريق التشغيلي.",
        },
        {
          q: "ماذا يحدث عند انقطاع الشبكة أو ضعف الاتصال؟",
          a: "يستمر النظام في تشغيل الوظائف الأساسية محلياً وفق تصميم المشروع، مع مزامنة البيانات والتنبيهات تلقائياً عند عودة الاتصال.",
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
      subheading: "أرسل لنا حالة الاستخدام وسنقترح بنية (أجهزة + اتصال + منصة + تكامل) مع خطة تنفيذ واضحة.",
      email: "contact@atex.sa",
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
    out.topbar.phone = asString(src.topbar.phone) || out.topbar.phone;
    out.topbar.tagline = asString(src.topbar.tagline) || out.topbar.tagline;
    out.topbar.ctaText = asString(src.topbar.ctaText) || out.topbar.ctaText;
    out.topbar.ctaHref = asString(src.topbar.ctaHref) || out.topbar.ctaHref;
  }

  if (src.hero && typeof src.hero === "object") {
    out.hero.kicker = asString(src.hero.kicker) || out.hero.kicker;
    out.hero.title = asString(src.hero.title) || out.hero.title;
    out.hero.desc = asString(src.hero.desc) || out.hero.desc;
    out.hero.ctaPrimary = asString(src.hero.ctaPrimary) || out.hero.ctaPrimary;
    out.hero.ctaSecondary = asString(src.hero.ctaSecondary) || out.hero.ctaSecondary;
  }

  if (src.heroVideo && typeof src.heroVideo === "object") {
    // Preserve hero video configuration from database if provided
    out.heroVideo.sourceType = asString(src.heroVideo.sourceType) || out.heroVideo.sourceType;
    out.heroVideo.youtubeUrl = asString(src.heroVideo.youtubeUrl) || out.heroVideo.youtubeUrl;
    out.heroVideo.uploadedVideoUrl = asString(src.heroVideo.uploadedVideoUrl) || out.heroVideo.uploadedVideoUrl;
  }

  if (src.solutions && typeof src.solutions === "object") {
    out.solutions.heading = asString(src.solutions.heading) || out.solutions.heading;
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

  if (src.process && typeof src.process === "object") {
    out.process.heading = asString(src.process.heading) || out.process.heading;
    out.process.subheading = asString(src.process.subheading) || out.process.subheading;
  }

  if (src.integrations && typeof src.integrations === "object") {
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

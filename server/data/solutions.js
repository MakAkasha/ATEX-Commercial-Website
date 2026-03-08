const fs = require("fs");
const path = require("path");

const SOLUTIONS_DIR = path.resolve(__dirname, "..", "..", "assets", "solutions");

function preferPngAsset(assetPath) {
  const normalized = String(assetPath || "").trim();
  if (!normalized.startsWith("/assets/solutions/")) return normalized;

  const parsed = path.parse(normalized);
  const pngFileName = `${parsed.name}.png`;
  const pngDiskPath = path.join(SOLUTIONS_DIR, pngFileName);

  if (fs.existsSync(pngDiskPath)) {
    return `/assets/solutions/${pngFileName}`;
  }

  return normalized;
}

const solutions = [
  {
    slug: "smart-home",
    title: "أنظمة المنازل الذكية",
    summary: "تحكم مركزي بالإضاءة والتكييف والستائر والطاقة والأمن من تطبيق واحد.",
    details:
      "نصمم تجربة منزلية متكاملة تجمع الراحة، الأمان، وكفاءة الاستهلاك. يتم ربط الأنظمة الحيوية في واجهة واحدة مع سيناريوهات يومية قابلة للتخصيص لكل فرد في المنزل.",
    features: [
      "لوحات تحكم موحّدة عبر الجوال والأجهزة اللوحية",
      "سيناريوهات تلقائية (وصول، مغادرة، نوم، ضيافة)",
      "تقارير استهلاك الطاقة والتنبيهات الفورية",
      "تكامل مرن مع الأنظمة الأمنية والمساعدات الصوتية",
    ],
    useCases: ["فلل ومجمّعات سكنية", "منازل فاخرة وقصور", "شقق ضيافة وسكن تنفيذي"],
    primaryImage: "/assets/solutions/smart-home.jpg",
    supportImages: ["/assets/solutions/security-Systems.jpg", "/assets/solutions/smart-ligting.jpg"],
  },
  {
    slug: "smart-office",
    title: "أنظمة المكاتب الذكية",
    summary: "بيئة عمل أكثر إنتاجية عبر الأتمتة الذكية وإدارة المرافق في الوقت الحقيقي.",
    details:
      "نساعد الشركات على تحسين تجربة الموظفين وتقليل تكلفة التشغيل من خلال إدارة ذكية للمساحات والاجتماعات والطاقة. الحل يدعم النمو ويعطي فرق التشغيل رؤية فورية على مؤشرات الأداء.",
    features: [
      "إدارة الحضور والمساحات وقاعات الاجتماعات",
      "تحكم ديناميكي في الإضاءة والتكييف حسب الإشغال",
      "تنبيهات أعطال وصيانة وقائية للمرافق",
      "لوحات تشغيل وتقارير فورية للإدارة",
    ],
    useCases: ["المقار الإدارية", "مساحات العمل المشتركة", "المكاتب الإقليمية متعددة الفروع"],
    primaryImage: "/assets/solutions/smart-office.jpg",
    supportImages: ["/assets/solutions/ICT-Systems.jpg", "/assets/solutions/smart-building.jpg"],
  },
  {
    slug: "smart-hotel",
    title: "أنظمة الفنادق الذكية",
    summary: "رفع جودة تجربة الضيوف مع خفض تكاليف التشغيل وإدارة الغرف بذكاء.",
    details:
      "نطوّر بنية تشغيل ذكية للفنادق توازن بين راحة النزيل وكفاءة التشغيل الخلفي، عبر تكامل إدارة الغرف، الإضاءة، المناخ الداخلي، وطلبات الخدمة ضمن رحلة ضيافة متصلة.",
    features: [
      "أتمتة الغرف والمشاهد حسب حالة النزيل",
      "إدارة الطاقة أثناء الإشغال وعدم الإشغال",
      "تكامل مع أنظمة PMS والتحكم بالدخول",
      "مؤشرات تشغيلية لتحسين رضا الضيوف",
    ],
    useCases: ["الفنادق الحضرية", "المنتجعات", "الشقق الفندقية"],
    primaryImage: "/assets/solutions/smart-hotel.jpg",
    supportImages: ["/assets/solutions/security-Systems.jpg", "/assets/solutions/smart-led-screen.jpg"],
  },
  {
    slug: "smart-parking",
    title: "أنظمة مواقف السيارات الذكية",
    summary: "تحسين تدفق المركبات وتقليل زمن البحث عن موقف عبر إدارة رقمية متكاملة.",
    details:
      "نقدّم حلول مواقف ذكية تدعم المراكز التجارية والمشاريع متعددة الاستخدامات من خلال مراقبة الإشغال، توجيه المركبات، وإدارة الدخول والخروج بشكل سريع وآمن.",
    features: [
      "رصد الإشغال اللحظي وتوجيه الزوار",
      "لوحات إرشاد ومسارات دخول/خروج ذكية",
      "تكامل مع الدفع والتحكم بالمنافذ",
      "تحليلات الذروة لتحسين السعة التشغيلية",
    ],
    useCases: ["المجمعات التجارية", "الأبراج متعددة الاستخدام", "مواقف الجهات الحكومية"],
    primaryImage: "/assets/solutions/smart-parking.jpg",
    supportImages: ["/assets/solutions/ev-charging.jpg", "/assets/solutions/security-Systems.jpg"],
  },
  {
    slug: "bms",
    title: "أنظمة إدارة المباني (BMS)",
    summary: "إدارة مركزية لأنظمة المبنى لرفع الكفاءة وتقليل المخاطر التشغيلية.",
    details:
      "نعمل على توحيد أنظمة التكييف، الطاقة، الإنذار، والمراقبة في لوحة إدارة واحدة تمنح فريق التشغيل رؤية دقيقة وتحكماً استباقياً بالأداء العام للمبنى.",
    features: [
      "مراقبة مركزية لأنظمة المباني الحيوية",
      "تنبيهات ذكية للأعطال والانحرافات",
      "تكامل مع الأنظمة القائمة دون تعطيل التشغيل",
      "تقارير أداء وامتثال دورية",
    ],
    useCases: ["الأبراج التجارية", "المستشفيات", "المرافق التعليمية"],
    primaryImage: "/assets/solutions/smart-building.jpg",
    supportImages: ["/assets/solutions/ICT-Systems.jpg", "/assets/solutions/smart-ligting.jpg"],
  },
  {
    slug: "facade-lighting",
    title: "أنظمة إضاءة الواجهات الخارجية",
    summary: "إظهار الهوية المعمارية للمشروع عبر تصميم وإدارة إضاءة احترافية.",
    details:
      "ننفّذ حلول إضاءة واجهات تجمع الجاذبية البصرية والانضباط التشغيلي عبر جداول تشغيل ومشاهد قابلة للبرمجة، ما يرفع قيمة الواجهة ويعزز حضور العلامة.",
    features: [
      "تصميم مشاهد إضاءة حسب الهوية المعمارية",
      "تحكم مركزي بالجداول والمناسبات",
      "توازن بين الأثر البصري وكفاءة الطاقة",
      "دعم تقنيات DMX وDALI للتوسع المستقبلي",
    ],
    useCases: ["الأبراج التجارية", "الوجهات السياحية", "مشاريع الضيافة والترفيه"],
    primaryImage: "/assets/solutions/smart-ligting.jpg",
    supportImages: ["/assets/solutions/smart-led-screen.jpg", "/assets/solutions/smart-building.jpg"],
  },
  {
    slug: "central-vacuum",
    title: "نظام المكنسة المركزية",
    summary: "حل تنظيف مريح وأكثر كفاءة وجودة هواء أفضل داخل المباني.",
    details:
      "نوفر نظام مكنسة مركزية مدمجاً في البنية الداخلية للمشروع، يقلل الضوضاء داخل المساحات ويُحسن الجودة البيئية، مع سهولة تشغيل وصيانة للمستخدم النهائي.",
    features: [
      "تصميم مناسب للمنازل والفنادق والفلل",
      "خفض الضوضاء مقارنة بالحلول التقليدية",
      "تحسين جودة الهواء الداخلي",
      "حل عملي طويل الأمد مع صيانة ميسّرة",
    ],
    useCases: ["الفلل السكنية", "الوحدات الفندقية", "القصور والمنازل الكبيرة"],
    primaryImage: "/assets/solutions/central-vacuum.jpg",
    supportImages: ["/assets/solutions/smart-home.jpg", "/assets/solutions/smart-hotel.jpg"],
  },
  {
    slug: "led-screens",
    title: "شاشات LED الداخلية والخارجية",
    summary: "حلول عرض رقمية عالية التأثير للاستخدام التجاري والتشغيلي.",
    details:
      "نقدم حلول شاشات LED بمواصفات تناسب البيئات الداخلية والخارجية، مع جودة عرض عالية وإدارة محتوى مرنة، ما يدعم الاتصال البصري والعلامة التجارية.",
    features: [
      "شاشات داخلية وخارجية بدرجات سطوع مختلفة",
      "إدارة محتوى مركزية متعددة المواقع",
      "تكامل مع أنظمة الإعلان والتوجيه",
      "تصاميم تركيب تتوافق مع متطلبات الموقع",
    ],
    useCases: ["المجمعات التجارية", "الواجهات الإعلامية", "قاعات الفعاليات والمعارض"],
    primaryImage: "/assets/solutions/smart-led-screen.jpg",
    supportImages: ["/assets/solutions/ICT-Systems.jpg", "/assets/solutions/smart-building.jpg"],
  },
  {
    slug: "ev-charging",
    title: "أنظمة شحن المركبات الكهربائية (EV Chargers)",
    summary: "بنية شحن موثوقة وقابلة للتوسع للمشاريع السكنية والتجارية.",
    details:
      "ننفّذ حلول شحن كهربائي مدروسة من حيث الطاقة والتشغيل وإدارة المستخدمين، مع قابلية توسع مستقبلية تواكب نمو الطلب على المركبات الكهربائية.",
    features: [
      "محطات شحن AC/DC حسب سيناريو الاستخدام",
      "إدارة المستخدمين والجلسات والدفع",
      "تكامل مع أنظمة المواقف والطاقة",
      "تقارير تشغيل واستهلاك دورية",
    ],
    useCases: ["المشاريع السكنية", "مواقف المولات", "المنشآت الحكومية والشركات"],
    primaryImage: "/assets/solutions/ev-charging.jpg",
    supportImages: ["/assets/solutions/smart-parking.jpg", "/assets/solutions/ICT-Systems.jpg"],
  },
  {
    slug: "ict-systems",
    title: "أنظمة تقنية المعلومات والاتصالات (ICT Systems)",
    summary: "بنية اتصالات متكاملة تدعم التشغيل الذكي واعتمادية الخدمات الرقمية.",
    details:
      "نصمم وننفذ أنظمة ICT كقاعدة تقنية للمباني الذكية، تشمل الشبكات السلكية واللاسلكية ومراكز الاتصال الداخلي بما يضمن استقرار الأداء وقابلية التوسع.",
    features: [
      "تصميم شبكات مؤسسية عالية الاعتمادية",
      "توزيع بنية الاتصالات بحسب متطلبات المشروع",
      "جاهزية للتكامل مع حلول الأمن والتحكم",
      "حوكمة تشغيل ومراقبة للأداء الشبكي",
    ],
    useCases: ["المباني الذكية", "المنشآت الصحية والتعليمية", "المشاريع متعددة الأبراج"],
    primaryImage: "/assets/solutions/ICT-Systems.jpg",
    supportImages: ["/assets/solutions/security-Systems.jpg", "/assets/solutions/smart-office.jpg"],
  },
  {
    slug: "indoor-lighting-control",
    title: "أنظمة التحكم بالإضاءة الداخلية",
    summary: "تحكم ذكي بمشاهد الإضاءة الداخلية لتحسين الراحة وتوفير الطاقة.",
    details:
      "نطوّر سيناريوهات إضاءة داخلية مرنة بحسب نوع المساحة والأنشطة، مع إدارة مركزية للجداول والمشاهد بما يرفع جودة الاستخدام اليومي ويُحسّن استهلاك الطاقة.",
    features: [
      "مشاهد إضاءة متعددة حسب النشاط والوقت",
      "إدارة جداول التشغيل والتعتيم الآلي",
      "تكامل مع حساسات الحركة والضوء الطبيعي",
      "دعم بروتوكولات تحكم حديثة DMX/DALI",
    ],
    useCases: ["المكاتب والمساحات التجارية", "الفلل والمنازل", "الفنادق والمراكز الصحية"],
    primaryImage: "/assets/solutions/smart-ligting.jpg",
    supportImages: ["/assets/solutions/smart-home.jpg", "/assets/solutions/smart-office.jpg"],
  },
  {
    slug: "security-systems",
    title: "الأنظمة الأمنية (Security Systems)",
    summary: "حماية متقدمة عبر تكامل المراقبة والإنذار والتحكم بالوصول.",
    details:
      "نقدم حلول أمن متكاملة تربط كاميرات المراقبة، أنظمة الإنذار، والتحكم بالدخول في منظومة واحدة تسهّل الاستجابة الفورية وتدعم استمرارية الأعمال.",
    features: [
      "كاميرات مراقبة وتحليلات فيديو ذكية",
      "أنظمة تحكم بالدخول وصلاحيات متعددة",
      "تكامل مع الإنذار والحريق وأنظمة المبنى",
      "مركز مراقبة وتنبيهات فورية للفرق المختصة",
    ],
    useCases: ["المقار الحكومية", "المشاريع التجارية", "المنشآت الحساسة والمجمعات"],
    primaryImage: "/assets/solutions/security-Systems.jpg",
    supportImages: ["/assets/solutions/smart-building.jpg", "/assets/solutions/ICT-Systems.jpg"],
  },
].map((solution) => ({
  ...solution,
  primaryImage: preferPngAsset(solution.primaryImage),
  supportImages: Array.isArray(solution.supportImages)
    ? solution.supportImages.map(preferPngAsset)
    : [],
}));

module.exports = {
  solutions,
};

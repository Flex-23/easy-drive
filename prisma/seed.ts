import { PrismaClient, Prisma } from "@prisma/client";
import { hashPin } from "../lib/auth/pin";
import {
  computeOrderTotals,
  eurosToCents,
  centsToDecimalString,
} from "../lib/pricing";

const db = new PrismaClient();
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const Dc = (cents: number) => new Prisma.Decimal(centsToDecimalString(cents));

const TAX_RATE = 0.19;
const DELIVERY_FEE = 2.5;

// ---------------------------------------------------------------------------
// Seed data types
// ---------------------------------------------------------------------------
interface ChoiceSeed {
  ar: string;
  de: string;
  priceDelta?: number;
  isDefault?: boolean;
}
interface GroupSeed {
  ar: string;
  de: string;
  /** SIZE is the dish's size list, priced absolutely; everything else is EXTRA. */
  kind?: "SIZE" | "EXTRA";
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired?: boolean;
  isCollapsible?: boolean;
  choices: ChoiceSeed[];
}
interface ItemSeed {
  itemNumber: number;
  basePrice: number;
  isPopular?: boolean;
  ar: { name: string; description: string };
  de: { name: string; description: string };
  groups?: GroupSeed[];
}
interface CategorySeed {
  slug: string;
  icon: string;
  ar: string;
  de: string;
  items: ItemSeed[];
}

// ---------------------------------------------------------------------------
// Reusable option groups
// ---------------------------------------------------------------------------
const pizzaSizes: GroupSeed = {
  ar: "الحجم",
  de: "Größe",
  kind: "SIZE",
  selectionType: "SINGLE",
  isRequired: true,
  choices: [
    { ar: "٢٦ سم", de: "26 cm", priceDelta: 0, isDefault: true },
    { ar: "٣٠ سم", de: "30 cm", priceDelta: 2.0 },
    { ar: "٣٣×٤٦ سم", de: "33×46 cm", priceDelta: 8.0 },
    { ar: "٤٠×٦٠ سم", de: "40×60 cm", priceDelta: 18.0 },
  ],
};
const dips: GroupSeed = {
  ar: "الصلصات",
  de: "Dips",
  selectionType: "MULTIPLE",
  isCollapsible: true,
  choices: [
    { ar: "صلصة الثوم", de: "Knoblauchsoße", priceDelta: 0.8 },
    { ar: "تزاتزيكي", de: "Tzatziki", priceDelta: 1.0 },
    { ar: "كريمة الفجل", de: "Sahne-Meerrettich", priceDelta: 1.0 },
    { ar: "كاتشب", de: "Ketchup", priceDelta: 0.5 },
  ],
};
const softDrinks: GroupSeed = {
  ar: "مشروبات",
  de: "Getränke",
  selectionType: "MULTIPLE",
  isCollapsible: true,
  choices: [
    { ar: "كولا ٠٫٣٣ لتر", de: "Cola 0,33 l", priceDelta: 2.5 },
    { ar: "فانتا ٠٫٣٣ لتر", de: "Fanta 0,33 l", priceDelta: 2.5 },
    { ar: "ماء ٠٫٥ لتر", de: "Wasser 0,5 l", priceDelta: 2.0 },
  ],
};
const pastaType: GroupSeed = {
  ar: "نوع المعكرونة",
  de: "Nudelsorte",
  selectionType: "SINGLE",
  isRequired: true,
  choices: [
    { ar: "سباغيتي", de: "Spaghetti", priceDelta: 0, isDefault: true },
    { ar: "ريجاتوني", de: "Rigatoni", priceDelta: 0 },
    { ar: "تالياتيلي", de: "Tagliatelle", priceDelta: 0 },
    { ar: "تورتيليني", de: "Tortellini", priceDelta: 1.0 },
    { ar: "نيوكي", de: "Gnocchi", priceDelta: 1.0 },
  ],
};
const pastaExtras: GroupSeed = {
  ar: "إضافات",
  de: "Extras",
  selectionType: "MULTIPLE",
  isCollapsible: true,
  choices: [
    { ar: "جبن إضافي", de: "Extra Käse", priceDelta: 1.5 },
    { ar: "صلصة إضافية", de: "Extra Soße", priceDelta: 1.0 },
  ],
};
const spiceLevel: GroupSeed = {
  ar: "مستوى الحرارة",
  de: "Schärfegrad",
  selectionType: "SINGLE",
  isRequired: true,
  choices: [
    { ar: "خفيف", de: "Mild", priceDelta: 0, isDefault: true },
    { ar: "متوسط", de: "Mittel", priceDelta: 0 },
    { ar: "حار", de: "Scharf", priceDelta: 0 },
  ],
};
const gyrosSides: GroupSeed = {
  ar: "الطبق الجانبي",
  de: "Beilage",
  selectionType: "SINGLE",
  isRequired: true,
  choices: [
    { ar: "بطاطس مقلية", de: "Pommes", priceDelta: 0, isDefault: true },
    { ar: "أرز", de: "Reis", priceDelta: 0 },
    { ar: "كروكيت", de: "Kroketten", priceDelta: 0.5 },
    { ar: "سلطة", de: "Salat", priceDelta: 1.0 },
  ],
};
const drinkSize: GroupSeed = {
  ar: "الحجم",
  de: "Größe",
  kind: "SIZE",
  selectionType: "SINGLE",
  isRequired: true,
  choices: [
    { ar: "٠٫٣٣ لتر", de: "0,33 l", priceDelta: 0, isDefault: true },
    { ar: "٠٫٥ لتر", de: "0,5 l", priceDelta: 0.7 },
    { ar: "١٫٠ لتر", de: "1,0 l", priceDelta: 1.5 },
  ],
};

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
const menu: CategorySeed[] = [
  {
    slug: "popular",
    icon: "Star",
    ar: "الأكثر طلبًا",
    de: "Beliebt",
    items: [
      {
        itemNumber: 101,
        basePrice: 10.5,
        isPopular: true,
        ar: { name: "بيتزا سلامي", description: "صلصة طماطم، جبنة موزاريلا، سلامي" },
        de: { name: "Pizza Salami", description: "Tomatensoße, Mozzarella, Salami" },
        groups: [pizzaSizes, dips, softDrinks],
      },
      {
        itemNumber: 102,
        basePrice: 12.9,
        isPopular: true,
        ar: { name: "دوريم دونر", description: "خبز صاج، لحم دونر، سلطة، صلصة" },
        de: { name: "Dürüm Döner", description: "Fladenbrot, Dönerfleisch, Salat, Soße" },
        groups: [spiceLevel, dips],
      },
      {
        itemNumber: 103,
        basePrice: 13.5,
        isPopular: true,
        ar: { name: "شنيتزل فيينّي", description: "شنيتزل لحم عجل مع بطاطس مقلية" },
        de: { name: "Wiener Schnitzel", description: "Kalbsschnitzel mit Pommes" },
        groups: [gyrosSides],
      },
      {
        itemNumber: 104,
        basePrice: 11.9,
        isPopular: true,
        ar: { name: "تشيز برجر مزدوج", description: "قطعتا لحم، جبنة شيدر، صلصة البيت" },
        de: { name: "Double Cheeseburger", description: "Doppeltes Rindfleisch, Cheddar, Haussoße" },
        groups: [dips],
      },
    ],
  },
  {
    slug: "angebote",
    icon: "Tag",
    ar: "العروض",
    de: "Angebote",
    items: [
      {
        itemNumber: 201,
        basePrice: 27.9,
        ar: { name: "عرض العائلة", description: "بيتزا كبيرة ٤٠×٦٠، ٤ مشروبات، صلصتان" },
        de: { name: "Familien-Angebot", description: "Party-Pizza 40×60, 4 Getränke, 2 Dips" },
      },
      {
        itemNumber: 202,
        basePrice: 25.5,
        ar: { name: "عرض الثنائي", description: "بيتزاتان ٣٠ سم ومشروبان" },
        de: { name: "Duo-Angebot", description: "2 Pizzen 30 cm + 2 Getränke" },
      },
      {
        itemNumber: 203,
        basePrice: 29.9,
        ar: { name: "صينية دونر مشكّلة", description: "دونر لأربعة أشخاص مع بطاطس وصلصات" },
        de: { name: "Döner-Platte für 4", description: "Döner für 4 mit Pommes und Soßen" },
      },
      {
        itemNumber: 204,
        basePrice: 26.0,
        ar: { name: "عرض الغداء", description: "باستا، سلطة ومشروب" },
        de: { name: "Lunch-Deal", description: "Pasta, Salat und ein Getränk" },
        groups: [pastaType],
      },
    ],
  },
  {
    slug: "salads",
    icon: "Salad",
    ar: "السلطات",
    de: "Salate",
    items: [
      {
        itemNumber: 301,
        basePrice: 8.5,
        ar: { name: "سلطة يونانية", description: "خس، طماطم، خيار، جبنة فيتا، زيتون" },
        de: { name: "Griechischer Salat", description: "Salat, Tomate, Gurke, Feta, Oliven" },
      },
      {
        itemNumber: 302,
        basePrice: 9.9,
        ar: { name: "سلطة سيزر بالدجاج", description: "خس روماني، دجاج مشوي، صلصة سيزر" },
        de: { name: "Caesar Salat mit Hähnchen", description: "Römersalat, Hähnchen, Caesar-Dressing" },
      },
      {
        itemNumber: 303,
        basePrice: 8.0,
        ar: { name: "سلطة الموسم", description: "خضار موسمية طازجة مع صلصة الخل" },
        de: { name: "Gemischter Salat", description: "Frisches Saisongemüse mit Vinaigrette" },
      },
      {
        itemNumber: 304,
        basePrice: 10.5,
        ar: { name: "سلطة تونة", description: "خضار مشكّلة مع تونة وبيض" },
        de: { name: "Thunfischsalat", description: "Gemischter Salat mit Thunfisch und Ei" },
      },
    ],
  },
  {
    slug: "pizza",
    icon: "Pizza",
    ar: "بيتزا",
    de: "Pizza",
    items: [
      {
        itemNumber: 401,
        basePrice: 9.0,
        ar: { name: "بيتزا مارغريتا", description: "صلصة طماطم وجبنة موزاريلا" },
        de: { name: "Pizza Margherita", description: "Tomatensoße und Mozzarella" },
        groups: [pizzaSizes, dips, softDrinks],
      },
      {
        itemNumber: 402,
        basePrice: 10.5,
        ar: { name: "بيتزا فونغي", description: "طماطم، موزاريلا، فطر طازج" },
        de: { name: "Pizza Funghi", description: "Tomate, Mozzarella, frische Champignons" },
        groups: [pizzaSizes, dips, softDrinks],
      },
      {
        itemNumber: 403,
        basePrice: 11.5,
        ar: { name: "بيتزا بروشوتو", description: "طماطم، موزاريلا، لحم مقدد" },
        de: { name: "Pizza Prosciutto", description: "Tomate, Mozzarella, Schinken" },
        groups: [pizzaSizes, dips, softDrinks],
      },
      {
        itemNumber: 404,
        basePrice: 12.5,
        ar: { name: "بيتزا هاواي", description: "طماطم، موزاريلا، لحم، أناناس" },
        de: { name: "Pizza Hawaii", description: "Tomate, Mozzarella, Schinken, Ananas" },
        groups: [pizzaSizes, dips, softDrinks],
      },
      {
        itemNumber: 405,
        basePrice: 13.0,
        ar: { name: "بيتزا الخضار", description: "طماطم، موزاريلا، خضار مشكّلة" },
        de: { name: "Pizza Vegetaria", description: "Tomate, Mozzarella, gemischtes Gemüse" },
        groups: [pizzaSizes, dips, softDrinks],
      },
      {
        itemNumber: 406,
        basePrice: 13.5,
        ar: { name: "بيتزا توناكورن", description: "طماطم، موزاريلا، تونة، ذرة، بصل" },
        de: { name: "Pizza Thunfisch", description: "Tomate, Mozzarella, Thunfisch, Mais, Zwiebeln" },
        groups: [pizzaSizes, dips, softDrinks],
      },
      {
        itemNumber: 407,
        basePrice: 14.5,
        ar: { name: "بيتزا كواترو ستاجوني", description: "أربعة فصول: فطر، لحم، خرشوف، زيتون" },
        de: { name: "Pizza Quattro Stagioni", description: "Champignons, Schinken, Artischocken, Oliven" },
        groups: [pizzaSizes, dips, softDrinks],
      },
      {
        itemNumber: 408,
        basePrice: 15.0,
        ar: { name: "بيتزا دياڤولا", description: "طماطم، موزاريلا، سلامي حار، فلفل" },
        de: { name: "Pizza Diavola", description: "Tomate, Mozzarella, scharfe Salami, Peperoni" },
        groups: [pizzaSizes, dips, softDrinks],
      },
    ],
  },
  {
    slug: "pizzabroetchen",
    icon: "Croissant",
    ar: "خبز البيتزا",
    de: "Pizzabrötchen",
    items: [
      {
        itemNumber: 501,
        basePrice: 5.5,
        ar: { name: "خبز بالثوم", description: "٦ قطع خبز بيتزا مع صلصة الثوم" },
        de: { name: "Pizzabrötchen Knoblauch", description: "6 Stück mit Knoblauchsoße" },
        groups: [dips],
      },
      {
        itemNumber: 502,
        basePrice: 6.5,
        ar: { name: "خبز بالجبن", description: "٦ قطع خبز بيتزا بالجبنة المذابة" },
        de: { name: "Pizzabrötchen Käse", description: "6 Stück mit geschmolzenem Käse" },
        groups: [dips],
      },
      {
        itemNumber: 503,
        basePrice: 6.0,
        ar: { name: "خبز حار", description: "٦ قطع خبز بيتزا مع فلفل حار" },
        de: { name: "Pizzabrötchen Scharf", description: "6 Stück mit Peperoni" },
        groups: [dips],
      },
    ],
  },
  {
    slug: "pasta",
    icon: "Wheat",
    ar: "باستا",
    de: "Pasta",
    items: [
      {
        itemNumber: 601,
        basePrice: 10.0,
        ar: { name: "باستا نابوليتانا", description: "صلصة طماطم وريحان" },
        de: { name: "Pasta Napoli", description: "Tomatensoße und Basilikum" },
        groups: [pastaType, pastaExtras],
      },
      {
        itemNumber: 602,
        basePrice: 11.5,
        ar: { name: "باستا بولونيز", description: "صلصة لحم مفروم" },
        de: { name: "Pasta Bolognese", description: "Hackfleischsoße" },
        groups: [pastaType, pastaExtras],
      },
      {
        itemNumber: 603,
        basePrice: 11.9,
        ar: { name: "باستا كاربونارا", description: "كريمة، لحم مقدد، بارميزان" },
        de: { name: "Pasta Carbonara", description: "Sahne, Speck, Parmesan" },
        groups: [pastaType, pastaExtras],
      },
      {
        itemNumber: 604,
        basePrice: 12.5,
        ar: { name: "باستا الدجاج", description: "كريمة، دجاج مشوي، فطر" },
        de: { name: "Pasta mit Hähnchen", description: "Sahne, Hähnchen, Champignons" },
        groups: [pastaType, pastaExtras],
      },
      {
        itemNumber: 605,
        basePrice: 12.9,
        ar: { name: "باستا فروتي دي ماري", description: "مأكولات بحرية بصلصة الطماطم" },
        de: { name: "Pasta Frutti di Mare", description: "Meeresfrüchte in Tomatensoße" },
        groups: [pastaType, pastaExtras],
      },
      {
        itemNumber: 606,
        basePrice: 10.9,
        ar: { name: "باستا بيستو", description: "صلصة بيستو الريحان والصنوبر" },
        de: { name: "Pasta Pesto", description: "Basilikum-Pesto mit Pinienkernen" },
        groups: [pastaType, pastaExtras],
      },
    ],
  },
  {
    slug: "baked",
    icon: "Flame",
    ar: "أطباق بالفرن",
    de: "Überbackene Gerichte",
    items: [
      {
        itemNumber: 701,
        basePrice: 11.5,
        ar: { name: "لازانيا بولونيز", description: "طبقات باستا بصلصة اللحم والبشاميل" },
        de: { name: "Lasagne Bolognese", description: "Pasta mit Hackfleisch und Béchamel, überbacken" },
      },
      {
        itemNumber: 702,
        basePrice: 12.0,
        ar: { name: "كانيلوني بالسبانخ", description: "باستا محشوة بالسبانخ والريكوتا" },
        de: { name: "Cannelloni Spinat", description: "Mit Spinat und Ricotta gefüllt, überbacken" },
      },
      {
        itemNumber: 703,
        basePrice: 13.5,
        ar: { name: "دجاج بالفرن مع الجبن", description: "صدور دجاج، خضار، جبن مذاب" },
        de: { name: "Überbackenes Hähnchen", description: "Hähnchenbrust, Gemüse, geschmolzener Käse" },
        groups: [gyrosSides],
      },
      {
        itemNumber: 704,
        basePrice: 14.5,
        ar: { name: "جراتان البطاطس", description: "بطاطس بالكريمة والجبن بالفرن" },
        de: { name: "Kartoffelgratin", description: "Kartoffeln mit Sahne und Käse überbacken" },
      },
    ],
  },
  {
    slug: "gyros",
    icon: "Beef",
    ar: "جيروس ودونر",
    de: "Gyros & Döner",
    items: [
      {
        itemNumber: 801,
        basePrice: 12.0,
        ar: { name: "طبق جيروس", description: "لحم جيروس مع طبق جانبي وصلصة تزاتزيكي" },
        de: { name: "Gyros Teller", description: "Gyros mit Beilage und Tzatziki" },
        groups: [gyrosSides, spiceLevel],
      },
      {
        itemNumber: 802,
        basePrice: 6.5,
        ar: { name: "ساندويتش دونر", description: "خبز، لحم دونر، سلطة، صلصة" },
        de: { name: "Döner Sandwich", description: "Brot, Dönerfleisch, Salat, Soße" },
        groups: [spiceLevel, dips],
      },
      {
        itemNumber: 803,
        basePrice: 13.5,
        ar: { name: "طبق دونر مشكّل", description: "دونر مع بطاطس، أرز وسلطة" },
        de: { name: "Döner Teller", description: "Döner mit Pommes, Reis und Salat" },
        groups: [gyrosSides, spiceLevel],
      },
      {
        itemNumber: 804,
        basePrice: 7.5,
        ar: { name: "لحمة عجين (لهم أجون)", description: "عجينة رقيقة باللحم المفروم والخضار" },
        de: { name: "Lahmacun", description: "Dünner Teig mit Hackfleisch und Gemüse" },
        groups: [dips],
      },
      {
        itemNumber: 805,
        basePrice: 12.5,
        ar: { name: "بوكس دجاج", description: "قطع دجاج مقرمشة مع بطاطس وصلصة" },
        de: { name: "Chicken Box", description: "Knusprige Hähnchenstücke mit Pommes und Soße" },
        groups: [dips, spiceLevel],
      },
    ],
  },
  {
    slug: "schnitzel",
    icon: "Drumstick",
    ar: "شنيتزل",
    de: "Schnitzel",
    items: [
      {
        itemNumber: 901,
        basePrice: 13.0,
        ar: { name: "شنيتزل عادي", description: "شنيتزل مقرمش مع بطاطس مقلية" },
        de: { name: "Schnitzel Wiener Art", description: "Knuspriges Schnitzel mit Pommes" },
        groups: [gyrosSides],
      },
      {
        itemNumber: 902,
        basePrice: 14.0,
        ar: { name: "شنيتزل بصلصة الفطر", description: "شنيتزل مع صلصة الفطر الكريمية" },
        de: { name: "Jägerschnitzel", description: "Schnitzel mit Champignon-Rahmsoße" },
        groups: [gyrosSides],
      },
      {
        itemNumber: 903,
        basePrice: 14.5,
        ar: { name: "شنيتزل بالفلفل", description: "شنيتزل مع صلصة الفلفل الحارة" },
        de: { name: "Zigeunerschnitzel", description: "Schnitzel mit Paprikasoße" },
        groups: [gyrosSides],
      },
      {
        itemNumber: 904,
        basePrice: 15.0,
        ar: { name: "شنيتزل بالجبن", description: "شنيتزل بالجبن المذاب والصلصة" },
        de: { name: "Rahmschnitzel", description: "Schnitzel mit Käse und Rahmsoße" },
        groups: [gyrosSides],
      },
    ],
  },
  {
    slug: "burgers",
    icon: "Sandwich",
    ar: "برجر",
    de: "Burger",
    items: [
      {
        itemNumber: 1001,
        basePrice: 9.5,
        ar: { name: "برجر كلاسيك", description: "لحم بقري، خس، طماطم، صلصة" },
        de: { name: "Classic Burger", description: "Rindfleisch, Salat, Tomate, Soße" },
        groups: [dips],
      },
      {
        itemNumber: 1002,
        basePrice: 10.5,
        ar: { name: "تشيز برجر", description: "لحم بقري، جبنة شيدر، بصل" },
        de: { name: "Cheeseburger", description: "Rindfleisch, Cheddar, Zwiebeln" },
        groups: [dips],
      },
      {
        itemNumber: 1003,
        basePrice: 11.5,
        ar: { name: "برجر بيكون", description: "لحم بقري، لحم مقدد، جبنة" },
        de: { name: "Bacon Burger", description: "Rindfleisch, Bacon, Käse" },
        groups: [dips],
      },
      {
        itemNumber: 1004,
        basePrice: 10.0,
        ar: { name: "برجر نباتي", description: "قرص نباتي، خضار طازجة، صلصة" },
        de: { name: "Veggie Burger", description: "Gemüse-Patty, frisches Gemüse, Soße" },
        groups: [dips],
      },
    ],
  },
  {
    slug: "burger-menus",
    icon: "Sandwich",
    ar: "وجبات برجر",
    de: "Burger-Menüs",
    items: [
      {
        itemNumber: 1101,
        basePrice: 13.5,
        ar: { name: "وجبة تشيز برجر", description: "تشيز برجر مع بطاطس ومشروب" },
        de: { name: "Cheeseburger Menü", description: "Cheeseburger mit Pommes und Getränk" },
        groups: [softDrinks],
      },
      {
        itemNumber: 1102,
        basePrice: 15.0,
        ar: { name: "وجبة برجر بيكون", description: "برجر بيكون مع بطاطس ومشروب" },
        de: { name: "Bacon Burger Menü", description: "Bacon Burger mit Pommes und Getränk" },
        groups: [softDrinks],
      },
    ],
  },
  {
    slug: "fish",
    icon: "Fish",
    ar: "أسماك",
    de: "Fisch",
    items: [
      {
        itemNumber: 1201,
        basePrice: 13.5,
        ar: { name: "فيليه سمك مقلي", description: "فيليه سمك مقرمش مع بطاطس وصلصة" },
        de: { name: "Backfisch", description: "Knuspriges Fischfilet mit Pommes und Soße" },
        groups: [gyrosSides],
      },
      {
        itemNumber: 1202,
        basePrice: 15.5,
        ar: { name: "سلمون مشوي", description: "سلمون مشوي مع خضار وأرز" },
        de: { name: "Gegrillter Lachs", description: "Gegrillter Lachs mit Gemüse und Reis" },
      },
      {
        itemNumber: 1203,
        basePrice: 12.5,
        ar: { name: "أصابع السمك", description: "أصابع سمك مقرمشة مع بطاطس" },
        de: { name: "Fischstäbchen", description: "Knusprige Fischstäbchen mit Pommes" },
        groups: [dips],
      },
    ],
  },
  {
    slug: "vegetarian",
    icon: "Leaf",
    ar: "نباتي",
    de: "Vegetarisch",
    items: [
      {
        itemNumber: 1301,
        basePrice: 10.5,
        ar: { name: "فلافل بلاته", description: "فلافل مع حمص وسلطة وخبز" },
        de: { name: "Falafel Teller", description: "Falafel mit Hummus, Salat und Brot" },
        groups: [dips],
      },
      {
        itemNumber: 1302,
        basePrice: 11.0,
        ar: { name: "خضار بالكاري", description: "خضار موسمية بصلصة الكاري والأرز" },
        de: { name: "Gemüse-Curry", description: "Saisongemüse in Currysoße mit Reis" },
        groups: [spiceLevel],
      },
      {
        itemNumber: 1303,
        basePrice: 9.9,
        ar: { name: "حلومي مشوي", description: "جبن حلومي مشوي مع سلطة" },
        de: { name: "Gegrillter Halloumi", description: "Gegrillter Halloumi mit Salat" },
      },
    ],
  },
  {
    slug: "curries",
    icon: "Soup",
    ar: "كاري",
    de: "Currys",
    items: [
      {
        itemNumber: 1401,
        basePrice: 12.5,
        ar: { name: "كاري دجاج", description: "دجاج بصلصة الكاري الكريمية والأرز" },
        de: { name: "Hähnchen-Curry", description: "Hähnchen in cremiger Currysoße mit Reis" },
        groups: [spiceLevel],
      },
      {
        itemNumber: 1402,
        basePrice: 13.5,
        ar: { name: "كاري لحم", description: "لحم طري بصلصة الكاري والأرز" },
        de: { name: "Rindfleisch-Curry", description: "Zartes Rindfleisch in Currysoße mit Reis" },
        groups: [spiceLevel],
      },
      {
        itemNumber: 1403,
        basePrice: 12.9,
        ar: { name: "كاري روبيان", description: "روبيان بصلصة الكاري الحارة والأرز" },
        de: { name: "Garnelen-Curry", description: "Garnelen in scharfer Currysoße mit Reis" },
        groups: [spiceLevel],
      },
    ],
  },
  {
    slug: "drinks",
    icon: "CupSoda",
    ar: "مشروبات",
    de: "Getränke",
    items: [
      {
        itemNumber: 1501,
        basePrice: 2.5,
        ar: { name: "كولا", description: "مشروب غازي منعش" },
        de: { name: "Cola", description: "Erfrischendes Erfrischungsgetränk" },
        groups: [drinkSize],
      },
      {
        itemNumber: 1502,
        basePrice: 2.5,
        ar: { name: "فانتا", description: "مشروب برتقال غازي" },
        de: { name: "Fanta", description: "Orangenlimonade" },
        groups: [drinkSize],
      },
      {
        itemNumber: 1503,
        basePrice: 2.5,
        ar: { name: "سبرايت", description: "مشروب ليمون غازي" },
        de: { name: "Sprite", description: "Zitronenlimonade" },
        groups: [drinkSize],
      },
      {
        itemNumber: 1504,
        basePrice: 2.0,
        ar: { name: "ماء معدني", description: "ماء معدني طبيعي" },
        de: { name: "Mineralwasser", description: "Natürliches Mineralwasser" },
        groups: [drinkSize],
      },
      {
        itemNumber: 1505,
        basePrice: 3.5,
        ar: { name: "عصير برتقال", description: "عصير برتقال طازج" },
        de: { name: "Orangensaft", description: "Frisch gepresster Orangensaft" },
      },
      {
        itemNumber: 1506,
        basePrice: 3.0,
        ar: { name: "آيس تي", description: "شاي مثلج بالخوخ" },
        de: { name: "Eistee", description: "Eistee Pfirsich" },
      },
      {
        itemNumber: 1507,
        basePrice: 2.8,
        ar: { name: "قهوة", description: "قهوة إسبريسو ساخنة" },
        de: { name: "Kaffee", description: "Heißer Espresso-Kaffee" },
      },
      {
        itemNumber: 1508,
        basePrice: 3.8,
        ar: { name: "عيران", description: "مشروب لبن مملح منعش" },
        de: { name: "Ayran", description: "Erfrischendes Joghurtgetränk" },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function tr(ar: string, de: string, arDesc?: string, deDesc?: string) {
  return {
    create: [
      { locale: "ar" as const, name: ar, description: arDesc ?? null },
      { locale: "de" as const, name: de, description: deDesc ?? null },
    ],
  };
}

async function clear() {
  await db.orderLineOption.deleteMany();
  await db.orderLine.deleteMany();
  await db.order.deleteMany();
  await db.customerAddress.deleteMany();
  await db.customer.deleteMany();
  await db.optionChoiceTranslation.deleteMany();
  await db.optionChoice.deleteMany();
  await db.optionGroupTranslation.deleteMany();
  await db.optionGroup.deleteMany();
  await db.menuItemTranslation.deleteMany();
  await db.menuItem.deleteMany();
  await db.categoryTranslation.deleteMany();
  await db.category.deleteMany();
  await db.user.deleteMany();
  await db.setting.deleteMany();
}

async function seedMenu() {
  for (let c = 0; c < menu.length; c++) {
    const cat = menu[c];
    await db.category.create({
      data: {
        slug: cat.slug,
        sortOrder: c,
        icon: cat.icon,
        translations: tr(cat.ar, cat.de),
        items: {
          create: cat.items.map((item, i) => ({
            itemNumber: item.itemNumber,
            basePrice: D(item.basePrice),
            isPopular: item.isPopular ?? false,
            sortOrder: i,
            translations: tr(
              item.ar.name,
              item.de.name,
              item.ar.description,
              item.de.description,
            ),
            optionGroups: {
              create: (item.groups ?? []).map((g, gi) => ({
                kind: g.kind ?? "EXTRA",
                selectionType: g.selectionType,
                isRequired: g.isRequired ?? false,
                isCollapsible: g.isCollapsible ?? false,
                sortOrder: gi,
                translations: tr(g.ar, g.de),
                choices: {
                  create: g.choices.map((ch, ci) => ({
                    priceDelta: D(ch.priceDelta ?? 0),
                    isDefault: ch.isDefault ?? false,
                    sortOrder: ci,
                    translations: tr(ch.ar, ch.de),
                  })),
                },
              })),
            },
          })),
        },
      },
    });
  }
}

async function seedUsers() {
  return Promise.all([
    db.user.create({
      data: {
        name: "Amir Hassan",
        pin: hashPin("1234"),
        role: "ADMIN",
        avatarColor: "#ea580c",
      },
    }),
    db.user.create({
      data: {
        name: "Lena Müller",
        pin: hashPin("2345"),
        role: "CASHIER",
        avatarColor: "#0891b2",
      },
    }),
    db.user.create({
      data: {
        name: "Jonas Weber",
        pin: hashPin("3456"),
        role: "CASHIER",
        avatarColor: "#16a34a",
      },
    }),
  ]);
}

const CUSTOMERS = [
  { name: "Thomas Schneider", phone: "01512 3456789", street: "Hauptstraße", houseNumber: "12", postalCode: "10115", city: "Berlin" },
  { name: "Julia Fischer", phone: "01522 9876543", street: "Bahnhofstraße", houseNumber: "5a", postalCode: "80331", city: "München" },
  { name: "Michael Wagner", phone: "01573 1122334", street: "Lindenweg", houseNumber: "23", postalCode: "50667", city: "Köln" },
  { name: "Sabine Becker", phone: "01601 5566778", street: "Gartenstraße", houseNumber: "8", postalCode: "20095", city: "Hamburg" },
  { name: "Andreas Hoffmann", phone: "01704 4455667", street: "Schulstraße", houseNumber: "17", postalCode: "60311", city: "Frankfurt" },
  { name: "Nicole Schäfer", phone: "01515 7788990", street: "Kirchgasse", houseNumber: "3", postalCode: "70173", city: "Stuttgart" },
  { name: "Stefan Koch", phone: "01577 2233445", street: "Ringstraße", houseNumber: "44", postalCode: "40213", city: "Düsseldorf" },
  { name: "Petra Bauer", phone: "01609 9988776", street: "Amselweg", houseNumber: "9", postalCode: "04109", city: "Leipzig" },
  { name: "Markus Richter", phone: "01712 6677889", street: "Feldstraße", houseNumber: "31", postalCode: "01067", city: "Dresden" },
  { name: "Claudia Klein", phone: "01525 3344556", street: "Rosenweg", houseNumber: "2b", postalCode: "30159", city: "Hannover" },
  { name: "Daniel Wolf", phone: "01578 8899001", street: "Waldstraße", houseNumber: "15", postalCode: "90402", city: "Nürnberg" },
  { name: "Katrin Neumann", phone: "01603 1212343", street: "Bergstraße", houseNumber: "6", postalCode: "28195", city: "Bremen" },
  { name: "Oliver Schwarz", phone: "01516 4545676", street: "Talweg", houseNumber: "19", postalCode: "45127", city: "Essen" },
  { name: "Sandra Zimmermann", phone: "01579 7878909", street: "Sonnenallee", houseNumber: "27", postalCode: "44135", city: "Dortmund" },
  { name: "Frank Braun", phone: "01704 3232109", street: "Uferstraße", houseNumber: "11", postalCode: "79098", city: "Freiburg" },
];

async function seedCustomers() {
  const created = [];
  for (const c of CUSTOMERS) {
    created.push(
      await db.customer.create({
        data: {
          name: c.name,
          phone: c.phone,
          email: `${c.name.split(" ")[0].toLowerCase()}@example.de`,
          addresses: {
            create: {
              street: c.street,
              houseNumber: c.houseNumber,
              postalCode: c.postalCode,
              city: c.city,
              isDefault: true,
            },
          },
        },
        include: { addresses: true },
      }),
    );
  }
  return created;
}

type SeededCustomer = Awaited<ReturnType<typeof seedCustomers>>[number];

// deterministic-ish pseudo random
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function seedOrders(
  users: { id: number }[],
  customers: SeededCustomer[],
) {
  const items = await db.menuItem.findMany({
    include: {
      translations: true,
      optionGroups: {
        include: { translations: true, choices: { include: { translations: true } } },
      },
    },
  });

  const deName = (translations: { locale: string; name: string }[]) =>
    translations.find((t) => t.locale === "de")?.name ??
    translations[0]?.name ??
    "";

  const types = ["DINE_IN", "PICKUP", "DELIVERY"] as const;
  const methods = ["CASH", "CARD", "ONLINE"] as const;
  const perDay: Record<string, number> = {};

  const now = new Date("2026-09-02T14:30:00");

  // 40 historical + a few live online orders
  for (let n = 0; n < 40; n++) {
    const daysAgo = Math.floor(n / 3); // ~3 per day across 14 days
    const created = new Date(now);
    created.setDate(created.getDate() - daysAgo);
    created.setHours(11 + (n % 10), (n * 7) % 60, 0, 0);

    const dayKey = created.toISOString().slice(0, 10).replace(/-/g, "");
    perDay[dayKey] = (perDay[dayKey] ?? 0) + 1;
    const orderNumber = `${dayKey}-${String(perDay[dayKey]).padStart(3, "0")}`;

    const type = pick([...types], n);
    const method = pick([...methods], n + 1);
    const customer = pick(customers, n);
    const lineCount = 1 + (n % 3);

    const lineInputs: {
      item: (typeof items)[number];
      quantity: number;
      chosen: { groupName: string; choiceName: string; priceDelta: Prisma.Decimal }[];
    }[] = [];

    for (let l = 0; l < lineCount; l++) {
      const item = pick(items, n * 3 + l);
      const chosen: {
        groupName: string;
        choiceName: string;
        priceDelta: Prisma.Decimal;
      }[] = [];
      for (const g of item.optionGroups) {
        if (g.isRequired) {
          const def = g.choices.find((c) => c.isDefault) ?? g.choices[0];
          if (def) {
            chosen.push({
              groupName: deName(g.translations),
              choiceName: deName(def.translations),
              priceDelta: def.priceDelta,
            });
          }
        }
      }
      lineInputs.push({ item, quantity: 1 + (l % 2), chosen });
    }

    const totals = computeOrderTotals({
      lines: lineInputs.map((li) => ({
        basePrice: eurosToCents(li.item.basePrice.toString()),
        quantity: li.quantity,
        options: li.chosen.map((c) => ({
          priceDelta: eurosToCents(c.priceDelta.toString()),
        })),
      })),
      deliveryFee: type === "DELIVERY" ? eurosToCents(DELIVERY_FEE) : 0,
      taxRate: TAX_RATE,
    });

    await db.order.create({
      data: {
        orderNumber,
        type,
        status: "COMPLETED",
        source: method === "ONLINE" ? "ONLINE" : "POS",
        customerId: type === "DELIVERY" ? customer.id : n % 2 === 0 ? customer.id : null,
        addressId: type === "DELIVERY" ? customer.addresses[0]?.id ?? null : null,
        tableNumber: type === "DINE_IN" ? String(1 + (n % 12)) : null,
        subtotal: Dc(totals.subtotal),
        discountAmount: Dc(totals.discountAmount),
        deliveryFee: Dc(totals.deliveryFee),
        taxAmount: Dc(totals.taxAmount),
        total: Dc(totals.total),
        paymentMethod: method,
        paidAt: created,
        cashierId: pick(users, n).id,
        createdAt: created,
        lines: {
          create: lineInputs.map((li, idx) => ({
            menuItemId: li.item.id,
            itemNameSnapshot: deName(li.item.translations),
            unitPrice: Dc(totals.lines[idx].unitPrice),
            quantity: li.quantity,
            lineTotal: Dc(totals.lines[idx].lineTotal),
            options: {
              create: li.chosen.map((c) => ({
                groupNameSnapshot: c.groupName,
                choiceNameSnapshot: c.choiceName,
                priceDelta: c.priceDelta,
              })),
            },
          })),
        },
      },
    });
  }

  // Live online orders awaiting acceptance (recent, active countdown)
  for (let k = 0; k < 4; k++) {
    const created = new Date(now.getTime() - (2 + k * 4) * 60 * 1000);
    const dayKey = created.toISOString().slice(0, 10).replace(/-/g, "");
    perDay[dayKey] = (perDay[dayKey] ?? 0) + 1;
    const orderNumber = `${dayKey}-${String(perDay[dayKey]).padStart(3, "0")}`;
    const item = pick(items, 100 + k);
    const totals = computeOrderTotals({
      lines: [
        {
          basePrice: eurosToCents(item.basePrice.toString()),
          quantity: 1 + k,
          options: [],
        },
      ],
      deliveryFee: eurosToCents(DELIVERY_FEE),
      taxRate: TAX_RATE,
    });
    const customer = pick(customers, k + 5);
    await db.order.create({
      data: {
        orderNumber,
        type: "DELIVERY",
        status: "PENDING",
        source: "ONLINE",
        customerId: customer.id,
        addressId: customer.addresses[0]?.id ?? null,
        subtotal: Dc(totals.subtotal),
        deliveryFee: Dc(totals.deliveryFee),
        taxAmount: Dc(totals.taxAmount),
        total: Dc(totals.total),
        cashierId: pick(users, k).id,
        createdAt: created,
        lines: {
          create: [
            {
              menuItemId: item.id,
              itemNameSnapshot: deName(item.translations),
              unitPrice: Dc(totals.lines[0].unitPrice),
              quantity: 1 + k,
              lineTotal: Dc(totals.lines[0].lineTotal),
            },
          ],
        },
      },
    });
  }
}

async function seedSettings() {
  const rows = [
    { key: "restaurantName", value: "Easy Drive Restaurant", type: "STRING" as const },
    { key: "defaultLocale", value: "ar", type: "LOCALE" as const },
    { key: "currency", value: "EUR", type: "STRING" as const },
    { key: "taxRate", value: "0.19", type: "NUMBER" as const },
    { key: "deliveryFee", value: "2.50", type: "NUMBER" as const },
    { key: "receiptHeader", value: "Easy Drive Restaurant", type: "STRING" as const },
    { key: "receiptFooter", value: "Vielen Dank! · شكراً لزيارتكم", type: "STRING" as const },
    { key: "printerName", value: "TERM-01 Thermal", type: "STRING" as const },
  ];
  for (const r of rows) {
    await db.setting.create({ data: r });
  }
}

async function main() {
  console.log("🌱 Seeding Easy Drive…");
  await clear();
  await seedMenu();
  const users = await seedUsers();
  const customers = await seedCustomers();
  await seedOrders(users, customers);
  await seedSettings();
  const counts = {
    categories: await db.category.count(),
    items: await db.menuItem.count(),
    orders: await db.order.count(),
    customers: await db.customer.count(),
    users: await db.user.count(),
  };
  console.log("✅ Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

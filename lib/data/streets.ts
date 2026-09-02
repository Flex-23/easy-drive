/**
 * Local address reference data. Selecting a street auto-fills its Mahalla
 * (sector), Area (district) and City — the cashier only types the house number.
 * To extend coverage, add entries here; nothing else needs to change.
 */
export interface StreetEntry {
  street: string;
  mahalla: string;
  area: string;
  city: string;
}

export const streets: StreetEntry[] = [
  { street: "شارع 14 رمضان", mahalla: "609", area: "المنصور", city: "بغداد" },
  { street: "شارع الأميرات", mahalla: "605", area: "المنصور", city: "بغداد" },
  { street: "شارع الرواد", mahalla: "601", area: "المنصور", city: "بغداد" },
  { street: "شارع أبو نؤاس", mahalla: "103", area: "الكرادة", city: "بغداد" },
  { street: "شارع الكرادة داخل", mahalla: "909", area: "الكرادة", city: "بغداد" },
  { street: "شارع 62", mahalla: "701", area: "زيونة", city: "بغداد" },
  { street: "شارع الربيعي", mahalla: "703", area: "زيونة", city: "بغداد" },
  { street: "شارع الجادرية", mahalla: "913", area: "الجادرية", city: "بغداد" },
  { street: "شارع حيفا", mahalla: "215", area: "الكرخ", city: "بغداد" },
  { street: "شارع فلسطين", mahalla: "503", area: "الرصافة", city: "بغداد" },
  { street: "شارع المغرب", mahalla: "305", area: "الأعظمية", city: "بغداد" },
  { street: "شارع عمر بن عبد العزيز", mahalla: "311", area: "الأعظمية", city: "بغداد" },
  { street: "شارع الإمام الأعظم", mahalla: "302", area: "الأعظمية", city: "بغداد" },
  { street: "شارع الكفاح", mahalla: "109", area: "الرصافة", city: "بغداد" },
  { street: "شارع السعدون", mahalla: "102", area: "الرصافة", city: "بغداد" },
  { street: "شارع النضال", mahalla: "104", area: "الرصافة", city: "بغداد" },
  { street: "شارع الرشيد", mahalla: "108", area: "الرصافة", city: "بغداد" },
  { street: "شارع المتنبي", mahalla: "107", area: "الرصافة", city: "بغداد" },
  { street: "شارع الحارثية", mahalla: "213", area: "الحارثية", city: "بغداد" },
  { street: "شارع اليرموك", mahalla: "607", area: "اليرموك", city: "بغداد" },
  { street: "شارع القاهرة", mahalla: "313", area: "الأعظمية", city: "بغداد" },
  { street: "شارع الشيخ عمر", mahalla: "111", area: "الرصافة", city: "بغداد" },
  { street: "شارع صلاح الدين", mahalla: "617", area: "الغزالية", city: "بغداد" },
  { street: "شارع الجامعة", mahalla: "631", area: "الجامعة", city: "بغداد" },
];

export function findStreet(name: string): StreetEntry | undefined {
  return streets.find((s) => s.street === name);
}

import { z } from "zod";

export const settingsSchema = z.object({
  restaurantName: z.string().trim().min(1, "required").max(120),
  defaultLocale: z.enum(["ar", "de"]),
  currency: z.string().trim().min(1, "required").max(8),
  /** Entered as a percentage in the UI (e.g. 19), stored as a fraction. */
  taxRatePercent: z.number().min(0, "taxRateRange").max(100, "taxRateRange"),
  deliveryFee: z.number().min(0, "negativePrice"),
  receiptHeader: z.string().trim().max(200),
  receiptFooter: z.string().trim().max(200),
  printerName: z.string().trim().max(120),
  printerColumns: z.number().int().min(24).max(64),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

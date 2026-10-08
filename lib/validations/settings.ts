import { z } from "zod";

export const settingsSchema = z.object({
  restaurantName: z.string().trim().min(1, "required").max(120),
  defaultLocale: z.enum(["ar", "de"]),
  currency: z.string().trim().min(1, "required").max(8),
  receiptHeader: z.string().trim().max(200),
  receiptFooter: z.string().trim().max(200),
  printerName: z.string().trim().max(120),
  printerColumns: z.number().int().min(24).max(64),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

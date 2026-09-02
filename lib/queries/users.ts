import "server-only";
import { db } from "../db";

export interface StaffView {
  id: number;
  name: string;
  role: "ADMIN" | "CASHIER";
  avatarColor: string;
}

export async function getActiveUsers(): Promise<StaffView[]> {
  return db.user.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true, role: true, avatarColor: true },
  });
}

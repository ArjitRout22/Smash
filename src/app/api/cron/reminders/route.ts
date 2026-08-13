import { NextRequest } from "next/server";
import { getEnv } from "@/lib/config/env";
import { runTournamentReminders } from "@/lib/services/reminders.service";

// Daily reminder job (wired via vercel.json crons). Vercel Cron includes
// `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set.
export async function GET(req: NextRequest) {
  const { CRON_SECRET } = getEnv();
  if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runTournamentReminders();
  return Response.json({ success: true, ...result });
}

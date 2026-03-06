//login cookies
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export function getSupabaseServerClient() {
  return createServerComponentClient({ cookies });
}

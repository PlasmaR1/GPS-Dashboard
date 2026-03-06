
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export default async function HomePage() {
  const supabase = getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();


  redirect(session ? "/gps" : "/login");
}

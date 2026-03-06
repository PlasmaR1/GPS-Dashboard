import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import LiveBikeMap from "@/components/LiveBikeMap";
import NavBar from "@/components/NavBar";
import "mapbox-gl/dist/mapbox-gl.css";

export default async function GPSPage() {
  const supabase = getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const userEmail = session.user?.email || session.user?.id;

  return (
    <div className="h-screen w-screen">
      <NavBar userEmail={userEmail} />
      <div className="relative w-full h-[calc(100vh-3.5rem)] mt-14">
        <LiveBikeMap />
      </div>
    </div>
  );
}

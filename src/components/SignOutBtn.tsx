//sign out
"use client";
import { supabase } from "@/lib/supabaseClient";

export default function SignOutBtn() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };
  return (
    <button
      onClick={handleSignOut}
      className="text-red-500 px-3 py-1 hover:text-red-700"
    >
      Logout
    </button>
  );
}

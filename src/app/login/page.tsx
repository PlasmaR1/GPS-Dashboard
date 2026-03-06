"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const redirectTo = sp.get("redirectTo") || "/gps";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const signIn = async () => {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message);
    else router.push(redirectTo);
  };

  const signUp = async () => {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else setMsg("Regsiter Success, please check your email。");
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6">
     
      <Image
        src="/login-bg.jpg"
        alt=""
        fill
        priority
        className="object-cover"
      />
    

      <div className="w-full max-w-sm rounded-xl p-5 shadow-xl border border-white/10 bg-neutral-900/70 backdrop-blur text-white">
        <h1 className="text-lg font-semibold mb-4 bg-gradient-to-r from-orange-400 to-yellow-300 bg-clip-text text-transparent">
          Stride Dashboard System
        </h1>

        <input
          className="w-full rounded px-3 py-2 mb-2 bg-white/95 text-black placeholder:text-gray-500 outline-none"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded px-3 py-2 mb-3 bg-white/95 text-black placeholder:text-gray-500 outline-none"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            onClick={signIn}
            className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold rounded py-2 hover:from-orange-600 hover:to-yellow-500 transition"
          >
            Login
          </button>
          <button
            onClick={signUp}
            className="flex-1 bg-green-600 text-white rounded py-2 hover:bg-green-700 transition"
          >
            Register
          </button>
        </div>

        {msg && <p className="mt-3 text-sm text-red-400">{msg}</p>}
      </div>
    </main>
  );
}

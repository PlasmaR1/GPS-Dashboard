"use client";

import Link from "next/link";
import SignOutBtn from "@/components/SignOutBtn";

export default function NavBar({ userEmail }: { userEmail?: string }) {
  return (
    <header className="fixed top-0 inset-x-0 h-14 bg-gray-900/95 backdrop-blur border-b border-gray-800 z-40 flex items-center justify-between px-4">

      <div className="flex items-center space-x-6">
        <Link href="/gps" className="text-white font-semibold text-base">
          Stride Dashboard
        </Link>

        <Link
          href="/bikes"
          className="text-red-500 px-3 py-1 "
        >
           Scooter
        </Link>
      </div>

 
      <div className="flex items-center space-x-4">
        {userEmail && (
          <div className="text-sm text-gray-200">
            Signed in as{" "}
            <span className="font-medium text-white">{userEmail}</span>
          </div>
        )}
        <SignOutBtn />
        <div className="ml-2 text-xs text-gray-400">© 2025 by PlasmaR1</div>
      </div>
    </header>
  );
}

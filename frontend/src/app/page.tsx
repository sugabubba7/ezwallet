"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(user ? "/dashboard" : "/login");
  }, [user, loading, router]);
  return (
    <main className="bg-sunrise grid min-h-screen place-items-center">
      <Loader2 className="h-6 w-6 animate-spin text-leather-900" />
    </main>
  );
}

import { getSession, isAdmin } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function AuthGuard({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: string;
}) {
  const session = await getSession();

  // dashboard/*
  if (!session) {
    redirect("/login");
  }

  // dashboard/(admin)/*
  if (role === "admin" && !(await isAdmin())) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  const email = session.user.email;
  const operator = await prisma.operatorUser.findUnique({
    where: { email },
    include: { organization: true },
  });

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Operator dashboard</CardTitle>
          <CardDescription>Phase 0 placeholder.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Logged in as <strong>{email}</strong>
          </p>
          {operator ? (
            <p className="text-sm text-muted-foreground">
              Operator role <strong>{operator.role}</strong> at{" "}
              <strong>{operator.organization.name}</strong>.
            </p>
          ) : (
            <p className="text-sm text-destructive">
              No OperatorUser record found for this email. You&apos;re
              authenticated but not authorized for the operator portal.
            </p>
          )}
          <form action={logout}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

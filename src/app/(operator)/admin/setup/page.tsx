import Link from "next/link";

import { requireOperatorProperty } from "@/lib/auth-property";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SetupWizardPage() {
  const ctx = await requireOperatorProperty();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Set up your campground</CardTitle>
          <CardDescription>
            We&apos;ll walk you through configuring{" "}
            <strong>{ctx.organization.name}</strong> in a few steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The interactive wizard ships in a later commit. For now, you can
            jump to any section directly:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link href="/admin/property">
              <Button variant="outline" className="w-full justify-start">
                Property basics
              </Button>
            </Link>
            <Link href="/admin/site-types">
              <Button variant="outline" className="w-full justify-start">
                Site types
              </Button>
            </Link>
            <Link href="/admin/sites">
              <Button variant="outline" className="w-full justify-start">
                Sites
              </Button>
            </Link>
            <Link href="/admin/rate-plans">
              <Button variant="outline" className="w-full justify-start">
                Rate plans
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

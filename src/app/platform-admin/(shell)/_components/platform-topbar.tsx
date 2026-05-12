import { Button } from "@/components/ui/button";
import { platformAdminSignOutAction } from "../../sign-in/actions";

export function PlatformTopbar({ title }: { title: string }) {
  return (
    <header className="flex items-center justify-between border-b bg-card px-6 py-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      <form action={platformAdminSignOutAction}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </header>
  );
}

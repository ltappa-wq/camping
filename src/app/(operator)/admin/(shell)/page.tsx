import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Quick links and operational summary will live here.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            Use the sidebar to manage your campground configuration. The
            reservation grid and reporting views land in Phase 4.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}

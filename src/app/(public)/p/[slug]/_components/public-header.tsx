import Link from "next/link";

export function PublicHeader({
  slug,
  name,
  logoUrl,
}: {
  slug: string;
  name: string;
  logoUrl: string | null;
}) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link
          href={`/p/${slug}`}
          className="flex items-center gap-2 hover:opacity-80"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 rounded" />
          ) : null}
          <span className="text-lg font-semibold">{name}</span>
        </Link>
      </div>
    </header>
  );
}

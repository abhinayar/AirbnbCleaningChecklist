import Link from "next/link";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  let properties: { id: string; name: string; address: string | null }[] = [];
  let dbError = false;
  try {
    properties = await prisma.property.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true },
    });
  } catch {
    dbError = true;
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Cleaning QC</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pick a property to start its cleaning checklist.
        </p>
      </header>

      {dbError && (
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          Could not load properties. The database may still be starting up.
        </div>
      )}

      {!dbError && properties.length === 0 && (
        <div className="rounded-lg bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-600">No properties yet.</p>
          <Link
            href="/admin"
            className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            Set one up in Admin
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {properties.map((p) => (
          <li key={p.id}>
            <Link
              href={`/clean/${p.id}`}
              className="block rounded-xl bg-white p-4 shadow-sm transition active:scale-[0.99]"
            >
              <div className="font-semibold">{p.name}</div>
              {p.address && (
                <div className="text-sm text-gray-500">{p.address}</div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <footer className="mt-10 text-center">
        <Link href="/admin" className="text-sm text-gray-400 underline">
          Admin
        </Link>
      </footer>
    </main>
  );
}

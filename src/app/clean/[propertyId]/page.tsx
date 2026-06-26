"use client";

import { useState } from "react";
import Link from "next/link";

type Item = {
  id: string;
  title: string;
  tips: string | null;
  qcPrompt: string;
  requiresPhoto: boolean;
};

type Area = {
  id: string;
  name: string;
  kind: "common" | "room";
  items: Item[];
};

type QcResult = {
  blurry: boolean;
  pass: boolean;
  confidence: number;
  notes: string;
};

type ItemState = {
  uploading: boolean;
  error?: string;
  result?: QcResult;
  previewUrl?: string;
};

export default function CleanPage({
  params,
}: {
  params: { propertyId: string };
}) {
  const [stage, setStage] = useState<"pin" | "checklist" | "done">("pin");
  const [pin, setPin] = useState("");
  const [cleanerName, setCleanerName] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const [runId, setRunId] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({}); // areaId -> skipped

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [finishMsg, setFinishMsg] = useState("");

  async function startRun(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);
    setStartError("");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: params.propertyId, pin, cleanerName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start.");
      setRunId(data.runId);
      setPropertyName(data.property.name);
      setAreas(data.areas);
      setStage("checklist");
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Could not start.");
    } finally {
      setStarting(false);
    }
  }

  async function uploadPhoto(item: Item, file: File) {
    const previewUrl = URL.createObjectURL(file);
    setStates((s) => ({
      ...s,
      [item.id]: { uploading: true, previewUrl, error: undefined, result: undefined },
    }));
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch(`/api/runs/${runId}/items/${item.id}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setStates((s) => ({
        ...s,
        [item.id]: { uploading: false, previewUrl, result: data.result },
      }));
    } catch (err) {
      setStates((s) => ({
        ...s,
        [item.id]: {
          uploading: false,
          previewUrl,
          error: err instanceof Error ? err.message : "Upload failed.",
        },
      }));
    }
  }

  async function toggleSkip(area: Area, skip: boolean) {
    // Optimistic UI; revert on failure.
    setSkipped((s) => ({ ...s, [area.id]: skip }));
    try {
      const res = await fetch(`/api/runs/${runId}/rooms/${area.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped: skip, reason: "Occupied by guests" }),
      });
      if (!res.ok) throw new Error();
      if (skip) {
        // Clear any local results for that room's items.
        setStates((s) => {
          const next = { ...s };
          for (const it of area.items) delete next[it.id];
          return next;
        });
      }
    } catch {
      setSkipped((s) => ({ ...s, [area.id]: !skip }));
    }
  }

  // An area is "satisfied" if it's a skipped room, or all its required items have results.
  function areaSatisfied(area: Area): boolean {
    if (area.kind === "room" && skipped[area.id]) return true;
    return area.items
      .filter((i) => i.requiresPhoto)
      .every((i) => states[i.id]?.result);
  }
  const allSatisfied = areas.every(areaSatisfied);

  async function finish() {
    setFinishing(true);
    setFinishError("");
    try {
      const res = await fetch(`/api/runs/${runId}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send report.");
      setFinishMsg(
        `Report sent to ${data.sentTo.length} recipient(s). ` +
          `${data.passed}/${data.total} items passed QC` +
          (data.skippedRooms ? `, ${data.skippedRooms} room(s) skipped.` : "."),
      );
      setStage("done");
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : "Could not send report.");
    } finally {
      setFinishing(false);
    }
  }

  // ---------- PIN stage ----------
  if (stage === "pin") {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <Link href="/" className="text-sm text-gray-400 underline">
          ← All properties
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Start cleaning</h1>
        <p className="mt-1 text-sm text-gray-500">Enter the property PIN to begin.</p>
        <form onSubmit={startRun} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium">Your name (optional)</label>
            <input
              value={cleanerName}
              onChange={(e) => setCleanerName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="e.g. Maria"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Property PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              autoFocus
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 tracking-widest"
              placeholder="••••"
            />
          </div>
          {startError && <p className="text-sm text-red-600">{startError}</p>}
          <button
            type="submit"
            disabled={starting || !pin}
            className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start checklist"}
          </button>
        </form>
      </main>
    );
  }

  // ---------- Done stage ----------
  if (stage === "done") {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="text-5xl">✅</div>
        <h1 className="mt-4 text-2xl font-bold">All done!</h1>
        <p className="mt-2 text-sm text-gray-600">{finishMsg}</p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg bg-brand px-5 py-3 font-medium text-white"
        >
          Back to properties
        </Link>
      </main>
    );
  }

  // ---------- Checklist stage ----------
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold">{propertyName}</h1>
        <p className="text-sm text-gray-500">
          {areas.filter(areaSatisfied).length}/{areas.length} areas complete
        </p>
      </header>

      <div className="space-y-6">
        {areas.map((area) => {
          const isRoom = area.kind === "room";
          const isSkipped = isRoom && skipped[area.id];
          return (
            <section key={area.id}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">
                  {area.name}
                  {area.kind === "common" && (
                    <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      DAILY
                    </span>
                  )}
                </h2>
                {isRoom && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={!!isSkipped}
                      onChange={(e) => toggleSkip(area, e.target.checked)}
                    />
                    Not cleaned (occupied)
                  </label>
                )}
              </div>

              {isSkipped ? (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                  Marked as not cleaned — occupied by guests. This room will be
                  noted on the report and its items skipped.
                </div>
              ) : (
                <ol className="space-y-4">
                  {area.items.map((item, idx) => {
                    const st = states[item.id];
                    const r = st?.result;
                    return (
                      <li key={item.id} className="rounded-xl bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold">
                            {idx + 1}. {item.title}
                          </h3>
                          {item.requiresPhoto ? (
                            r && (
                              <span
                                className={
                                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " +
                                  (r.blurry
                                    ? "bg-amber-100 text-amber-800"
                                    : r.pass
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800")
                                }
                              >
                                {r.blurry ? "Blurry" : r.pass ? "Pass" : "Fail"}
                              </span>
                            )
                          ) : (
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                              No photo
                            </span>
                          )}
                        </div>

                        {item.tips && (
                          <p className="mt-1 text-sm text-gray-500">{item.tips}</p>
                        )}

                        {!item.requiresPhoto ? null : (
                          <>
                        {item.qcPrompt && (
                          <p className="mt-1 text-xs text-gray-400">QC: {item.qcPrompt}</p>
                        )}

                        {st?.previewUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={st.previewUrl}
                            alt="preview"
                            className="mt-3 max-h-56 w-full rounded-lg object-cover"
                          />
                        )}

                        {st?.uploading && (
                          <p className="mt-2 text-sm text-gray-500">Checking photo…</p>
                        )}
                        {st?.error && (
                          <p className="mt-2 text-sm text-red-600">{st.error}</p>
                        )}
                        {r && (
                          <p
                            className={
                              "mt-2 text-sm " +
                              (r.blurry || !r.pass ? "text-red-700" : "text-green-700")
                            }
                          >
                            {r.notes}
                          </p>
                        )}

                        <label className="mt-3 block">
                          <span
                            className={
                              "block cursor-pointer rounded-lg px-4 py-2 text-center text-sm font-medium " +
                              (r && !r.blurry && r.pass
                                ? "bg-gray-100 text-gray-700"
                                : "bg-brand text-white")
                            }
                          >
                            {st?.uploading
                              ? "Uploading…"
                              : r
                                ? "Retake photo"
                                : "Take / upload photo"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={st?.uploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadPhoto(item, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      <div className="sticky bottom-0 mt-6 -mx-4 border-t bg-white/90 px-4 py-4 backdrop-blur">
        {finishError && (
          <p className="mb-2 text-center text-sm text-red-600">{finishError}</p>
        )}
        <button
          onClick={finish}
          disabled={finishing || !allSatisfied}
          className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          {finishing
            ? "Sending report…"
            : allSatisfied
              ? "Finish & send report"
              : "Complete every area to finish"}
        </button>
      </div>
    </main>
  );
}

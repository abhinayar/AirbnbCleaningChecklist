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
  qcSkipped?: boolean; // true for the Abhi test account (photo captured, no AI QC)
};

const CLEANERS = ["Leah", "Daniel", "Shubhi", "Abhi"];

// Convert a camera photo (often HEIC on iPhones) to a downscaled JPEG in the
// browser before upload. Safari can decode HEIC for display, so drawing it to a
// canvas and exporting as JPEG gives us a format the server can always read.
// Falls back to the original file if anything goes wrong.
async function toUploadJpeg(
  file: File,
): Promise<{ blob: Blob; previewUrl: string }> {
  const previewUrl = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = previewUrl;
    });
    const maxDim = 1600;
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.drawImage(img, 0, 0, cw, ch);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("toBlob failed");
    return { blob, previewUrl };
  } catch {
    // Couldn't convert — send the original and let the server try.
    return { blob: file, previewUrl };
  }
}

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
  const [checked, setChecked] = useState<Record<string, boolean>>({}); // itemId -> done

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
    const { blob, previewUrl } = await toUploadJpeg(file);
    setStates((s) => ({
      ...s,
      [item.id]: { uploading: true, previewUrl, error: undefined, result: undefined },
    }));
    try {
      const form = new FormData();
      form.append("photo", blob, "photo.jpg");
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
        // Clear any local results + checks for that room's items.
        setStates((s) => {
          const next = { ...s };
          for (const it of area.items) delete next[it.id];
          return next;
        });
        setChecked((c) => {
          const next = { ...c };
          for (const it of area.items) delete next[it.id];
          return next;
        });
      }
    } catch {
      setSkipped((s) => ({ ...s, [area.id]: !skip }));
    }
  }

  // A photo item can only be checked off once its photo has been uploaded.
  function canCheck(item: Item): boolean {
    return item.requiresPhoto ? !!states[item.id]?.result : true;
  }

  // An area is "satisfied" if it's a skipped room, or every item is checked off.
  function areaSatisfied(area: Area): boolean {
    if (area.kind === "room" && skipped[area.id]) return true;
    return area.items.every((i) => checked[i.id]);
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
            <label className="block text-sm font-medium">Your name</label>
            <select
              value={cleanerName}
              onChange={(e) => setCleanerName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="" disabled>
                Select your name…
              </option>
              {CLEANERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
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
            disabled={starting || !pin || !cleanerName}
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
      {(() => {
        const allItems = areas.flatMap((a) => a.items);
        const doneItems = allItems.filter((i) => checked[i.id]).length;
        return (
          <header className="mb-4">
            <h1 className="text-xl font-bold">{propertyName}</h1>
            <p className="text-sm text-gray-500">
              {doneItems}/{allItems.length} items checked off ·{" "}
              {areas.filter(areaSatisfied).length}/{areas.length} areas complete
            </p>
          </header>
        );
      })()}

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
                      <li
                        key={item.id}
                        className={
                          "rounded-xl bg-white p-4 shadow-sm transition " +
                          (checked[item.id] ? "ring-2 ring-green-400" : "")
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3
                            className={
                              "font-semibold " +
                              (checked[item.id] ? "text-gray-400 line-through" : "")
                            }
                          >
                            {idx + 1}. {item.title}
                          </h3>
                          {checked[item.id] ? (
                            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                              ✓ Done
                            </span>
                          ) : item.requiresPhoto ? (
                            r &&
                            (r.qcSkipped ? (
                              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                Photo added
                              </span>
                            ) : (
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
                            ))
                          ) : (
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                              Reminder
                            </span>
                          )}
                        </div>

                        {item.tips && (
                          <p className="mt-1 text-sm text-gray-500">{item.tips}</p>
                        )}

                        {item.requiresPhoto && (
                          <>
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
                            {r && !r.qcSkipped && r.notes && (
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
                                  (r ? "bg-gray-100 text-gray-700" : "bg-brand text-white")
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

                        <button
                          type="button"
                          disabled={!canCheck(item)}
                          onClick={() =>
                            setChecked((c) => ({ ...c, [item.id]: !c[item.id] }))
                          }
                          className={
                            "mt-3 w-full rounded-lg px-4 py-2 text-sm font-semibold transition " +
                            (checked[item.id]
                              ? "bg-green-600 text-white"
                              : canCheck(item)
                                ? "bg-gray-900 text-white"
                                : "cursor-not-allowed bg-gray-200 text-gray-400")
                          }
                        >
                          {checked[item.id]
                            ? "✓ Done — tap to undo"
                            : !canCheck(item)
                              ? "Add a photo to check off"
                              : "Mark as done"}
                        </button>
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Item = {
  id: string;
  title: string;
  tips: string | null;
  qcPrompt: string;
  requiresPhoto: boolean;
  order: number;
};
type Area = {
  id: string;
  name: string;
  kind: "common" | "room";
  order: number;
  items: Item[];
};
type Property = {
  id: string;
  name: string;
  address: string | null;
  pin: string;
  active: boolean;
  areas: Area[];
};

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [properties, setProperties] = useState<Property[]>([]);
  const [recipients, setRecipients] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");

  const [npName, setNpName] = useState("");
  const [npAddress, setNpAddress] = useState("");
  const [npPin, setNpPin] = useState("");

  async function loadAll() {
    const res = await fetch("/api/admin/properties");
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    const data = await res.json();
    setProperties(data.properties);
    const sres = await fetch("/api/admin/settings");
    if (sres.ok) {
      const sdata = await sres.json();
      setRecipients(sdata.settings.recipients || "");
      setFromEmail(sdata.settings.fromEmail || "");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const d = await res.json();
      setLoginError(d.error || "Login failed.");
      return;
    }
    setPassword("");
    loadAll();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
  }

  async function addProperty(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: npName, address: npAddress, pin: npPin }),
    });
    if (res.ok) {
      setNpName("");
      setNpAddress("");
      setNpPin("");
      loadAll();
    }
  }

  async function updateProperty(id: string, patch: Partial<Property>) {
    await fetch(`/api/admin/properties/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    loadAll();
  }

  async function deleteProperty(id: string) {
    if (!confirm("Delete this property, its areas and checklist items?")) return;
    await fetch(`/api/admin/properties/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function addArea(propertyId: string, name: string, kind: "common" | "room") {
    await fetch("/api/admin/areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, name, kind }),
    });
    loadAll();
  }

  async function deleteArea(id: string) {
    if (!confirm("Delete this area and its items?")) return;
    await fetch(`/api/admin/areas/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function addItem(
    areaId: string,
    fields: { title: string; tips: string; qcPrompt: string; requiresPhoto: boolean },
  ) {
    await fetch("/api/admin/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ areaId, ...fields }),
    });
    loadAll();
  }

  async function updateItem(id: string, patch: Partial<Item>) {
    await fetch(`/api/admin/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    loadAll();
  }

  async function deleteItem(id: string) {
    await fetch(`/api/admin/items/${id}`, { method: "DELETE" });
    loadAll();
  }

  // Move an item up/down within its area by swapping positions and re-indexing
  // the area's items to sequential order values (robust against gaps).
  async function moveItem(area: Area, index: number, dir: -1 | 1) {
    const arr = [...area.items];
    const j = index + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    await Promise.all(
      arr.flatMap((it, idx) =>
        it.order === idx + 1
          ? []
          : [
              fetch(`/api/admin/items/${it.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order: idx + 1 }),
              }),
            ],
      ),
    );
    loadAll();
  }

  async function bulkImport(propertyId: string, json: string): Promise<string> {
    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      return "That isn't valid JSON.";
    }
    const res = await fetch(`/api/admin/properties/${propertyId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return data.error || "Import failed.";
    await loadAll();
    return `Added ${data.createdAreas} area(s) and ${data.createdItems} item(s).`;
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsMsg("");
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients, fromEmail }),
    });
    setSettingsMsg(res.ok ? "Saved." : "Failed to save.");
  }

  if (authed === null) {
    return <main className="p-8 text-sm text-gray-500">Loading…</main>;
  }

  if (!authed) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-2xl font-bold">Admin</h1>
        <form onSubmit={login} className="mt-6 space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white">
            Log in
          </button>
        </form>
        <Link href="/" className="mt-6 inline-block text-sm text-gray-400 underline">
          ← Back
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <button onClick={logout} className="text-sm text-gray-500 underline">
          Log out
        </button>
      </div>

      {/* Settings */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Report email settings</h2>
        <form onSubmit={saveSettings} className="mt-3 space-y-3">
          <div>
            <label className="block text-sm font-medium">
              Recipients (comma-separated)
            </label>
            <input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="a@x.com, b@y.com, c@z.com"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">
              From address (must be verified in Resend)
            </label>
            <input
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="Cleaning QC <onboarding@resend.dev>"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
              Save settings
            </button>
            {settingsMsg && <span className="text-sm text-gray-500">{settingsMsg}</span>}
          </div>
        </form>
      </section>

      {/* Add property */}
      <section className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Add property</h2>
        <form onSubmit={addProperty} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            value={npName}
            onChange={(e) => setNpName(e.target.value)}
            placeholder="Name"
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            value={npAddress}
            onChange={(e) => setNpAddress(e.target.value)}
            placeholder="Address (optional)"
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            value={npPin}
            onChange={(e) => setNpPin(e.target.value)}
            placeholder="PIN"
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white sm:col-span-3">
            Add property
          </button>
        </form>
      </section>

      {/* Properties */}
      <section className="mt-6 space-y-5">
        {properties.map((p) => (
          <PropertyCard
            key={p.id}
            property={p}
            onUpdate={updateProperty}
            onDelete={deleteProperty}
            onAddArea={addArea}
            onDeleteArea={deleteArea}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
            onMoveItem={moveItem}
            onBulkImport={bulkImport}
          />
        ))}
      </section>
    </main>
  );
}

function PropertyCard({
  property,
  onUpdate,
  onDelete,
  onAddArea,
  onDeleteArea,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onMoveItem,
  onBulkImport,
}: {
  property: Property;
  onUpdate: (id: string, patch: Partial<Property>) => void;
  onDelete: (id: string) => void;
  onAddArea: (propertyId: string, name: string, kind: "common" | "room") => void;
  onDeleteArea: (id: string) => void;
  onAddItem: (
    areaId: string,
    fields: { title: string; tips: string; qcPrompt: string; requiresPhoto: boolean },
  ) => void;
  onUpdateItem: (id: string, patch: Partial<Item>) => void;
  onDeleteItem: (id: string) => void;
  onMoveItem: (area: Area, index: number, dir: -1 | 1) => void;
  onBulkImport: (propertyId: string, json: string) => Promise<string>;
}) {
  const [name, setName] = useState(property.name);
  const [pin, setPin] = useState(property.pin);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaKind, setNewAreaKind] = useState<"common" | "room">("room");
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importMsg, setImportMsg] = useState("");

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== property.name && onUpdate(property.id, { name })}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 font-semibold"
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onBlur={() => pin !== property.pin && onUpdate(property.id, { pin })}
          className="w-24 rounded-lg border border-gray-200 px-3 py-2"
          placeholder="PIN"
        />
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={property.active}
            onChange={(e) => onUpdate(property.id, { active: e.target.checked })}
          />
          Active
        </label>
        <button onClick={() => onDelete(property.id)} className="text-sm text-red-600 underline">
          Delete
        </button>
      </div>

      {/* Areas */}
      <div className="mt-4 space-y-4">
        {property.areas.map((area) => (
          <AreaBlock
            key={area.id}
            area={area}
            onDeleteArea={onDeleteArea}
            onAddItem={onAddItem}
            onUpdateItem={onUpdateItem}
            onDeleteItem={onDeleteItem}
            onMoveItem={onMoveItem}
          />
        ))}
        {property.areas.length === 0 && (
          <p className="text-sm text-gray-400">No areas yet. Add a common area and rooms below.</p>
        )}
      </div>

      {/* Add area */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        <input
          value={newAreaName}
          onChange={(e) => setNewAreaName(e.target.value)}
          placeholder="New area name (e.g. Common Areas, Bedroom 2)"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={newAreaKind}
          onChange={(e) => setNewAreaKind(e.target.value as "common" | "room")}
          className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
        >
          <option value="common">Common (daily)</option>
          <option value="room">Room (skippable)</option>
        </select>
        <button
          onClick={() => {
            if (!newAreaName.trim()) return;
            onAddArea(property.id, newAreaName, newAreaKind);
            setNewAreaName("");
          }}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
        >
          Add area
        </button>
      </div>

      {/* Bulk import */}
      <div className="mt-3 border-t pt-3">
        <button
          onClick={() => setShowImport((v) => !v)}
          className="text-sm text-blue-600 underline"
        >
          {showImport ? "Hide bulk import" : "Bulk import areas + items (JSON)"}
        </button>
        {showImport && (
          <div className="mt-2">
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={8}
              placeholder={IMPORT_PLACEHOLDER}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={async () => {
                  setImportMsg("Importing…");
                  setImportMsg(await onBulkImport(property.id, importJson));
                  setImportJson("");
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                Import
              </button>
              {importMsg && <span className="text-sm text-gray-600">{importMsg}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AreaBlock({
  area,
  onDeleteArea,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onMoveItem,
}: {
  area: Area;
  onDeleteArea: (id: string) => void;
  onAddItem: (
    areaId: string,
    fields: { title: string; tips: string; qcPrompt: string; requiresPhoto: boolean },
  ) => void;
  onUpdateItem: (id: string, patch: Partial<Item>) => void;
  onDeleteItem: (id: string) => void;
  onMoveItem: (area: Area, index: number, dir: -1 | 1) => void;
}) {
  const [title, setTitle] = useState("");
  const [tips, setTips] = useState("");
  const [qcPrompt, setQcPrompt] = useState("");
  const [requiresPhoto, setRequiresPhoto] = useState(true);

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">
          {area.name}{" "}
          <span
            className={
              "ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold " +
              (area.kind === "common"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600")
            }
          >
            {area.kind === "common" ? "DAILY" : "ROOM"}
          </span>
        </div>
        <button
          onClick={() => onDeleteArea(area.id)}
          className="text-xs text-red-600 underline"
        >
          Delete area
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {area.items.map((it, idx) => (
          <ItemRow
            key={it.id}
            item={it}
            index={idx}
            total={area.items.length}
            onUpdateItem={onUpdateItem}
            onDeleteItem={onDeleteItem}
            onMove={(dir) => onMoveItem(area, idx, dir)}
          />
        ))}
        {area.items.length === 0 && (
          <li className="text-sm text-gray-400">No items yet.</li>
        )}
      </ul>

      <div className="mt-3 space-y-2 border-t pt-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Item title (e.g. Bathtub)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          value={tips}
          onChange={(e) => setTips(e.target.value)}
          placeholder="Cleaning tips (optional)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        {requiresPhoto && (
          <textarea
            value={qcPrompt}
            onChange={(e) => setQcPrompt(e.target.value)}
            placeholder="What should the AI check? (e.g. No visible hair in the tub or drain)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={requiresPhoto}
            onChange={(e) => setRequiresPhoto(e.target.checked)}
          />
          Requires a photo + AI QC check
        </label>
        <button
          onClick={() => {
            if (!title.trim()) return;
            if (requiresPhoto && !qcPrompt.trim()) return;
            onAddItem(area.id, { title, tips, qcPrompt, requiresPhoto });
            setTitle("");
            setTips("");
            setQcPrompt("");
            setRequiresPhoto(true);
          }}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Add item
        </button>
      </div>
    </div>
  );
}

// An editable row for an existing checklist item. Saves each field on blur.
function ItemRow({
  item,
  index,
  total,
  onUpdateItem,
  onDeleteItem,
  onMove,
}: {
  item: Item;
  index: number;
  total: number;
  onUpdateItem: (id: string, patch: Partial<Item>) => void;
  onDeleteItem: (id: string) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [tips, setTips] = useState(item.tips ?? "");
  const [qcPrompt, setQcPrompt] = useState(item.qcPrompt);

  return (
    <li className="space-y-1.5 rounded-lg bg-gray-50 p-2 text-sm">
      <div className="flex items-start gap-2">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
            className="px-1 leading-none text-gray-500 disabled:text-gray-300"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move down"
            className="px-1 leading-none text-gray-500 disabled:text-gray-300"
          >
            ▼
          </button>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const v = title.trim();
            if (v && v !== item.title) onUpdateItem(item.id, { title: v });
          }}
          className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 font-medium"
        />
        <button
          onClick={() => onDeleteItem(item.id)}
          className="shrink-0 text-xs text-red-600 underline"
        >
          Remove
        </button>
      </div>

      <input
        value={tips}
        onChange={(e) => setTips(e.target.value)}
        onBlur={() => {
          if (tips !== (item.tips ?? "")) onUpdateItem(item.id, { tips });
        }}
        placeholder="Cleaning tips (optional)"
        className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-gray-600"
      />

      {item.requiresPhoto && (
        <textarea
          value={qcPrompt}
          onChange={(e) => setQcPrompt(e.target.value)}
          onBlur={() => {
            const v = qcPrompt.trim();
            if (v && v !== item.qcPrompt) onUpdateItem(item.id, { qcPrompt: v });
          }}
          rows={2}
          placeholder="What should the AI check?"
          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-gray-600"
        />
      )}

      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={item.requiresPhoto}
          onChange={(e) => onUpdateItem(item.id, { requiresPhoto: e.target.checked })}
        />
        Requires photo
      </label>
    </li>
  );
}

const IMPORT_PLACEHOLDER = `{
  "areas": [
    {
      "name": "Common Areas",
      "kind": "common",
      "items": [
        { "title": "Kitchen counters", "tips": "Wipe & clear", "qcPrompt": "Counters clear and free of crumbs or streaks" }
      ]
    },
    {
      "name": "Bedroom 1",
      "kind": "room",
      "items": [
        { "title": "Bed made", "qcPrompt": "Bed neatly made, duvet centered, pillows fluffed" }
      ]
    }
  ]
}`;

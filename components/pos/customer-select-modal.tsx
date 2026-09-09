"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MapPin, Search, Check, UserCheck, Eraser } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { customerSchema } from "@/lib/validations/customer";
import { searchCustomersAction, upsertCustomer } from "@/app/actions/customers";
import { listStreets } from "@/app/actions/streets";
import type { CustomerView, CustomerMatch } from "@/lib/queries/customers";
import type { StreetEntry } from "@/types/street";
import type { Dictionary } from "@/lib/i18n/types";

type ValidationKey = keyof Dictionary["validation"];

const emptyForm = {
  name: "",
  phone: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  area: "",
  city: "",
};

/**
 * Fetched-once caches that outlive the modal: the street list (identical for
 * every order) and the lookups already answered this session. Re-opening the
 * form, or backspacing over a query, then costs nothing.
 */
let streetCache: StreetEntry[] | null = null;
const searchCache = new Map<string, CustomerMatch[]>();

/**
 * What we can answer without the server: too short a query, a customer already
 * chosen, a repeated query — or a shorter query that found nobody, since a
 * longer one cannot match more. `undefined` means the server must be asked.
 */
function answerFromCache(
  query: string,
  existingId: number | null,
): CustomerMatch[] | undefined {
  if (query.length < 2 || existingId !== null) return [];
  const hit = searchCache.get(query);
  if (hit) return hit;
  for (let i = 2; i < query.length; i++) {
    if (searchCache.get(query.slice(0, i))?.length === 0) return [];
  }
  return undefined;
}

export function CustomerSelectModal({
  open,
  onClose,
  onAttach,
}: {
  open: boolean;
  onClose: () => void;
  onAttach: (c: CustomerView) => void;
}) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [form, setForm] = useState({ ...emptyForm });
  const [existingId, setExistingId] = useState<number | null>(null);
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [streets, setStreets] = useState<StreetEntry[]>(streetCache ?? []);
  const [streetQuery, setStreetQuery] = useState("");
  const [streetOpen, setStreetOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reqId = useRef(0);

  // The street list is fetched once per tab, the first time the form opens.
  useEffect(() => {
    if (streetCache) return;
    let alive = true;
    listStreets().then((rows) => {
      streetCache = rows;
      if (alive) setStreets(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Debounced phone lookup — only while no existing customer is chosen yet.
  useEffect(() => {
    const query = form.phone.trim();
    const id = ++reqId.current;
    const known = answerFromCache(query, existingId);

    const t = setTimeout(
      async () => {
        if (id !== reqId.current) return;
        if (known) {
          setMatches(known);
          setSearching(false);
          return;
        }
        setSearching(true);
        const res = await searchCustomersAction(query);
        searchCache.set(query, res);
        if (id === reqId.current) {
          setMatches(res);
          setSearching(false);
        }
      },
      known ? 0 : 150,
    );
    return () => clearTimeout(t);
  }, [form.phone, existingId]);

  const msg = (key: string) => dict.validation[key as ValidationKey] ?? dict.validation.required;

  const streetMatches = useMemo(() => {
    const q = streetQuery.trim().toLowerCase();
    const list = q
      ? streets.filter((s) => s.street.toLowerCase().includes(q))
      : streets;
    return list.slice(0, 8);
  }, [streetQuery, streets]);

  function fillFromCustomer(c: CustomerMatch) {
    setExistingId(c.id);
    setMatches([]);
    setForm({
      name: c.name,
      phone: c.phone,
      street: c.address?.street ?? "",
      houseNumber: c.address?.houseNumber ?? "",
      postalCode: c.address?.postalCode ?? "",
      area: c.address?.area ?? "",
      city: c.address?.city ?? "",
    });
    setStreetQuery(c.address?.street ?? "");
  }

  function clearForm() {
    setForm({ ...emptyForm });
    setExistingId(null);
    setMatches([]);
    setStreetQuery("");
    setStreetOpen(false);
    setErrors({});
  }

  function pickStreet(entry: StreetEntry) {
    setStreetQuery(entry.street);
    setStreetOpen(false);
    setForm((f) => ({
      ...f,
      street: entry.street,
      postalCode: entry.postalCode,
      city: entry.city,
      area: entry.area,
    }));
  }

  function attach() {
    const hasAddress =
      form.street || form.houseNumber || form.postalCode || form.area || form.city;
    const payload = {
      id: existingId ?? undefined,
      name: form.name,
      phone: form.phone,
      address: hasAddress
        ? {
            street: form.street,
            houseNumber: form.houseNumber,
            postalCode: form.postalCode || undefined,
            area: form.area || undefined,
            city: form.city,
          }
        : undefined,
    };
    const parsed = customerSchema.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path.join(".");
        if (!fe[k]) fe[k] = i.message;
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await upsertCustomer({ ...parsed.data, locale });
      if (res.ok) {
        // The directory just changed: cached answers (including "no match" for
        // a number that now exists) would otherwise hide the new customer.
        searchCache.clear();
        toast(dict.toast.customerSaved, "success");
        onAttach(res.data);
      } else {
        setErrors(res.fieldErrors ?? {});
        toast(dict.toast.genericError, "error");
      }
    });
  }

  const input =
    "w-full rounded-[var(--radius-btn)] border bg-surface-muted px-3 py-2 text-sm text-text outline-none focus:border-accent";
  const renderField = (
    name: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    span = 1,
  ) => (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className="mb-1 block text-xs font-semibold text-text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${input} ${errors[name] ? "border-danger" : "border-border"}`}
      />
      {errors[name] ? <p className="mt-1 text-xs text-danger">{msg(errors[name])}</p> : null}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={dict.common.close}
      title={dict.customer.selectCustomer}
      maxWidth="max-w-4xl"
      footer={
        <div className="flex gap-2">
          <button
            onClick={clearForm}
            disabled={pending}
            className="press flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-btn)] border border-border py-3 font-semibold text-text-muted hover:bg-surface-muted disabled:opacity-50"
          >
            <Eraser className="size-5" />
            {dict.common.clear}
          </button>
          <button
            onClick={attach}
            disabled={pending}
            className="press flex flex-[2] items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-3 font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-50"
          >
            <Check className="size-5" />
            {dict.customer.attach}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {/* Phone first — drives the lookup */}
        <div className="relative col-span-2">
          <label className="mb-1 block text-xs font-semibold text-text-muted">
            {dict.customer.phone}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
            <input
              data-autofocus
              value={form.phone}
              onChange={(e) => {
                setForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9\s+/-]/g, "") }));
                setExistingId(null);
              }}
              inputMode="tel"
              placeholder={dict.customer.searchPhone}
              className={`tnum ${input} ps-9 pe-8 ${errors["phone"] ? "border-danger" : "border-border"}`}
            />
            {searching ? (
              <span className="absolute top-1/2 -translate-y-1/2 text-xs text-text-faint end-3">…</span>
            ) : null}
          </div>
          {errors["phone"] ? <p className="mt-1 text-xs text-danger">{msg(errors["phone"])}</p> : null}

          {/* existing matches — click to autofill the whole form */}
          {matches.length > 0 ? (
            <div className="absolute z-30 mt-1 max-h-44 w-full overflow-y-auto rounded-[var(--radius-btn)] border border-border bg-surface-raised shadow-[var(--shadow-lg)]">
              {matches.map((c) => (
                <button
                  key={c.id}
                  onClick={() => fillFromCustomer(c)}
                  className="press flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-start last:border-0 hover:bg-surface-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-text">{c.name}</span>
                    <span className="tnum block truncate text-xs text-text-muted">{c.phone}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
                    <UserCheck className="size-3.5" /> {dict.common.apply}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {existingId !== null ? (
          <p className="col-span-2 -mt-1 flex items-center gap-1.5 text-xs font-semibold text-success">
            <UserCheck className="size-3.5" /> {dict.customer.details}
          </p>
        ) : null}

        {renderField("name", dict.customer.name, form.name, (v) => setForm((f) => ({ ...f, name: v })), 2)}

        {/* Street autocomplete from streets.txt */}
        <div className="relative col-span-2">
          <label className="mb-1 block text-xs font-semibold text-text-muted">{dict.customer.street}</label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
            <input
              value={streetQuery}
              onChange={(e) => {
                const v = e.target.value;
                setStreetQuery(v);
                setStreetOpen(true);
                setForm((f) => ({ ...f, street: v }));
              }}
              onFocus={() => setStreetOpen(true)}
              placeholder={dict.customer.selectStreet}
              className={`${input} ps-9 ${errors["address.street"] ? "border-danger" : "border-border"}`}
            />
          </div>
          {errors["address.street"] ? (
            <p className="mt-1 text-xs text-danger">{msg(errors["address.street"])}</p>
          ) : null}
          {streetOpen && streetMatches.length > 0 ? (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius-btn)] border border-border bg-surface-raised shadow-[var(--shadow-lg)]">
              {streetMatches.map((s) => (
                <button
                  key={s.street}
                  onClick={() => pickStreet(s)}
                  className="press flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-start last:border-0 hover:bg-surface-muted"
                >
                  <span className="truncate text-sm font-medium text-text">{s.street}</span>
                  <span className="tnum shrink-0 text-xs text-text-faint">
                    {[s.postalCode, s.area || s.city].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {renderField("address.houseNumber", dict.customer.houseNumber, form.houseNumber, (v) =>
          setForm((f) => ({ ...f, houseNumber: v })),
        )}
        {renderField("address.postalCode", dict.customer.postalCode, form.postalCode, (v) =>
          setForm((f) => ({ ...f, postalCode: v })),
        )}
        {renderField("address.area", dict.customer.area, form.area, (v) =>
          setForm((f) => ({ ...f, area: v })),
        )}
        {renderField("address.city", dict.customer.city, form.city, (v) =>
          setForm((f) => ({ ...f, city: v })),
        )}
      </div>
    </Modal>
  );
}

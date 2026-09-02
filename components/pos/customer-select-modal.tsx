"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Phone, MapPin, Search, UserPlus, ArrowLeft, Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { NumericKeypad } from "./numeric-keypad";
import { customerSchema } from "@/lib/validations/customer";
import { searchCustomersAction, upsertCustomer } from "@/app/actions/customers";
import { streets, findStreet } from "@/lib/data/streets";
import type { CustomerView } from "@/lib/queries/customers";
import type { Dictionary } from "@/lib/i18n/types";

type ValidationKey = keyof Dictionary["validation"];
type Mode = "lookup" | "register";

const emptyForm = {
  name: "",
  phone: "",
  street: "",
  houseNumber: "",
  mahalla: "",
  area: "",
  city: "",
};

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

  const [mode, setMode] = useState<Mode>("lookup");
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<CustomerView[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CustomerView | null>(null);

  const [form, setForm] = useState({ ...emptyForm });
  const [streetQuery, setStreetQuery] = useState("");
  const [streetOpen, setStreetOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reqId = useRef(0);

  // Debounced phone lookup.
  useEffect(() => {
    if (mode !== "lookup") return;
    const query = phone.trim();
    const id = ++reqId.current;
    const t = setTimeout(
      async () => {
        if (query.length < 2) {
          if (id === reqId.current) {
            setResults([]);
            setSearching(false);
          }
          return;
        }
        setSearching(true);
        const res = await searchCustomersAction(query);
        if (id === reqId.current) {
          setResults(res);
          setSearching(false);
        }
      },
      query.length < 2 ? 0 : 250,
    );
    return () => clearTimeout(t);
  }, [phone, mode]);

  const msg = (key: string) => dict.validation[key as ValidationKey] ?? dict.validation.required;
  const noMatch = mode === "lookup" && phone.trim().length >= 2 && !searching && results.length === 0;

  const streetMatches = useMemo(() => {
    const q = streetQuery.trim();
    const list = q ? streets.filter((s) => s.street.includes(q)) : streets;
    return list.slice(0, 8);
  }, [streetQuery]);

  function goRegister() {
    setMode("register");
    setSelected(null);
    setForm({ ...emptyForm, phone: phone.trim() });
    setStreetQuery("");
    setErrors({});
  }

  function pickStreet(name: string) {
    const entry = findStreet(name);
    setStreetQuery(name);
    setStreetOpen(false);
    setForm((f) => ({
      ...f,
      street: name,
      mahalla: entry?.mahalla ?? "",
      area: entry?.area ?? "",
      city: entry?.city ?? "",
    }));
  }

  function attachExisting() {
    if (selected) onAttach(selected);
  }

  function registerAndAttach() {
    const payload = {
      name: form.name,
      phone: form.phone,
      address: {
        street: form.street,
        houseNumber: form.houseNumber,
        mahalla: form.mahalla || undefined,
        area: form.area || undefined,
        city: form.city,
      },
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
    opts?: { readOnly?: boolean; placeholder?: string },
  ) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={opts?.readOnly}
        placeholder={opts?.placeholder}
        className={`${input} ${errors[name] ? "border-danger" : "border-border"} ${opts?.readOnly ? "opacity-70" : ""}`}
      />
      {errors[name] ? <p className="mt-1 text-xs text-danger">{msg(errors[name])}</p> : null}
    </div>
  );

  const footer =
    mode === "lookup" ? (
      <button
        onClick={attachExisting}
        disabled={!selected}
        className="press flex w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-3 font-bold text-accent-fg hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Check className="size-5" />
        {dict.customer.attach}
      </button>
    ) : (
      <button
        onClick={registerAndAttach}
        disabled={pending}
        className="press flex w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-3 font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-50"
      >
        <Check className="size-5" />
        {dict.customer.attach}
      </button>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={dict.common.close}
      title={mode === "register" ? dict.customer.register : dict.customer.selectCustomer}
      footer={footer}
    >
      {mode === "lookup" ? (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
            <input
              data-autofocus
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value.replace(/[^0-9\s+/-]/g, ""));
                setSelected(null);
              }}
              inputMode="tel"
              placeholder={dict.customer.searchPhone}
              className="tnum w-full rounded-[var(--radius-btn)] border border-border bg-surface-muted py-2.5 text-sm text-text outline-none placeholder:text-text-faint focus:border-accent ps-9 pe-3"
              aria-label={dict.customer.searchPhone}
            />
          </div>

          {results.length > 0 ? (
            <div className="max-h-40 overflow-y-auto rounded-[var(--radius-btn)] border border-border">
              {results.map((c) => {
                const active = selected?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={`press flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-start last:border-0 ${active ? "bg-accent-weak" : "hover:bg-surface-muted"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-text">{c.name}</span>
                      <span className="tnum block truncate text-xs text-text-muted">{c.phone}</span>
                    </span>
                    {active ? <Check className="size-4 text-accent" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {noMatch ? (
            <div className="rounded-[var(--radius-btn)] border border-dashed border-border bg-surface-muted/50 p-3 text-center">
              <p className="mb-2 text-sm text-text-muted">{dict.customer.notFoundHint}</p>
              <button
                onClick={goRegister}
                className="press inline-flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-strong"
              >
                <UserPlus className="size-4" />
                {dict.customer.register}
              </button>
            </div>
          ) : null}

          {/* Selected customer details */}
          {selected ? (
            <div className="rounded-[var(--radius-btn)] border border-border bg-surface-raised p-3">
              <p className="mb-1 text-xs font-semibold text-text-muted">{dict.customer.details}</p>
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent-weak text-sm font-bold text-accent">
                  {selected.name.slice(0, 1)}
                </span>
                <div>
                  <p className="font-semibold text-text">{selected.name}</p>
                  <p className="tnum flex items-center gap-1 text-xs text-text-muted">
                    <Phone className="size-3" /> {selected.phone}
                  </p>
                </div>
              </div>
              {selected.address ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-text-muted">
                  <MapPin className="mt-0.5 size-3 shrink-0" />
                  <span>
                    {[
                      `${selected.address.street} ${selected.address.houseNumber}`,
                      selected.address.mahalla ? `${dict.customer.mahalla} ${selected.address.mahalla}` : null,
                      selected.address.area,
                      selected.address.city,
                    ]
                      .filter(Boolean)
                      .join("، ")}
                  </span>
                </p>
              ) : null}
              <p className="tnum mt-2 text-xs text-text-faint">
                {selected.orderCount} {dict.customer.pastOrders}
              </p>
            </div>
          ) : (
            <NumericKeypad
              onKey={(c) => setPhone((b) => b + c)}
              onBackspace={() => setPhone((b) => b.slice(0, -1))}
              onEnter={() => {
                if (results[0]) setSelected(results[0]);
                else if (noMatch) goRegister();
              }}
              enterLabel={dict.keypad.enter}
              backspaceLabel={dict.keypad.backspace}
            />
          )}
        </div>
      ) : (
        // Register mode
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setMode("lookup")}
            className="press flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
            {dict.customer.searchPhone}
          </button>

          <div className="grid grid-cols-2 gap-3">
            {renderField("name", dict.customer.name, form.name, (v) => setForm((f) => ({ ...f, name: v })))}
            {renderField("phone", dict.customer.phone, form.phone, (v) => setForm((f) => ({ ...f, phone: v })))}
          </div>

          {/* Street autocomplete */}
          <div className="relative">
            <label className="mb-1 block text-xs font-semibold text-text-muted">{dict.customer.street}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
              <input
                value={streetQuery}
                onChange={(e) => {
                  setStreetQuery(e.target.value);
                  setStreetOpen(true);
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
              <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-[var(--radius-btn)] border border-border bg-surface-raised shadow-[var(--shadow-lg)]">
                {streetMatches.map((s) => (
                  <button
                    key={s.street}
                    onClick={() => pickStreet(s.street)}
                    className="press flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-start last:border-0 hover:bg-surface-muted"
                  >
                    <span className="text-sm font-medium text-text">{s.street}</span>
                    <span className="text-xs text-text-faint">{s.area}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {renderField("address.houseNumber", dict.customer.houseNumber, form.houseNumber, (v) =>
              setForm((f) => ({ ...f, houseNumber: v })),
            )}
            {renderField("address.mahalla", dict.customer.mahalla, form.mahalla, () => {}, { readOnly: true })}
            {renderField("address.area", dict.customer.area, form.area, () => {}, { readOnly: true })}
            {renderField("address.city", dict.customer.city, form.city, () => {}, { readOnly: true })}
          </div>
        </div>
      )}
    </Modal>
  );
}

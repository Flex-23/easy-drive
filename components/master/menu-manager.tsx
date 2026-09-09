"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Star,
  Search,
  Layers,
  UtensilsCrossed,
  Ruler,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatMoney, formatNumber } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { categorySchema, menuItemSchema } from "@/lib/validations/master";
import {
  saveCategory,
  deleteCategory,
  saveMenuItem,
  setMenuItemActive,
  deleteMenuItem,
} from "@/app/actions/menu";
import { EmptyState } from "@/components/ui/empty-state";
import type { MasterMenu, MasterCategory, MasterItem } from "@/lib/queries/master";
import type { Dictionary } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

type ValidationKey = keyof Dictionary["validation"];
type MasterErrorKey = keyof Dictionary["master"]["errors"];

/** The catalogue editor: categories on the left, their dishes on the right. */
export function MenuManager({ menu }: { menu: MasterMenu }) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = dict.master.menu;

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [categoryForm, setCategoryForm] = useState<MasterCategory | null | undefined>();
  const [itemForm, setItemForm] = useState<MasterItem | null | undefined>();

  const label = (row: { nameAr: string; nameDe: string }) =>
    locale === "ar" ? row.nameAr || row.nameDe : row.nameDe || row.nameAr;
  const actionMsg = (key: string) =>
    dict.master.errors[key as MasterErrorKey] ?? dict.toast.genericError;

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.items.filter((i) => {
      if (categoryId !== null && i.categoryId !== categoryId) return false;
      if (!q) return true;
      return (
        i.nameAr.toLowerCase().includes(q) ||
        i.nameDe.toLowerCase().includes(q) ||
        String(i.itemNumber).includes(q)
      );
    });
  }, [menu.items, categoryId, search]);
  /** Runs a mutation and reports its outcome with the shared toast. */
  function run(action: () => Promise<ActionResult<unknown>>, successMsg: string) {
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast(successMsg, "success");
        router.refresh();
      } else {
        toast(actionMsg(res.error), "error");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[300px_1fr]">
      {/* Categories */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-text">
            <Layers className="size-4 text-accent" />
            {t.categories}
          </h2>
          <button
            onClick={() => setCategoryForm(null)}
            className="press flex items-center gap-1 rounded-[var(--radius-btn)] bg-accent px-2.5 py-1.5 text-xs font-bold text-accent-fg hover:bg-accent-strong"
          >
            <Plus className="size-3.5" />
            {t.addCategory}
          </button>
        </header>

        <div className="p-2">
          <button
            onClick={() => setCategoryId(null)}
            className={`press mb-1 flex w-full items-center justify-between gap-2 rounded-[var(--radius-btn)] px-3 py-2 text-start text-sm font-semibold ${
              categoryId === null
                ? "bg-accent-weak text-accent"
                : "text-text-muted hover:bg-surface-muted"
            }`}
          >
            <span>{t.allCategories}</span>
            <span className="tnum text-xs">{formatNumber(menu.items.length, locale)}</span>
          </button>

          {menu.categories.length === 0 ? (
            <EmptyState icon={Layers}>{t.noCategories}</EmptyState>
          ) : (
            menu.categories.map((c) => {
              const active = categoryId === c.id;
              return (
                <div
                  key={c.id}
                  className={`mb-1 flex items-center gap-1 rounded-[var(--radius-btn)] ${
                    active ? "bg-accent-weak" : "hover:bg-surface-muted"
                  }`}
                >
                  <button
                    onClick={() => setCategoryId(c.id)}
                    className="press min-w-0 flex-1 px-3 py-2 text-start"
                  >
                    <span
                      className={`block truncate text-sm font-semibold ${
                        active ? "text-accent" : "text-text"
                      }`}
                    >
                      {label(c)}
                    </span>
                    <span className="tnum block truncate text-xs text-text-faint">
                      {c.slug} · {formatNumber(c.itemCount, locale)} {t.itemsCount}
                      {c.isActive ? "" : ` · ${t.inactive}`}
                    </span>
                  </button>
                  <button
                    onClick={() => setCategoryForm(c)}
                    aria-label={t.editCategory}
                    className="press rounded-md p-1.5 text-text-faint hover:text-text"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(t.deleteCategoryConfirm)) return;
                      run(() => deleteCategory(c.id), t.deleted);
                    }}
                    aria-label={dict.common.delete}
                    className="press me-1 rounded-md p-1.5 text-text-faint hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Items */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-text">
            <UtensilsCrossed className="size-4 text-accent" />
            {t.items}
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchHint}
                aria-label={dict.common.search}
                className="w-56 rounded-[var(--radius-btn)] border border-border bg-surface-sunken py-2 text-sm text-text outline-none transition-colors placeholder:text-text-faint hover:border-border-strong focus:border-accent focus:bg-surface ps-9 pe-3"
              />
            </div>
            <button
              onClick={() => setItemForm(null)}
              disabled={menu.categories.length === 0}
              className="press flex items-center gap-1 rounded-[var(--radius-btn)] bg-accent px-3 py-2 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-40"
            >
              <Plus className="size-4" />
              {t.addItem}
            </button>
          </div>
        </header>

        {items.length === 0 ? (
          <EmptyState icon={UtensilsCrossed}>{t.noItems}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-faint">
                  <th className="px-4 py-2 text-start font-semibold">{t.itemNumber}</th>
                  <th className="px-4 py-2 text-start font-semibold">{dict.receipt.item}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t.category}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t.price}</th>
                  <th className="px-4 py-2 text-start font-semibold">{dict.dailyReport.status}</th>
                  <th className="px-4 py-2 text-end font-semibold">{dict.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const category = menu.categories.find((c) => c.id === item.categoryId);
                  return (
                    <tr key={item.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-muted/60">
                      <td className="tnum px-4 py-2 font-semibold text-text">{item.itemNumber}</td>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2 font-medium text-text">
                          {label(item)}
                          {item.isPopular ? (
                            <Star className="size-3.5 fill-warning text-warning" />
                          ) : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-faint">
                          {item.sizes.length > 0 ? (
                            <span className="tnum flex items-center gap-1">
                              <Ruler className="size-3" />
                              {formatNumber(item.sizes.length, locale)} {t.sizes}
                            </span>
                          ) : null}
                          {item.extraGroupCount > 0 ? (
                            <span className="tnum">
                              {formatNumber(item.extraGroupCount, locale)} {t.options}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {category ? label(category) : "—"}
                      </td>
                      <td className="tnum px-4 py-2 text-end font-bold text-text">
                        {/* With sizes the dish has no single price — show the range.
                            It is isolated as LTR so the cheapest stays on the left
                            in an Arabic (RTL) page instead of being flipped. */}
                        {item.sizes.length > 0 ? (
                          <span dir="ltr" className="inline-block">
                            <bdi data-range="min">
                              {formatMoney(Math.min(...item.sizes.map((s) => s.price)), locale)}
                            </bdi>
                            {" – "}
                            <bdi data-range="max">
                              {formatMoney(Math.max(...item.sizes.map((s) => s.price)), locale)}
                            </bdi>
                          </span>
                        ) : (
                          formatMoney(item.basePrice, locale)
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.isActive
                              ? "bg-success-weak text-success"
                              : "bg-surface-muted text-text-muted"
                          }`}
                        >
                          {item.isActive ? t.active : t.inactive}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setItemForm(item)}
                            aria-label={t.editItem}
                            className="press rounded-md p-1.5 text-text-faint hover:text-text"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() =>
                              run(
                                () => setMenuItemActive(item.id, !item.isActive),
                                t.saved,
                              )
                            }
                            aria-label={item.isActive ? t.deactivate : t.activate}
                            title={item.isActive ? t.deactivate : t.activate}
                            className="press rounded-md p-1.5 text-text-faint hover:text-text"
                          >
                            {item.isActive ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (!window.confirm(t.deleteItemConfirm)) return;
                              run(() => deleteMenuItem(item.id), t.deleted);
                            }}
                            aria-label={dict.common.delete}
                            title={
                              item.usageCount > 0 ? t.usedInOrders : dict.common.delete
                            }
                            className="press rounded-md p-1.5 text-text-faint hover:text-danger"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {categoryForm !== undefined ? (
        <CategoryFormModal
          category={categoryForm}
          pending={pending}
          onClose={() => setCategoryForm(undefined)}
          onSaved={() => {
            setCategoryForm(undefined);
            router.refresh();
          }}
        />
      ) : null}

      {itemForm !== undefined ? (
        <ItemFormModal
          item={itemForm}
          categories={menu.categories}
          defaultCategoryId={categoryId ?? menu.categories[0]?.id ?? 0}
          pending={pending}
          onClose={() => setItemForm(undefined)}
          onSaved={() => {
            setItemForm(undefined);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------ category form ----------------------------- */

function CategoryFormModal({
  category,
  pending,
  onClose,
  onSaved,
}: {
  category: MasterCategory | null;
  pending: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const [saving, start] = useTransition();
  const t = dict.master.menu;
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    slug: category?.slug ?? "",
    icon: category?.icon ?? "",
    isActive: category?.isActive ?? true,
    // One name, shown in whichever language the shop runs in.
    name: category ? preferred(category.nameAr, category.nameDe, locale) : "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const msg = (key: string) =>
    dict.validation[key as ValidationKey] ?? dict.validation.required;
  const actionMsg = (key: string) =>
    dict.master.errors[key as MasterErrorKey] ?? dict.toast.genericError;

  function save() {
    const payload = {
      ...(category ? { id: category.id } : {}),
      slug: form.slug.trim().toLowerCase(),
      icon: form.icon.trim() || null,
      isActive: form.isActive,
      name: form.name,
    };
    const parsed = categorySchema.safeParse(payload);
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
      const res = await saveCategory(parsed.data);
      if (res.ok) {
        toast(t.saved, "success");
        onSaved();
      } else {
        setErrors(res.fieldErrors ?? {});
        toast(actionMsg(res.error), "error");
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={dict.common.close}
      maxWidth="max-w-lg"
      title={category ? t.editCategory : t.addCategory}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="press rounded-[var(--radius-btn)] border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted"
          >
            {dict.common.cancel}
          </button>
          <button
            onClick={save}
            disabled={pending || saving}
            className="press rounded-[var(--radius-btn)] bg-accent px-5 py-2 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-50"
          >
            {dict.common.save}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t.name} error={errors.name} msg={msg}>
            <input
              data-autofocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls(errors.name)}
            />
          </Field>
        </div>
        <Field label={t.slug} error={errors.slug} msg={msg}>
          <input
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            dir="ltr"
            className={inputCls(errors.slug)}
          />
        </Field>
        <Field label={t.icon} error={errors.icon} msg={msg}>
          <input
            value={form.icon}
            onChange={(e) => set("icon", e.target.value)}
            dir="ltr"
            placeholder="Pizza"
            className={inputCls(errors.icon)}
          />
        </Field>
        <Toggle
          label={t.active}
          checked={form.isActive}
          onChange={(v) => set("isActive", v)}
        />
      </div>
    </Modal>
  );
}

/* -------------------------------- item form ------------------------------- */

function ItemFormModal({
  item,
  categories,
  defaultCategoryId,
  pending,
  onClose,
  onSaved,
}: {
  item: MasterItem | null;
  categories: MasterCategory[];
  defaultCategoryId: number;
  pending: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const [saving, start] = useTransition();
  const t = dict.master.menu;
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sizes live beside the form: a dish either has one price or a list of them.
  const [sizes, setSizes] = useState<SizeRow[]>(() =>
    (item?.sizes ?? []).map((s) => ({
      name: preferred(s.nameAr, s.nameDe, locale),
      price: s.price.toFixed(2),
    })),
  );

  const [form, setForm] = useState({
    itemNumber: item ? String(item.itemNumber) : "",
    categoryId: String(item?.categoryId ?? defaultCategoryId),
    basePrice: item ? item.basePrice.toFixed(2) : "",
    isActive: item?.isActive ?? true,
    isPopular: item?.isPopular ?? false,
    // One name and one description, in the language being used.
    name: item ? preferred(item.nameAr, item.nameDe, locale) : "",
    description: item
      ? preferred(item.descriptionAr ?? "", item.descriptionDe ?? "", locale)
      : "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const msg = (key: string) =>
    dict.validation[key as ValidationKey] ?? dict.validation.required;
  const actionMsg = (key: string) =>
    dict.master.errors[key as MasterErrorKey] ?? dict.toast.genericError;

  function save() {
    const parsedSizes = sizes.map((s) => ({
      name: s.name,
      price: Number(s.price.replace(",", ".")),
    }));
    const payload = {
      ...(item ? { id: item.id } : {}),
      itemNumber: Number(form.itemNumber),
      categoryId: Number(form.categoryId),
      // The first size is the dish's price when it is sold in sizes.
      basePrice:
        parsedSizes.length > 0
          ? parsedSizes[0].price
          : Number(form.basePrice.replace(",", ".")),
      sizes: parsedSizes,
      isActive: form.isActive,
      isPopular: form.isPopular,
      name: form.name,
      description: form.description.trim() || null,
    };
    const parsed = menuItemSchema.safeParse(payload);
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
      const res = await saveMenuItem(parsed.data);
      if (res.ok) {
        toast(t.saved, "success");
        onSaved();
      } else {
        setErrors(res.fieldErrors ?? {});
        toast(actionMsg(res.error), "error");
      }
    });
  }

  const categoryLabel = (c: MasterCategory) =>
    locale === "ar" ? c.nameAr || c.nameDe : c.nameDe || c.nameAr;

  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={dict.common.close}
      title={item ? t.editItem : t.addItem}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="press rounded-[var(--radius-btn)] border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted"
          >
            {dict.common.cancel}
          </button>
          <button
            onClick={save}
            disabled={pending || saving}
            className="press rounded-[var(--radius-btn)] bg-accent px-5 py-2 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-50"
          >
            {dict.common.save}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t.name} error={errors.name} msg={msg}>
            <input
              data-autofocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls(errors.name)}
            />
          </Field>
        </div>
        <Field label={t.itemNumber} error={errors.itemNumber} msg={msg}>
          <input
            value={form.itemNumber}
            onChange={(e) => set("itemNumber", e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            className={`tnum ${inputCls(errors.itemNumber)}`}
          />
        </Field>
        {sizes.length === 0 ? (
          <Field label={t.price} error={errors.basePrice} msg={msg}>
            <input
              value={form.basePrice}
              onChange={(e) => set("basePrice", e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="0.00"
              className={`tnum ${inputCls(errors.basePrice)}`}
            />
          </Field>
        ) : (
          <Field label={t.price}>
            <p className="rounded-[var(--radius-btn)] border border-dashed border-border px-3 py-2 text-sm text-text-faint">
              {t.priceFromSizes}
            </p>
          </Field>
        )}
        <Field label={t.category} error={errors.categoryId} msg={msg}>
          <select
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            className={inputCls(errors.categoryId)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <SizesEditor rows={sizes} onChange={setSizes} errors={errors} msg={msg} />
        </div>
        <div className="sm:col-span-2">
          <Field label={t.description} error={errors.description} msg={msg}>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className={inputCls(errors.description)}
            />
          </Field>
        </div>
        <Toggle label={t.active} checked={form.isActive} onChange={(v) => set("isActive", v)} />
        <Toggle
          label={t.popular}
          checked={form.isPopular}
          onChange={(v) => set("isPopular", v)}
        />
      </div>
    </Modal>
  );
}

/* --------------------------------- fields -------------------------------- */

/** The text in the language in use, falling back to the other one. */
function preferred(ar: string, de: string, locale: Locale): string {
  return locale === "ar" ? ar || de : de || ar;
}

/** The look of an input, without a width — the caller decides how wide it is. */
function inputBase(error?: string) {
  return `rounded-[var(--radius-btn)] border bg-surface-muted px-3 py-2 text-sm text-text outline-none focus:border-accent ${
    error ? "border-danger" : "border-border"
  }`;
}

function inputCls(error?: string) {
  return `w-full ${inputBase(error)}`;
}

function Field({
  label,
  error,
  msg,
  children,
}: {
  label: string;
  error?: string;
  msg?: (key: string) => string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-text-muted">{label}</label>
      {children}
      {error && msg ? <p className="mt-1 text-xs text-danger">{msg(error)}</p> : null}
    </div>
  );
}

/** One row of the size list, held as text while it is being typed. */
interface SizeRow {
  name: string;
  price: string;
}

/**
 * The sizes a dish is sold in — a name and the price the customer pays for it,
 * never a surcharge. An empty list means the dish has a single price; the first
 * row is what the cashier starts on, so it is also the dish's headline price.
 */
function SizesEditor({
  rows,
  onChange,
  errors,
  msg,
}: {
  rows: SizeRow[];
  /** Takes an updater, not a list: two quick taps must not undo each other. */
  onChange: (update: (rows: SizeRow[]) => SizeRow[]) => void;
  errors: Record<string, string>;
  msg: (key: string) => string;
}) {
  const { dict } = useI18n();
  const t = dict.master.menu;

  const set = (index: number, patch: Partial<SizeRow>) =>
    onChange((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
          <Ruler className="size-3.5" />
          {t.sizes}
        </span>
        <button
          type="button"
          onClick={() => onChange((prev) => [...prev, { name: "", price: "" }])}
          className="press flex items-center gap-1 rounded-[var(--radius-btn)] border border-border px-2.5 py-1.5 text-xs font-bold text-text-muted hover:border-accent hover:text-accent"
        >
          <Plus className="size-3.5" />
          {t.addSize}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-btn)] border border-dashed border-border px-3 py-2.5 text-xs text-text-faint">
          {t.sizesHint}
        </p>
      ) : (
        <>
          {/* The size is named first, its price second — the order they are read. */}
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-text-faint ps-7 pe-9">
            <span className="flex-1">{t.sizeName}</span>
            <span className="w-28 shrink-0">{t.sizePrice}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const nameError = errors[`sizes.${i}.name`];
              const priceError = errors[`sizes.${i}.price`];
              return (
                <li key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="tnum w-5 shrink-0 text-center text-xs font-bold text-text-faint">
                      {i + 1}
                    </span>
                    <input
                      value={row.name}
                      onChange={(e) => set(i, { name: e.target.value })}
                      placeholder={t.sizeExample}
                      aria-label={t.sizeName}
                      className={`min-w-0 flex-1 ${inputBase(nameError)}`}
                    />
                    <div className="relative w-28 shrink-0">
                      <input
                        value={row.price}
                        onChange={(e) =>
                          set(i, { price: e.target.value.replace(/[^0-9.,]/g, "") })
                        }
                        inputMode="decimal"
                        placeholder="0,00"
                        aria-label={t.sizePrice}
                        className={`tnum w-full ${inputBase(priceError)} pe-7`}
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-text-faint end-3"
                      >
                        €
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onChange((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={t.removeSize}
                      className="press shrink-0 rounded-md p-1.5 text-text-faint hover:text-danger"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  {nameError || priceError ? (
                    <p className="text-xs text-danger ps-7">{msg(nameError ?? priceError!)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {rows.length > 0 ? (
        <p className="mt-1.5 text-xs text-text-faint">{t.sizesDefaultHint}</p>
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 self-end py-2 text-sm font-semibold text-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}
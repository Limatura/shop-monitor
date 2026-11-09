import type { ReactNode } from "react";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Shared Tailwind class sets, in the spirit of shadcn/ui variants. */
export const button = {
  primary:
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white " +
    "hover:bg-zinc-800 data-[disabled]:cursor-default data-[disabled]:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white",
  outline:
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm " +
    "hover:bg-zinc-100 data-[disabled]:cursor-default data-[disabled]:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800",
  ghost:
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-600 " +
    "hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
};

export const input =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 " +
  "dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500";

export function Card({ title, description, children, className }: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900", className)}>
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      <div className={title || description ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Checkbox({ checked, onChange, children }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <BaseCheckbox.Root
        checked={checked}
        onCheckedChange={onChange}
        className="flex size-4 items-center justify-center rounded border border-zinc-300 data-[checked]:border-zinc-900 data-[checked]:bg-zinc-900 dark:border-zinc-600 dark:data-[checked]:border-zinc-100 dark:data-[checked]:bg-zinc-100"
      >
        <BaseCheckbox.Indicator className="text-white dark:text-zinc-900">
          <Check className="size-3" strokeWidth={3} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {children}
    </label>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return <span className={cn("inline-block size-2 rounded-full", ok ? "bg-emerald-500" : "bg-red-500")} />;
}

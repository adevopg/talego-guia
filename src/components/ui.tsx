import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The small pieces every page is built from.
 *
 * They are plain server components with no state: the guide is a reading
 * surface, and the only things that need to run in the browser are the search
 * box and the map.
 */

export function Panel({
  title, note, right, children, className = "",
}: {
  title?: ReactNode;
  note?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-line bg-panel/70 ${className}`}
    >
      {title && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-soft px-4 py-2.5">
          <h2 className="text-[13px] font-semibold tracking-wide text-dim uppercase">
            {title}
          </h2>
          {note && <p className="text-xs text-faint">{note}</p>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/** A label-and-value line, the shape most of this data wants. */
export function Row({
  label, children, mono = true, tone,
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
  tone?: "red" | "green" | "amber" | "faint";
}) {
  const colour =
    tone === "red" ? "text-red"
    : tone === "green" ? "text-green"
    : tone === "amber" ? "text-amber"
    : tone === "faint" ? "text-faint"
    : "text-text";
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line-soft px-4 py-1.5 last:border-0">
      <dt className="text-[13px] text-dim">{label}</dt>
      <dd
        className={`text-right text-[13px] ${colour} ${mono ? "tnum font-mono" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "border-line text-dim",
  amber: "border-amber-dim text-amber",
  red: "border-red/40 text-red",
  green: "border-green/40 text-green",
  blue: "border-blue/40 text-blue",
  violet: "border-violet/40 text-violet",
};

export function Badge({
  children, tone = "neutral", title,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES | string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border px-1.5 py-px text-[11px] leading-5 ${TONES[tone] ?? TONES.neutral}`}
    >
      {children}
    </span>
  );
}

/** The colour each inventory tab gets, kept the same everywhere. */
export const GROUP_TONE: Record<string, string> = {
  ARMAS: "red",
  ROPA: "blue",
  CONSUMIBLES: "green",
  CHAPAS: "amber",
  ESTILO: "violet",
  OTROS: "neutral",
};

/**
 * An item's icon.
 *
 * A plain `img`, not `next/image`: these are 2576 already-optimised WebP files
 * of about 2 KB each, so there is nothing for an optimiser to do and a lot for
 * it to queue up. `onError` is not available in a server component, so a missing
 * file simply shows the empty frame, which is honest enough.
 *
 * The frame is **1.4 times as wide as it is tall** because that is what the
 * pictures are: 180×128, every one of them. In a square box they would sit in
 * the middle of two bars of nothing and be drawn smaller than the row allows.
 *
 * `size` is the height, and the art is only ever scaled **down** from 180×128 —
 * so no pixelated rendering here. Hard-edged downscaling is what makes an image
 * crawl with aliasing; smooth is right when the source is larger than the box.
 */
export function ItemIcon({
  icon, size = 32, alt = "",
}: {
  icon: string | null;
  size?: number;
  alt?: string;
}) {
  const width = Math.round(size * 1.4);
  if (!icon) {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded border border-line-soft bg-ink-sunken"
        style={{ width, height: size }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/iconos/${icon.toLowerCase()}.webp`}
      alt={alt}
      width={width}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded border border-line-soft bg-ink-sunken object-contain"
      style={{ width, height: size }}
    />
  );
}

/** A room's background view, at thumbnail size or full. */
export function RoomView({
  scene, view, thumb = false, className = "", alt = "",
}: {
  scene: string;
  view: number;
  thumb?: boolean;
  className?: string;
  alt?: string;
}) {
  const file = `${scene.toLowerCase()}${view}.webp`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumb ? `/salas/mini/${file}` : `/salas/${file}`}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`bg-ink-sunken object-cover ${className}`}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-[13px] text-faint">{children}</p>;
}

/**
 * A level, coloured by how far up it is. The game's own ceiling is 150, so the
 * bands are read against that rather than against whatever the page happens to
 * be showing.
 */
export function Level({ value }: { value: number }) {
  const tone =
    value >= 120 ? "text-red"
    : value >= 70 ? "text-rust"
    : value >= 30 ? "text-amber"
    : "text-dim";
  return <span className={`tnum font-mono ${tone}`}>{value}</span>;
}

/** Paging that keeps every other filter in the URL. */
export function Pager({
  page, perPage, total, params, basePath,
}: {
  page: number;
  perPage: number;
  total: number;
  params: Record<string, string | undefined>;
  basePath: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;

  const href = (p: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "" && key !== "pagina") query.set(key, value);
    }
    if (p > 1) query.set("pagina", String(p));
    const text = query.toString();
    return text ? `${basePath}?${text}` : basePath;
  };

  // A window around the current page, with the ends always reachable.
  const around = new Set<number>([1, pages, page]);
  for (let delta = 1; delta <= 2; delta++) {
    if (page - delta >= 1) around.add(page - delta);
    if (page + delta <= pages) around.add(page + delta);
  }
  const shown = [...around].sort((a, b) => a - b);

  return (
    <nav className="flex flex-wrap items-center gap-1 px-4 py-3 text-[13px]">
      {page > 1 && (
        <Link
          href={href(page - 1)}
          className="rounded border border-line px-2 py-1 text-dim hover:border-amber-dim hover:text-amber"
        >
          anterior
        </Link>
      )}
      {shown.map((p, index) => (
        <span key={p} className="flex items-center gap-1">
          {index > 0 && shown[index - 1] !== p - 1 && (
            <span className="px-1 text-faint">…</span>
          )}
          {p === page ? (
            <span className="tnum rounded border border-amber-dim bg-amber/10 px-2 py-1 font-mono text-amber">
              {p}
            </span>
          ) : (
            <Link
              href={href(p)}
              className="tnum rounded border border-line px-2 py-1 font-mono text-dim hover:border-amber-dim hover:text-amber"
            >
              {p}
            </Link>
          )}
        </span>
      ))}
      {page < pages && (
        <Link
          href={href(page + 1)}
          className="rounded border border-line px-2 py-1 text-dim hover:border-amber-dim hover:text-amber"
        >
          siguiente
        </Link>
      )}
    </nav>
  );
}

/** The heading every list and detail page opens with. */
export function PageHead({
  eyebrow, title, children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {eyebrow && (
        <p className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-amber uppercase">
          {eyebrow}
        </p>
      )}
      <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
      {children && <div className="mt-1.5 text-[13px] text-dim">{children}</div>}
    </header>
  );
}

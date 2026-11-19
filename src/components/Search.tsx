"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The search box in the header, and the palette behind it.
 *
 * `/` and `cmd+k` open it, the arrows walk the list, Enter opens what is
 * selected and Escape closes. Every request is cancelled when the next
 * keystroke arrives, so a slow one can never land on top of a newer answer.
 */

interface Hit {
  kind: string;
  ref: number;
  name: string;
  extra: string;
}

const WHERE: Record<string, (ref: number) => string> = {
  objeto: (id) => `/objetos/${id}`,
  npc: (id) => `/npcs/${id}`,
  sala: (id) => `/salas/${id}`,
  vendedor: (id) => `/vendedores/${id}`,
  receta: (id) => `/recetas/${id}`,
};

const KIND_TONE: Record<string, string> = {
  objeto: "text-blue",
  npc: "text-red",
  sala: "text-green",
  vendedor: "text-amber",
  receta: "text-violet",
};

export default function Search() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // `/` and cmd+k open it from anywhere that is not already a text field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) ||
          (event.key === "/" && !typing)) {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => input.current?.focus());
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // What is on screen is derived from what is typed, not stored a second time:
  // a stale result from a longer query must not show under a shorter one.
  const asked = text.trim();
  const showing = asked.length >= 2 ? hits : [];

  useEffect(() => {
    const q = text.trim();
    // Nothing is set here for a query too short to send. Clearing the results
    // synchronously in an effect body would be a second render for something
    // the line above already decides.
    if (q.length < 2) return;

    const stop = new AbortController();
    // Enough of a wait that a fast typist makes one request, not eight.
    const wait = setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch(
          `/api/buscar?q=${encodeURIComponent(q)}`,
          { signal: stop.signal },
        );
        const body = (await response.json()) as { hits: Hit[] };
        setHits(body.hits);
        setAt(0);
      } catch {
        // An aborted request is the normal case, not a failure.
      } finally {
        setBusy(false);
      }
    }, 140);
    return () => {
      clearTimeout(wait);
      stop.abort();
    };
  }, [text]);

  function go(hit: Hit) {
    const to = WHERE[hit.kind]?.(hit.ref);
    if (!to) return;
    setOpen(false);
    setText("");
    router.push(to);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => input.current?.focus());
        }}
        className="flex w-full items-center gap-2 rounded-md border border-line bg-ink-sunken px-2.5 py-1.5 text-left text-[13px] text-faint transition-colors hover:border-amber-dim sm:w-64"
      >
        <span aria-hidden className="text-faint">⌕</span>
        <span className="flex-1">Buscar en la guía</span>
        <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] text-faint sm:block">
          /
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              ref={input}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setAt((n) => Math.min(n + 1, showing.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setAt((n) => Math.max(n - 1, 0));
                } else if (event.key === "Enter" && showing[at]) {
                  event.preventDefault();
                  go(showing[at]);
                }
              }}
              placeholder="un objeto, un NPC, una sala, una receta…"
              aria-label="Buscar en la guía"
              className="w-full border-b border-line bg-transparent px-4 py-3 text-[15px] outline-none placeholder:text-faint"
            />
            <ul className="max-h-[52vh] overflow-y-auto">
              {showing.map((hit, index) => (
                <li key={`${hit.kind}-${hit.ref}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setAt(index)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-baseline gap-3 px-4 py-2 text-left text-[13px] ${
                      index === at ? "bg-amber/10" : ""
                    }`}
                  >
                    <span
                      className={`w-16 shrink-0 text-[10px] font-semibold tracking-wider uppercase ${KIND_TONE[hit.kind] ?? "text-faint"}`}
                    >
                      {hit.kind}
                    </span>
                    <span className="flex-1 truncate text-text">{hit.name}</span>
                    <span className="hidden max-w-[40%] truncate text-xs text-faint sm:block">
                      {hit.extra}
                    </span>
                  </button>
                </li>
              ))}
              {!showing.length && (
                <li className="px-4 py-6 text-center text-[13px] text-faint">
                  {busy && asked.length >= 2
                    ? "buscando…"
                    : asked.length < 2
                      ? "escribe al menos dos letras"
                      : "nada con ese nombre"}
                </li>
              )}
            </ul>
            <footer className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-faint">
              <span>↑↓ moverse</span>
              <span>⏎ abrir</span>
              <span>esc cerrar</span>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

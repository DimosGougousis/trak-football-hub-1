// Arc Pro (uiarc.dev): adapted from the Action morph component; licensed source, not covered by this repository's licence. See src/components/arc/PRO.md.
"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";
import { ArrowLeft, X } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./action-morph.module.css";

/** A row of the menu. Picking it calls `onSelect`; the caller opens a face or leaves. */
export interface MorphRow { id: string; label: string; description?: string; icon: ReactNode }
/** A face the shape can become, such as a short form, with Back and a close button around it. */
export interface MorphFace { id: string; title: string; content: ReactNode }

type Size = { w: number; h: number };
type Bezier = [number, number, number, number];
const { blur } = motionTokens;
const enter = [...motionTokens.ease.enter] as Bezier;
const standard = [...motionTokens.ease.standard] as Bezier;
const physical = (visualDuration: number, bounce: number): Transition => {
  const root = 2 * Math.PI / (visualDuration * 1.2);
  return { type: "spring", stiffness: root * root, damping: 2 * (1 - bounce) * root, mass: 1 };
};
/** Growing and folding settle without overshoot. */
const GROW = physical(.46, 0), SHRINK = physical(.38, 0), GLIDE = physical(.28, 0), SLIDE = physical(.4, 0), PRESS = physical(.2, 0);
const TRAVEL = 28;
const FAB = "fab", MENU = "menu";
const depth = (view: string) => view === FAB ? 0 : view === MENU ? 1 : 2;

const faceVariants: Variants = {
  hidden: (direction: number) => direction ? { opacity: 0, x: direction * TRAVEL, scale: 1, filter: `blur(${blur.soft}px)` } : { opacity: 0, x: 0, scale: .9, filter: `blur(${blur.soft}px)` },
  shown: {
    opacity: 1, x: 0, scale: 1, filter: "blur(0px)",
    transition: { x: SLIDE, scale: GROW, opacity: { duration: .22, ease: enter, delay: .05 }, filter: { duration: .24, ease: enter, delay: .05 }, delayChildren: .06, staggerChildren: motionTokens.stagger.item },
  },
  gone: (direction: number) => direction
    ? { opacity: 0, x: direction * -TRAVEL * .7, filter: `blur(${blur.soft}px)`, transition: { x: SLIDE, opacity: { duration: .12, ease: standard }, filter: { duration: .12, ease: standard } } }
    : { opacity: 0, scale: .92, filter: `blur(${blur.soft}px)`, transition: { duration: .12, ease: standard } },
};
const fadeVariants: Variants = { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: .16 } }, gone: { opacity: 0, transition: { duration: .1 } } };
const rowVariants: Variants = { hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0, transition: { y: physical(.36, 0), opacity: { duration: .2, ease: enter } } } };
const stillRow: Variants = { hidden: { opacity: 1 }, shown: { opacity: 1 } };

/** A face reports its natural size while it is the current one. React 18 (Trak): `inert` goes on as an attribute. */
function Face({ id, direction, reduced, onSize, className, children }: { id: string; direction: number; reduced: boolean; onSize: (id: string, size: Size) => void; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!present) { node.setAttribute("inert", ""); return; }
    node.removeAttribute("inert");
    const report = () => onSize(id, { w: node.offsetWidth, h: node.offsetHeight });
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [id, onSize, present]);
  return <motion.div ref={ref} className={[styles.face, className].filter(Boolean).join(" ")} data-face={id} custom={direction}
    variants={reduced ? fadeVariants : faceVariants} initial="hidden" animate="shown" exit="gone">{children}</motion.div>;
}

/**
 * Trak's "+" (TRAK-265, Imad, 22 Oct): Arc's Action morph. One glass shape springs from the button into the menu, a row
 * slides the same surface into its own face (a short form) with Back and a close button, and it folds back into the
 * button. Escape steps back; a press outside folds it. `anchor` is the corner it grows from: the phone's tab bar
 * (bottom) or a laptop's top bar (top). The view is the caller's, so a form can close it after saving.
 */
export function ActionMorph({ label, rows, faces, view, onViewChange, onSelect, trigger, anchor = "bottom", lift = 0, className, style }: {
  /** The menu's title and the button's accessible name. */
  label: string;
  rows: MorphRow[];
  faces: MorphFace[];
  /** "fab", "menu", or a face's id. */
  view: string;
  onViewChange: (view: string) => void;
  onSelect: (id: string) => void;
  /** What the closed button shows. */
  trigger: ReactNode;
  anchor?: "bottom" | "top";
  /** Raises the open shape, such as over the on-screen keyboard. */
  lift?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduced = !!useReducedMotion();
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const face = faces.find(item => item.id === view);

  /* The shape: width, height and corners spring to whichever face is current. */
  const width = useMotionValue<number | string>("100%"), height = useMotionValue<number | string>("100%"), radius = useMotionValue<number | string>(999);
  const press = useMotionValue(1);
  const sizes = useRef(new Map<string, Size>());
  const live = useRef({ view: FAB, reduced: false, measured: false });
  const last = useRef<Size>({ w: 0, h: 0 });

  const place = useCallback(() => {
    const state = live.current;
    const size = sizes.current.get(state.view);
    if (!size || !size.w) return;
    const r = state.view === FAB ? size.h / 2 : 24;
    const previous = last.current;
    if (Math.abs(previous.w - size.w) < .5 && Math.abs(previous.h - size.h) < .5 && state.measured) return;
    last.current = size;
    if (!state.measured || state.reduced) { width.jump(size.w); height.jump(size.h); radius.jump(r); state.measured = true; return; }
    const transition = size.w * size.h >= previous.w * previous.h ? GROW : SHRINK;
    animate(width, size.w, transition);
    animate(height, size.h, transition);
    animate(radius, r, transition);
  }, [height, radius, width]);

  const onSize = useCallback((id: string, size: Size) => {
    sizes.current.set(id, size);
    if (id === live.current.view) place();
  }, [place]);

  // Trak: the closed button is the size of the place it holds (the tab bar's slot shrinks as the page scrolls).
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const fit = () => {
      node.style.setProperty("--fab-w", `${node.offsetWidth}px`);
      node.style.setProperty("--fab-h", `${node.offsetHeight}px`);
      onSize(FAB, { w: node.offsetWidth, h: node.offsetHeight });
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onSize]);

  useLayoutEffect(() => {
    live.current.view = face || view === MENU ? view : FAB;
    live.current.reduced = reduced;
    place();
  }, [face, place, reduced, view]);

  /* Focus follows the surface: the first row, the face's first field, or back to the button. */
  const shown = face ? view : view === MENU ? MENU : FAB;
  const previousView = useRef(shown);
  const restore = useRef(true);
  useEffect(() => {
    const from = depth(previousView.current), to = depth(shown);
    // A press outside folds the shape without taking focus back to the button.
    const target = shown === FAB ? (restore.current && previousView.current !== FAB ? FAB : null) : shown;
    restore.current = true;
    previousView.current = shown;
    setDirection(from >= 1 && to >= 1 ? Math.sign(to - from) : 0);
    setHovered(null);
    if (!target) return;
    // After the new face mounts: twice, as the leaving face still holds the first frame.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const root = rootRef.current;
      if (target === FAB) fabRef.current?.focus({ preventScroll: true });
      else if (target === MENU) menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus({ preventScroll: true });
      else root?.querySelector<HTMLElement>(`[data-face="${target}"] input, [data-face="${target}"] button[aria-pressed], [data-face="${target}"] [role="radio"]`)?.focus({ preventScroll: true });
    }));
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  const opened = shown !== FAB;
  // A press outside folds the shape back into the button. Pickers open in portals of their own: a press there is not outside.
  useEffect(() => {
    if (!opened) return;
    const down = (event: PointerEvent) => {
      const target = event.target as Element;
      if (rootRef.current?.contains(target) || target.closest?.('[role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper]')) return;
      restore.current = false;
      onViewChange(FAB);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [onViewChange, opened]);

  const onRootKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented || !opened) return;
    event.preventDefault();
    onViewChange(shown === MENU ? FAB : MENU);
  };

  /* The menu highlight glides between rows and follows keyboard focus as well as the pointer. */
  const hy = useMotionValue(0), hh = useMotionValue(0), ho = useMotionValue(0);
  useLayoutEffect(() => {
    const node = hovered === null ? null : menuRef.current?.querySelector<HTMLElement>(`[data-index="${hovered}"]`);
    if (!node) { animate(ho, 0, { duration: reduced ? 0 : .14, ease: standard }); return; }
    if (ho.get() < .05 || reduced) { hy.jump(node.offsetTop); hh.jump(node.offsetHeight); }
    else { animate(hy, node.offsetTop, GLIDE); animate(hh, node.offsetHeight, GLIDE); }
    animate(ho, 1, { duration: reduced ? 0 : .12, ease: enter });
  }, [ho, hh, hovered, hy, reduced, shown]);

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"));
    const at = items.indexOf(document.activeElement as HTMLElement);
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    const next = event.key in steps ? (at < 0 ? 0 : (at + steps[event.key] + items.length) % items.length)
      : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  };

  // A face keeps focus inside it, as a small dialog does.
  const onFaceKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex='0']")];
    const first = focusable[0], end = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); end?.focus(); }
    else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first?.focus(); }
  };

  const pressIn = () => { if (!reduced) animate(press, .94, PRESS); };
  const pressOut = () => animate(press, 1, PRESS);
  const row = reduced ? stillRow : rowVariants;
  const menuTitle = `${uid}-menu`, faceTitle = `${uid}-face`;
  const close = <button type="button" className={styles.iconButton} aria-label={`Close ${label.toLowerCase()}`} onClick={() => onViewChange(FAB)}><X size={16} strokeWidth={1.75} aria-hidden="true" /></button>;

  return <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(" ")} style={style} data-anchor={anchor} data-view={shown === FAB ? "fab" : shown === MENU ? "menu" : "face"} onKeyDown={onRootKey}>
    <motion.div className={styles.shape} style={{ width, height, borderRadius: radius, scale: press, y: opened ? -lift : 0 }}>
      <AnimatePresence initial={false} custom={direction}>
        {shown === FAB && <Face key={FAB} id={FAB} direction={direction} reduced={reduced} onSize={onSize} className={styles.fabFace}>
          <button ref={fabRef} type="button" className={styles.fab} aria-label={label} aria-haspopup="menu" aria-expanded={false}
            onClick={() => onViewChange(MENU)} onPointerDown={event => { if (event.button === 0) pressIn(); }} onPointerUp={pressOut} onPointerLeave={pressOut} onPointerCancel={pressOut}>
            {trigger}
          </button>
        </Face>}

        {shown === MENU && <Face key={MENU} id={MENU} direction={direction} reduced={reduced} onSize={onSize} className={styles.menuFace}>
          <motion.div className={styles.header} variants={row}>
            <p id={menuTitle} className={styles.title}>{label}</p>
            {close}
          </motion.div>
          <div ref={menuRef} className={styles.menu} role="menu" aria-labelledby={menuTitle} onKeyDown={onMenuKey} onPointerLeave={() => setHovered(null)}>
            <motion.span className={styles.highlight} style={{ y: hy, height: hh, opacity: ho }} aria-hidden="true" />
            {rows.map((item, index) => <motion.button key={item.id} type="button" role="menuitem" className={styles.item} data-index={index} variants={row}
              onClick={() => onSelect(item.id)}
              onPointerMove={event => { if (event.pointerType === "mouse" && hovered !== index) setHovered(index); }}
              onFocus={() => setHovered(index)}>
              <span className={styles.itemIcon} aria-hidden="true">{item.icon}</span>
              <span className={styles.itemText}>
                <span className={styles.itemLabel}>{item.label}</span>
                {item.description && <span className={styles.itemDescription}>{item.description}</span>}
              </span>
            </motion.button>)}
          </div>
        </Face>}

        {face && <Face key={face.id} id={face.id} direction={direction} reduced={reduced} onSize={onSize} className={styles.formFace}>
          <div role="dialog" aria-labelledby={faceTitle} onKeyDown={onFaceKey} className={styles.form}>
            <motion.div className={styles.header} variants={row}>
              <button type="button" className={styles.iconButton} aria-label={`Back to ${label.toLowerCase()}`} onClick={() => onViewChange(MENU)}><ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /></button>
              <p id={faceTitle} className={styles.title}>{face.title}</p>
              {close}
            </motion.div>
            <motion.div variants={row}>{face.content}</motion.div>
          </div>
        </Face>}
      </AnimatePresence>
    </motion.div>
  </div>;
}

export default ActionMorph;

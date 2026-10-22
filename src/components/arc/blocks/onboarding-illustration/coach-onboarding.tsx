// Arc Pro (uiarc.dev): adapted from the Onboarding illustration block; licensed source, not covered by this repository's licence. See src/components/arc/PRO.md.
"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { motionTokens } from "../../lib/motion-tokens";
import styles from "./coach-onboarding.module.css";

type Tone = "paper" | "shade" | "note";
type Shape = { x: number; y: number; w: number; h: number; r: number; rot: number; tone: Tone; o: number };
type Stroke = { x1: number; y1: number; x2: number; y2: number; accent: boolean };
type Scene = { label: string; shapes: Shape[]; strokes: Stroke[]; curve: number[]; curveOn: boolean; check: boolean };
type Pointer = { x: MotionValue<number>; y: MotionValue<number> };

const { spring, duration, blur } = motionTokens;
const easeEnter: [number, number, number, number] = [...motionTokens.ease.enter];
const easeStandard: [number, number, number, number] = [...motionTokens.ease.standard];
const still = { duration: 0 };
const round = (value: number) => Math.round(value * 10) / 10;
const s = (x: number, y: number, w: number, h: number, r: number, rot = 0, tone: Tone = "paper", o = 1): Shape => ({ x, y, w, h, r, rot, tone, o });
const l = (x1: number, y1: number, x2: number, y2: number, accent = false): Stroke => ({ x1, y1, x2, y2, accent });
const parked = (x: number, y: number) => [x, y, x, y, x, y, x, y];

/** Places a line in a rotated shape's local space, so text lines ride on a tilted page. */
function onShape(shape: Shape, x1: number, y1: number, x2: number, y2: number) {
  const a = (shape.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const px = (x: number, y: number) => round(shape.x + x * cos - y * sin);
  const py = (x: number, y: number) => round(shape.y + x * sin + y * cos);
  return l(px(x1, y1), py(x1, y1), px(x2, y2), py(x2, y2));
}

function ray(angle: number) {
  const a = (angle * Math.PI) / 180;
  return l(round(160 + Math.cos(a) * 64), round(92 + Math.sin(a) * 64), round(160 + Math.cos(a) * 74), round(92 + Math.sin(a) * 74));
}

const tab = s(120, 62, 44, 22, 7, 0, "shade");
const back = s(160, 108, 136, 88, 12, 0, "shade");
const front = s(160, 122, 144, 64, 11);
const arriving = s(258, 38, 48, 60, 6, 16, "note");
const tucked = s(160, 92, 20, 20, 10, 0, "paper", 0);

/** Every scene uses the same seven shapes, three lines, one curve and one check, so each piece can travel. */
const scenes: Scene[] = [
  {
    label: "An open, empty folder with a plus sign above it",
    shapes: [tab, back, s(112, 12, 44, 56, 5, -18, "paper", 0), s(166, 0, 44, 56, 5, 6, "paper", 0), s(214, 12, 44, 56, 5, 20, "paper", 0), s(294, 6, 44, 56, 5, 30, "note", 0), front],
    strokes: [l(148, 114, 172, 114), l(151, 36, 169, 36, true), l(160, 27, 160, 45, true)],
    curve: parked(226, 30), curveOn: false, check: false,
  },
  {
    label: "Pages flying into the open folder and stacking inside it",
    shapes: [tab, back, s(134, 80, 56, 72, 6, -10), s(158, 74, 56, 72, 6, -2), s(184, 80, 56, 72, 6, 9), arriving, front],
    strokes: [onShape(arriving, -14, -18, 14, -18), onShape(arriving, -14, -9, 10, -9), onShape(arriving, -14, 0, 4, 0)],
    curve: [226, 30, 214, 13, 198, 13, 190, 30], curveOn: true, check: false,
  },
  {
    label: "Three people gathered around one shared page",
    shapes: [s(160, 58, 40, 34, 17), s(160, 27, 22, 22, 11), s(88, 128, 46, 40, 20), s(88, 90, 28, 28, 14), s(232, 128, 46, 40, 20), s(232, 90, 28, 28, 14), s(160, 106, 72, 88, 8)],
    strokes: [l(138, 82, 174, 82), l(138, 94, 166, 94, true), l(138, 106, 178, 106)],
    curve: [214, 82, 204, 64, 184, 66, 173, 92], curveOn: true, check: false,
  },
  {
    label: "A finished badge with a check mark",
    shapes: [s(146, 156, 22, 52, 4, 16), s(174, 156, 22, 52, 4, -16), s(160, 92, 108, 108, 54, 0, "shade"), tucked, tucked, tucked, s(160, 92, 84, 84, 42)],
    strokes: [ray(-140), ray(-90), ray(-40)],
    curve: parked(160, 92), curveOn: false, check: true,
  },
];

const depths = [0.4, 0.55, 0.7, 0.8, 0.9, 1, 1];
const mix = (from: number[], to: number[], t: number) => from.map((value, index) => value + (to[index] - value) * t);
const toCurve = (p: number[]) => `M${p[0]} ${p[1]}C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}`;

function useDepth(pointer: Pointer, depth: number) {
  const x = useTransform(pointer.x, (value) => value * depth);
  const y = useTransform(pointer.y, (value) => value * depth);
  return { x, y };
}

function MorphShape({ shape, delay, instant, pointer, depth }: { shape: Shape; delay: number; instant: boolean; pointer: Pointer; depth: number }) {
  const style = useDepth(pointer, depth);
  return (
    <motion.g initial={false} animate={{ x: shape.x, y: shape.y }} transition={instant ? still : { ...spring.smooth, delay }}>
      <motion.rect
        className={`${styles.shape} ${styles[shape.tone]}`}
        style={style}
        initial={false}
        animate={{ attrX: -shape.w / 2, attrY: -shape.h / 2, width: shape.w, height: shape.h, rx: shape.r, rotate: shape.rot, opacity: shape.o }}
        transition={instant ? still : { default: { ...spring.morph, delay }, opacity: { duration: duration.standard, ease: easeStandard, delay } }}
      />
    </motion.g>
  );
}

function MorphStroke({ stroke, delay, instant, pointer }: { stroke: Stroke; delay: number; instant: boolean; pointer: Pointer }) {
  const style = useDepth(pointer, 1);
  return (
    <motion.line
      className={`${styles.stroke} ${stroke.accent ? styles.accent : ""}`}
      style={style}
      initial={false}
      animate={{ x1: stroke.x1, y1: stroke.y1, x2: stroke.x2, y2: stroke.y2 }}
      transition={instant ? still : { ...spring.smooth, delay }}
    />
  );
}

/** Morphs a cubic curve by interpolating two equal point lists; a new target starts from wherever the curve is now. */
function MorphCurve({ points, visible, delay, instant, pointer }: { points: number[]; visible: boolean; delay: number; instant: boolean; pointer: Pointer }) {
  const style = useDepth(pointer, 1);
  const d = useMotionValue(toCurve(points));
  const current = useRef(points);
  useEffect(() => {
    const from = current.current;
    if (from === points) return;
    if (instant) { current.current = points; d.set(toCurve(points)); return; }
    const controls = animate(0, 1, { ...spring.morph, delay, onUpdate: (t) => { current.current = mix(from, points, t); d.set(toCurve(current.current)); } });
    return () => controls.stop();
  }, [points, delay, instant, d]);
  return <motion.path d={d} className={`${styles.stroke} ${styles.trail}`} style={style} initial={false} animate={{ opacity: visible ? 1 : 0 }} transition={instant ? still : { duration: duration.standard, ease: easeStandard, delay: visible ? delay + 0.06 : 0 }} />;
}

function Illustration({ scene, dir, rushed, instant, pointer }: { scene: Scene; dir: number; rushed: boolean; instant: boolean; pointer: Pointer }) {
  const count = scene.shapes.length;
  const rank = (index: number, total: number) => (dir > 0 ? index : total - 1 - index);
  const checkStyle = useDepth(pointer, 1);
  return (
    <>
      {scene.shapes.map((shape, index) => <MorphShape key={index} shape={shape} depth={depths[index]} delay={rushed ? 0 : rank(index, count) * 0.03} instant={instant} pointer={pointer} />)}
      <MorphCurve points={scene.curve} visible={scene.curveOn} delay={rushed ? 0 : 0.1} instant={instant} pointer={pointer} />
      {scene.strokes.map((stroke, index) => <MorphStroke key={index} stroke={stroke} delay={rushed ? 0 : 0.12 + rank(index, 3) * 0.04} instant={instant} pointer={pointer} />)}
      <motion.path
        d="M143 93L155 105L178 80"
        className={`${styles.stroke} ${styles.accent} ${styles.check}`}
        style={checkStyle}
        initial={false}
        animate={{ pathLength: scene.check ? 1 : 0, opacity: scene.check ? 1 : 0 }}
        transition={instant ? still : scene.check ? { pathLength: { duration: duration.considered, ease: easeEnter, delay: rushed ? 0.12 : 0.32 }, opacity: { duration: 0.01, delay: rushed ? 0.12 : 0.32 } } : { duration: duration.fast }}
      />
    </>
  );
}

/**
 * A coach's first open (Imad, 22 Oct: Arc's onboarding illustration). Four steps: the week, the squad, the "+", and
 * ready. The same line shapes morph from folder to pages, people and a badge.
 */
export function CoachOnboarding({ open, onOpenChange, club, squads, players }: { open: boolean; onOpenChange: (open: boolean) => void; club: string; squads: number; players: number }) {
  const steps = [
    { id: "week", title: "Your week, at a glance", body: "Home opens on this week. Tap a day to see its trainings and matches, then publish, share or take the register from there." },
    { id: "squad", title: "Your squad, one player at a time", body: "Squad lists every player. Open one to see their profile, how their season is going and every assessment you've written." },
    { id: "create", title: "Everything starts with +", body: "Assess a player, log a match or a training, or plan a new event. Players who need you show on Home." },
    { id: "ready", title: "You're ready", body: `${club} has ${squads} ${squads === 1 ? "squad" : "squads"} and ${players} ${players === 1 ? "player" : "players"}. Get started opens your week.` },
  ];
  const last = steps.length - 1;
  const [step, setStep] = useState(0);
  const [flow, setFlow] = useState({ dir: 1, rushed: false });
  const lastChange = useRef(0);
  const reduce = useReducedMotion() ?? false;
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const pointer = { x: useSpring(rawX, { visualDuration: 0.5, bounce: 0 }), y: useSpring(rawY, { visualDuration: 0.5, bounce: 0 }) };
  const scene = scenes[step];
  const copy = steps[step];

  function go(next: number) {
    const target = Math.max(0, Math.min(last, next));
    const now = performance.now();
    setFlow({ dir: target >= step ? 1 : -1, rushed: now - lastChange.current < 650 });
    lastChange.current = now;
    setStep(target);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowRight" && step < last) { event.preventDefault(); go(step + 1); }
    if (event.key === "ArrowLeft" && step > 0) { event.preventDefault(); go(step - 1); }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reduce || event.pointerType !== "mouse" || !window.matchMedia("(hover: hover)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    rawX.set(((event.clientX - box.left) / box.width - 0.5) * 12);
    rawY.set(((event.clientY - box.top) / box.height - 0.5) * 8);
  }

  const primary = step === last ? { key: "start", label: "Get started" } : { key: "next", label: "Next" };
  const textIn = reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: `blur(${blur.soft}px)` };
  const textOut = reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: `blur(${blur.soft}px)` };

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className={`arc ${styles.overlay}`} />
      <Dialog.Content className={`arc ${styles.layer}`} aria-describedby={undefined} onKeyDown={handleKeyDown}
        onOpenAutoFocus={event => { event.preventDefault(); (event.currentTarget as HTMLElement | null)?.focus(); }}>
        <section className={styles.card} aria-label="Welcome to Trak">
          <Dialog.Title className={styles.srOnly}>Welcome to Trak</Dialog.Title>
          <div className={styles.stage} onPointerMove={handlePointerMove} onPointerLeave={() => { rawX.set(0); rawY.set(0); }}>
            <svg className={styles.art} viewBox="0 0 320 200" role="img" aria-label={scene.label}>
              <AnimatePresence initial={false}>
                <motion.g key={reduce ? `still-${step}` : "live"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: duration.standard, ease: easeStandard }}>
                  <Illustration scene={scene} dir={flow.dir} rushed={flow.rushed} instant={reduce} pointer={pointer} />
                </motion.g>
              </AnimatePresence>
            </svg>
            <AnimatePresence initial={false}>
              {step < last ? <motion.button key="skip" type="button" className={styles.skip} onClick={() => go(last)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: duration.fast }}>Skip</motion.button> : null}
            </AnimatePresence>
          </div>

          <div className={styles.body}>
            <div className={styles.copy} aria-live="polite">
              <AnimatePresence initial={false}>
                <motion.div key={copy.id} className={styles.copyItem} initial={textIn} animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: duration.considered, ease: easeEnter, delay: reduce ? 0 : 0.08 } }} exit={{ ...textOut, transition: { duration: duration.exit, ease: easeStandard } }}>
                  <h2>{copy.title}</h2>
                  <p>{copy.body}</p>
                  <span className={styles.srOnly}>{`Step ${step + 1} of ${steps.length}`}</span>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className={styles.footer}>
              <div className={styles.dots} role="group" aria-label="Steps">
                {steps.map((item, index) => (
                  <button key={item.id} type="button" className={styles.dot} aria-label={`Step ${index + 1}: ${item.title}`} aria-current={index === step ? "step" : undefined} onClick={() => go(index)}>
                    <motion.span className={styles.dotMark} data-state={index === step ? "current" : index < step ? "complete" : "upcoming"} initial={false} animate={{ width: index === step ? 20 : 6 }} transition={reduce ? still : spring.morph} />
                  </button>
                ))}
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.back} aria-disabled={step === 0} onClick={() => { if (step > 0) go(step - 1); }}>
                  <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className={styles.backLabel}>Back</span>
                </button>
                <button type="button" className={styles.primary} onClick={() => step === last ? onOpenChange(false) : go(step + 1)}>
                  <AnimatePresence initial={false}>
                    <motion.span key={primary.key} className={styles.primaryLabel} initial={textIn} animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: duration.standard, ease: easeEnter } }} exit={{ ...textOut, transition: { duration: duration.exit, ease: easeStandard } }}>
                      {primary.label}
                      {primary.key === "next" ? <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" /> : null}
                    </motion.span>
                  </AnimatePresence>
                </button>
              </div>
            </div>
          </div>
        </section>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export default CoachOnboarding;

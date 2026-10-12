import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// TRAK-114: findBy/waitFor wait 1 s by default, and GitHub's runners can take longer than
// that for a full-provider render (main went red on 5 Oct). 4 s is what 45 calls already pass.
configure({ asyncUtilTimeout: 4000 });

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// TRAK-163: Arc components measure themselves with ResizeObserver, which every
// browser Trak supports has and jsdom lacks. Nothing in jsdom ever resizes.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// TRAK-190: Trak's one email design (approved by Imad, 17 Nov). Every email:
// "Hello," -> one bold sentence on what happened -> one short paragraph ->
// the code, button or event box -> the grey footer, on a white card over
// Trak's ground, with the TRAK wordmark and buttons in brand green.
// email-templates/*.html (the Auth emails) use the same colours and styles by
// hand: change both together.
//
// The HTML is plain ASCII: anything else becomes a numeric entity, because
// some inboxes strip the charset and print symbols as mojibake. Coach-typed
// text goes through esc() first. Words never live here: callers pass them.

export const COLOURS = {
  ground: '#F6F5F1', card: '#FFFFFF', ink: '#1A2421', ink2: '#57615C', ink3: '#6B736F',
  line: '#E2E0D8', raised: '#EEEDE7', brand: '#0B6623', danger: '#B42318', changed: '#FBF1DD',
} as const;
const C = COLOURS;
/** The app's own font where the phone has it (iPhone, Mac), then Century Gothic, then Arial. */
export const FONT = "Futura,'Century Gothic','Trebuchet MS',Arial,sans-serif";

/** Text as HTML: the five special characters escaped. */
export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Every non-ASCII character as a numeric entity ("–" -> "&#8211;"). */
export function asciiOnly(html: string): string {
  return html.replace(/[^\t\n\r\x20-\x7e]/gu, ch => `&#${ch.codePointAt(0)};`);
}

const STYLE = {
  p: `margin:0 0 14px;font-size:15px;line-height:1.55;color:${C.ink};`,
  lead: `margin:0 0 14px;font-size:16px;line-height:1.5;font-weight:600;color:${C.ink};`,
  details: `margin:0 0 14px;padding:12px 14px;background:${C.ground};border:1px solid ${C.line};border-radius:10px;font-size:15px;line-height:1.55;color:${C.ink};`,
  was: `color:${C.ink3};text-decoration:line-through;margin-right:6px;`,
  now: `background:${C.changed};color:${C.ink};font-weight:600;padding:0 4px;border-radius:4px;`,
  off: `color:${C.ink3};text-decoration:line-through;`,
  link: `color:${C.brand};text-decoration:underline;`,
  foot: `margin:0 0 8px;font-size:12px;line-height:1.5;color:${C.ink3};`,
} as const;

/** The pieces of an email body, each already HTML. */
export const part = {
  p: (inner: string) => `<p style="${STYLE.p}">${inner}</p>`,
  /** The bold sentence that says what happened. */
  lead: (inner: string) => `<p style="${STYLE.lead}">${inner}</p>`,
  /** CANCELLED in red, as on the design. */
  danger: (inner: string) => `<span style="color:${C.danger};">${inner}</span>`,
  /** The event box: one row per line. A row is HTML, or { html, off } for a crossed-out row, { html, strong } for a bold one. */
  details: (rows: (string | { html: string; off?: boolean; strong?: boolean; gap?: boolean })[]) =>
    `<div style="${STYLE.details}">${rows.map(row => {
      if (typeof row === 'string') return `<div>${row}</div>`;
      const style = `${row.off ? STYLE.off : ''}${row.strong ? 'font-weight:600;' : ''}${row.gap ? 'margin-top:6px;' : ''}`;
      return style ? `<div style="${style}">${row.html}</div>` : `<div>${row.html}</div>`;
    }).join('')}</div>`,
  /** A changed value: the old one crossed out, the new one marked (layout A, Kostas 17 Nov). */
  was: (inner: string) => `<span style="${STYLE.was}">${inner}</span>`,
  now: (inner: string) => `<span style="${STYLE.now}">${inner}</span>`,
  link: (url: string) => `<a href="${esc(url)}" style="${STYLE.link}">${esc(url)}</a>`,
};

/** One whole email: the ground, the card, the wordmark, the body, then the grey footer. */
export function emailDocument(body: string, foot: string[]): string {
  return asciiOnly([
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>',
    `<body style="margin:0;padding:0;background:${C.ground};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ground}" style="background:${C.ground};"><tr><td style="padding:24px 12px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="max-width:480px;margin:0 auto;background:${C.card};border:1px solid ${C.line};border-radius:14px;">`,
    `<tr><td style="padding:24px 22px 18px;font-family:${FONT};color:${C.ink};">`,
    `<p style="margin:0 0 18px;font-size:15px;font-weight:700;letter-spacing:4px;color:${C.brand};">TRAK</p>`,
    body,
    `<div style="margin-top:20px;padding-top:12px;border-top:1px solid ${C.line};">`,
    ...foot.map(line => `<p style="${STYLE.foot}">${line}</p>`),
    '</div>',
    '</td></tr></table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('\n'));
}

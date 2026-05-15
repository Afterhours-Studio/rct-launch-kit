/**
 * Tiny ANSI SGR parser sufficient for typical CLI output (npm, cargo, vite,
 * nodejs servers). Strips other escape sequences (cursor moves, OSC titles)
 * so they don't render as garbage.
 *
 * Only handles SGR `\x1b[<codes>m`. Honors foreground/background standard +
 * bright colors, bold, dim, italic, underline, and reset.
 */

export interface AnsiSpan {
  text: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

// VS Code dark+ palette (good readability on both light & dark backgrounds).
const FG_COLORS: Record<number, string> = {
  30: "#3f3f3f",
  31: "#cd3131",
  32: "#0dbc79",
  33: "#bb8c00",
  34: "#2472c8",
  35: "#bc3fbc",
  36: "#0598bc",
  37: "#9c9c9c",
  90: "#666666",
  91: "#f14c4c",
  92: "#23d18b",
  93: "#d5a800",
  94: "#3b8eea",
  95: "#d670d6",
  96: "#29b8db",
  97: "#bfbfbf",
};

const BG_COLORS: Record<number, string> = Object.fromEntries(
  Object.entries(FG_COLORS).map(([k, v]) => [String(Number(k) + 10), v]),
);

const SGR_RE = /\x1b\[([0-9;]*)m/g;
// Strip OSC sequences (title setting) and other CSI sequences.
const OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g;
const OTHER_CSI_RE = /\x1b\[[?!]*[0-9;]*[A-HJKSTfilmnpsu]/g;

function stripNonSgr(input: string): string {
  return input.replace(OSC_RE, "").replace(OTHER_CSI_RE, (m) => {
    return m.endsWith("m") ? m : "";
  });
}

function applyCode(span: AnsiSpan, code: number): AnsiSpan {
  if (code === 0) return { text: span.text }; // reset, preserve text accumulator
  if (code === 1) return { ...span, bold: true };
  if (code === 2) return { ...span, dim: true };
  if (code === 3) return { ...span, italic: true };
  if (code === 4) return { ...span, underline: true };
  if (code === 22) return { ...span, bold: false, dim: false };
  if (code === 23) return { ...span, italic: false };
  if (code === 24) return { ...span, underline: false };
  if (code === 39) return { ...span, color: undefined };
  if (code === 49) return { ...span, bgColor: undefined };
  if (FG_COLORS[code]) return { ...span, color: FG_COLORS[code] };
  if (BG_COLORS[code]) return { ...span, bgColor: BG_COLORS[code] };
  return span;
}

export function parseAnsi(input: string): AnsiSpan[] {
  if (!input) return [];
  const cleaned = stripNonSgr(input);
  if (!cleaned.includes("\x1b[")) {
    return [{ text: cleaned }];
  }

  const spans: AnsiSpan[] = [];
  let cur: AnsiSpan = { text: "" };
  let last = 0;
  let match: RegExpExecArray | null;
  SGR_RE.lastIndex = 0;

  while ((match = SGR_RE.exec(cleaned)) !== null) {
    const before = cleaned.slice(last, match.index);
    if (before) {
      spans.push({ ...cur, text: before });
    }
    const codes = match[1]
      ? match[1].split(";").map((s) => Number(s) || 0)
      : [0];
    for (const c of codes) {
      cur = applyCode(cur, c);
    }
    last = match.index + match[0].length;
  }
  const tail = cleaned.slice(last);
  if (tail) spans.push({ ...cur, text: tail });

  return spans.filter((s) => s.text.length > 0);
}

export function spanStyle(s: AnsiSpan): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (s.color) style.color = s.color;
  if (s.bgColor) style.background = s.bgColor;
  if (s.bold) style.fontWeight = 600;
  if (s.dim) style.opacity = 0.65;
  if (s.italic) style.fontStyle = "italic";
  if (s.underline) style.textDecoration = "underline";
  return style;
}

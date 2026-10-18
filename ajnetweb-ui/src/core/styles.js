// Design tokens shared by every AJ Netweb card.
// Everything falls back to standard HA theme variables, so the cards look right in any
// theme; AJ Netweb themes refine them through --ajn-* variables.
export const TOKENS = `
  :host {
    --_accent: var(--ajn-accent, var(--primary-color, #2f7dd1));
    --_grad: var(--ajn-gradient, linear-gradient(135deg, var(--_accent), var(--_accent)));
    --_surface: var(--ajn-surface, var(--ha-card-background, var(--card-background-color, #fff)));
    --_surface-on: var(--ajn-surface-on, rgba(255, 255, 255, 0.94));
    --_text-on: var(--ajn-text-on, #15171c);
    --_text: var(--primary-text-color, #15171c);
    --_text2: var(--secondary-text-color, #6b7180);
    --_border: var(--ajn-border, var(--ha-card-border-color, var(--divider-color, rgba(0,0,0,.08))));
    --_radius: var(--ajn-radius, var(--ha-card-border-radius, 20px));
    --_blur: var(--ajn-glass-blur, 0px);
    --_shadow: var(--ajn-shadow, var(--ha-card-box-shadow, none));
    --_muted: rgba(var(--rgb-primary-text-color, 128, 128, 128), 0.08);
    --_ease: cubic-bezier(.2, .8, .2, 1);
    display: block;
    font-family: var(--ajn-font, var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif));
    -webkit-font-smoothing: antialiased;
  }
  ha-card {
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    background: var(--_surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    box-shadow: var(--_shadow);
    -webkit-backdrop-filter: blur(var(--_blur)) saturate(var(--ajn-glass-saturate, 1.4));
    backdrop-filter: blur(var(--_blur)) saturate(var(--ajn-glass-saturate, 1.4));
    container-type: inline-size;
  }
  .tap { cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
  .tap:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
  ha-icon { display: inline-flex; --mdc-icon-size: 22px; }
  .muted { color: var(--_text2); }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

// RGB triplets for semantic colours, used as rgba(var(--c), alpha)
export const COLORS = {
  amber: "255, 176, 32", blue: "64, 156, 255", orange: "255, 128, 48", red: "255, 69, 58",
  green: "48, 209, 88", purple: "191, 90, 242", teal: "64, 200, 224", indigo: "94, 92, 230",
  pink: "255, 55, 95", grey: "142, 142, 147",
};

// Background for room cards without a photo: a soft gradient picked by room type
export const ROOM_GRADIENTS = [
  [/living|salon|lounge|family|sofa/, "#3a2f2a", "#8a6a4f"],
  [/bed|suite|master/, "#25283d", "#5b5f97"],
  [/kid|child|nursery|teddy/, "#2b3a4a", "#4f8fbf"],
  [/kitchen|stove|pantry|dining|silverware/, "#2f3a2d", "#7d9b5f"],
  [/bath|shower|wc|toilet/, "#203a40", "#4fa3a8"],
  [/majlis|guest|diwan|account-group/, "#3d2a1f", "#b07a3c"],
  [/garden|yard|pool|outdoor|flower|patio|balcony|terrace/, "#1f3a2a", "#3f8f5f"],
  [/garage|parking|car/, "#2a2d33", "#5c6370"],
  [/office|study|desk|library/, "#2a2f3d", "#6a7a9a"],
  [/entrance|entry|foyer|gate|door|hall|corridor|stair/, "#33302b", "#8a7f6a"],
  [/cinema|theater|theatre|media/, "#1e1a2e", "#5a3f8f"],
];

export function roomGradient(text) {
  const t = (text || "").toLowerCase();
  const hit = ROOM_GRADIENTS.find(([re]) => re.test(t));
  const [a, b] = hit ? [hit[1], hit[2]] : ["#2a2e38", "#56607a"];
  return `linear-gradient(145deg, ${a} 0%, ${b} 100%)`;
}

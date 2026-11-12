// Contract for a visual style. A style is a complete look for the same ReelSpec: it may replace any layer the
// player draws. Everything it leaves out falls back to the original PATCH NOTES look.
import type { z } from 'zod';
import type { AccentName, CameraClipRegion, Ctx, Frame, LayoutFrame, Mode, ReelSpec, SceneDef, SceneProps, SceneType, Theme, TransitionContext, TransitionName } from '../core.ts';
import type { ActiveCaption } from '../captions.ts';

/** A font file shipped inside the style folder. Only use fonts whose licence allows embedding (OFL, Apache). */
export interface StyleFont {
  /** CSS family name the style's code uses, for example 'Anton'. */
  family: string;
  /** Path relative to `styles/<name>/`, for example 'fonts/Anton-Regular.ttf'. */
  file: string;
  weight?: string;
  style?: 'normal' | 'italic';
}

/** A scene only this style provides, used through `{ "type": "special", "kind": <key>, "data": {...} }`. */
export interface SpecialScene<D = any> {
  /** Validates `data`. Use `.strict()` objects and bound every string and array. */
  schema: z.ZodType<D>;
  /** One line for agents: what the scene is for and when to use it. */
  purpose: string;
  /** Draws the scene; `props.data` has passed `schema`. */
  render(frame: Frame, props: { kind: string; data: D }): void;
  /** Optional named-object placements for camera and transition continuity. */
  layout?(frame: LayoutFrame, props: { kind: string; data: D }): void;
  /** Optional sound bed while the scene builds (a key of the shared SFX table in scripts/motion-audio.mjs). */
  bed?: string;
  /** May this scene open a reel (counts as a hook for the linter)? */
  hook?: boolean;
}

export interface StyleDef {
  name: string;
  /** One line describing the look, shown to agents choosing a style. */
  description: string;
  defaultMode?: Mode;
  defaultAccent?: AccentName;
  /** Palette. Keep the Theme roles: one accent for the one thing to look at. */
  theme?(mode: Mode, accent: AccentName): Theme;
  fonts?: StyleFont[];
  background?(frame: Frame, time: number): void;
  /** Persistent identity layer (wordmark, ticker, frame). */
  chrome?(frame: Frame, spec: ReelSpec, time: number, duration: number): void;
  caption?(frame: Frame, caption: ActiveCaption, time: number): void;
  /** Draws a transition at `phase` -1..0 (outgoing) and 0..1 (incoming), like fx/transitions.ts. */
  transition?(ctx: Ctx, name: TransitionName, phase: number, theme: Theme, seed: number, context?: TransitionContext): void;
  /** Per-transition skins. New v2 transitions use the shared helper unless a style supplies a named override here. */
  transitions?: Partial<Record<TransitionName, (ctx: Ctx, name: TransitionName, phase: number, theme: Theme, seed: number, context?: TransitionContext) => void>>;
  /** Camera move for the scene; must call ctx.save() exactly once (the player restores it). */
  camera?(frame: Frame, hits: number[]): void;
  /** Optional screen-space clip around scene drawing. Omit to draw the full canvas. */
  cameraClip?: CameraClipRegion;
  impact?(frame: Frame, hits: number[]): void;
  /** Re-skins of the shared scene types. */
  scenes?: Partial<{ [K in Exclude<SceneType, 'special'>]: SceneDef<SceneProps[K]> }>;
  specials?: Record<string, SpecialScene>;
}

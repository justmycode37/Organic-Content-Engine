import { z } from 'zod';

const claimId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const claimSourceSchema = z.object({
  url: z.string().url(),
  type: z.enum(['primary', 'secondary']),
  publisher: z.string().trim().min(1),
  retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export const claimSchema = z.object({
  id: claimId,
  statement: z.string().trim().min(1),
  value: z.number().finite().optional(),
  unit: z.string().trim().min(1).optional(),
  sources: z.array(claimSourceSchema).min(1),
  status: z.enum(['verified', 'attributed', 'contested', 'unverified']),
  attribution: z.string().trim().min(1),
  caveats: z.array(z.string().trim().min(1)),
  notes: z.array(z.string().trim().min(1)),
}).strict().superRefine((claim, ctx) => {
  if ((claim.value === undefined) !== (claim.unit === undefined)) {
    ctx.addIssue({ code: 'custom', message: 'value and unit must be provided together', path: ['unit'] });
  }
});

export const claimsLedgerSchema = z.object({
  version: z.literal(1),
  spec: z.string().min(1).optional(),
  claims: z.array(claimSchema).min(1),
}).strict().superRefine((ledger, ctx) => {
  const ids = new Set<string>();
  ledger.claims.forEach((claim, index) => {
    if (ids.has(claim.id)) ctx.addIssue({ code: 'custom', path: ['claims', index, 'id'], message: `duplicate claim id '${claim.id}'` });
    ids.add(claim.id);
  });
});

export type ClaimStatus = z.infer<typeof claimSchema>['status'];
export type Claim = z.infer<typeof claimSchema>;
export type ClaimsLedger = z.infer<typeof claimsLedgerSchema>;

export interface NumberMention {
  scene: number | null;
  path: string;
  raw: string;
  value: number;
  unit?: string;
  relation: 'exact' | 'lower' | 'upper';
  tolerance: number;
}

export interface ClaimIssue {
  code: string;
  message: string;
  path?: string;
  scene?: number;
}

export interface NumberCheck extends NumberMention {
  supported: boolean;
  claimId?: string;
  status?: ClaimStatus;
}

export interface ClaimCheckReport {
  ok: boolean;
  errors: ClaimIssue[];
  warnings: ClaimIssue[];
  numbers: NumberCheck[];
  blockedClaims: string[];
}

// Identifiers, URLs and timing anchors are never read as story content, so their digits are not claims.
const ignoredSceneStringKeys = new Set([
  'claims', 'type', 'transition', 'style', 'status', 'role', 'icon', 'direction', 'pattern', 'winner', 'kind',
  'target', 'word', 'sfx', 'reward', 'move', 'asset', 'url',
]);

const numberPattern = /(?<![\p{L}\d])(?<currency>[$€£])?\s*(?<number>-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|-?\.\d+)\s*(?<scale>million|billion|trillion|thousand|[kmb])?\s*(?<percent>%|percent(?:age)?)?\s*(?<multiplier>[x×]|times)?(?![\p{L}])/giu;

const wordValues: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const wordScales: Record<string, number> = { hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000, trillion: 1_000_000_000_000 };

interface ParsedNumericText {
  start: number;
  end: number;
  raw: string;
  value: number;
  unit?: string;
  relation: NumberMention['relation'];
  tolerance: number;
}

function plainContext(text: string, start: number): string {
  return text.slice(Math.max(0, start - 32), start).replaceAll('*', ' ');
}

function numericRelation(text: string, start: number): NumberMention['relation'] {
  const before = plainContext(text, start);
  if (/\b(?:over|above|more than|at least)\s*$/i.test(before)) return 'lower';
  if (/\b(?:under|below|less than|fewer than)\s*$/i.test(before)) return 'upper';
  return 'exact';
}

function isApproximate(text: string, start: number): boolean {
  const before = plainContext(text, start);
  return /(?:\babout|\baround|\broughly|\bapproximately|\bapprox\.?|~)\s*$/i.test(before) || text[start - 1] === '~';
}

function countUnitFromText(text: string, end: number): string | undefined {
  const after = text.slice(end);
  if (/^\s*(?:ways?\s+to\s+(?:root|take over\s+linux))/i.test(after)) return 'bugs';
  const match = after.match(/^\s*(?:\/|per\s+)?\s*(root\s+)?(bugs?|vulnerabilities|flaws|exploits?|candidates?|suspects|findings|confirmed|reproduced|fixes|patches|months?|years?|days?|hours?|runs?|accounts?)\b/i);
  if (!match) return undefined;
  const word = match[2]!.toLowerCase();
  if (['bug', 'bugs', 'vulnerabilities', 'flaw', 'flaws'].includes(word)) return 'bugs';
  if (['exploit', 'exploits'].includes(word)) return 'root exploits';
  if (['candidate', 'candidates', 'suspects', 'findings'].includes(word)) return 'candidates';
  if (['confirmed', 'reproduced'].includes(word)) return 'confirmed findings';
  if (['fixes', 'patches'].includes(word)) return 'fixes';
  if (word.startsWith('month')) return 'months';
  if (word.startsWith('year')) return 'years';
  if (word.startsWith('day')) return 'days';
  if (word.startsWith('hour')) return 'hours';
  if (word.startsWith('run')) return 'runs';
  if (word.startsWith('account')) return 'accounts';
  return undefined;
}

function unitFromSurface(text: string, start: number, end: number, currency: string | undefined, suffix: string | undefined): string | undefined {
  const after = text.slice(end);
  const currencyUnit = currency === '$' ? 'USD' : currency === '€' ? 'EUR' : currency === '£' ? 'GBP' : undefined;
  const denominator = after.match(/^\s*(?:\/|per)\s*(bug|bugs|exploit|exploits)\b/i)?.[1];
  if (currencyUnit) return denominator ? `${currencyUnit} per ${denominator.toLowerCase()}` : currencyUnit;
  if (/^(?:%|percent)/i.test(suffix ?? '')) return 'percent';
  if (/^(?:x|×|times)$/i.test(suffix ?? '')) return 'multiplier';
  if (/^\s*(?:US\s*)?dollars?\b/i.test(after)) return 'USD';
  if (/^\s*euros?\b/i.test(after)) return 'EUR';
  if (/^\s*pounds?\b/i.test(after)) return 'GBP';
  const before = text.slice(Math.max(0, start - 16), start);
  if (/\bpercent(?:age)?\s*$/i.test(before)) return 'percent';
  if (/\b(?:times|fold)\s*$/i.test(before)) return 'multiplier';
  return countUnitFromText(text, end);
}

function explicitNumbers(text: string): ParsedNumericText[] {
  const mentions: ParsedNumericText[] = [];
  for (const match of text.matchAll(numberPattern)) {
    const start = match.index ?? 0;
    const raw = match[0].trim();
    const valueText = match.groups?.number?.replaceAll(',', '') ?? raw;
    let value = Number(valueText);
    const scaleText = (match.groups?.scale ?? '').toLowerCase();
    const scale = scaleText === 'k' || scaleText === 'thousand' ? 1_000
      : scaleText === 'm' || scaleText === 'million' ? 1_000_000
        : scaleText === 'b' || scaleText === 'billion' ? 1_000_000_000
          : scaleText === 'trillion' ? 1_000_000_000_000 : 1;
    value *= scale;
    const currency = match.groups?.currency;
    const suffix = match.groups?.percent || match.groups?.multiplier || scaleText;
    const unit = unitFromSurface(text, start, match.index! + match[0].length, currency, suffix);
    const decimals = (valueText.split('.')[1] ?? '').length;
    let step = scale / (10 ** decimals);
    if (scale === 1) {
      const integer = valueText.replace(/^-/, '').split('.')[0] ?? '';
      const zeros = integer.match(/0+$/)?.[0].length ?? 0;
      if (zeros && isApproximate(text, start)) step = 10 ** zeros;
    }
    mentions.push({
      start,
      end: match.index! + match[0].length,
      raw,
      value,
      unit,
      relation: numericRelation(text, start),
      tolerance: Math.max(Number.EPSILON, step / 2),
    });
  }
  return mentions;
}

function wordNumbers(text: string): ParsedNumericText[] {
  const tokens = [...text.matchAll(/[a-z]+/gi)].map(match => ({ word: match[0].toLowerCase(), start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
  const mentions: ParsedNumericText[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let startIndex = i;
    let initialArticle = false;
    if ((tokens[i]?.word === 'a' || tokens[i]?.word === 'an') && (wordScales[tokens[i + 1]?.word ?? ''] || tokens[i + 1]?.word === 'half')) {
      startIndex = i;
      initialArticle = true;
    } else if (!(tokens[i]?.word in wordValues) && tokens[i]?.word !== 'half') {
      continue;
    }
    const start = tokens[startIndex]!.start;
    if (/\beach\s*$/i.test(plainContext(text, start))) continue;
    if (mentions.some(mention => start >= mention.start && start < mention.end)) continue;

    let cursor = initialArticle ? i + 1 : i;
    let current = initialArticle ? 1 : 0;
    let total = 0;
    let consumed = cursor;
    let step = 1;
    let usedScale = false;
    let sawNumber = initialArticle;
    let half = false;

    if (tokens[cursor]?.word === 'half') {
      half = true;
      sawNumber = true;
      current = 0.5;
      step = 0.01;
      consumed = cursor;
    } else {
      for (let j = cursor; j < tokens.length; j++) {
        const token = tokens[j]!;
        if (j > cursor) {
          const gap = text.slice(tokens[j - 1]!.end, token.start);
          if (!/^[\s-]*$/.test(gap)) break;
        }
        if (token.word === 'and' && sawNumber) {
          consumed = j;
          continue;
        }
        const value = wordValues[token.word];
        if (value !== undefined) {
          current += value;
          sawNumber = true;
          consumed = j;
          if (usedScale) step = 1;
          continue;
        }
        const magnitude = wordScales[token.word];
        if (magnitude !== undefined && sawNumber) {
          if (magnitude === 100) {
            current = Math.max(1, current) * magnitude;
          } else {
            total += Math.max(1, current) * magnitude;
            current = 0;
          }
          usedScale = true;
          step = magnitude;
          consumed = j;
          continue;
        }
        break;
      }
    }
    if (!sawNumber) continue;
    const end = tokens[consumed]!.end;
    const value = half ? 0.5 : total + current;
    const after = text.slice(end);
    const nextUnit = after.match(/^\s*(times?|fold|percent(?:age)?|months?|years?|days?|hours?|fixes|bugs?|exploits?|runs?|accounts?)\b/i)?.[1]?.toLowerCase();
    const unit = nextUnit?.startsWith('time') || nextUnit === 'fold' ? 'multiplier'
      : nextUnit?.startsWith('percent') ? 'percent'
        : nextUnit?.startsWith('month') ? 'months'
          : nextUnit?.startsWith('year') ? 'years'
            : nextUnit?.startsWith('day') ? 'days'
              : nextUnit?.startsWith('hour') ? 'hours'
                : nextUnit?.startsWith('fix') ? 'fixes'
                  : nextUnit?.startsWith('bug') ? 'bugs'
                    : nextUnit?.startsWith('exploit') ? 'root exploits'
                      : nextUnit?.startsWith('run') ? 'runs'
                        : nextUnit?.startsWith('account') ? 'accounts' : undefined;
    mentions.push({ start, end, raw: text.slice(start, end), value, unit: half ? 'ratio' : unit, relation: numericRelation(text, start), tolerance: step / 2 });
    i = consumed;
  }
  return mentions;
}

function parseNumericText(text: string): ParsedNumericText[] {
  const explicit = explicitNumbers(text);
  const words = wordNumbers(text).filter(word => !explicit.some(number => word.start < number.end && number.start < word.end));
  return [...explicit, ...words].sort((a, b) => a.start - b.start);
}

/** "Captured 11 Nov 2026" and similar labels state when we read a source, not what the story claims. */
const provenanceLabel = /^\s*(?:captured|retrieved|accessed)\b/i;

function addTextMentions(target: NumberMention[], text: string, scene: number | null, path: string): void {
  if (provenanceLabel.test(text)) return;
  for (const mention of parseNumericText(text)) {
    target.push({ scene, path, raw: mention.raw, value: mention.value, unit: mention.unit, relation: mention.relation, tolerance: mention.tolerance });
  }
}

function collectStrings(value: unknown, path: string, target: { text: string; path: string }[]): void {
  if (typeof value === 'string') {
    target.push({ text: value, path });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectStrings(child, `${path}[${index}]`, target));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (ignoredSceneStringKeys.has(key)) continue;
    collectStrings(child, path ? `${path}.${key}` : key, target);
  }
}

function visibleNumericFields(scene: Record<string, unknown>, index: number, target: NumberMention[]): void {
  if (scene.type === 'stat' && typeof scene.value === 'number') {
    const prefix = typeof scene.prefix === 'string' ? scene.prefix : '';
    const suffix = typeof scene.suffix === 'string' ? scene.suffix : '';
    addTextMentions(target, `${prefix}${scene.value}${suffix}`, index, `scenes[${index}].value`);
    const versus = scene.versus;
    if (versus && typeof versus === 'object' && typeof (versus as Record<string, unknown>).value === 'number') {
      addTextMentions(target, `${prefix}${(versus as Record<string, unknown>).value}${suffix}`, index, `scenes[${index}].versus.value`);
    }
  }
  if (scene.type === 'bars' && Array.isArray(scene.items)) {
    scene.items.forEach((item, itemIndex) => {
      if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).value === 'number') {
        addTextMentions(target, String((item as Record<string, unknown>).value), index, `scenes[${index}].items[${itemIndex}].value`);
      }
    });
  }
}

function overlappingScenes(spec: Record<string, unknown>, start: unknown, end: unknown): number[] {
  if (!Array.isArray(spec.scenes) || typeof start !== 'number' || typeof end !== 'number') return [];
  let cursor = 0;
  const result: number[] = [];
  spec.scenes.forEach((scene, index) => {
    if (!scene || typeof scene !== 'object') return;
    const duration = typeof (scene as Record<string, unknown>).duration === 'number' ? (scene as Record<string, number>).duration : 0;
    const sceneEnd = cursor + duration;
    if (start < sceneEnd && end > cursor) result.push(index);
    cursor = sceneEnd;
  });
  return result;
}

/** Extract numeric claims from visible scene strings, special-scene data, narration and captions. */
export function extractNumberMentions(input: unknown): NumberMention[] {
  if (!input || typeof input !== 'object') return [];
  const spec = input as Record<string, unknown>;
  if (!Array.isArray(spec.scenes)) return [];
  const result: NumberMention[] = [];
  spec.scenes.forEach((scene, index) => {
    if (!scene || typeof scene !== 'object') return;
    const strings: { text: string; path: string }[] = [];
    collectStrings(scene, `scenes[${index}]`, strings);
    strings.forEach(({ text, path }) => addTextMentions(result, text, index, path));
    visibleNumericFields(scene as Record<string, unknown>, index, result);
  });
  if (Array.isArray(spec.captions)) {
    spec.captions.forEach((caption, index) => {
      if (!caption || typeof caption !== 'object' || typeof (caption as Record<string, unknown>).text !== 'string') return;
      const value = caption as Record<string, unknown>;
      const scenes = overlappingScenes(spec, value.start, value.end);
      (scenes.length ? scenes : [null]).forEach(scene => addTextMentions(result, value.text as string, scene, `captions[${index}].text`));
    });
  }
  return result;
}

function canonicalUnit(unit: string | undefined): string | undefined {
  if (!unit) return undefined;
  const value = unit.toLowerCase().trim().replace(/\s+/g, ' ');
  const currency = value.match(/^(usd|us dollars?|eur|euros?|gbp|pounds?)(?: per (?:root )?(bug|bugs|exploit|exploits))?$/);
  if (currency) {
    const code = /^(?:usd|us dollars?)$/.test(currency[1]!) ? 'USD' : /^(?:eur|euros?)$/.test(currency[1]!) ? 'EUR' : 'GBP';
    const denominator = currency[2]?.startsWith('bug') ? 'bug' : currency[2] ? 'exploit' : undefined;
    return `currency:${code}${denominator ? `/per-${denominator}` : ''}`;
  }
  if (/^(?:percent|percentage|pct)$/.test(value)) return 'percent';
  if (/^(?:multiplier|times|fold|x|×)$/.test(value)) return 'multiplier';
  if (/^(?:ratio|fraction)$/.test(value)) return 'ratio';
  if (/^(?:root )?bugs?$|^(?:vulnerabilities|flaws)$/.test(value)) return 'bugs';
  if (/^(?:root )?exploits?$|^(?:unique )?root exploits?$/.test(value)) return 'root exploits';
  if (/^(?:candidates|candidate findings|suspects|findings)$/.test(value)) return 'candidates';
  if (/^(?:confirmed findings|confirmed reports|reproduced findings)$/.test(value)) return 'confirmed findings';
  if (/^(?:fixes|patches)$/.test(value)) return 'fixes';
  if (/^months?$/.test(value)) return 'months';
  if (/^years?$/.test(value)) return 'years';
  if (/^days?$/.test(value)) return 'days';
  if (/^hours?$/.test(value)) return 'hours';
  if (/^runs?$/.test(value)) return 'runs';
  if (/^accounts?$/.test(value)) return 'accounts';
  return value;
}

function unitsCompatible(mention: NumberMention, claim: Claim): boolean {
  const left = canonicalUnit(mention.unit);
  const right = canonicalUnit(claim.unit);
  if (!left || !right) return true;
  return left === right;
}

function supportsValue(mention: NumberMention, claim: Claim): boolean {
  if (claim.value === undefined || !unitsCompatible(mention, claim)) return false;
  if (mention.relation === 'lower') return claim.value >= mention.value - mention.tolerance;
  if (mention.relation === 'upper') return claim.value <= mention.value + mention.tolerance;
  return Math.abs(claim.value - mention.value) <= mention.tolerance;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAttribution(text: string, claim: Claim): boolean {
  const normalized = text.replaceAll('*', '').replace(/\s+/g, ' ');
  if (/\baccording to\b/i.test(normalized) && claim.sources.some(source => new RegExp(`\\b${escapeRegex(source.publisher)}\\b`, 'i').test(normalized))) return true;
  if (/\b(?:source|sources)\s*:/i.test(normalized) && claim.sources.some(source => new RegExp(`\\b${escapeRegex(source.publisher)}\\b`, 'i').test(normalized))) return true;
  return claim.sources.some(source => {
    const publisher = escapeRegex(source.publisher);
    return new RegExp(`\\b${publisher}(?:'s)?\\b.{0,40}\\b(?:says?|said|reports?|reported|states?|stated|numbers|figures|data|results|findings|own numbers)\\b`, 'i').test(normalized)
      || new RegExp(`\\b(?:reported|relayed|published)\\s+by\\s+${publisher}\\b`, 'i').test(normalized)
      || new RegExp(`\\bvia\\s+${publisher}\\b`, 'i').test(normalized);
  });
}

function sceneAttributionText(scene: Record<string, unknown>, spec: Record<string, unknown>, sceneIndex: number): string {
  const pieces: string[] = [];
  if (typeof scene.say === 'string') pieces.push(scene.say);
  if (typeof scene.caption === 'string') pieces.push(scene.caption);
  else if (Array.isArray(scene.caption)) pieces.push(...scene.caption.filter((line): line is string => typeof line === 'string'));
  if (Array.isArray(spec.captions)) {
    spec.captions.forEach(caption => {
      if (!caption || typeof caption !== 'object' || typeof (caption as Record<string, unknown>).text !== 'string') return;
      if (overlappingScenes(spec, (caption as Record<string, unknown>).start, (caption as Record<string, unknown>).end).includes(sceneIndex)) {
        pieces.push((caption as Record<string, string>).text);
      }
    });
  }
  return pieces.join(' ');
}

function issue(code: string, message: string, path?: string, scene?: number): ClaimIssue {
  return { code, message, ...(path ? { path } : {}), ...(scene === undefined ? {} : { scene }) };
}

/** Pure claim/source check. The adjacent ledger is reel-wide unless a scene narrows it with `claims`. */
export function checkClaims(specInput: unknown, ledgerInput: unknown): ClaimCheckReport {
  const errors: ClaimIssue[] = [];
  const warnings: ClaimIssue[] = [];
  const parsedLedger = claimsLedgerSchema.safeParse(ledgerInput);
  if (!parsedLedger.success) {
    const message = parsedLedger.error.issues.map(entry => `${entry.path.join('.') || 'ledger'}: ${entry.message}`).join('; ');
    return { ok: false, errors: [issue('INVALID_LEDGER', message)], warnings, numbers: [], blockedClaims: [] };
  }
  if (!specInput || typeof specInput !== 'object' || !Array.isArray((specInput as Record<string, unknown>).scenes)) {
    return { ok: false, errors: [issue('INVALID_SPEC', 'spec must contain a scenes array')], warnings, numbers: [], blockedClaims: [] };
  }

  const spec = specInput as Record<string, unknown>;
  const scenes = spec.scenes as unknown[];
  const ledger = parsedLedger.data;
  const claimsById = new Map(ledger.claims.map(claim => [claim.id, claim]));
  scenes.forEach((scene, index) => {
    if (!scene || typeof scene !== 'object') return;
    const ids = (scene as Record<string, unknown>).claims;
    if (ids === undefined) return;
    if (!Array.isArray(ids)) {
      errors.push(issue('INVALID_SCENE_CLAIMS', 'scene claims must be an array of claim IDs', `scenes[${index}].claims`, index));
      return;
    }
    ids.forEach((id, idIndex) => {
      if (typeof id !== 'string' || !claimsById.has(id)) {
        errors.push(issue('UNKNOWN_CLAIM_ID', `scene references unknown claim '${String(id)}'`, `scenes[${index}].claims[${idIndex}]`, index));
      }
    });
  });

  const mentions = extractNumberMentions(spec);
  const numbers: NumberCheck[] = mentions.map(mention => {
    let eligible: Claim[];
    if (mention.scene !== null) {
      const scene = scenes[mention.scene] as Record<string, unknown>;
      const sceneIds = scene && Array.isArray(scene.claims) ? scene.claims.filter((id): id is string => typeof id === 'string') : undefined;
      eligible = sceneIds === undefined ? ledger.claims : sceneIds.map(id => claimsById.get(id)).filter((claim): claim is Claim => Boolean(claim));
    } else {
      eligible = ledger.claims;
    }
    const match = eligible.filter(claim => supportsValue(mention, claim)).sort((a, b) => Math.abs((a.value ?? 0) - mention.value) - Math.abs((b.value ?? 0) - mention.value))[0];
    if (!match) {
      const unit = mention.unit ? ` (unit: ${mention.unit})` : '';
      errors.push(issue('UNSUPPORTED_NUMBER', `number '${mention.raw}'${unit} has no supporting claim value`, mention.path, mention.scene ?? undefined));
      return { ...mention, supported: false };
    }
    return { ...mention, supported: true, claimId: match.id, status: match.status };
  });

  // A shared ledger may hold disputed claims; only the claims this reel actually uses can block it.
  const usedClaimIds = new Set<string>(numbers.flatMap(number => number.claimId ? [number.claimId] : []));
  scenes.forEach(scene => {
    const ids = scene && typeof scene === 'object' ? (scene as Record<string, unknown>).claims : undefined;
    if (Array.isArray(ids)) ids.forEach(id => { if (typeof id === 'string' && claimsById.has(id)) usedClaimIds.add(id); });
  });
  const blockedClaims: string[] = [];
  ledger.claims.forEach(claim => {
    if (usedClaimIds.has(claim.id) && (claim.status === 'unverified' || claim.status === 'contested')) {
      blockedClaims.push(claim.id);
      errors.push(issue('CLAIM_STATUS_BLOCKS_PUBLISHING', `claim '${claim.id}' is ${claim.status} and blocks publishing`));
    }
  });

  const attributionWarnings = new Set<string>();
  numbers.forEach(number => {
    if (!number.claimId || number.status !== 'attributed' || number.scene === null) return;
    const claim = claimsById.get(number.claimId)!;
    const scene = scenes[number.scene] as Record<string, unknown>;
    const text = sceneAttributionText(scene, spec, number.scene);
    const key = `${number.scene}:${claim.id}`;
    if (!hasAttribution(text, claim) && !attributionWarnings.has(key)) {
      attributionWarnings.add(key);
      warnings.push(issue('ATTRIBUTION_MISSING', `scene ${number.scene + 1} uses attributed claim '${claim.id}' without attribution wording in its narration or caption`, `scenes[${number.scene}]`, number.scene));
    }
  });

  scenes.forEach((sceneValue, index) => {
    if (!sceneValue || typeof sceneValue !== 'object') return;
    const scene = sceneValue as Record<string, unknown>;
    if (!Array.isArray(scene.claims)) return;
    const text = sceneAttributionText(scene, spec, index);
    for (const id of scene.claims) {
      if (typeof id !== 'string') continue;
      const claim = claimsById.get(id);
      const key = `${index}:${id}`;
      if (claim?.status === 'attributed' && !hasAttribution(text, claim) && !attributionWarnings.has(key)) {
        attributionWarnings.add(key);
        warnings.push(issue('ATTRIBUTION_MISSING', `scene ${index + 1} uses attributed claim '${id}' without attribution wording in its narration or caption`, `scenes[${index}]`, index));
      }
    }
  });

  return { ok: errors.length === 0, errors, warnings, numbers, blockedClaims };
}

// Pure-data catalog of the production shot library, safe to import from the worker (no canvas code).
// Each entry: what the shot shows, and the narration-synced event kinds it animates on (sync[].kind).
export interface ShotCatalogEntry { name: string; describe: string; events: readonly string[] }
export const SHOT_CATALOG: readonly ShotCatalogEntry[] = [
  { name: "borrowedasset", describe: "Hook: a giant asset rockets out of depth into a noir venue lobby; Hedgy snatches it from a chrome lender dock and sells it through a hatch with the tether intact. Params: asset (ticket default; share, coin, banknote), lenderDock, obligationTether, heroAction, cameraEntry, depthLayers.", events: ["sells", "his"] },
  { name: "shortsalehandoff", describe: "A lender hands Hedgy a ticket and clips on its tether; he feeds the ticket through a separate sale slot, catches the cash and receipt, then wears the RETURN 1 stub pinned to his wrist. The camera follows each exchange. Params: asset, salePortal, proceedsContainer, returnReceipt, syncEvents, cameraPath, depthLayers.", events: ["borrows", "sells", "owes"] },
  { name: "pricestair", describe: "A high sale receipt overlooks a descending, perspective price stair; a grey trace falls through the prices and a ghost ticket lands on the lowest step as the full CHEAPER plate lights.", events: ["fall", "cheaper"] },
  { name: "vaultlock", describe: "Sale cash sweeps into a thick glass broker vault; the inset becomes a monumental steel door and wheel that slams shut and locks on collateral, with Hedgy reaching from the foreground.", events: ["money", "collateral"] },
  { name: "waitclock", describe: "A restless Hedgy taps beside a full-frame vault clock as the grey price trace sinks away; params: clockSpeed (0.2\u20135), traceDirection (down/up/flat).", events: ["waits", "fade"] },
  { name: "announcement", describe: "The venue curtains snap open on announces; a REUNION marquee hits with a shock pop as seven balcony tiers and three spotlights ignite on reunion.", events: ["announces", "reunion"] },
  { name: "crowdrush", describe: "Fans surge toward the final ticket window from three balcony depths; the last ticket flies out as its shutter slams. Params: crowdSize, windowsCount, supplyLeft.", events: ["rush", "last"] },
  { name: "priceride", describe: "A camera rides the rising red price pixel past parallax balconies; a dithered loss band opens between Hedgy and his original sale level.", events: ["jump", "losses"] },
  { name: "collateralcall", describe: "The obligation pan sinks on demands; a marked collateral drawer punches out toward Hedgy as the camera pushes between the counter and the scale.", events: ["demands", "collateral"] },
  { name: "forcedbuyback", describe: "Close-up Hedgy turns an empty pouch inside out on pay, then bolts as the buyback kiosk rushes toward the camera.", events: ["pay", "buy"] },
  { name: "buybackhandoff", describe: "Tight counter close-up: the clerk slaps down the buyback money, slides one shared ticket to Hedgy on \u201cback\u201d, then the tether flashes home to the lender rack on \u201cnow\u201d.", events: ["back", "now"] },
  { name: "minimarket", describe: "The camera pulls back from Hedgy holding his buyback ticket to reveal a dwindling rack in a huge buyer-filled hall. On \u201cdemand\u201d one ticket leaves and a buyer token joins; on \u201chigher\u201d the red price path jumps and climbs out of frame.", events: ["demand", "higher"] },
  { name: "demandfeedback", describe: "Three short sellers recoil as the red price rail rockets past, then cover in three timed BUY beats. Hedgy runs the foreground catwalk.", events: ["scaring", "buying"] },
  { name: "squeezerocket", describe: "A red ticket chain rises into a loop around the tower, gets crushed by a hydraulic press, then its stamped ticket rockets through the lens to match the opening.", events: ["loop", "squeeze"] },
];
export const SHOT_NAMES = SHOT_CATALOG.map(entry => entry.name);
export const describeShotCatalog = () => SHOT_CATALOG.map(entry => `${entry.name} [events: ${entry.events.join(', ')}]: ${entry.describe}`).join('\n');
/** Mirror of core.ts TRANSITIONS for worker code that cannot import canvas types (kept equal by motion.test.mjs). */
export const SHOT_TRANSITIONS = ['cut', 'blocks', 'wipe', 'glitch', 'zoom', 'flash', 'shutter', 'push', 'whip', 'zoomthrough', 'shatter', 'pixelsort', 'melt', 'iris', 'cube', 'flip', 'dissolve', 'slice', 'ink', 'match'] as const;

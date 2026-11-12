import {z} from 'zod';
import {SHOT_ITEMS} from '../src/motion/shots/catalog.ts';

/** Distinct, non-obvious finance mechanisms. Each reel explains exactly one; the account rotates through them. */
export const HEDGY_CONCEPTS=[
 {id:'short-selling',name:'Short selling: selling something borrowed and buying it back later'},
 {id:'short-squeeze',name:'Short squeeze: rising prices force short sellers to buy back'},
 {id:'recall-risk',name:'Recall risk: a lender can demand a borrowed asset back early'},
 {id:'bid-ask-spread',name:'Bid-ask spread: the gap between the buying and selling price'},
 {id:'liquidity',name:'Liquidity: how fast something can be sold without dropping the price'},
 {id:'compound-interest',name:'Compound interest: earning returns on earlier returns'},
 {id:'inflation',name:'Inflation: the same money buys less over time'},
 {id:'opportunity-cost',name:'Opportunity cost: the value of the best option you gave up'},
 {id:'leverage',name:'Leverage: borrowed money magnifies both gains and losses'},
 {id:'margin-call',name:'Margin call: a falling price forces you to add cash or sell'},
 {id:'insurance-premium',name:'Insurance and premiums: paying a small certain cost to avoid a large uncertain one'},
 {id:'protective-put',name:'Protective put: paying for the right to sell at a set price'},
 {id:'call-option',name:'Call option: paying a small fee for the right, not the obligation, to buy later'},
 {id:'futures-contract',name:'Futures contract: locking in a price today for a trade in the future'},
 {id:'arbitrage',name:'Arbitrage: buying cheap in one place and selling dear in another until the gap closes'},
 {id:'supply-demand-price',name:'Price discovery: how many buyers and few sellers set a price'},
 {id:'bond-price-rates',name:'Why bond prices fall when interest rates rise'},
 {id:'credit-risk',name:'Credit risk: the borrower might not pay back'},
 {id:'collateral',name:'Collateral: something pledged that the lender keeps if you do not repay'},
 {id:'bank-run',name:'Bank run: banks lend out deposits, so everyone withdrawing at once breaks them'},
 {id:'fractional-reserve',name:'Fractional reserve banking: one deposit becomes several loans'},
 {id:'dollar-cost-averaging',name:'Dollar-cost averaging: buying a fixed amount regularly buys more when prices are low'},
 {id:'volatility-drag',name:'Volatility drag: losing half needs a doubling to recover'},
 {id:'survivorship-bias',name:'Survivorship bias: you only hear about the winners'},
 {id:'market-maker',name:'Market makers: someone always willing to buy and sell, for a small spread'},
 {id:'stock-dilution',name:'Dilution: new shares make each slice of the company smaller'},
 {id:'stock-split',name:'Stock split: more slices of the same pie does not create value'},
 {id:'dividends',name:'Dividends: a company paying part of its profit to owners'},
 {id:'buybacks',name:'Share buybacks: fewer shares, bigger slice for remaining owners'},
 {id:'ipo',name:'IPO: a private company selling slices to the public for the first time'},
 {id:'fees-drag',name:'Fees: a small yearly fee compounds into a large missing amount'},
 {id:'currency-exchange',name:'Exchange rates: the same item costs different amounts in different currencies'},
 {id:'price-elasticity',name:'Price elasticity: some things people buy no matter the price, others they skip'},
 {id:'moral-hazard',name:'Moral hazard: being protected from risk makes people take more of it'},
 {id:'adverse-selection',name:'Adverse selection: the riskiest people are most eager to buy insurance'},
 {id:'bubble',name:'Bubbles: prices rising only because people expect them to keep rising'},
 {id:'panic-selling',name:'Panic selling: everyone selling at once pushes prices below fair value'},
 {id:'time-value-of-money',name:'Time value of money: a coin today is worth more than a coin next year'},
 {id:'yield-chasing',name:'Chasing yield: higher promised returns come with hidden risk'},
 {id:'counterparty-risk',name:'Counterparty risk: your contract is only as good as the one who signed it'},
 {id:'hedging-cost',name:'The cost of hedging: protection gives up some upside'},
 {id:'correlation-crash',name:'Correlation: in a crash, things that usually move apart fall together'},
] as const;
export type HedgyConceptId=(typeof HEDGY_CONCEPTS)[number]['id'];
/** Hedgy scores are always action / electric: driving or dark-driving. Never happy, playful or lo-fi. */
export const HEDGY_MOODS=['drive','tense'] as const;
export const HEDGY_MUSIC_STYLE='High-energy electronic ACTION score (think heist/chase trailer, cyberpunk, electro, darksynth, drum-and-bass, industrial, electric guitar riffs): punchy drums, distorted or pulsing synth bass, 120–150 BPM, tense and propulsive. Never happy, cute, playful, whimsical, jazzy, acoustic, lo-fi, swing, chamber or orchestral-comedy.';

/** What a past reel used; built from stored provenance (or a title for older reels). */
export interface HedgyHistoryEntry {title?:string;concept?:string;item?:string;music?:string;musicBrief?:string;setting?:string;summary?:string}

export const ideaSchema=z.object({
 concept:z.string(),
 angle:z.string().min(1).max(240),
 setting:z.string().min(1).max(160),
 heroItem:z.enum(SHOT_ITEMS as unknown as [string,...string[]]),
 supportingItems:z.array(z.enum(SHOT_ITEMS as unknown as [string,...string[]])).max(4),
 cast:z.array(z.string().min(1).max(30)).min(1).max(3),
 hook:z.string().min(1).max(160),
 music:z.enum(HEDGY_MOODS),
 musicBrief:z.string().min(40).max(400),
}).strict();
export type HedgyIdea=z.infer<typeof ideaSchema>;

const shuffle=<T,>(list:readonly T[],random:()=>number)=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];}return a;};

/** Concepts never used before come first (random order); otherwise the least recently used. */
export function conceptCandidates(history:HedgyHistoryEntry[],count=5,random=Math.random){
 const used=history.map(h=>h.concept).filter(Boolean) as string[];
 const fresh=shuffle(HEDGY_CONCEPTS.filter(c=>!used.includes(c.id)),random);
 if(fresh.length>=count)return fresh.slice(0,count);
 const lastUse=(id:string)=>used.indexOf(id);// history is newest first; a larger index = longer ago
 const old=HEDGY_CONCEPTS.filter(c=>used.includes(c.id)).sort((a,b)=>lastUse(b.id)-lastUse(a.id));
 return [...fresh,...old].slice(0,count);
}
/** Items and moods that the next reel must avoid. */
export function recentlyUsed(history:HedgyHistoryEntry[]){
 const items=[...new Set(history.slice(0,10).map(h=>h.item).filter(Boolean) as string[])];
 const lastMood=history.find(h=>h.music)?.music;
 const moods=HEDGY_MOODS.filter(m=>m!==lastMood);
 return {items,moods};
}
/** Problems that make an idea repeat earlier reels; empty when it is acceptable. */
export function ideaProblems(idea:HedgyIdea,candidates:readonly {id:string}[],history:HedgyHistoryEntry[]){
 const {items,moods}=recentlyUsed(history),problems:string[]=[];
 if(!candidates.some(c=>c.id===idea.concept))problems.push(`concept must be one of: ${candidates.map(c=>c.id).join(', ')}`);
 if(items.includes(idea.heroItem))problems.push(`heroItem ${idea.heroItem} was used recently; choose another`);
 if(!moods.includes(idea.music))problems.push(`music must be one of: ${moods.join(', ')}`);
 return problems;
}

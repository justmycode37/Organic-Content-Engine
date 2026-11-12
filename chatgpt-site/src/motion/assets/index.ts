import { FINANCE_ASSETS } from './finance.ts';
import { INFRA_ASSETS } from './infrastructure.ts';
import { OBJECT_ASSETS } from './objects.ts';
import { TRANSPORT_ASSETS } from './transport.ts';
import type { AssetFactory, AssetModel, AssetOptions } from './common.ts';

export * from './common.ts';
export { coin, coinStack, coinPile, banknote, banknoteBundle, ingot, piggyBank, wallet, creditCard, bank, vaultDoor, vault, safe, ticker, candlestick, barChart, lineChart, arrow, hourglass, clock, calculator, briefcase, phone, atm, printingPress, moneyPrinter, receipt } from './finance.ts';
export { house, apartmentTower, skyscraper, cityBlock, factoryBuilding, oilBarrel, shippingContainer, cargoShip } from './infrastructure.ts';
export { truck, airplane, rocket, parachute, umbrella } from './transport.ts';
export { shield, padlock, key, balanceScale, dice, trophy, crown, magnet, ladder, seesaw, ropeBridge, bomb, dominoRow, houseOfCards, bubble, balloon, anvil, gear, conveyorBelt, bull, bear, laptop, shoppingCart } from './objects.ts';

/** Every model is a pure factory. Generators accept bounded detail/count/seed options. */
export const ASSETS = Object.freeze({
  ...FINANCE_ASSETS,
  ...INFRA_ASSETS,
  ...TRANSPORT_ASSETS,
  ...OBJECT_ASSETS,
});
export type AssetName = keyof typeof ASSETS;
export const ASSET_NAMES = Object.freeze(Object.keys(ASSETS) as AssetName[]);
export function getAsset(name: AssetName, opts?: AssetOptions): AssetModel {
  return ASSETS[name](opts);
}


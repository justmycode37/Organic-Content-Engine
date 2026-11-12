import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const directory = new URL('../../motion-examples/assets/breaking/', import.meta.url);
const rack = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><path d="M112 60H470L520 110V730H112Z" fill="#111" stroke="#fff" stroke-width="12"/><path d="M470 60V680L520 730V110Z" fill="#444" stroke="#fff" stroke-width="8"/>${Array.from({ length: 6 }, (_, index) => `<g transform="translate(140 ${100 + index * 90})"><rect width="304" height="68" fill="#ddd"/><rect x="16" y="18" width="190" height="9" fill="#222"/><rect x="16" y="38" width="190" height="9" fill="#222"/><circle cx="264" cy="34" r="12" fill="#111"/></g>`).join('')}<rect x="146" y="666" width="290" height="34" fill="#fff"/><path d="M90 744H538V776H90Z" fill="#111" stroke="#fff" stroke-width="10"/></svg>`;
const terminal = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><path d="M60 70H740V480H60Z" fill="#111" stroke="#fff" stroke-width="18"/><path d="M60 140H740" stroke="#fff" stroke-width="10"/><path d="M132 222L198 268L132 314M232 322H348" fill="none" stroke="#fff" stroke-width="24"/><path d="M350 490V530H260V560H540V530H450V490" fill="#111" stroke="#fff" stroke-width="12"/></svg>`;
for (const [name, svg] of [['server-rack', rack], ['terminal', terminal]]) {
  await writeFile(new URL(`${name}.svg`, directory), svg);
  await sharp(Buffer.from(svg)).png().toFile(new URL(`${name}.png`, directory).pathname);
}
console.log('Created original transparent server-rack and terminal illustrations.');

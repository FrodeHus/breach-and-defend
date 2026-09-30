// npm run playtest -- [seeds]: prints the balance table for the given number of seeds (default 50).
import {playtest, report} from './playtest.mjs';

const n = Number(process.argv[2] ?? 50);
console.log(report(playtest(Array.from({length: n}, (_, i) => i + 1))));

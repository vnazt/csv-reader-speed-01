// Harness driver for csv-reader-speed-01. The harness starts `node /bot/main.ts`:
// it loads every case from cases.json in the input directory, answers each case
// on its own with run() from ./solve.js, and writes the answers, in case order,
// to answers.json in the output directory. Outside the sandbox the directories
// come from MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR, defaulting to /input and
// /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Keep V8's incremental marker off for everything solve.js does, set before
// the module is imported so the whole run happens under it.
setFlagsFromString('--no-incremental-marking');

const solve = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];

// Answer each case alone, in order, into a preallocated array: no case's work
// may leak into another's, and the array's shape is fixed before the loop runs.
const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) answers[i] = solve.run(cases[i]!.input);
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));

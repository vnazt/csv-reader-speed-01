// Harness driver for csv-reader-speed-01. The harness starts `node /bot/main.ts`
// and times the whole process, so this driver treats every phase as scored:
// it loads every case from cases.json in the input directory, answers each
// case on its own with run() from ./solve.js, and writes the answers, in case
// order, to answers.json in the output directory. Outside the sandbox the
// directories come from MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR, defaulting to
// /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const solve = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

// V8's incremental marking stays ON here. The house driver turns it off, but
// a run of this program retains every answer (some 12 MB of strings in over
// a hundred thousand arrays) while it works, and with marking off each major
// collection walks that whole live heap at once; measured on the practice
// set through this driver, leaving marking on is the faster setting.

// Warm the reader's code paths before the first real case: run() compiles
// and tiers up on a small synthetic text that exercises plain fields, quoted
// fields with doubled quotes and embedded breaks, a stray CR, an
// unterminated quote re-read as plain text, and junk after a closing quote.
// The answers are thrown away; nothing from any real case is seen, kept or
// reused — each case below is still answered alone, from its own input.
const warmRow =
  'alpha,beta,"gam\nma","de""lta",eps\r\n"zeta\r\neta",theta,iota,"unterm\rjunk,mu\n';
const warmText = warmRow.repeat(700);
solve.run({ text: warmText, header: true });
solve.run({ text: warmText, header: false });

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The cases file is read as bytes and decoded in one explicit step: timed
// through the whole process, that measured faster than the 'utf8'
// convenience form of readFileSync.
const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json')).toString('utf8')) as {
  id: string;
  input: unknown;
}[];

// Answer each case alone, in order, into a preallocated array: no case's work
// may leak into another's, and the array's shape is fixed before the loop runs.
const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) answers[i] = solve.run(cases[i]!.input);
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));

# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/vnazt/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/vnazt/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast single-pass reader for damaged CSV, entered in make.fun's
csv-reader-speed-01. It reads each case's text once, left to right, and answers
`{columns, rows, errors}` under the contest's broken-row policy: a leading BOM
is dropped, records end at LF or CRLF, stray CRs outside quotes are dropped and
reported, quoted fields collapse doubled quotes and read CRs as LFs, text glued
after a closing quote is kept and reported, a quote that never closes is read
again as unquoted text, and every record is padded or cut to the first record's
width with the damage itemised in `errors`.

It is built for speed without giving up a single one of those readings: an
unquoted field is a single slice of the input between special characters, and
a quoted field is a single slice too whenever its body holds neither a doubled
quote nor a CR. Only genuinely tangled fields are assembled from segment
slices. No dependencies, no state between cases.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<out dir> node main.ts
```

`main.ts` is the harness driver: it answers each case in `cases.json` with
`solve.js`'s `run(input)` and writes `answers.json` in case order.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ws8tc7yd&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

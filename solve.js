// A fast single-pass reader for damaged CSV, written for the csv-reader-speed-01
// harness. run(input) takes {text, header} and answers {columns, rows, errors}
// under the contest's broken-row policy:
//
//   - one U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF; a line holding no characters is no record;
//   - a CR outside quotes that is not part of a CRLF is dropped (stray_cr);
//   - a field opening with a quote runs to the next quote that is not doubled,
//     a doubled quote inside it is one quote, and every CRLF or lone CR inside
//     it is read as one LF; whatever follows the closing quote, up to the next
//     comma or line break, is glued onto the field as it stands (quote_junk,
//     reported when the field ends and something was glued);
//   - a quote that never closes counts as a literal character and the rest of
//     the field is read again as unquoted text (unterminated_quote);
//   - a quote inside an unquoted field is an ordinary character; fields are
//     never trimmed or converted, they stay the strings they are;
//   - columns is the first record when header is true, else null; every later
//     record is padded with empty strings (short_row, with fields: its count)
//     or cut (long_row, with extra: the fields cut) to the first record's
//     width;
//   - errors are {code, line, row} in the order they are met: line is the
//     1-based line the record starts on, counting every LF, CRLF and lone CR
//     inside quoted fields; row is the record's index in rows, null for the
//     header.
//
// How it is fast: fields are almost never built character by character. An
// unquoted field is one slice of the input between two special characters,
// found by a tight code scan; a quoted field is found by searching for quote
// characters and is likewise one slice whenever its body holds neither a
// doubled quote nor a CR. Only the genuinely tangled fields (stray CRs,
// escapes, CRs inside quotes) are assembled from segment slices, and only
// then. No dependencies, no state between calls.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of text. */
const AT_COMMA = 0;
const AT_BREAK = 1;
const AT_END = 2;

const CH_COMMA = 44;
const CH_LF = 10;
const CH_CR = 13;
const CH_QUOTE = 34;

/** The answer for one case: the same reading the policy above gives. */
export function run(input) {
  const raw = input.text;
  const text = typeof raw === 'string' ? raw : String(raw);
  const header = input.header === true;
  const len = text.length;

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // index of the next character to read
  let line = 1; // 1-based line that character sits on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record under construction: the line it starts on, and the index it
  // will take in rows (null while it could still be the header).
  let recordLine = 1;
  let recordRow = null;

  // Reads an unquoted stretch starting at pos, on top of `prefix` ('' for an
  // ordinary field, the opening quote for a re-read, the quoted body for junk
  // after a closing quote). Stops at the first comma or line break. A CR that
  // is not part of a CRLF is dropped and reported; the kept text is then
  // assembled from the slices between those drops. Returns the field value,
  // how it ended, and how many characters were kept past the prefix.
  function scanPlain(prefix) {
    let parts = null; // segment slices, allocated only once a stray CR splits the field
    let segFrom = pos;
    let i = pos;
    let kept = 0;
    for (;;) {
      while (i < len) {
        const c = text.charCodeAt(i);
        if (c === CH_COMMA || c === CH_LF || c === CH_CR) break;
        i += 1;
      }
      if (i >= len) {
        kept += len - segFrom;
        pos = len;
        if (parts === null) return { value: prefix + text.slice(segFrom, len), ended: AT_END, kept };
        parts.push(text.slice(segFrom, len));
        return { value: parts.join(''), ended: AT_END, kept };
      }
      const c = text.charCodeAt(i);
      if (c === CH_COMMA) {
        kept += i - segFrom;
        pos = i + 1;
        if (parts === null) return { value: prefix + text.slice(segFrom, i), ended: AT_COMMA, kept };
        parts.push(text.slice(segFrom, i));
        return { value: parts.join(''), ended: AT_COMMA, kept };
      }
      if (c === CH_LF || (i + 1 < len && text.charCodeAt(i + 1) === CH_LF)) {
        // LF, or CRLF: either way the record ends and one line is counted.
        kept += i - segFrom;
        pos = i + (c === CH_LF ? 1 : 2);
        line += 1;
        if (parts === null) return { value: prefix + text.slice(segFrom, i), ended: AT_BREAK, kept };
        parts.push(text.slice(segFrom, i));
        return { value: parts.join(''), ended: AT_BREAK, kept };
      }
      // A CR with no LF after it: dropped, reported, reading goes on.
      if (parts === null) parts = [prefix + text.slice(segFrom, i)];
      else parts.push(text.slice(segFrom, i));
      kept += i - segFrom;
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      i += 1;
      segFrom = i;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function scanQuoted() {
    const bodyFrom = pos + 1;
    // Find the closing quote: the first quote that is not doubled.
    let close = -1;
    let doubled = false;
    let j = bodyFrom;
    for (;;) {
      const q = text.indexOf('"', j);
      if (q === -1) break;
      if (q + 1 < len && text.charCodeAt(q + 1) === CH_QUOTE) {
        doubled = true;
        j = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // Never closed: the quote is a literal character and the rest of the
      // field is read again as unquoted text.
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = bodyFrom;
      return scanPlain('"');
    }
    const crAt = text.indexOf('\r', bodyFrom);
    let value;
    if (!doubled && (crAt === -1 || crAt >= close)) {
      // Clean body: one slice; only the line count needs the LFs inside it.
      value = text.slice(bodyFrom, close);
      let k = bodyFrom;
      for (;;) {
        const n = text.indexOf('\n', k);
        if (n === -1 || n >= close) break;
        line += 1;
        k = n + 1;
      }
    } else {
      // Tangled body: rebuild it segment by segment, collapsing doubled
      // quotes and reading each CR (alone or in a CRLF) as one LF.
      const parts = [];
      let segFrom = bodyFrom;
      let k = bodyFrom;
      while (k < close) {
        const c = text.charCodeAt(k);
        if (c === CH_QUOTE) {
          if (segFrom < k) parts.push(text.slice(segFrom, k));
          parts.push('"');
          k += 2;
          segFrom = k;
        } else if (c === CH_CR) {
          if (segFrom < k) parts.push(text.slice(segFrom, k));
          parts.push('\n');
          line += 1;
          k += k + 1 < close && text.charCodeAt(k + 1) === CH_LF ? 2 : 1;
          segFrom = k;
        } else {
          if (c === CH_LF) line += 1;
          k += 1;
        }
      }
      if (segFrom < close) parts.push(text.slice(segFrom, close));
      value = parts.join('');
    }
    pos = close + 1;
    if (pos >= len) return { value, ended: AT_END };
    const c = text.charCodeAt(pos);
    if (c === CH_COMMA) {
      pos += 1;
      return { value, ended: AT_COMMA };
    }
    if (c === CH_LF) {
      pos += 1;
      line += 1;
      return { value, ended: AT_BREAK };
    }
    if (c === CH_CR && pos + 1 < len && text.charCodeAt(pos + 1) === CH_LF) {
      pos += 2;
      line += 1;
      return { value, ended: AT_BREAK };
    }
    // Anything else after the closing quote is glued on as it stands.
    const glued = scanPlain(value);
    if (glued.kept > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return glued;
  }

  for (;;) {
    // Lines holding no characters are no records: skip bare LF and CRLF.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === CH_LF) {
        pos += 1;
        line += 1;
      } else if (c === CH_CR && pos + 1 < len && text.charCodeAt(pos + 1) === CH_LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = pos < len && text.charCodeAt(pos) === CH_QUOTE;
      field = quoted ? scanQuoted() : scanPlain('');
      fields.push(field.value);
    } while (field.ended === AT_COMMA);

    // A line that held nothing but dropped CRs is no record either; the
    // errors it raised stay.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? columns ?? [] : null, rows, errors };
}

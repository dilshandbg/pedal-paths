/**
 * Minimal RFC 4180 CSV parser. It handles quoted fields, escaped quotes (`""`), commas and line
 * breaks inside quotes, CRLF/LF line endings and a leading BOM. Strava's `activities.csv` needs all
 * of these, because activity descriptions can contain commas and multi-line text.
 *
 * Returns rows of raw string cells. A trailing empty line is not returned as a row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += char;
      }
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      endRow();
      if (text[i + 1] === '\n') {
        i += 1;
      }
    } else {
      field += char;
    }
    i += 1;
  }

  if (field !== '' || row.length > 0) {
    endRow();
  }

  return rows;
}

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/services/strava-export/csv';

describe('parseCsv', () => {
  it('splits simple rows and fields', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas, escaped quotes and line breaks inside quoted fields', () => {
    const text = 'id,description\n1,"Hills, wind and ""fun""\nsecond line"\n2,plain\n';
    expect(parseCsv(text)).toEqual([
      ['id', 'description'],
      ['1', 'Hills, wind and "fun"\nsecond line'],
      ['2', 'plain'],
    ]);
  });

  it('handles CRLF line endings and a UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty fields and a last row without a trailing newline', () => {
    expect(parseCsv('a,,c\n,,')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });

  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

// Tolkar en vys SQL: vilka tabeller den läser från och vilka källkolumner varje vykolumn bygger på.
// Avsedd för SELECT-vyer i semantiska lagret. Klarar uttryck, funktioner, alias och JOIN.

export interface ColumnMapping {
  sourceCol: string;
  targetCol: string;
  sourceTable?: string; // tabellen som den tolkades från, så som den står i sourceTables
  expression?: string;  // satt när vykolumnen är ett uttryck och inte en ren kolumn
}

export interface TableRefs {
  sourceTables: string[];            // "schema.tabell" utan citattecken
  aliases: Record<string, string>;   // alias/tabellnamn (gemener) -> sourceTables-värde
}

const NOT_A_FUNCTION = new Set([
  'FROM', 'JOIN', 'IN', 'AS', 'ON', 'AND', 'OR', 'WHERE', 'SELECT', 'EXISTS', 'NOT', 'UNION', 'ALL', 'ANY', 'SOME',
  'LATERAL', 'OVER', 'BY', 'HAVING', 'WHEN', 'THEN', 'ELSE', 'CASE', 'DISTINCT', 'USING', 'VALUES', 'WITH',
  'INTERSECT', 'EXCEPT', 'FILTER',
]);
const NOT_A_TABLE = new Set(['SELECT', 'LATERAL', 'ONLY', 'VALUES', 'UNNEST']);
const NOT_AN_ALIAS = new Set([
  'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'NATURAL', 'ON', 'GROUP', 'ORDER', 'LIMIT', 'UNION',
  'USING', 'HAVING', 'WINDOW', 'OFFSET', 'FETCH', 'EXCEPT', 'INTERSECT', 'AS',
]);

const unquote = (s: string) => s.replace(/"/g, '');

/** Ersätter strängar och kommentarer med blanksteg, med bibehållen längd, så att positioner stämmer mot originalet. */
function mask(sql: string): string {
  const blank = (m: string) => ' '.repeat(m.length);
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/--[^\n]*/g, blank)
    .replace(/'(?:[^']|'')*'/g, m => "'" + ' '.repeat(Math.max(0, m.length - 2)) + "'");
}

/** depth[i] = parentesdjup vid position i. inFunc[i] = sant om positionen ligger i ett funktionsanrop. */
function scan(s: string): { depth: number[]; inFunc: boolean[] } {
  const depth = new Array<number>(s.length).fill(0);
  const inFunc = new Array<boolean>(s.length).fill(false);
  const stack: boolean[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ')') stack.pop();
    depth[i] = stack.length;
    inFunc[i] = stack.some(Boolean);
    if (ch === '(') {
      let j = i - 1;
      while (j >= 0 && /\s/.test(s[j])) j--;
      let isFunc = false;
      if (j >= 0 && /[\w"]/.test(s[j])) {
        let k = j;
        while (k >= 0 && /\w/.test(s[k])) k--;
        isFunc = !NOT_A_FUNCTION.has(s.slice(k + 1, j + 1).toUpperCase());
      }
      stack.push(isFunc);
    }
  }
  return { depth, inFunc };
}

const IDENT = '(?:"[^"]+"|[A-Za-z_]\\w*)';

export function extractTableRefs(sql: string): TableRefs {
  const s = mask(sql ?? '');
  const { inFunc } = scan(s);
  const sourceTables: string[] = [];
  const aliases: Record<string, string> = {};
  // Namn på CTE:er (WITH x AS (...)) är inga källtabeller
  const cteNames = new Set<string>();
  for (const m of s.matchAll(new RegExp(`(?:\\bWITH\\b|,)\\s*(${IDENT})\\s+AS\\s*\\(`, 'gi'))) cteNames.add(unquote(m[1]).toLowerCase());

  const re = new RegExp(
    `\\b(?:FROM|JOIN)\\s+\\(*\\s*(${IDENT}(?:\\s*\\.\\s*${IDENT})?)(?![\\w"])(?!\\s*\\()(?:\\s+(?:AS\\s+)?([A-Za-z_]\\w*))?`,
    'gi',
  );
  for (const m of s.matchAll(re)) {
    if (inFunc[m.index ?? 0]) continue; // t.ex. EXTRACT(year FROM kolumn)
    const table = unquote(m[1]).replace(/\s+/g, '');
    if (NOT_A_TABLE.has(table.toUpperCase()) || cteNames.has(table.toLowerCase())) continue;
    if (!sourceTables.includes(table)) sourceTables.push(table);
    const bare = table.split('.').pop()!.toLowerCase();
    if (!aliases[bare]) aliases[bare] = table;
    const alias = m[2];
    if (alias && !NOT_AN_ALIAS.has(alias.toUpperCase())) aliases[alias.toLowerCase()] = table;
  }
  return { sourceTables, aliases };
}

/** Texten mellan huvudfrågans SELECT och FROM, plus startposition i originalet. */
function selectList(s: string, depth: number[]): { start: number; end: number } | null {
  let selectAt = -1;
  for (const m of s.matchAll(/\bSELECT\b/gi)) {
    if (depth[m.index!] === 0) { selectAt = m.index! + m[0].length; break; }
  }
  if (selectAt < 0) {
    const first = s.search(/\bSELECT\b/i);
    if (first < 0) return null;
    selectAt = first + 6;
  }
  const base = depth[selectAt - 1] ?? 0;
  const fromRe = /\bFROM\b/gi;
  fromRe.lastIndex = selectAt;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(s)) !== null) {
    if (depth[m.index] === base) return { start: selectAt, end: m.index };
  }
  return { start: selectAt, end: s.length };
}

function splitTopLevel(s: string, depth: number[], start: number, end: number): { from: number; to: number }[] {
  const base = depth[start] ?? 0;
  const parts: { from: number; to: number }[] = [];
  let from = start;
  for (let i = start; i < end; i++) {
    if (s[i] === ',' && depth[i] === base) { parts.push({ from, to: i }); from = i + 1; }
  }
  parts.push({ from, to: end });
  return parts;
}

const SIMPLE_COL = new RegExp(`^(?:(${IDENT})\\s*\\.\\s*)?(${IDENT})$`);

/**
 * @param tableColumns kolumner per källtabell (nyckel = värde i sourceTables). Tom/okänd tabell tolkas försiktigt.
 */
export function extractColumnMappings(
  sql: string,
  refs: TableRefs,
  tableColumns: Record<string, string[]>,
): ColumnMapping[] {
  const original = sql ?? '';
  const s = mask(original);
  const { depth } = scan(s);
  const list = selectList(s, depth);
  if (!list) return [];

  const colsLower: Record<string, Set<string>> = {};
  for (const t of refs.sourceTables) colsLower[t] = new Set((tableColumns[t] ?? []).map(c => c.toLowerCase()));
  const anyKnown = refs.sourceTables.some(t => colsLower[t].size > 0);

  const tableFor = (qualifier: string | undefined, col: string): string | undefined | null => {
    const c = col.toLowerCase();
    if (qualifier) {
      const t = refs.aliases[qualifier.toLowerCase()];
      if (!t) return null; // okänt alias, t.ex. underfråga
      if (colsLower[t].size > 0 && !colsLower[t].has(c)) return null;
      return t;
    }
    const owner = refs.sourceTables.find(t => colsLower[t].has(c));
    if (owner) return owner;
    return anyKnown ? null : refs.sourceTables[0];
  };

  const mappings: ColumnMapping[] = [];
  const seen = new Set<string>();
  const add = (m: ColumnMapping) => {
    const key = `${m.sourceTable ?? ''}|${m.sourceCol.toLowerCase()}|${m.targetCol.toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); mappings.push(m); }
  };

  splitTopLevel(s, depth, list.start, list.end).forEach((part, idx) => {
    let masked = s.slice(part.from, part.to);
    let orig = original.slice(part.from, part.to);
    const lead = masked.length - masked.trimStart().length;
    masked = masked.trim();
    orig = orig.slice(lead, lead + masked.length);
    if (idx === 0) {
      const d = masked.match(/^DISTINCT\s+(?:ON\s*\([^)]*\)\s*)?/i);
      if (d) { masked = masked.slice(d[0].length); orig = orig.slice(d[0].length); }
    }
    if (!masked || masked === '*') return;

    let target: string;
    let exprMasked = masked;
    let exprOrig = orig;
    const as = masked.match(/^([\s\S]+)\s+AS\s+("[^"]+"|\w+)\s*$/i);
    const simple = masked.match(SIMPLE_COL);
    if (as) {
      target = unquote(as[2]);
      exprMasked = as[1].trim();
      exprOrig = orig.slice(0, as[1].length).trim();
    } else if (simple) {
      target = unquote(simple[2]);
    } else {
      return; // uttryck utan alias
    }

    const isSimple = SIMPLE_COL.test(exprMasked);
    const expression = isSimple ? undefined : exprOrig.replace(/\s+/g, ' ');

    if (isSimple) {
      const sm = exprMasked.match(SIMPLE_COL)!;
      const col = unquote(sm[2]);
      const t = tableFor(sm[1] ? unquote(sm[1]) : undefined, col);
      if (t !== null) add({ sourceCol: col, targetCol: target, sourceTable: t });
      return;
    }

    // Uttryck: plocka ut alla kolumnreferenser
    const cleaned = exprMasked
      .replace(/::\s*"?[A-Za-z_]\w*"?(?:\s+(?:without|with)\s+time\s+zone|\s+varying|\s+precision)?(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?/gi, m => ' '.repeat(m.length))
      .replace(/\bEXTRACT\s*\(\s*\w+\s+FROM\b/gi, m => 'EXTRACT(' + ' '.repeat(m.length - 8))
      .replace(/\bAS\s+[A-Za-z_][\w ]*?(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?(?=\s*\))/gi, m => ' '.repeat(m.length)); // CAST(x AS typ)
    const ref = new RegExp(`(?:(${IDENT})\\s*\\.\\s*)?(${IDENT})(\\s*\\()?`, 'g');
    for (const m of cleaned.matchAll(ref)) {
      if (m[3]) continue; // funktionsnamn
      const col = unquote(m[2]);
      if (!m[1] && !anyKnown) continue; // utan kolumnkännedom går uttryck inte att tolka säkert
      const t = tableFor(m[1] ? unquote(m[1]) : undefined, col);
      if (t === null || t === undefined) continue;
      if (!colsLower[t].has(col.toLowerCase()) && colsLower[t].size > 0) continue;
      add({ sourceCol: col, targetCol: target, sourceTable: t, expression });
    }
  });

  return mappings;
}

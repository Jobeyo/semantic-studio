import { Client } from 'pg';

// Läser ETL-flödets lineage (källfil -> Core -> data mart) ur en vy som ETL-verktyget underhåller,
// och kopplar den mot de tabeller som affärsmodellens vyer läser från.
//
// Källan anges per modell i sourceConfig (lineageDatabase, lineageView) eller globalt via
// miljövariablerna LINEAGE_DATABASE och LINEAGE_VIEW. Samma server och inloggning som datakällan används
// om inte lineageUser/lineagePassword anges.
//
// Förväntade kolumner i vyn:
//   sourcefile, sourcefilehierarchy, sourcefilecolumn, sourcefilecolumndescription, sourcefilecolumndatatype,
//   hassensitivedata, loadingtransformation, wherecondition,
//   coremodeltable, coremodelcolumn, coremodelcolumndescription, coremodelcolumndatatype,
//   datamart, loadingexpression, datamarttable, datamartcolumn, datamartcolumndescription, datamartcolumndatatype

export interface UpstreamColumn {
  column: string;               // kolumnen i tabellen som affärsmodellen läser (Core- eller data mart-kolumn)
  sourceFile: string | null;
  sourceHierarchy: string | null;
  sourceColumn: string | null;
  sourceDescription: string | null;
  sourceDataType: string | null;
  sensitive: boolean;
  transformation: string | null;    // laddning källa -> Core
  whereCondition: string | null;
  coreTable: string | null;
  coreColumn: string | null;
  coreDescription: string | null;
  coreDataType: string | null;
  datamart: string | null;
  datamartTable: string | null;
  datamartColumn: string | null;
  datamartDescription: string | null;
  loadingExpression: string | null; // laddning Core -> data mart
}

export interface UpstreamTable {
  layer: 'core' | 'datamart'; // vilket lager affärsmodellens källtabell tillhör
  columns: UpstreamColumn[];
}

export interface EtlLineage {
  configured: boolean;
  source?: string;  // "databas.schema.vy"
  error?: string;
  tables: Record<string, UpstreamTable>; // nyckel = källtabell så som den står i vyns SQL
}

const IDENT = /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)?$/;
const str = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
const lc = (v: unknown) => String(v ?? '').trim().toLowerCase();

export async function loadEtlLineage(cfg: any, sourceTables: string[]): Promise<EtlLineage> {
  const database = str(cfg?.lineageDatabase) ?? str(process.env.LINEAGE_DATABASE);
  const view = str(cfg?.lineageView) ?? str(process.env.LINEAGE_VIEW);
  if (!database || !view) return { configured: false, tables: {} };
  const source = `${database}.${view}`;
  if (!IDENT.test(view)) return { configured: true, source, error: 'Ogiltigt namn på lineage-vyn', tables: {} };

  let rows: Record<string, unknown>[] = [];
  const client = new Client({
    host: cfg.host, port: cfg.port ?? 5432, database,
    user: str(cfg.lineageUser) ?? cfg.user,
    password: str(cfg.lineagePassword) ?? cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const res = await client.query(`SELECT * FROM ${view}`); // namnet är validerat mot IDENT ovan
    rows = res.rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v])));
  } catch (e) {
    return { configured: true, source, error: (e as Error).message, tables: {} };
  } finally {
    try { await client.end(); } catch {}
  }

  const toColumn = (r: Record<string, unknown>, layer: 'core' | 'datamart'): UpstreamColumn | null => {
    const column = str(layer === 'datamart' ? r.datamartcolumn : r.coremodelcolumn);
    if (!column) return null;
    return {
      column,
      sourceFile: str(r.sourcefile),
      sourceHierarchy: str(r.sourcefilehierarchy),
      sourceColumn: str(r.sourcefilecolumn),
      sourceDescription: str(r.sourcefilecolumndescription),
      sourceDataType: str(r.sourcefilecolumndatatype),
      sensitive: Number(r.hassensitivedata ?? 0) > 0,
      transformation: str(r.loadingtransformation),
      whereCondition: str(r.wherecondition),
      coreTable: str(r.coremodeltable),
      coreColumn: str(r.coremodelcolumn),
      coreDescription: str(r.coremodelcolumndescription),
      coreDataType: str(r.coremodelcolumndatatype),
      datamart: str(r.datamart),
      datamartTable: str(r.datamarttable),
      datamartColumn: str(r.datamartcolumn),
      datamartDescription: str(r.datamartcolumndescription),
      loadingExpression: str(r.loadingexpression),
    };
  };

  const tables: Record<string, UpstreamTable> = {};
  for (const table of sourceTables) {
    const name = lc(table.split('.').pop());
    const schema = table.includes('.') ? lc(table.split('.')[0]) : null;

    // Data mart går före Core: bygger modellen på en mart följer Core-ledet med i samma rad.
    let martRows = rows.filter(r => lc(r.datamarttable) === name);
    const sameSchema = martRows.filter(r => schema && lc(r.datamart) === schema);
    if (sameSchema.length) martRows = sameSchema;
    const coreRows = rows.filter(r => lc(r.coremodeltable) === name);

    const layer: 'core' | 'datamart' | null = martRows.length ? 'datamart' : coreRows.length ? 'core' : null;
    if (!layer) continue;
    const seen = new Set<string>();
    const columns: UpstreamColumn[] = [];
    for (const r of layer === 'datamart' ? martRows : coreRows) {
      const c = toColumn(r, layer);
      if (!c) continue;
      const key = [c.column, c.sourceFile, c.sourceHierarchy, c.sourceColumn, c.coreTable, c.coreColumn].map(lc).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      columns.push(c);
    }
    if (columns.length) tables[table] = { layer, columns };
  }
  return { configured: true, source, tables };
}

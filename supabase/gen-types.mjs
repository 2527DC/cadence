#!/usr/bin/env node
// supabase/gen-types.mjs — the local stand-in for `supabase gen types typescript`.
//
// The CLI's `gen types` runs pg_meta inside Docker, which is a hard dependency we do
// not have here: P01 was built against the PostgreSQL install on this machine, and the
// Docker daemon is not running. So this reads the catalogs over the same psql
// connection everything else uses and emits the same shape of file.
//
// It produces a `Database` type compatible with createClient<Database>() from
// @supabase/supabase-js, so switching to a hosted project later is a connection-string
// change, not a rewrite.
//
//   node supabase/gen-types.mjs
//
// Output: cadence/src/types/database.types.ts   (generated; do not edit by hand)

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'cadence', 'src', 'types', 'database.types.ts');

// ---------------------------------------------------------------------------
// Connection (same resolution order as db.mjs)
// ---------------------------------------------------------------------------

function loadEnvLocal() {
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const fileEnv = loadEnvLocal();
const pick = (k, d) => process.env[k] ?? fileEnv[k] ?? d;

const CONN = {
  host: pick('PGHOST', 'localhost'),
  port: pick('PGPORT', '5432'),
  user: pick('PGUSER', 'postgres'),
  password: pick('PGPASSWORD', 'root'),
  database: pick('PGDATABASE', 'cadence'),
};

// A full connection URI wins over the PG* parts, so types can be generated straight
// from a hosted Supabase project as easily as from the local database.
const DATABASE_URL = pick('DATABASE_URL', '');

function query(sql) {
  const target = DATABASE_URL
    ? ['-d', DATABASE_URL]
    : ['-h', CONN.host, '-p', CONN.port, '-U', CONN.user, '-d', CONN.database];

  const res = spawnSync(
    'psql',
    [...target, '-v', 'ON_ERROR_STOP=1', '--no-psqlrc', '-A', '-t', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: CONN.password } },
  );
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(1);
  }
  return JSON.parse(res.stdout.trim() || 'null') ?? [];
}

// ---------------------------------------------------------------------------
// Catalog reads
// ---------------------------------------------------------------------------

const enums = query(`
  select coalesce(json_agg(x order by x->>'name'), '[]'::json) from (
    select json_build_object(
      'name', t.typname,
      'values', (select json_agg(e.enumlabel order by e.enumsortorder)
                   from pg_enum e where e.enumtypid = t.oid)
    ) as x
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
  ) s;
`);

const columns = query(`
  select coalesce(json_agg(x order by (x->>'relname'), (x->>'attnum')::int), '[]'::json) from (
    select json_build_object(
      'relname',   c.relname,
      'relkind',   c.relkind,
      'attnum',    a.attnum,
      'name',      a.attname,
      'type',      format_type(a.atttypid, a.atttypmod),
      'typname',   t.typname,
      'typtype',   t.typtype,
      'elem_typname', (select et.typname from pg_type et where et.oid = t.typelem),
      'elem_typtype', (select et.typtype from pg_type et where et.oid = t.typelem),
      'nullable',  not a.attnotnull,
      'has_default', pg_get_expr(d.adbin, d.adrelid) is not null,
      'generated', a.attgenerated <> '' or a.attidentity <> ''
    ) as x
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'v')
  ) s;
`);

const foreignKeys = query(`
  select coalesce(json_agg(x), '[]'::json) from (
    select json_build_object(
      'table',   cl.relname,
      'name',    con.conname,
      'columns', (select json_agg(a.attname order by k.ord)
                    from unnest(con.conkey) with ordinality k(num, ord)
                    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.num),
      'ref_table', fcl.relname,
      'ref_columns', (select json_agg(a.attname order by k.ord)
                    from unnest(con.confkey) with ordinality k(num, ord)
                    join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.num)
    ) as x
    from pg_constraint con
    join pg_class cl  on cl.oid  = con.conrelid
    join pg_class fcl on fcl.oid = con.confrelid
    where con.contype = 'f' and con.connamespace = 'public'::regnamespace
  ) s;
`);

const functions = query(`
  select coalesce(json_agg(x order by x->>'name'), '[]'::json) from (
    select json_build_object(
      'name', p.proname,
      'args', (
        select coalesce(json_agg(json_build_object(
                 'name', n.name,
                 'type', format_type(n.oid_type, null),
                 'optional', n.ord > p.pronargs - p.pronargdefaults
               ) order by n.ord), '[]'::json)
        from unnest(p.proargnames, p.proargtypes::oid[]) with ordinality n(name, oid_type, ord)
      ),
      'returns', pg_get_function_result(p.oid)
    ) as x
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_function_result(p.oid) <> 'trigger'
      -- Functions an extension brought with it are not part of this app's API.
      -- On a hosted Supabase project they live in the "extensions" schema; locally
      -- an extension installed into "public" would otherwise land in the types.
      and not exists (
        select 1 from pg_depend d
         where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
      )
      -- Overloaded builtins can report more argument names than argument types,
      -- which produces a half-null row. Nothing in this app is overloaded.
      and (p.proargnames is null or coalesce(array_length(p.proargnames, 1), 0) = p.pronargs)
  ) s;
`);

// ---------------------------------------------------------------------------
// Postgres type -> TypeScript
// ---------------------------------------------------------------------------

const enumNames = new Set(enums.map((e) => e.name));

const SCALARS = {
  bool: 'boolean',
  int2: 'number', int4: 'number', int8: 'number',
  float4: 'number', float8: 'number', numeric: 'number',
  text: 'string', varchar: 'string', bpchar: 'string', name: 'string', citext: 'string',
  uuid: 'string',
  date: 'string', timestamp: 'string', timestamptz: 'string', time: 'string', timetz: 'string',
  interval: 'string',
  json: 'Json', jsonb: 'Json',
  bytea: 'string',
};

function tsType(col) {
  // arrays arrive as _int2, _text, ... with typelem pointing at the element type
  if (col.typname.startsWith('_') && col.elem_typname) {
    const elem = { ...col, typname: col.elem_typname, typtype: col.elem_typtype, elem_typname: null };
    return tsType(elem) + '[]';
  }
  if (col.typtype === 'e' || enumNames.has(col.typname)) {
    return `Database["public"]["Enums"]["${col.typname}"]`;
  }
  return SCALARS[col.typname] ?? 'unknown';
}

const withNull = (t, nullable) => (nullable ? `${t} | null` : t);

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const byRel = new Map();
for (const c of columns) {
  if (!byRel.has(c.relname)) byRel.set(c.relname, { relkind: c.relkind, cols: [] });
  byRel.get(c.relname).cols.push(c);
}

const tables = [...byRel.entries()].filter(([, v]) => v.relkind === 'r').sort();
const views = [...byRel.entries()].filter(([, v]) => v.relkind === 'v').sort();

const L = [];
const p = (s = '') => L.push(s);

p('// AUTO-GENERATED. Do not edit by hand.');
p('//');
p('// Regenerate with:  node supabase/gen-types.mjs');
p('//');
p('// Produced by introspecting the local Postgres database directly, because the');
p("// Supabase CLI's `gen types` requires Docker. The shape matches what the CLI emits,");
p('// so this file stays valid if the project later moves to a hosted Supabase project.');
p('');
p('export type Json =');
p('  | string');
p('  | number');
p('  | boolean');
p('  | null');
p('  | { [key: string]: Json | undefined }');
p('  | Json[];');
p('');
p('export type Database = {');
p('  public: {');

// --- Tables ---
p('    Tables: {');
for (const [name, { cols }] of tables) {
  p(`      ${name}: {`);

  p('        Row: {');
  for (const c of cols) p(`          ${c.name}: ${withNull(tsType(c), c.nullable)};`);
  p('        };');

  p('        Insert: {');
  for (const c of cols) {
    if (c.generated) continue; // generated always as / identity: never insertable
    const optional = c.nullable || c.has_default;
    p(`          ${c.name}${optional ? '?' : ''}: ${withNull(tsType(c), c.nullable)};`);
  }
  p('        };');

  p('        Update: {');
  for (const c of cols) {
    if (c.generated) continue;
    p(`          ${c.name}?: ${withNull(tsType(c), c.nullable)};`);
  }
  p('        };');

  const fks = foreignKeys.filter((f) => f.table === name);
  if (fks.length === 0) {
    p('        Relationships: [];');
  } else {
    p('        Relationships: [');
    for (const f of fks) {
      p('          {');
      p(`            foreignKeyName: "${f.name}";`);
      p(`            columns: [${f.columns.map((c) => `"${c}"`).join(', ')}];`);
      p('            isOneToOne: false;');
      p(`            referencedRelation: "${f.ref_table}";`);
      p(`            referencedColumns: [${f.ref_columns.map((c) => `"${c}"`).join(', ')}];`);
      p('          },');
    }
    p('        ];');
  }
  p('      };');
}
p('    };');

// --- Views ---
p('    Views: {');
for (const [name, { cols }] of views) {
  p(`      ${name}: {`);
  p('        Row: {');
  // Every column of a grouped view is nullable as far as the type system knows.
  for (const c of cols) p(`          ${c.name}: ${withNull(tsType(c), true)};`);
  p('        };');
  p('        Relationships: [];');
  p('      };');
}
p('    };');

// --- Functions ---
p('    Functions: {');
for (const f of functions) {
  p(`      ${f.name}: {`);
  if (f.args.length === 0) {
    p('        Args: Record<PropertyKey, never>;');
  } else {
    p('        Args: {');
    for (const a of f.args) {
      const fake = { typname: a.type.replace(/\[\]$/, '').split('.').pop(), typtype: null, nullable: true };
      const t = enumNames.has(fake.typname)
        ? `Database["public"]["Enums"]["${fake.typname}"]`
        : (SCALARS[fake.typname] ?? 'unknown');
      p(`          ${a.name}${a.optional ? '?' : ''}: ${t};`);
    }
    p('        };');
  }
  // `returns tasks` -> the row type of that table
  const ret = f.returns.replace(/^setof\s+/i, '').trim();
  if (byRel.has(ret)) {
    const many = /^setof/i.test(f.returns);
    p(`        Returns: Database["public"]["Tables"]["${ret}"]["Row"]${many ? '[]' : ''};`);
  } else {
    p(`        Returns: ${SCALARS[ret] ?? 'unknown'};`);
  }
  p('      };');
}
p('    };');

// --- Enums ---
p('    Enums: {');
for (const e of enums) {
  p(`      ${e.name}: ${e.values.map((v) => `"${v}"`).join(' | ')};`);
}
p('    };');

p('    CompositeTypes: Record<PropertyKey, never>;');
p('  };');
p('};');
p('');
p('// Convenience aliases, matching the ones the Supabase CLI emits.');
p('type PublicSchema = Database["public"];');
p('');
p('export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =');
p('  (PublicSchema["Tables"] & PublicSchema["Views"])[T] extends { Row: infer R } ? R : never;');
p('');
p('export type TablesInsert<T extends keyof PublicSchema["Tables"]> =');
p('  PublicSchema["Tables"][T] extends { Insert: infer I } ? I : never;');
p('');
p('export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =');
p('  PublicSchema["Tables"][T] extends { Update: infer U } ? U : never;');
p('');
p('export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];');
p('');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, L.join('\n'), 'utf8');

console.log(
  `  generated    ${OUT.replace(ROOT + '\\', '').replace(ROOT + '/', '')}\n` +
  `               ${tables.length} tables, ${views.length} views, ` +
  `${functions.length} function(s), ${enums.length} enums`,
);

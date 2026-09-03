#!/usr/bin/env node
// supabase/db.mjs — the local stand-in for the Supabase CLI.
//
// P01 assumes `supabase start` / `supabase db reset` against Docker. We run against the
// PostgreSQL install on this machine instead, so this script provides the same verbs by
// shelling out to psql (already on PATH; no npm dependency, nothing to install).
//
//   node supabase/db.mjs reset     drop, recreate, shim, migrate, seed  (the big one)
//   node supabase/db.mjs migrate   apply migrations not yet applied
//   node supabase/db.mjs seed      re-run seed.sql
//   node supabase/db.mjs test      run every file in tests/, report pass/fail
//   node supabase/db.mjs status    which migrations are applied
//   node supabase/db.mjs psql      open an interactive shell on the database
//
// Connection comes from .env.local at the repo root, falling back to the defaults below.

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// ---------------------------------------------------------------------------
// Connection
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
const pick = (k, fallback) => process.env[k] ?? fileEnv[k] ?? fallback;

const CONN = {
  host: pick('PGHOST', 'localhost'),
  port: pick('PGPORT', '5432'),
  user: pick('PGUSER', 'postgres'),
  password: pick('PGPASSWORD', 'root'),
  database: pick('PGDATABASE', 'cadence'),
};

// A full connection URI wins over the PG* parts. This is how a hosted Supabase project
// is addressed: Dashboard -> Project Settings -> Database -> Connection string (URI).
const DATABASE_URL = pick('DATABASE_URL', '');

function urlHost(u) {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];
const REMOTE = DATABASE_URL
  ? !LOCAL_HOSTS.includes(urlHost(DATABASE_URL))
  : !LOCAL_HOSTS.includes(CONN.host);

// `reset`, `seed` and `test` are local-only tools and always talk to the PG* database,
// ignoring DATABASE_URL entirely. That is not a preference, it is a safety property:
// once DATABASE_URL points at a hosted project, a plain `db.mjs test` would otherwise
// run the destructive suite against it. Those files roll their work back, but running
// them there at all is wrong, and one un-rolled-back edit would be unrecoverable.
//
// So the split is: DATABASE_URL is for reading and for forward migrations. Anything
// that drops, seeds, or deliberately tries to break the schema uses PG* only, and
// refuses even that if PGHOST is not a local address.
function refuseUnlessLocal(verb) {
  if (LOCAL_HOSTS.includes(CONN.host)) return;
  fail(
    `"${verb}" only runs against a local database.\n` +
    `         PGHOST is "${CONN.host}", which is not local.\n\n` +
    `         This verb drops, seeds or deliberately attacks the schema. To apply the\n` +
    `         schema to a hosted project instead, use:  node supabase/db.mjs migrate`,
  );
}

// ---------------------------------------------------------------------------
// psql plumbing
// ---------------------------------------------------------------------------

const fail = (msg) => {
  console.error('\n  ERROR  ' + msg + '\n');
  process.exit(1);
};
const say = (msg) => console.log(msg);

function psql({
  db = CONN.database,
  file,
  sql,
  quiet = false,
  tuplesOnly = false,
  singleTransaction = true,
  local = false,
}) {
  // A URI carries host, port, user, password and database in one argument. It is only
  // used for the app's own database; `reset` talks to `postgres` and is local-only.
  const target =
    DATABASE_URL && db === CONN.database && !local
      ? ['-d', DATABASE_URL]
      : ['-h', CONN.host, '-p', CONN.port, '-U', CONN.user, '-d', db];

  const args = [...target, '-v', 'ON_ERROR_STOP=1', '--no-psqlrc'];
  if (tuplesOnly) args.push('-A', '-t');
  if (file) {
    if (singleTransaction) args.push('--single-transaction');
    args.push('-f', file);
  }
  if (sql) args.push('-c', sql);

  const res = spawnSync('psql', args, {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: CONN.password, PGCLIENTENCODING: 'UTF8' },
  });

  if (res.error) {
    fail('could not run psql: ' + res.error.message + "\n  Is PostgreSQL's bin directory on PATH?");
  }
  if (!quiet && res.stdout) process.stdout.write(res.stdout);
  if (!quiet && res.stderr) process.stderr.write(res.stderr);
  return res;
}

function psqlOrDie(opts, what) {
  const res = psql(opts);
  if (res.status !== 0) fail(what + ' failed');
  return res;
}

const migrationFiles = () =>
  readdirSync(join(HERE, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();

const indent = (text) =>
  text
    .split(/\r?\n/)
    .map((l) => '      ' + l)
    .join('\n');

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

function ensureMigrationTable(local = false) {
  psqlOrDie(
    {
      quiet: true,
      local,
      sql: [
        'create schema if not exists supabase_migrations;',
        'create table if not exists supabase_migrations.schema_migrations (',
        '  version    text primary key,',
        '  name       text,',
        '  applied_at timestamptz not null default now());',
      ].join('\n'),
    },
    'creating the migration ledger',
  );
}

function appliedVersions(local = false) {
  const res = psql({
    quiet: true,
    local,
    tuplesOnly: true,
    sql: 'select version from supabase_migrations.schema_migrations order by version;',
  });
  if (res.status !== 0) return new Set();
  return new Set(
    res.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function migrate(local = false) {
  if (REMOTE && !local) {
    say('\n  Target: ' + (DATABASE_URL ? urlHost(DATABASE_URL) : CONN.host) + '  (remote)');
    say('  Forward migrations only. Nothing is dropped.\n');
  }
  ensureMigrationTable(local);
  const done = appliedVersions(local);
  const pending = migrationFiles().filter((f) => !done.has(f.split('_')[0]));

  if (pending.length === 0) {
    say('  migrations   up to date');
    return;
  }

  for (const f of pending) {
    const version = f.split('_')[0];
    process.stdout.write('  applying     ' + f + ' ... ');
    const res = psql({ file: join(HERE, 'migrations', f), quiet: true, local });
    if (res.status !== 0) {
      console.log('FAILED\n');
      process.stderr.write(indent(res.stderr) + '\n');
      fail('migration ' + f + ' did not apply. Nothing from it was committed.');
    }
    psqlOrDie(
      {
        quiet: true,
        local,
        sql:
          'insert into supabase_migrations.schema_migrations (version, name) values (' +
          "'" + version + "', '" + f + "') on conflict (version) do nothing;",
      },
      'recording the migration',
    );
    console.log('ok');
  }
}

function reset() {
  refuseUnlessLocal('reset');
  say('\n  Rebuilding "' + CONN.database + '" on ' + CONN.host + ':' + CONN.port + ' from scratch.\n');

  // Cannot drop the database we are connected to, so drive this from `postgres`.
  psqlOrDie(
    {
      db: 'postgres',
      quiet: true,
      sql:
        'select pg_terminate_backend(pid) from pg_stat_activity where datname = ' +
        "'" + CONN.database + "' and pid <> pg_backend_pid();",
    },
    'disconnecting other sessions',
  );
  psqlOrDie(
    { db: 'postgres', quiet: true, sql: 'drop database if exists "' + CONN.database + '";' },
    'dropping the database',
  );
  psqlOrDie(
    { db: 'postgres', quiet: true, sql: 'create database "' + CONN.database + '";' },
    'creating the database',
  );
  say('  database     dropped and recreated');

  // The shim is local-only scaffolding, not a migration: it supplies auth.*, storage.*
  // and the Supabase roles, which a hosted project already has. It is deliberately not
  // recorded in the migration ledger.
  psqlOrDie(
    { file: join(HERE, 'local', '0000_local_supabase_shim.sql'), quiet: true, local: true },
    'applying the local Supabase shim',
  );
  say('  shim         auth.uid(), auth.users, storage.*, roles');

  migrate(true);
  seed(true);
  say('\n  Done. Run `node supabase/db.mjs test` to prove the immutability rules hold.\n');
}

function seed(fromReset = false) {
  // seed.sql writes two rows straight into auth.users. That is fine for a scratch
  // database; against a hosted project it forges accounts GoTrue never issued, and the
  // fake users then own real rows. Create a real account through sign-up instead.
  if (!fromReset) refuseUnlessLocal('seed');
  const file = join(HERE, 'seed.sql');
  if (!existsSync(file)) {
    say('  seed         (none)');
    return;
  }
  process.stdout.write('  seeding      ... ');
  const res = psql({ file, quiet: true, local: true });
  if (res.status !== 0) {
    console.log('FAILED\n');
    process.stderr.write(indent(res.stderr) + '\n');
    fail('seed failed');
  }
  console.log('ok');
}

function test() {
  refuseUnlessLocal('test');
  const dir = join(HERE, 'tests');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];
  if (files.length === 0) fail('no test files in supabase/tests/');

  say('');
  let failed = 0;

  for (const f of files) {
    process.stdout.write('  ' + f.padEnd(28) + ' ');
    // Deliberately not --single-transaction: each test file manages its own
    // transactions, because most of them provoke an error on purpose and then
    // have to recover and keep going.
    const res = psql({ file: join(HERE, 'tests', f), quiet: true, singleTransaction: false, local: true });
    const out = (res.stdout || '') + (res.stderr || '');

    if (res.status !== 0) {
      failed++;
      console.log('FAIL');
      process.stderr.write(indent(out) + '\n');
    } else {
      // psql prefixes raised notices with "NOTICE:  ", so this cannot anchor to ^
      const passes = (out.match(/\bPASS\b/g) || []).length;
      console.log('ok  (' + passes + ' assertions)');
    }
  }

  if (failed > 0) {
    console.error('\n  ' + failed + ' test file(s) FAILED.\n');
    process.exit(1);
  }
  say('\n  All test files passed.\n');
}

function status() {
  ensureMigrationTable();
  const done = appliedVersions();
  say('');
  for (const f of migrationFiles()) {
    say('  ' + (done.has(f.split('_')[0]) ? 'applied ' : 'PENDING ') + f);
  }
  say('');
}

function shell() {
  spawnSync('psql', ['-h', CONN.host, '-p', CONN.port, '-U', CONN.user, '-d', CONN.database], {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: CONN.password },
  });
}

// ---------------------------------------------------------------------------

const verbs = { reset, migrate, seed, test, status, psql: shell };
const verb = process.argv[2];

if (!verb || !verbs[verb]) {
  console.log(
    [
      '',
      '  Usage: node supabase/db.mjs <verb>',
      '',
      '    reset     drop, recreate, shim, migrate, seed',
      '    migrate   apply migrations not yet applied',
      '    seed      re-run seed.sql',
      '    test      run supabase/tests/*.sql',
      '    status    which migrations are applied',
      '    psql      interactive shell',
      '',
    ].join('\n'),
  );
  process.exit(verb ? 1 : 0);
}

verbs[verb]();

// Isolated real PostgreSQL. Never connects to the user's Supabase project.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
const name = `padel-test-${randomUUID().slice(0, 8)}`;
const coach = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
let db: pg.Client | undefined;
let count = 0;
const pass = (label: string) => {
  count++;
  console.log(`✓ ${label}`);
};
try {
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--name",
      name,
      "-e",
      "POSTGRES_PASSWORD=local-test-only",
      "-e",
      "POSTGRES_DB=padel_security_test",
      "-p",
      "127.0.0.1::5432",
      "postgres:17-alpine",
    ],
    { stdio: "pipe" },
  );
  const port = Number(
    execFileSync("docker", ["port", name, "5432/tcp"], { encoding: "utf8" })
      .trim()
      .split(":")
      .at(-1),
  );
  const connect = () =>
    new pg.Client({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password: "local-test-only",
      database: "padel_security_test",
      statement_timeout: 5000,
    });
  for (let i = 0; i < 60; i++) {
    try {
      db = connect();
      await db.connect();
      break;
    } catch {
      db = undefined;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!db) throw new Error("PostgreSQL not ready");
  await db.query(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to public;`,
  );
  await db.query(
    readFileSync(
      new URL(
        "../supabase/migrations/202610220001_booking.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  pass("migracja wykonuje się na PostgreSQL 17");
  await db.query("insert into auth.users values ($1),($2)", [coach, other]);
  await db.query("insert into private.coach(user_id) values ($1)", [coach]);
  async function as(
    role: string,
    user: string,
    sql: string,
    args: unknown[] = [],
  ) {
    await db!.query("begin");
    try {
      await db!.query(`set local role ${role}`);
      await db!.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user,
      ]);
      const r = await db!.query(sql, args);
      await db!.query("commit");
      return r;
    } catch (e) {
      await db!.query("rollback");
      throw e;
    }
  }
  let slotIndex = 0;
  async function slot() {
    return (
      await as(
        "authenticated",
        coach,
        "select public.add_slot(date_trunc('hour',now())+interval '10 days'+$1*interval '2 hours') id",
        [slotIndex++],
      )
    ).rows[0].id as string;
  }
  const id = await slot();
  pass("trener może dodać godzinny termin");
  const row = (await db.query("select * from public.slots where id=$1", [id]))
    .rows[0];
  assert.equal(+row.ends_at - +row.starts_at, 3600000);
  pass("termin trwa dokładnie 60 minut");
  assert.equal(
    (await as("anon", "", "select * from public.available_slots()")).rows
      .length,
    1,
  );
  pass("anonim widzi dostępność bez danych klientów");
  for (const table of ["customers", "bookings", "slots"])
    await assert.rejects(
      as("anon", "", `select * from public.${table}`),
      /permission denied/,
    );
  pass("anonim nie odczyta tabel bezpośrednio");
  assert.equal(
    (await as("authenticated", other, "select public.is_coach() ok")).rows[0]
      .ok,
    false,
  );
  await assert.rejects(
    as(
      "authenticated",
      other,
      "select public.add_slot(now()+interval '50 days')",
    ),
    /FORBIDDEN/,
  );
  pass("inne konto Auth nie jest trenerem");
  await assert.rejects(
    as(
      "authenticated",
      coach,
      "insert into public.slots(starts_at,ends_at) values(now(),now())",
    ),
    /permission denied/,
  );
  await assert.rejects(
    as(
      "anon",
      "",
      "select public.create_booking($1,'Alex','Test','000000000',$2)",
      [id, "a".repeat(64)],
    ),
    /permission denied/,
  );
  await assert.rejects(
    as(
      "authenticated",
      other,
      "select public.create_booking($1,'Alex','Test','000000000',$2)",
      [id, "a".repeat(64)],
    ),
    /permission denied/,
  );
  pass("API nie pozwala ominąć CAPTCHA przez bezpośredni zapis");
  await assert.rejects(
    as("authenticated", other, "select * from private.coach"),
    /permission denied/,
  );
  pass("konto użytkownika nie może nadać sobie roli trenera");
  const booking = (
    await as(
      "service_role",
      "",
      "select public.create_booking($1,'Alex','Test','000000000',$2) id",
      [id, "a".repeat(64)],
    )
  ).rows[0].id;
  assert.equal(
    (
      await db.query("select status from public.bookings where id=$1", [
        booking,
      ])
    ).rows[0].status,
    "pending",
  );
  assert.equal(
    (await as("anon", "", "select * from public.available_slots()")).rows
      .length,
    0,
  );
  pass("oczekująca rezerwacja zajmuje termin");
  for (const table of ["customers", "bookings", "slots"])
    assert.equal(
      (await as("authenticated", other, `select * from public.${table}`)).rows
        .length,
      0,
    );
  assert.equal(
    (await as("authenticated", coach, "select * from public.customers")).rows
      .length,
    1,
  );
  pass("RLS: tylko trener odczytuje dane osobowe");
  await assert.rejects(
    as(
      "authenticated",
      other,
      "select public.set_booking_status($1,'approved')",
      [booking],
    ),
    /FORBIDDEN/,
  );
  await assert.rejects(
    as("anon", "", "select public.set_booking_status($1,'approved')", [
      booking,
    ]),
    /permission denied/,
  );
  pass("anonim i obcy użytkownik nie zmienią statusu");
  await assert.rejects(
    as("authenticated", coach, "select public.set_slot_blocked($1,true)", [id]),
    /SLOT_OCCUPIED/,
  );
  pass("nie można blokować zajętej godziny");
  await as(
    "authenticated",
    coach,
    "select public.set_booking_status($1,'approved')",
    [booking],
  );
  assert.equal(
    (await as("anon", "", "select * from public.available_slots()")).rows
      .length,
    0,
  );
  pass("zatwierdzenie zachowuje zajętość");
  await assert.rejects(
    as(
      "authenticated",
      coach,
      "select public.set_booking_status($1,'pending')",
      [booking],
    ),
    /INVALID_TRANSITION/,
  );
  await as(
    "authenticated",
    coach,
    "select public.set_booking_status($1,'rejected')",
    [booking],
  );
  await assert.rejects(
    as(
      "authenticated",
      coach,
      "select public.set_booking_status($1,'approved')",
      [booking],
    ),
    /INVALID_TRANSITION/,
  );
  assert.equal(
    (await as("anon", "", "select * from public.available_slots()")).rows
      .length,
    1,
  );
  pass(
    "odrzucenie zwalnia termin; odrzuconej rezerwacji nie można reaktywować",
  );
  await as(
    "service_role",
    "",
    "select public.create_booking($1,'Nowa','Osoba','000000001',$2)",
    [id, "b".repeat(64)],
  );
  pass("odrzucony termin można ponownie zarezerwować");
  const status = (
    await as("service_role", "", "select * from public.booking_status($1)", [
      "a".repeat(64),
    ])
  ).rows[0];
  assert.deepEqual(Object.keys(status).sort(), [
    "ends_at",
    "starts_at",
    "status",
  ]);
  assert.equal(status.status, "rejected");
  assert.equal(
    (
      await as("service_role", "", "select * from public.booking_status($1)", [
        "f".repeat(64),
      ])
    ).rows.length,
    0,
  );
  await assert.rejects(
    as("anon", "", "select * from public.booking_status($1)", ["a".repeat(64)]),
    /permission denied/,
  );
  pass("status wymaga poprawnego hasha i zwraca wyłącznie termin i status");
  const blocked = await slot();
  await as("authenticated", coach, "select public.set_slot_blocked($1,true)", [
    blocked,
  ]);
  await assert.rejects(
    as(
      "service_role",
      "",
      "select public.create_booking($1,'A','B','000000000',$2)",
      [blocked, "c".repeat(64)],
    ),
    /SLOT_UNAVAILABLE/,
  );
  pass("blokada działa po stronie bazy");
  await as("authenticated", coach, "select public.set_slot_blocked($1,false)", [
    blocked,
  ]);
  await assert.rejects(
    db.query("insert into public.slots(starts_at,ends_at) values ($1,$2)", [
      row.starts_at,
      new Date(+row.starts_at + 1800000),
    ]),
    /sixty_minutes/,
  );
  await assert.rejects(
    as("authenticated", coach, "select public.add_slot($1)", [
      new Date(+row.starts_at + 1800000),
    ]),
    /no_overlapping_slots/,
  );
  pass("baza odrzuca nakładające się godziny i zły czas trwania");
  const raceSlot = await slot();
  const c1 = connect(),
    c2 = connect();
  await c1.connect();
  await c2.connect();
  try {
    await c1.query("begin");
    await c1.query("set local role service_role");
    await c1.query(
      "select public.create_booking($1,'Pierwsza','Osoba','000000000',$2)",
      [raceSlot, "d".repeat(64)],
    );
    let finished = false;
    const competing = c2
      .query("set role service_role")
      .then(() =>
        c2.query(
          "select public.create_booking($1,'Druga','Osoba','000000000',$2)",
          [raceSlot, "e".repeat(64)],
        ),
      )
      .then(
        () => ({ ok: true, error: "" }),
        (e) => ({ ok: false, error: String(e) }),
      )
      .finally(() => {
        finished = true;
      });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(finished, false);
    await c1.query("commit");
    const result = await competing;
    assert.equal(result.ok, false);
    assert.match(result.error, /SLOT_UNAVAILABLE/);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.bookings where slot_id=$1 and status<>'rejected'",
          [raceSlot],
        )
      ).rows[0].n,
      1,
    );
    pass("dwa niezależne połączenia równocześnie: dokładnie jedna rezerwacja");
  } finally {
    await c1.end();
    await c2.end();
  }
  const invalidSlot = await slot(),
    customersBefore = (await db.query("select count(*) from public.customers"))
      .rows[0].count;
  await assert.rejects(
    as(
      "service_role",
      "",
      "select public.create_booking($1,'A','B','abc',$2)",
      [invalidSlot, "9".repeat(64)],
    ),
  );
  assert.equal(
    (await db.query("select count(*) from public.customers")).rows[0].count,
    customersBefore,
  );
  pass("błędny zapis wycofuje całą transakcję");
  for (let i = 0; i < 4; i++) {
    const allowed = (
      await as(
        "service_role",
        "",
        "select public.consume_rate_limit($1,'phone-book') ok",
        ["1".repeat(64)],
      )
    ).rows[0].ok;
    assert.equal(allowed, i < 3);
  }
  await assert.rejects(
    as("anon", "", "select public.consume_rate_limit($1,'phone-book')", [
      "1".repeat(64),
    ]),
    /permission denied/,
  );
  pass("limit zgłoszeń jest wymuszany w bazie i niedostępny anonimom");
  console.log(`\n${count} kontroli integracyjnych PostgreSQL: OK`);
} finally {
  if (db) await db.end();
  try {
    execFileSync("docker", ["rm", "-f", name], { stdio: "pipe" });
  } catch {}
}

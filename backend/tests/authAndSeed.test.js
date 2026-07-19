const test = require("node:test");
const assert = require("node:assert/strict");

const bcrypt = require("bcryptjs");

const {
  INITIAL_CATEGORIES,
  readAdminConfig,
  runSeed,
} = require("../scripts/seed");

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function createSeedPool() {
  const state = {
    categories: new Map(),
    users: new Map(),
    queries: [],
    nextCategoryId: 1,
    nextUserId: 1,
    released: false,
  };

  return {
    state,
    async connect() {
      return {
        async query(sql, params = []) {
          state.queries.push({ sql, params });

          if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
            return { rows: [] };
          }

          if (sql.includes("INSERT INTO kategori")) {
            const namaKategori = params[0];
            const key = normalize(namaKategori);
            const existing = state.categories.get(key);

            if (existing) {
              existing.nama_kategori = namaKategori;
              return { rows: [{ id: existing.id, nama_kategori: existing.nama_kategori }] };
            }

            const category = { id: state.nextCategoryId, nama_kategori: namaKategori };
            state.nextCategoryId += 1;
            state.categories.set(key, category);
            return { rows: [category] };
          }

          if (sql.includes("SELECT id, password_hash") && sql.includes("FROM pengguna")) {
            const user = state.users.get(normalize(params[0]));
            return { rows: user ? [{ id: user.id, password_hash: user.password_hash }] : [] };
          }

          if (sql.includes("INSERT INTO pengguna")) {
            const user = {
              id: state.nextUserId,
              nama: params[0],
              username: params[1],
              password_hash: params[2],
              is_active: true,
            };
            state.nextUserId += 1;
            state.users.set(normalize(user.username), user);
            return {
              rows: [{ id: user.id, nama: user.nama, username: user.username, is_active: user.is_active }],
            };
          }

          if (sql.includes("UPDATE pengguna")) {
            const id = params[3];
            const user = [...state.users.values()].find((row) => row.id === id);
            user.nama = params[0];
            user.username = params[1];
            user.password_hash = params[2];
            user.is_active = true;
            state.users.delete([...state.users.entries()].find(([, row]) => row.id === id)[0]);
            state.users.set(normalize(user.username), user);
            return {
              rows: [{ id: user.id, nama: user.nama, username: user.username, is_active: user.is_active }],
            };
          }

          return { rows: [] };
        },
        release() {
          state.released = true;
        },
      };
    },
  };
}

test("readAdminConfig skips administrator when ADMIN_PASSWORD is unavailable", () => {
  const config = readAdminConfig({ ADMIN_NAME: "Admin", ADMIN_USERNAME: "admin" });

  assert.equal(config.shouldSeed, false);
  assert.match(config.reason, /ADMIN_PASSWORD/);
});

test("seed categories is idempotent", async () => {
  const pool = createSeedPool();

  await runSeed({ pool, env: {}, logger: null });
  await runSeed({ pool, env: {}, logger: null });

  assert.equal(pool.state.categories.size, INITIAL_CATEGORIES.length);
  assert.deepEqual(
    [...pool.state.categories.values()].map((category) => category.nama_kategori),
    INITIAL_CATEGORIES,
  );
});

test("seed administrator hashes password and stores normalized username", async () => {
  const pool = createSeedPool();
  const env = {
    ADMIN_NAME: "Administrator",
    ADMIN_USERNAME: "ADMIN",
    ADMIN_PASSWORD: "strong-password",
  };

  const result = await runSeed({ pool, env, logger: null });
  const user = pool.state.users.get("admin");

  assert.equal(result.admin.action, "created");
  assert.equal(user.username, "admin");
  assert.notEqual(user.password_hash, env.ADMIN_PASSWORD);
  assert.equal(await bcrypt.compare(env.ADMIN_PASSWORD, user.password_hash), true);
  assert.equal(Object.prototype.hasOwnProperty.call(result.admin.user, "password_hash"), false);
});

test("seed administrator is idempotent and does not duplicate user", async () => {
  const pool = createSeedPool();
  const env = {
    ADMIN_NAME: "Administrator",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "strong-password",
  };

  await runSeed({ pool, env, logger: null });
  const firstHash = pool.state.users.get("admin").password_hash;
  const second = await runSeed({ pool, env, logger: null });
  const secondHash = pool.state.users.get("admin").password_hash;

  assert.equal(pool.state.users.size, 1);
  assert.equal(second.admin.action, "updated");
  assert.equal(secondHash, firstHash);
  assert.equal(await bcrypt.compare(env.ADMIN_PASSWORD, secondHash), true);
});

test("seed administrator requires name and username when password is provided", async () => {
  const pool = createSeedPool();

  await assert.rejects(
    runSeed({ pool, env: { ADMIN_PASSWORD: "secret", ADMIN_USERNAME: "admin" }, logger: null }),
    /ADMIN_NAME wajib diisi/,
  );

  await assert.rejects(
    runSeed({ pool, env: { ADMIN_PASSWORD: "secret", ADMIN_NAME: "Admin" }, logger: null }),
    /ADMIN_USERNAME wajib diisi/,
  );
});

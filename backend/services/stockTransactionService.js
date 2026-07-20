const {
  refreshSalesAggregationForChanges,
} = require("./salesAggregationService");

class StockTransactionError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function toPositiveNumber(value, fieldName) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new StockTransactionError(400, `${fieldName} harus angka positif`);
  }

  return numericValue;
}

function parseDate(value, fieldName = "tanggal") {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new StockTransactionError(400, `${fieldName} harus berformat YYYY-MM-DD`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() + 1 !== month
    || probe.getUTCDate() !== day
  ) {
    throw new StockTransactionError(400, `${fieldName} tidak valid`);
  }

  return text;
}

function parseTransactionId(value) {
  const transactionId = Number(value);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    throw new StockTransactionError(400, "id transaksi harus integer positif");
  }
  return transactionId;
}

function parseTransactionInput(input = {}, defaults = {}) {
  const produkId = Number(input.produk_id ?? defaults.produk_id);
  if (!Number.isInteger(produkId) || produkId <= 0) {
    throw new StockTransactionError(400, "produk_id harus integer positif");
  }

  const jenisTransaksi = input.jenis_transaksi ?? defaults.jenis_transaksi;
  if (!["masuk", "keluar"].includes(jenisTransaksi)) {
    throw new StockTransactionError(400, "Jenis transaksi harus 'masuk' atau 'keluar'");
  }

  const jumlah = toPositiveNumber(input.jumlah ?? defaults.jumlah, "jumlah");
  const harga = toPositiveNumber(input.harga ?? defaults.harga, "harga");
  const tanggal = parseDate(
    input.tanggal
      ?? defaults.tanggal
      ?? new Date().toISOString().split("T")[0],
  );

  return {
    produk_id: produkId,
    jenis_transaksi: jenisTransaksi,
    jumlah,
    harga,
    total: jumlah * harga,
    tanggal,
  };
}

function ensureValidStock(value, message = "Nilai stok produk tidak valid") {
  const stock = Number(value);
  if (!Number.isFinite(stock) || stock < 0) {
    throw new StockTransactionError(500, message);
  }
  return stock;
}


function stockEffectDelta(transaction) {
  const amount = Number(transaction.jumlah);
  return transaction.jenis_transaksi === "masuk" ? amount : -amount;
}

function replaceStockEffect(currentStock, oldTransaction, newTransaction) {
  const stock = ensureValidStock(currentStock);
  const nextStock = stock
    - stockEffectDelta(oldTransaction)
    + stockEffectDelta(newTransaction);

  if (nextStock < 0) {
    throw new StockTransactionError(400, "Stok tidak mencukupi untuk pembaruan transaksi", {
      stok_saat_ini: stock,
      stok_setelah_pembaruan: nextStock,
    });
  }

  return nextStock;
}

function normalizeTransactionDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value || "").slice(0, 10);
}

function reverseStockEffect(currentStock, transaction) {
  const stock = ensureValidStock(currentStock);
  const nextStock = transaction.jenis_transaksi === "masuk"
    ? stock - Number(transaction.jumlah)
    : stock + Number(transaction.jumlah);

  if (nextStock < 0) {
    throw new StockTransactionError(
      409,
      "Transaksi masuk tidak dapat dibatalkan karena stok sudah digunakan",
      {
        stok_saat_ini: stock,
        jumlah_transaksi: Number(transaction.jumlah),
      },
    );
  }

  return nextStock;
}

function applyStockEffect(currentStock, transaction) {
  const stock = ensureValidStock(currentStock);
  const amount = Number(transaction.jumlah);

  if (transaction.jenis_transaksi === "masuk") return stock + amount;

  if (stock < amount) {
    throw new StockTransactionError(400, "Stok tidak mencukupi", {
      stok_saat_ini: stock,
      jumlah_keluar: amount,
    });
  }

  return stock - amount;
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Rollback transaksi stok gagal:", rollbackError);
  }
}

async function lockProducts(client, productIds) {
  const ids = [...new Set(productIds.map(Number))]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);

  const result = await client.query(
    `
      SELECT id, stok
      FROM produk
      WHERE id = ANY($1::bigint[])
      ORDER BY id
      FOR UPDATE
    `,
    [ids],
  );

  const products = new Map(
    result.rows.map((row) => [Number(row.id), ensureValidStock(row.stok)]),
  );

  for (const id of ids) {
    if (!products.has(id)) {
      throw new StockTransactionError(404, `Produk ${id} tidak ditemukan`);
    }
  }

  return products;
}

async function updateProductStocks(client, stockByProduct) {
  const updated = [];

  for (const [produkId, stok] of [...stockByProduct.entries()].sort((a, b) => a[0] - b[0])) {
    const result = await client.query(
      `
        UPDATE produk
        SET stok=$1
        WHERE id=$2
        RETURNING id, stok
      `,
      [stok, produkId],
    );

    if (result.rows.length === 0) {
      throw new StockTransactionError(404, `Produk ${produkId} tidak ditemukan saat update stok`);
    }

    updated.push({
      produk_id: Number(result.rows[0].id),
      stok: Number(result.rows[0].stok),
    });
  }

  return updated;
}

async function createStockTransaction(db, input) {
  const transaction = parseTransactionInput(input);
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const products = await lockProducts(client, [transaction.produk_id]);
    const nextStock = applyStockEffect(
      products.get(transaction.produk_id),
      transaction,
    );

    const insertResult = await client.query(
      `
        INSERT INTO transaksi
          (produk_id, jenis_transaksi, jumlah, harga, total, tanggal)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        transaction.produk_id,
        transaction.jenis_transaksi,
        transaction.jumlah,
        transaction.harga,
        transaction.total,
        transaction.tanggal,
      ],
    );

    const updatedProducts = await updateProductStocks(
      client,
      new Map([[transaction.produk_id, nextStock]]),
    );
    const aggregation = await refreshSalesAggregationForChanges(client, [transaction]);

    await client.query("COMMIT");

    return {
      message: "Transaksi berhasil",
      stok_sekarang: nextStock,
      transaksi_id: Number(insertResult.rows[0].id),
      updated_products: updatedProducts,
      aggregation,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function updateStockTransaction(db, transactionIdInput, input = {}) {
  const transactionId = parseTransactionId(transactionIdInput);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const oldResult = await client.query(
      `
        SELECT id, produk_id, jenis_transaksi, jumlah, harga, total, tanggal
        FROM transaksi
        WHERE id=$1
        FOR UPDATE
      `,
      [transactionId],
    );

    if (oldResult.rows.length === 0) {
      throw new StockTransactionError(404, "Transaksi tidak ditemukan");
    }

    const oldTransaction = {
      ...oldResult.rows[0],
      produk_id: Number(oldResult.rows[0].produk_id),
      jumlah: Number(oldResult.rows[0].jumlah),
      harga: Number(oldResult.rows[0].harga),
      tanggal: normalizeTransactionDate(oldResult.rows[0].tanggal),
    };
    const newTransaction = parseTransactionInput(input, oldTransaction);
    const products = await lockProducts(client, [
      oldTransaction.produk_id,
      newTransaction.produk_id,
    ]);
    const resultingStocks = new Map(products);

    if (oldTransaction.produk_id === newTransaction.produk_id) {
      resultingStocks.set(
        oldTransaction.produk_id,
        replaceStockEffect(
          resultingStocks.get(oldTransaction.produk_id),
          oldTransaction,
          newTransaction,
        ),
      );
    } else {
      resultingStocks.set(
        oldTransaction.produk_id,
        reverseStockEffect(
          resultingStocks.get(oldTransaction.produk_id),
          oldTransaction,
        ),
      );
      resultingStocks.set(
        newTransaction.produk_id,
        applyStockEffect(
          resultingStocks.get(newTransaction.produk_id),
          newTransaction,
        ),
      );
    }

    const transactionResult = await client.query(
      `
        UPDATE transaksi
        SET produk_id=$1,
            jenis_transaksi=$2,
            jumlah=$3,
            harga=$4,
            total=$5,
            tanggal=$6
        WHERE id=$7
        RETURNING id
      `,
      [
        newTransaction.produk_id,
        newTransaction.jenis_transaksi,
        newTransaction.jumlah,
        newTransaction.harga,
        newTransaction.total,
        newTransaction.tanggal,
        transactionId,
      ],
    );

    if (transactionResult.rows.length === 0) {
      throw new StockTransactionError(404, "Transaksi tidak ditemukan saat update");
    }

    const updatedProducts = await updateProductStocks(client, resultingStocks);
    const aggregation = await refreshSalesAggregationForChanges(client, [
      oldTransaction,
      newTransaction,
    ]);

    await client.query("COMMIT");

    return {
      message: oldTransaction.produk_id === newTransaction.produk_id
        ? "Transaksi berhasil diperbarui"
        : "Transaksi berhasil diperbarui dengan perubahan produk",
      transaksi_id: transactionId,
      stok_sekarang: resultingStocks.get(newTransaction.produk_id),
      updated_products: updatedProducts,
      aggregation,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function deleteStockTransaction(db, transactionIdInput) {
  const transactionId = parseTransactionId(transactionIdInput);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const transactionResult = await client.query(
      `
        SELECT id, produk_id, jenis_transaksi, jumlah, harga, total, tanggal
        FROM transaksi
        WHERE id=$1
        FOR UPDATE
      `,
      [transactionId],
    );

    if (transactionResult.rows.length === 0) {
      throw new StockTransactionError(404, "Transaksi tidak ditemukan");
    }

    const transaction = {
      ...transactionResult.rows[0],
      produk_id: Number(transactionResult.rows[0].produk_id),
      jumlah: Number(transactionResult.rows[0].jumlah),
      tanggal: normalizeTransactionDate(transactionResult.rows[0].tanggal),
    };
    const products = await lockProducts(client, [transaction.produk_id]);
    const nextStock = reverseStockEffect(
      products.get(transaction.produk_id),
      transaction,
    );

    const deleteResult = await client.query(
      "DELETE FROM transaksi WHERE id=$1 RETURNING id",
      [transactionId],
    );
    if (deleteResult.rows.length === 0) {
      throw new StockTransactionError(404, "Transaksi tidak ditemukan saat dihapus");
    }

    const updatedProducts = await updateProductStocks(
      client,
      new Map([[transaction.produk_id, nextStock]]),
    );
    const aggregation = await refreshSalesAggregationForChanges(client, [transaction]);

    await client.query("COMMIT");

    return {
      message: "Transaksi berhasil dihapus dan stok disesuaikan",
      transaksi_id: transactionId,
      stok_sekarang: nextStock,
      updated_products: updatedProducts,
      aggregation,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  StockTransactionError,
  applyStockEffect,
  createStockTransaction,
  deleteStockTransaction,
  lockProducts,
  parseTransactionId,
  parseTransactionInput,
  replaceStockEffect,
  reverseStockEffect,
  stockEffectDelta,
  updateStockTransaction,
};

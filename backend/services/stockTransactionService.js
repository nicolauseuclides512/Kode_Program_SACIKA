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

function parseTransactionInput(input = {}) {
  const produkId = Number(input.produk_id);
  if (!Number.isInteger(produkId) || produkId <= 0) {
    throw new StockTransactionError(400, "produk_id harus integer positif");
  }

  const jenisTransaksi = input.jenis_transaksi;
  if (!["masuk", "keluar"].includes(jenisTransaksi)) {
    throw new StockTransactionError(400, "Jenis transaksi harus 'masuk' atau 'keluar'");
  }

  const jumlah = toPositiveNumber(input.jumlah, "jumlah");
  const harga = toPositiveNumber(input.harga, "harga");
  const tanggal = input.tanggal || new Date().toISOString().split("T")[0];

  return {
    produk_id: produkId,
    jenis_transaksi: jenisTransaksi,
    jumlah,
    harga,
    total: jumlah * harga,
    tanggal,
  };
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Rollback transaksi stok gagal:", rollbackError);
  }
}

async function createStockTransaction(db, input) {
  const transaction = parseTransactionInput(input);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const productResult = await client.query(
      `
        SELECT id, stok
        FROM produk
        WHERE id=$1
        FOR UPDATE
      `,
      [transaction.produk_id],
    );

    if (productResult.rows.length === 0) {
      throw new StockTransactionError(404, "Produk tidak ditemukan");
    }

    const currentStock = Number(productResult.rows[0].stok);
    if (!Number.isFinite(currentStock)) {
      throw new StockTransactionError(500, "Nilai stok produk tidak valid");
    }

    let nextStock = currentStock;
    if (transaction.jenis_transaksi === "masuk") {
      nextStock += transaction.jumlah;
    } else {
      if (currentStock < transaction.jumlah) {
        throw new StockTransactionError(400, "Stok tidak mencukupi");
      }
      nextStock -= transaction.jumlah;
    }

    if (nextStock < 0) {
      throw new StockTransactionError(400, "Stok tidak boleh negatif");
    }

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

    const updateResult = await client.query(
      `
        UPDATE produk
        SET stok=$1
        WHERE id=$2
        RETURNING stok
      `,
      [nextStock, transaction.produk_id],
    );

    if (updateResult.rows.length === 0) {
      throw new StockTransactionError(404, "Produk tidak ditemukan saat update stok");
    }

    await client.query("COMMIT");

    return {
      message: "Transaksi berhasil",
      stok_sekarang: Number(updateResult.rows[0].stok),
      transaksi_id: insertResult.rows[0].id,
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
  createStockTransaction,
  parseTransactionInput,
};

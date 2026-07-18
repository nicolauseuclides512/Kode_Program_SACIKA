const PRODUCT_CODE_FIELDS = [
  "kode_produk",
  "kode_barang",
  "kode",
  "sku",
  "barcode",
];

const PRODUCT_NAME_FIELDS = [
  "nama_produk",
  "nama_barang",
  "nama_barang_sumber",
  "product_name",
  "name",
];

const PRODUCT_CODE_COLUMNS = [
  "kode_produk",
  "kode_barang",
  "kode",
  "sku",
  "barcode",
];

function normalizeProductName(value) {
  if (value === undefined || value === null) return "";

  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/(\d+(?:[.,]\d+)?)\s*(m\s*l|ml)\b/gi, "$1 ml")
    .replace(/(\d+(?:[.,]\d+)?)\s*(gr|gram|grams|g)\b/gi, "$1 g")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstPresentValue(source, fields) {
  for (const field of fields) {
    const value = source?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function findProductByCode(db, kodeProduk, options = {}) {
  const code = String(kodeProduk || "").trim();
  if (!code) return null;

  const requestedColumns = options.productCodeColumns || PRODUCT_CODE_COLUMNS;
  const safeColumns = requestedColumns.filter((column) =>
    PRODUCT_CODE_COLUMNS.includes(column),
  );

  if (safeColumns.length === 0) return null;

  const columnResult = await db.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'produk'
        AND column_name = ANY($1::text[])
    `,
    [safeColumns],
  );

  const availableColumns = new Set(columnResult.rows.map((row) => row.column_name));
  const columnName = safeColumns.find((column) => availableColumns.has(column));

  if (!columnName) return null;

  const productResult = await db.query(
    `
      SELECT *
      FROM produk
      WHERE BTRIM(${quoteIdentifier(columnName)}::text) = $1
      LIMIT 1
    `,
    [code],
  );

  return productResult.rows[0] || null;
}

async function findProductByAlias(db, namaNormalisasi) {
  try {
    const result = await db.query(
      `
        SELECT p.*
        FROM product_alias pa
        JOIN produk p ON p.id = pa.produk_id
        WHERE pa.nama_normalisasi = $1
        LIMIT 1
      `,
      [namaNormalisasi],
    );

    return result.rows[0] || null;
  } catch (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
}

async function findProductByNormalizedName(db, namaNormalisasi) {
  const result = await db.query("SELECT * FROM produk");

  return (
    result.rows.find((product) => {
      return normalizeProductName(product.nama_produk) === namaNormalisasi;
    }) || null
  );
}

async function resolveProductMapping(db, sourceRow, options = {}) {
  const kodeProduk = firstPresentValue(
    sourceRow,
    options.productCodeFields || PRODUCT_CODE_FIELDS,
  );
  const namaBarangSumber = firstPresentValue(
    sourceRow,
    options.productNameFields || PRODUCT_NAME_FIELDS,
  );
  const namaNormalisasi = normalizeProductName(namaBarangSumber);

  if (kodeProduk) {
    const product = await findProductByCode(db, kodeProduk, options);
    if (product) {
      return {
        status: "resolved",
        matchType: "kode_produk",
        product,
        kodeProduk,
        namaBarangSumber,
        namaNormalisasi,
      };
    }
  }

  if (namaNormalisasi) {
    const aliasProduct = await findProductByAlias(db, namaNormalisasi);
    if (aliasProduct) {
      return {
        status: "resolved",
        matchType: "product_alias",
        product: aliasProduct,
        kodeProduk,
        namaBarangSumber,
        namaNormalisasi,
      };
    }

    const nameProduct = await findProductByNormalizedName(db, namaNormalisasi);
    if (nameProduct) {
      return {
        status: "resolved",
        matchType: "nama_produk_normalisasi",
        product: nameProduct,
        kodeProduk,
        namaBarangSumber,
        namaNormalisasi,
      };
    }
  }

  return {
    status: "unresolved",
    product: null,
    kodeProduk,
    namaBarangSumber,
    namaNormalisasi,
    unresolvedProduct: {
      kode_produk: kodeProduk || null,
      nama_barang_sumber: namaBarangSumber || null,
      nama_normalisasi: namaNormalisasi || null,
      reason: namaNormalisasi ? "not_found" : "missing_product_name",
    },
  };
}

async function mapProductRows(db, sourceRows, options = {}) {
  const resolved = [];
  const unresolvedProducts = [];

  for (const sourceRow of sourceRows) {
    const mapping = await resolveProductMapping(db, sourceRow, options);

    if (mapping.status === "resolved") {
      resolved.push({ sourceRow, mapping });
    } else {
      unresolvedProducts.push({
        sourceRow,
        ...mapping.unresolvedProduct,
      });
    }
  }

  return { resolved, unresolvedProducts };
}

module.exports = {
  normalizeProductName,
  resolveProductMapping,
  mapProductRows,
};

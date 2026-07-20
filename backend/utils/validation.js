const { createHttpError } = require("./httpError");

const NUMERIC_14_2_MAX = 999999999999.99;
const NUMERIC_18_2_MAX = 9999999999999999.99;

function isMissing(value) {
  return value === undefined || value === null;
}

function normalizeText(value, fieldName, options = {}) {
  const {
    required = true,
    maxLength = 255,
    allowEmpty = false,
  } = options;

  if (isMissing(value)) {
    if (!required) return null;
    throw createHttpError(400, `${fieldName} wajib diisi`, {
      code: `${fieldName.toUpperCase()}_REQUIRED`,
    });
  }

  const text = String(value).trim();
  if (!text && !allowEmpty) {
    throw createHttpError(400, `${fieldName} wajib diisi`, {
      code: `${fieldName.toUpperCase()}_REQUIRED`,
    });
  }

  if (text.length > maxLength) {
    throw createHttpError(400, `${fieldName} maksimal ${maxLength} karakter`, {
      code: `${fieldName.toUpperCase()}_TOO_LONG`,
    });
  }

  return text;
}

function parseIntegerId(value, fieldName = "id") {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} harus berupa integer positif`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
  }

  return parsed;
}

function decimalPlaces(value) {
  const text = String(value).trim().toLowerCase();
  if (!text.includes("e")) {
    const fraction = text.split(".")[1];
    return fraction ? fraction.length : 0;
  }

  const [coefficient, exponentText] = text.split("e");
  const exponent = Number(exponentText);
  const fractionLength = (coefficient.split(".")[1] || "").length;
  return Math.max(0, fractionLength - exponent);
}

function parseDecimal(value, fieldName, options = {}) {
  const {
    required = true,
    defaultValue = null,
    min = null,
    max = NUMERIC_14_2_MAX,
    scale = 2,
    allowZero = true,
  } = options;

  if (isMissing(value)) {
    if (defaultValue !== null && defaultValue !== undefined) {
      return parseDecimal(defaultValue, fieldName, {
        ...options,
        required: true,
        defaultValue: null,
      });
    }
    if (!required) return null;
    throw createHttpError(400, `${fieldName} wajib diisi`, {
      code: `${fieldName.toUpperCase()}_REQUIRED`,
    });
  }

  if (typeof value === "string" && value.trim() === "") {
    throw createHttpError(400, `${fieldName} tidak boleh kosong`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, `${fieldName} harus berupa angka valid`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
  }

  if (!allowZero && parsed === 0) {
    throw createHttpError(400, `${fieldName} harus lebih besar dari nol`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
  }

  if (min !== null && parsed < min) {
    throw createHttpError(400, `${fieldName} tidak boleh kurang dari ${min}`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
  }

  if (max !== null && parsed > max) {
    throw createHttpError(400, `${fieldName} melebihi batas maksimum`, {
      code: `${fieldName.toUpperCase()}_OUT_OF_RANGE`,
    });
  }

  if (scale !== null && decimalPlaces(value) > scale) {
    throw createHttpError(400, `${fieldName} maksimal ${scale} angka di belakang koma`, {
      code: `INVALID_${fieldName.toUpperCase()}_SCALE`,
    });
  }

  return Number(parsed.toFixed(scale ?? 12));
}

function parseNonNegativeDecimal(value, fieldName, options = {}) {
  return parseDecimal(value, fieldName, {
    ...options,
    min: 0,
    allowZero: true,
  });
}

function parsePositiveDecimal(value, fieldName, options = {}) {
  return parseDecimal(value, fieldName, {
    ...options,
    min: 0,
    allowZero: false,
  });
}

function parseBoolean(value, fieldName, defaultValue = null) {
  if (isMissing(value)) {
    if (defaultValue !== null) return defaultValue;
    throw createHttpError(400, `${fieldName} wajib diisi`, {
      code: `${fieldName.toUpperCase()}_REQUIRED`,
    });
  }

  if (typeof value === "string" && value.trim() === "") {
    throw createHttpError(400, `${fieldName} tidak boleh kosong`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
  }

  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || String(value).toLowerCase() === "true") return true;
  if (value === 0 || value === "0" || String(value).toLowerCase() === "false") return false;

  throw createHttpError(400, `${fieldName} harus berupa boolean`, {
    code: `INVALID_${fieldName.toUpperCase()}`,
  });
}

function parseMonthDate(value, fieldName, options = {}) {
  const { required = false } = options;

  if (isMissing(value) || value === "") {
    if (!required) return null;
    throw createHttpError(400, `${fieldName} wajib diisi`, {
      code: `${fieldName.toUpperCase()}_REQUIRED`,
    });
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-01)?$/);
  const month = match ? Number(match[2]) : 0;

  if (!match || month < 1 || month > 12) {
    throw createHttpError(400, `${fieldName} harus berformat YYYY-MM atau YYYY-MM-01`, {
      code: "INVALID_MONTH_DATE",
    });
  }

  return `${match[1]}-${match[2]}-01`;
}

function parseIsoDate(value, fieldName, options = {}) {
  const { required = true } = options;

  if (isMissing(value) || value === "") {
    if (!required) return null;
    throw createHttpError(400, `${fieldName} wajib diisi`, {
      code: `${fieldName.toUpperCase()}_REQUIRED`,
    });
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw createHttpError(400, `${fieldName} harus berformat YYYY-MM-DD`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
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
    throw createHttpError(400, `${fieldName} tidak valid`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
  }

  return text;
}

module.exports = {
  NUMERIC_14_2_MAX,
  NUMERIC_18_2_MAX,
  decimalPlaces,
  normalizeText,
  parseBoolean,
  parseDecimal,
  parseIntegerId,
  parseIsoDate,
  parseMonthDate,
  parseNonNegativeDecimal,
  parsePositiveDecimal,
};

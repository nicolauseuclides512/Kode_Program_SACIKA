const { createHttpError } = require("./httpError");

function translateDatabaseError(error, options = {}) {
  if (!error || error.statusCode) return error;

  const duplicateMessage = options.duplicateMessage || "Data yang sama sudah tersedia";
  const referenceMessage = options.referenceMessage
    || "Data tidak dapat diubah karena masih digunakan oleh data lain";
  const constraintMessage = options.constraintMessage || "Data tidak memenuhi aturan sistem";

  if (error.code === "23505") {
    return createHttpError(409, duplicateMessage, {
      code: options.duplicateCode || "DATA_CONFLICT",
      cause: error,
    });
  }

  if (error.code === "23503") {
    return createHttpError(409, referenceMessage, {
      code: options.referenceCode || "DATA_STILL_IN_USE",
      cause: error,
    });
  }

  if (error.code === "23514") {
    return createHttpError(400, constraintMessage, {
      code: options.constraintCode || "DATA_CONSTRAINT_VIOLATION",
      cause: error,
    });
  }

  if (["22P02", "22003", "22007", "22008"].includes(error.code)) {
    return createHttpError(400, "Format atau rentang data tidak valid", {
      code: "INVALID_DATABASE_VALUE",
      cause: error,
    });
  }

  return error;
}

module.exports = {
  translateDatabaseError,
};

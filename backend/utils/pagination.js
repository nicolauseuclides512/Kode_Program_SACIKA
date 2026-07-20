const { createHttpError } = require("./httpError");

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 120;

function parsePositiveInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} harus berupa bilangan bulat positif`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
  }
  return parsed;
}

function parseBooleanQuery(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if ([true, "true", "1", 1].includes(value)) return true;
  if ([false, "false", "0", 0].includes(value)) return false;
  throw createHttpError(400, "Parameter boolean tidak valid", {
    code: "INVALID_BOOLEAN_QUERY",
  });
}

function parseSearch(value) {
  const search = String(value || "").trim();
  if (search.length > MAX_SEARCH_LENGTH) {
    throw createHttpError(
      400,
      `Pencarian maksimal ${MAX_SEARCH_LENGTH} karakter`,
      { code: "SEARCH_TOO_LONG" },
    );
  }
  return search;
}

function parsePagination(query = {}, options = {}) {
  const defaultLimit = options.defaultLimit || DEFAULT_PAGE_SIZE;
  const maxLimit = options.maxLimit || MAX_PAGE_SIZE;
  const page = parsePositiveInteger(query.page, 1, "page");
  const requestedLimit = parsePositiveInteger(query.limit, defaultLimit, "limit");
  const limit = Math.min(requestedLimit, maxLimit);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    search: parseSearch(query.search),
  };
}

function createPaginationMeta({ page, limit, total }) {
  const numericTotal = Number(total || 0);
  const totalPages = Math.max(1, Math.ceil(numericTotal / limit));
  const normalizedPage = Math.min(page, totalPages);

  return {
    page: normalizedPage,
    limit,
    total: numericTotal,
    total_pages: totalPages,
    has_previous: normalizedPage > 1,
    has_next: normalizedPage < totalPages,
  };
}

function paginatedResponse(data, pagination, extra = {}) {
  return {
    data,
    pagination: createPaginationMeta(pagination),
    ...extra,
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  createPaginationMeta,
  paginatedResponse,
  parseBooleanQuery,
  parsePagination,
  parseSearch,
};

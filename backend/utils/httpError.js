class HttpError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options.code || null;
    this.details = options.details || null;
    this.expose = options.expose ?? statusCode < 500;
    this.cause = options.cause;
  }
}

function createHttpError(statusCode, message, options = {}) {
  return new HttpError(statusCode, message, options);
}

module.exports = {
  HttpError,
  createHttpError,
};

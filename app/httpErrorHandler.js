// Replaces Express' default error page, which echoes request fragments and stack traces.
// Express recognizes error middleware by its four parameters, so _next must stay.
function httpErrorHandler(error, _request, response, _next) {
  const status = Number(error?.status || error?.statusCode);
  const isClientError = status >= 400 && status < 500;
  response.status(isClientError ? status : 500).json({ error: isClientError ? 'Invalid request.' : 'Internal error.' });
}

module.exports = { httpErrorHandler };

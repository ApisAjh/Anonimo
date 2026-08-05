// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error('[error]', err);

  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Terjadi kesalahan pada server'
    : err.message || 'Terjadi kesalahan pada server';

  res.status(status).json({ success: false, error: message });
}

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan' });
}

module.exports = { errorHandler, notFoundHandler };

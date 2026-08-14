import mongoose from 'mongoose';

export async function healthController(req, res) {
  let databaseOk = false;
  let error = null;
  try {
    await mongoose.connection.db.admin().ping();
    databaseOk = true;
  } catch (exc) {
    error = exc.message;
  }
  return res.json({
    status: databaseOk ? 'ok' : 'degraded',
    database_backend: 'mongodb',
    database_ok: databaseOk,
    error,
  });
}

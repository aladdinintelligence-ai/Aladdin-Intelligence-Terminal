export function pickMiddleware(allowedFields) {
  return (req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
      const picked = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) picked[field] = req.body[field];
      }
      req.body = picked;
    }
    next();
  };
}

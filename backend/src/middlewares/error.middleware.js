function errorMiddleware(err, req, res, next) {
  console.error('Unhandled error:', err);

  // If it's a Zod validation error
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors,
    });
  }

  return res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

module.exports = { errorMiddleware };

/**
 * validate.js
 * 
 * Reusable middleware for validating Express request inputs (body, query, params)
 * using Zod schemas.
 */

const validate = (schema) => (req, res, next) => {
  try {
    // Parse input data against schema
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    return next();
  } catch (error) {
    // Format Zod errors into a friendly readable string format
    const errorMessage = error.errors 
      ? error.errors.map(e => `${e.path.slice(1).join('.')}: ${e.message}`).join(', ')
      : error.message;
      
    return res.status(400).json({ 
      success: false, 
      error: errorMessage 
    });
  }
};

module.exports = validate;

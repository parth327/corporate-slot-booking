/**
 * Wraps an async express handler so a rejected promise reaches the error
 * middleware instead of becoming an unhandled rejection.
 *
 *   router.get('/x', asyncHandler(async (req, res) => { ... }))
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => any} fn
 * @returns {import('express').RequestHandler}
 */
export default function asyncHandler(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('asyncHandler(fn): fn must be a function');
  }
  return function asyncHandlerWrapper(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

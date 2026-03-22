/**
 * Validate that a string's length is within [min, max].
 * Returns false if str is not a string or is out of range.
 */
function validateLength(str, min, max) {
  if (typeof str !== 'string') return false;
  const len = str.trim().length;
  return len >= min && len <= max;
}

/**
 * Validate that a URL string starts with http:// or https://.
 */
function validateUrl(url) {
  if (typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url.trim());
}

module.exports = { validateLength, validateUrl };

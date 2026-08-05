const sanitizeHtml = require('sanitize-html');

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidUsername(username) {
  return typeof username === 'string' && USERNAME_REGEX.test(username);
}

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email) && email.length <= 254;
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 72;
}

function cleanText(input, maxLength) {
  if (typeof input !== 'string') return '';
  const stripped = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim();
  return maxLength ? stripped.slice(0, maxLength) : stripped;
}

module.exports = { isValidUsername, isValidEmail, isValidPassword, cleanText };

// @ts-check
// public/html.mjs
// Views build markup as strings. Anything that is not fixed card data goes through esc before it is interpolated.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

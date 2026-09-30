// sfc32: fast, and its whole state is four 32-bit numbers, so a match can be saved and replayed exactly.
export function seededRandom(seed) {
  let [a, b, c, d] = Array.isArray(seed) ? seed : fromBytes(seed);
  const random = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  Object.defineProperty(random, 'state', {get: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0]});
  return random;
}

function fromBytes(bytes) {
  const u = new Uint8Array(bytes);
  if (u.length < 16) throw Error('A seed needs 16 bytes.');
  const view = new DataView(u.buffer, u.byteOffset, 16);
  return [0, 4, 8, 12].map(i => view.getUint32(i));
}

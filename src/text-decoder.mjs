export function decodeTextBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (!bytes.length) return '';

  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    // Some runtimes historically exposed a non-conformant windows-1252
    // TextDecoder that leaves the C1 extension bytes as control characters.
    // Decode with the platform first, then normalize those bytes to the
    // WHATWG Windows-1252 mapping so file handling is consistent everywhere.
    const decoded = new TextDecoder('windows-1252').decode(bytes);
    const windows1252Extensions = {
      0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E',
      0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6',
      0x89: '\u2030', 0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u0152',
      0x8E: '\u017D', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C',
      0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
      0x98: '\u02DC', 0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A',
      0x9C: '\u0153', 0x9E: '\u017E', 0x9F: '\u0178'
    };
    return Array.from(decoded, (char, index) => {
      const byte = bytes[index];
      return char.charCodeAt(0) === byte && windows1252Extensions[byte]
        ? windows1252Extensions[byte]
        : char;
    }).join('');
  }
}

export function readFileAsText(file) {
  return readFileAsArrayBuffer(file).then(buffer => decodeTextBuffer(buffer));
}

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
    reader.onabort = () => reject(new Error('The file read was cancelled.'));
    reader.readAsArrayBuffer(file);
  });
}

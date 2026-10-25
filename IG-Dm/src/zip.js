/**
 * Pure JavaScript In-Memory ZIP Archiver (Zero External Dependencies)
 * Implements standard PKWARE ZIP specification for uncompressed (STORE) entries.
 */

// CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

export function createZipBlob(files) {
  const fileEntries = Object.entries(files);
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  const textEncoder = new TextEncoder();

  for (const [filename, data] of fileEntries) {
    const nameBytes = textEncoder.encode(filename);
    const size = data.length;
    const crc = crc32(data);

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true);         // Version needed to extract
    lv.setUint16(6, 0, true);          // General purpose bit flag
    lv.setUint16(8, 0, true);          // Compression method: 0 (Stored)
    lv.setUint16(10, 0, true);         // Mod time
    lv.setUint16(12, 0, true);         // Mod date
    lv.setUint32(14, crc, true);       // CRC32
    lv.setUint32(18, size, true);      // Compressed size
    lv.setUint32(22, size, true);      // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // Filename length
    lv.setUint16(28, 0, true);         // Extra field length
    localHeader.set(nameBytes, 30);

    localHeaders.push(localHeader, data);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory file header signature
    cv.setUint16(4, 20, true);         // Version made by
    cv.setUint16(6, 20, true);         // Version needed to extract
    cv.setUint16(8, 0, true);          // General purpose bit flag
    cv.setUint16(10, 0, true);         // Compression method: 0
    cv.setUint16(12, 0, true);         // Mod time
    cv.setUint16(14, 0, true);         // Mod date
    cv.setUint32(16, crc, true);       // CRC32
    cv.setUint32(20, size, true);      // Compressed size
    cv.setUint32(24, size, true);      // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // Filename length
    cv.setUint16(30, 0, true);         // Extra field length
    cv.setUint16(32, 0, true);         // File comment length
    cv.setUint16(34, 0, true);         // Disk number start
    cv.setUint16(36, 0, true);         // Internal file attributes
    cv.setUint32(38, 0, true);         // External file attributes
    cv.setUint32(42, offset, true);    // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + size;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) {
    centralDirSize += ch.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true);          // Disk number
  ev.setUint16(6, 0, true);          // Disk with central dir
  ev.setUint16(8, fileEntries.length, true);  // Number of entries on this disk
  ev.setUint16(10, fileEntries.length, true); // Total entries
  ev.setUint32(12, centralDirSize, true);     // Size of central dir
  ev.setUint32(16, centralDirOffset, true);   // Offset of central dir
  ev.setUint16(20, 0, true);         // Comment length

  return new Blob([...localHeaders, ...centralHeaders, eocd], {
    type: "application/zip",
  });
}

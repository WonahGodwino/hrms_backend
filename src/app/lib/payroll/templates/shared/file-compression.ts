import { gzipSync, gunzipSync } from 'zlib';

const GZIP_MAGIC_BYTE_0 = 0x1f;
const GZIP_MAGIC_BYTE_1 = 0x8b;

export function compressFileBuffer(buffer: Buffer): Buffer {
	return gzipSync(buffer, { level: 9 });
}

// Rows written before compression was introduced store the raw buffer, so
// detect gzip's magic bytes rather than assuming every row is compressed.
export function decompressFileBufferIfNeeded(buffer: Buffer): Buffer {
	if (buffer.length >= 2 && buffer[0] === GZIP_MAGIC_BYTE_0 && buffer[1] === GZIP_MAGIC_BYTE_1) {
		return gunzipSync(buffer);
	}
	return buffer;
}

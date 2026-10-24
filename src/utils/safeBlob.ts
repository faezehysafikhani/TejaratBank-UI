// Files come back from the server with a content-type somebody chose when uploading. A blob URL
// is same-origin with the app, so a "text/html" or "image/svg+xml" attachment opened in a tab
// would run its script with the app's session. Only these types may keep their type (and be
// shown inline); anything else is handed on as an opaque download.
const SAFE_INLINE_TYPE = /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf|audio\/(webm|ogg|mp4|wav|mpeg)|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/(vnd\.ms-excel|msword))$/i;

export function isSafeInlineType(type: string | undefined | null): boolean {
  return !!type && SAFE_INLINE_TYPE.test(type.split(';')[0].trim());
}

/** The same bytes, with a type that cannot run script when opened. */
export function toSafeBlob(blob: Blob): Blob {
  return isSafeInlineType(blob.type) ? blob : new Blob([blob], { type: 'application/octet-stream' });
}

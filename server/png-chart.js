import zlib from 'node:zlib';

// Dependency-free PNG line chart for email digests. Email clients cannot render SVG, so the
// server rasterises a small cumulative-gain line and serves it as a hosted image.

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = buffer => {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const hex = value => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];

class Canvas {
  constructor(width, height, background = '#ffffff') {
    this.width = width; this.height = height;
    this.data = Buffer.alloc(width * height * 4);
    this.fillRect(0, 0, width, height, background);
  }
  set(x, y, color, alpha = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4, [r, g, b] = hex(color);
    this.data[i] = Math.round(this.data[i] * (1 - alpha) + r * alpha);
    this.data[i + 1] = Math.round(this.data[i + 1] * (1 - alpha) + g * alpha);
    this.data[i + 2] = Math.round(this.data[i + 2] * (1 - alpha) + b * alpha);
    this.data[i + 3] = 255;
  }
  fillRect(x0, y0, w, h, color, alpha = 1) {
    for (let y = Math.max(0, y0); y < Math.min(this.height, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.width, x0 + w); x++) this.set(x, y, color, alpha);
    }
  }
  // Vertical span per column keeps the polyline continuous without anti-aliasing work.
  polyline(points, color, thickness = 3) {
    const half = Math.floor(thickness / 2);
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      const steps = Math.max(1, Math.abs(x1 - x0));
      let prevY = y0;
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + (x1 - x0) * s / steps);
        const y = Math.round(y0 + (y1 - y0) * s / steps);
        const top = Math.min(prevY, y) - half, bottom = Math.max(prevY, y) + half;
        for (let yy = top; yy <= bottom; yy++) for (let xx = x - half; xx <= x + half; xx++) this.set(xx, yy, color);
        prevY = y;
      }
    }
  }
  png() { return encodePng(this.width, this.height, this.data); }
}

/**
 * Cumulative gain line for a series of daily counts (null = unknown day).
 * Returns null when fewer than two known days exist.
 */
export function renderGainChart(counts, { width = 600, height = 180, accent = '#315fd9' } = {}) {
  const known = counts.filter(value => value != null);
  if (known.length < 2) return null;
  const canvas = new Canvas(width, height);
  const pad = { left: 12, right: 12, top: 14, bottom: 14 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  let running = 0;
  const cumulative = counts.map(value => value == null ? null : (running += Math.max(0, value)));
  const max = Math.max(1, ...cumulative.filter(value => value != null));
  for (let i = 1; i <= 3; i++) canvas.fillRect(pad.left, Math.round(pad.top + plotH * i / 4), plotW, 1, '#e5e5e5');
  canvas.fillRect(pad.left, pad.top + plotH, plotW, 1, '#cfcfcf');
  const points = [];
  cumulative.forEach((value, i) => {
    if (value == null) return;
    const x = Math.round(pad.left + (counts.length === 1 ? 0 : plotW * i / (counts.length - 1)));
    const y = Math.round(pad.top + plotH - plotH * value / max);
    points.push([x, y]);
  });
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    for (let x = x0; x <= x1; x++) {
      const y = x1 === x0 ? y0 : Math.round(y0 + (y1 - y0) * (x - x0) / (x1 - x0));
      canvas.fillRect(x, y, 1, pad.top + plotH - y, accent, 0.12);
    }
  }
  canvas.polyline(points, accent, 3);
  const [lx, ly] = points[points.length - 1];
  canvas.fillRect(lx - 4, ly - 4, 8, 8, '#111111');
  canvas.fillRect(lx - 2, ly - 2, 4, 4, '#ffffff');
  return canvas.png();
}

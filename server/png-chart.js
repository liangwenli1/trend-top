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
  text(x, y, value, color = '#666666', scale = 2) {
    let cursor = x;
    for (const char of String(value)) {
      const rows = GLYPHS[char] || GLYPHS['?'];
      for (let row = 0; row < rows.length; row++) {
        for (let col = 0; col < rows[row].length; col++) {
          if (rows[row][col] === '1') this.fillRect(cursor + col * scale, y + row * scale, scale, scale, color);
        }
      }
      cursor += (rows[0].length + 1) * scale;
    }
    return cursor;
  }
  textWidth(value, scale = 2) {
    let width = 0;
    for (const char of String(value)) width += ((GLYPHS[char] || GLYPHS['?'])[0].length + 1) * scale;
    return Math.max(0, width - scale);
  }
}

const GLYPHS = {
  '0': ['01110', '10001', '10001', '10011', '10101', '11001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  k: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  '?': ['01110', '10001', '00010', '00100', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
};

function compactNumber(value) {
  if (value >= 1000000) return `${Math.round(value / 100000) / 10}M`.replace('.0M', 'M');
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

/**
 * Cumulative gain line for a series of daily counts (null = unknown day).
 * Returns null when fewer than two known days exist.
 */
export function renderGainChart(counts, { width = 600, height = 180, accent = '#315fd9', xStart = '', xEnd = '' } = {}) {
  const known = counts.filter(value => value != null);
  if (known.length < 2) return null;
  const labeled = width >= 400 && height >= 140;
  const scale = width >= 800 ? 2 : 1;
  const yMax = (() => {
    let running = 0;
    return Math.max(1, ...counts.map(value => value == null ? 0 : (running += Math.max(0, value))));
  })();
  const yLabel = compactNumber(yMax);
  const canvas = new Canvas(width, height);
  const pad = labeled
    ? { left: 16 + canvas.textWidth(yLabel, scale), right: 18, top: 16, bottom: xStart || xEnd ? 28 : 16 }
    : { left: 12, right: 12, top: 14, bottom: 14 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  let running = 0;
  const cumulative = counts.map(value => value == null ? null : (running += Math.max(0, value)));
  const max = Math.max(1, ...cumulative.filter(value => value != null));
  if (labeled) {
    canvas.text(pad.left - canvas.textWidth(yLabel, scale) - 8, pad.top - 2, yLabel, '#737373', scale);
    canvas.text(pad.left - canvas.textWidth('0', scale) - 8, pad.top + plotH - 12, '0', '#737373', scale);
    if (xStart) canvas.text(pad.left, height - 18, xStart, '#737373', scale);
    if (xEnd) canvas.text(width - pad.right - canvas.textWidth(xEnd, scale), height - 18, xEnd, '#737373', scale);
  }
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

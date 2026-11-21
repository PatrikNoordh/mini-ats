/// <reference types="node" />
// A small PNG writer for made-up images (ATS-55): the demo seed's brand and the end-to-end tests'
// backgrounds are drawn here at run time, so no image file, and never a real company's, is in the
// repo. Truecolour, 8 bits a channel, no transparency, one zlib stream.
import { deflateSync } from "node:zlib";

/** A colour as red, green and blue from 0 to 255. */
export type Rgb = readonly [number, number, number];

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOUR_TYPE_RGB = 2;
const BIT_DEPTH = 8;
const NO_FILTER = 0;

/** CRC-32 as PNG chunks need it, by the standard table. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** A PNG of the given size, each pixel's colour from `pixel(x, y)`. */
export function png(width: number, height: number, pixel: (x: number, y: number) => Rgb): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(BIT_DEPTH, 8);
  header.writeUInt8(COLOUR_TYPE_RGB, 9);
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * rowBytes] = NO_FILTER;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw.set([r, g, b], y * rowBytes + 1 + x * 3);
    }
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A PNG of one colour. */
export function solidPng(width: number, height: number, colour: Rgb): Buffer {
  return png(width, height, () => colour);
}

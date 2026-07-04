import { Buffer } from "node:buffer";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export async function persistRemoteAsset(url: string, key: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { storageKey: key, url };
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch provider asset: ${response.status}`);
  }
  const blob = await response.blob();
  const stored = await put(key, blob, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return { storageKey: stored.pathname, url: stored.url };
}

export async function persistDataUrlAsset(dataUrl: string, key: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !dataUrl.startsWith("data:")) {
    return { storageKey: key, url: dataUrl };
  }

  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return { storageKey: key, url: dataUrl };

  const [, mime, encoded] = match;
  const extension = mime.split("/").at(1)?.split("+").at(0) ?? "bin";
  const body = new Blob([Buffer.from(encoded, "base64")], { type: mime });
  const stored = await put(`${key}.${extension}`, body, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return { storageKey: stored.pathname, url: stored.url };
}

export async function persistLocalFileAsset(filePath: string, key: string, mime: string) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const body = new Blob([await readFile(filePath)], { type: mime });
    const stored = await put(`${key}.${extensionForMime(mime)}`, body, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { storageKey: stored.pathname, url: stored.url };
  }

  const cleanKey = sanitizeStorageKey(key);
  const relativePath = `${cleanKey}.${extensionForMime(mime)}`;
  const publicRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated");
  const targetPath = path.join(publicRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(filePath, targetPath);
  return {
    storageKey: `public/generated/${relativePath}`,
    url: `/generated/${relativePath}`,
  };
}

function extensionForMime(mime: string) {
  if (mime === "video/mp4") return "mp4";
  if (mime === "image/png") return "png";
  if (mime === "audio/wav") return "wav";
  if (mime === "application/json") return "json";
  return mime.split("/").at(1)?.split("+").at(0) ?? "bin";
}

function sanitizeStorageKey(key: string) {
  return key
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9_.-]/g, "_"))
    .join("/");
}

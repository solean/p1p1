const COOKIE_NAME = "p1p1-player";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
const encoder = new TextEncoder();

export type PlayerIdentity = {
  id: string;
  setCookie?: string;
};

let importedSecret: string | undefined;
let importedKey: Promise<CryptoKey> | undefined;

function signingKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) {
    throw new Error("PLAYER_COOKIE_SECRET must contain at least 32 characters");
  }
  if (!importedKey || importedSecret !== secret) {
    importedSecret = secret;
    importedKey = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return importedKey;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signedValue(id: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(id),
  );
  return `${id}.${encodeBase64Url(signature)}`;
}

function cookieValue(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  const cookie = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return cookie?.slice(COOKIE_NAME.length + 1);
}

function serializeCookie(value: string, maxAge: number, secure: boolean): string {
  const secureAttribute = secure ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly${secureAttribute}; SameSite=Lax`;
}

export async function playerIdentity(
  request: Request,
  secret: string,
): Promise<PlayerIdentity> {
  const value = cookieValue(request);
  if (value) {
    const separator = value.lastIndexOf(".");
    const id = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    if (separator > 0 && /^[0-9a-f-]{36}$/.test(id)) {
      try {
        const valid = await crypto.subtle.verify(
          "HMAC",
          await signingKey(secret),
          decodeBase64Url(signature),
          encoder.encode(id),
        );
        if (valid) return { id };
      } catch {
        // Invalid encodings receive a fresh anonymous identity below.
      }
    }
  }

  const id = crypto.randomUUID();
  const secure = new URL(request.url).protocol === "https:";
  return {
    id,
    setCookie: serializeCookie(await signedValue(id, secret), COOKIE_MAX_AGE, secure),
  };
}

export function clearPlayerCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:";
  return serializeCookie("", 0, secure);
}

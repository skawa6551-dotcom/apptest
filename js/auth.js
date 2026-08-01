// ============================================================
// auth.js
// 生体認証（WebAuthn / Passkey）専用モジュール。
// DOM操作・Storageアクセス・settings.js/sound.jsへの依存は一切行わない。
//
//   register()     … 初回設定時（設定画面で生体認証を有効にした瞬間）にのみ呼ぶ。
//   authenticate() … 通常利用時（アプリ起動のたびのロック解除）に呼ぶ。
//
// ロック状態はモジュール内のメモリにのみ保持し、Storageへの保存は行わない。
// ============================================================

const CHALLENGE_BYTE_LENGTH = 32;

const USER_ID_BYTE_LENGTH = 16;

const AUTH_TIMEOUT_MS = 30000;

const RELYING_PARTY_NAME = 'Calculator 0209';

const LOCAL_USER_NAME = 'calculator-0209-local-user';

const LOCAL_USER_DISPLAY_NAME = 'Calculator 0209';

const PUBLIC_KEY_ALGORITHMS = Object.freeze([
  Object.freeze({ type: 'public-key', alg: -7 }), // ES256
  Object.freeze({ type: 'public-key', alg: -257 }), // RS256
]);

let isLockedState = true;

function createRandomBytes(length) {
  return window.crypto.getRandomValues(new Uint8Array(length));
}

function getRelyingPartyId() {
  if (typeof window === 'undefined' || !window.location) return undefined;
  return window.location.hostname;
}

function buildCreationOptions() {
  const rpId = getRelyingPartyId();

  return {
    challenge: createRandomBytes(CHALLENGE_BYTE_LENGTH),
    rp: rpId ? { id: rpId, name: RELYING_PARTY_NAME } : { name: RELYING_PARTY_NAME },
    user: {
      id: createRandomBytes(USER_ID_BYTE_LENGTH),
      name: LOCAL_USER_NAME,
      displayName: LOCAL_USER_DISPLAY_NAME,
    },
    pubKeyCredParams: PUBLIC_KEY_ALGORITHMS,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
    },
    timeout: AUTH_TIMEOUT_MS,
    attestation: 'none',
  };
}

function buildRequestOptions() {
  const rpId = getRelyingPartyId();

  return {
    challenge: createRandomBytes(CHALLENGE_BYTE_LENGTH),
    ...(rpId ? { rpId } : {}),
    userVerification: 'required',
    timeout: AUTH_TIMEOUT_MS,
  };
}

export async function isSupported() {
  if (typeof window === 'undefined') return false;
  if (typeof window.PublicKeyCredential !== 'function') return false;

  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (error) {
    return false;
  }
}

export async function register() {
  const supported = await isSupported();
  if (!supported) return false;

  try {
    const credential = await navigator.credentials.create({
      publicKey: buildCreationOptions(),
    });

    if (credential === null) return false;

    unlock();
    return true;
  } catch (error) {
    return false;
  }
}

export async function authenticate() {
  const supported = await isSupported();
  if (!supported) return false;

  try {
    const credential = await navigator.credentials.get({
      publicKey: buildRequestOptions(),
    });

    if (credential === null) return false;

    unlock();
    return true;
  } catch (error) {
    return false;
  }
}

export function lock() {
  isLockedState = true;
}

export function unlock() {
  isLockedState = false;
}

export function isLocked() {
  return isLockedState;
}

const Auth = Object.freeze({
  isSupported,
  register,
  authenticate,
  lock,
  unlock,
  isLocked,
});

export default Auth;

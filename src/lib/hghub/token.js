/* eslint-disable */
/** 适配层令牌：把插件 id、媒体/分集标识、上游地址签名后放进 URL，避免开放代理。 */

const nodeCrypto = require('crypto');

const secret = () =>
  process.env.HGHUB_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.PASSWORD ||
  'hghub-bridge-default-secret';

const b64url = (buffer) =>
  Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (text) => Buffer.from(String(text).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const sign = (payload) => {
  const body = b64url(JSON.stringify(payload));
  const mac = b64url(nodeCrypto.createHmac('sha256', secret()).update(body).digest());
  return `${body}.${mac}`;
};

const verify = (token) => {
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  const expected = b64url(nodeCrypto.createHmac('sha256', secret()).update(body).digest());
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !nodeCrypto.timingSafeEqual(left, right)) return null;
  try {
    return JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return null;
  }
};

module.exports = { sign, verify };

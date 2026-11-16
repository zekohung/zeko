/*
 * 今日水印相机会员响应改写 / Shadowrocket
 * 2026-11-14 | self-contained, no remote crypto dependencies.
 * Verified captured format: AES-128-CBC, PKCS#7, UTF-8, Base64.
 * Raw enum values and unknown rights are preserved.
 */
var XCameraVipRewrite = (function () {
  'use strict';
  var KEY_TEXT = 'xhey-cc4275fd-43';
  var DEFAULT_EXPIRES = Math.floor(Date.UTC(2099, 11, 31, 23, 59, 59) / 1000);
  // HAR verified H5 route; native binary constructs the relative route app/vip/info.
  // Optional next/ is compatibility matching, not a captured native URL assertion.
  var TARGET = /^https:\/\/today\.xhey\.top(?::443)?\/(?:next\/)?app\/(?:(?:h5\/)?vip\/info|(?:h5\/)?usermember\/good\/info)\/?(?:\?[^#]*)?$/i;
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var sbox = [], inverseSbox = [], roundKeys;

  function gf(a, b) {
    var n = 0;
    while (b) {
      if (b & 1) n ^= a;
      a = ((a << 1) ^ ((a & 128) ? 283 : 0)) & 255;
      b >>>= 1;
    }
    return n;
  }
  function rotateByte(x, n) { return ((x << n) | (x >>> (8 - n))) & 255; }
  function initAes() {
    if (roundKeys) return;
    var i, x, n, p, rcon = 1, temp;
    for (i = 0; i < 256; i++) {
      x = i; p = i ? 1 : 0; n = 254;
      while (n && i) { if (n & 1) p = gf(p, x); x = gf(x, x); n >>>= 1; }
      x = p ^ rotateByte(p, 1) ^ rotateByte(p, 2) ^ rotateByte(p, 3) ^ rotateByte(p, 4) ^ 99;
      sbox[i] = x; inverseSbox[x] = i;
    }
    roundKeys = utf8Encode(KEY_TEXT);
    for (i = 16; i < 176; i += 4) {
      temp = roundKeys.slice(i - 4, i);
      if (i % 16 === 0) {
        temp = [sbox[temp[1]] ^ rcon, sbox[temp[2]], sbox[temp[3]], sbox[temp[0]]];
        rcon = gf(rcon, 2);
      }
      for (n = 0; n < 4; n++) roundKeys[i + n] = roundKeys[i - 16 + n] ^ temp[n];
    }
  }
  function addKey(state, round) {
    for (var i = 0; i < 16; i++) state[i] ^= roundKeys[round * 16 + i];
  }
  function substitute(state, inverse) {
    var table = inverse ? inverseSbox : sbox;
    for (var i = 0; i < 16; i++) state[i] = table[state[i]];
  }
  function shiftRows(state, inverse) {
    var copy = state.slice(), row, column, source;
    for (row = 0; row < 4; row++) for (column = 0; column < 4; column++) {
      source = (column + (inverse ? 4 - row : row)) % 4;
      state[4 * column + row] = copy[4 * source + row];
    }
  }
  function mixColumns(state, inverse) {
    var column, at, a, b, c, d;
    for (column = 0; column < 4; column++) {
      at = column * 4; a = state[at]; b = state[at + 1]; c = state[at + 2]; d = state[at + 3];
      if (inverse) {
        state[at] = gf(a, 14) ^ gf(b, 11) ^ gf(c, 13) ^ gf(d, 9);
        state[at + 1] = gf(a, 9) ^ gf(b, 14) ^ gf(c, 11) ^ gf(d, 13);
        state[at + 2] = gf(a, 13) ^ gf(b, 9) ^ gf(c, 14) ^ gf(d, 11);
        state[at + 3] = gf(a, 11) ^ gf(b, 13) ^ gf(c, 9) ^ gf(d, 14);
      } else {
        state[at] = gf(a, 2) ^ gf(b, 3) ^ c ^ d;
        state[at + 1] = a ^ gf(b, 2) ^ gf(c, 3) ^ d;
        state[at + 2] = a ^ b ^ gf(c, 2) ^ gf(d, 3);
        state[at + 3] = gf(a, 3) ^ b ^ c ^ gf(d, 2);
      }
    }
  }
  function block(input, inverse) {
    initAes();
    if (input.length !== 16) throw new Error('Invalid AES block length');
    var state = input.slice(), round;
    if (inverse) {
      addKey(state, 10);
      for (round = 9; round >= 1; round--) {
        shiftRows(state, true); substitute(state, true); addKey(state, round); mixColumns(state, true);
      }
      shiftRows(state, true); substitute(state, true); addKey(state, 0);
    } else {
      addKey(state, 0);
      for (round = 1; round < 10; round++) {
        substitute(state, false); shiftRows(state, false); mixColumns(state, false); addKey(state, round);
      }
      substitute(state, false); shiftRows(state, false); addKey(state, 10);
    }
    return state;
  }
  function utf8Encode(text) {
    var encoded = encodeURIComponent(text), bytes = [], i;
    for (i = 0; i < encoded.length; i++) {
      if (encoded.charAt(i) === '%') { bytes.push(parseInt(encoded.substr(i + 1, 2), 16)); i += 2; }
      else bytes.push(encoded.charCodeAt(i));
    }
    return bytes;
  }
  function utf8Decode(bytes) {
    var encoded = '', i;
    for (i = 0; i < bytes.length; i++) encoded += '%' + ('0' + bytes[i].toString(16)).slice(-2);
    return decodeURIComponent(encoded);
  }
  function base64Encode(bytes) {
    var output = '', i, a, b, c, n;
    for (i = 0; i < bytes.length; i += 3) {
      a = bytes[i]; b = bytes[i + 1]; c = bytes[i + 2]; n = (a << 16) | ((b || 0) << 8) | (c || 0);
      output += B64.charAt((n >>> 18) & 63) + B64.charAt((n >>> 12) & 63) +
        (i + 1 < bytes.length ? B64.charAt((n >>> 6) & 63) : '=') +
        (i + 2 < bytes.length ? B64.charAt(n & 63) : '=');
    }
    return output;
  }
  function base64Decode(text) {
    if (typeof text !== 'string' || !text.length || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      throw new Error('Invalid Base64');
    }
    var output = [], i, n;
    for (i = 0; i < text.length; i += 4) {
      n = (B64.indexOf(text.charAt(i)) << 18) | (B64.indexOf(text.charAt(i + 1)) << 12) |
        ((text.charAt(i + 2) === '=' ? 0 : B64.indexOf(text.charAt(i + 2))) << 6) |
        (text.charAt(i + 3) === '=' ? 0 : B64.indexOf(text.charAt(i + 3)));
      output.push((n >>> 16) & 255);
      if (text.charAt(i + 2) !== '=') output.push((n >>> 8) & 255);
      if (text.charAt(i + 3) !== '=') output.push(n & 255);
    }
    if (base64Encode(output) !== text) throw new Error('Noncanonical Base64');
    return output;
  }
  function encrypt(bytes) {
    var padded = bytes.slice(), padding = 16 - bytes.length % 16;
    var previous = utf8Encode(KEY_TEXT), output = [], i, j, current;
    for (i = 0; i < padding; i++) padded.push(padding);
    for (i = 0; i < padded.length; i += 16) {
      current = padded.slice(i, i + 16);
      for (j = 0; j < 16; j++) current[j] ^= previous[j];
      previous = block(current, false);
      for (j = 0; j < 16; j++) output.push(previous[j]);
    }
    return output;
  }
  function decrypt(bytes) {
    if (!bytes.length || bytes.length % 16) throw new Error('Invalid AES ciphertext length');
    var previous = utf8Encode(KEY_TEXT), output = [], i, j, current, plain;
    for (i = 0; i < bytes.length; i += 16) {
      current = bytes.slice(i, i + 16); plain = block(current, true);
      for (j = 0; j < 16; j++) output.push(plain[j] ^ previous[j]);
      previous = current;
    }
    var padding = output[output.length - 1];
    if (padding < 1 || padding > 16) throw new Error('Invalid PKCS#7 padding');
    for (i = output.length - padding; i < output.length; i++) {
      if (output[i] !== padding) throw new Error('Invalid PKCS#7 padding');
    }
    return output.slice(0, output.length - padding);
  }
  function decodeResult(encoded) {
    var text = utf8Decode(decrypt(base64Decode(encoded))), object, innerBase64 = false;
    try { object = JSON.parse(text); }
    catch (error) { object = JSON.parse(utf8Decode(base64Decode(text))); innerBase64 = true; }
    return { object: object, innerBase64: innerBase64 };
  }
  function encodeResult(object, innerBase64) {
    var text = JSON.stringify(object);
    if (innerBase64) text = base64Encode(utf8Encode(text));
    return base64Encode(encrypt(utf8Encode(text)));
  }
  function options(argument) {
    var result = { expires: DEFAULT_EXPIRES, count: 999999, vipLevel: null };
    if (!argument) return result;
    var supplied = JSON.parse(argument), n;
    if (Object.prototype.hasOwnProperty.call(supplied, 'expires')) {
      n = Number(supplied.expires);
      if (!isFinite(n) || n < 2000000000 || n > 9999999999 || Math.floor(n) !== n) throw new Error('expires must be a future Unix timestamp in seconds');
      result.expires = n;
    }
    if (Object.prototype.hasOwnProperty.call(supplied, 'count')) {
      n = Number(supplied.count);
      if (!isFinite(n) || n < 1 || n > 2147483647 || Math.floor(n) !== n) throw new Error('count must be a positive integer');
      result.count = n;
    }
    if (Object.prototype.hasOwnProperty.call(supplied, 'vipLevel')) {
      n = Number(supplied.vipLevel);
      if (!isFinite(n) || n < 0 || n > 999 || Math.floor(n) !== n) throw new Error('vipLevel must be an integer from 0 to 999');
      result.vipLevel = n;
    }
    return result;
  }
  function expiryValue(original, seconds) {
    // Preserve a nonzero observed millisecond representation; zero defaults to seconds.
    return Number(original) >= 100000000000 ? seconds * 1000 : seconds;
  }
  function patchMembership(object, config) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
    if (object.code !== undefined && object.code !== 200 && object.code !== 0) return false;
    var data = object.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (data.status !== undefined && data.status !== 0) return false;
    // Refuse to create a member object from an unrelated/error response.
    if (typeof data.isVip !== 'boolean' && typeof data.isAdFreeVip !== 'boolean' &&
        !(data.aiVip && typeof data.aiVip.isAiVip === 'boolean')) return false;
    if (typeof data.isVip === 'boolean') {
      data.isVip = true;
      if ('vipExpireTime' in data) data.vipExpireTime = expiryValue(data.vipExpireTime, config.expires);
    }
    if (typeof data.isAdFreeVip === 'boolean') {
      data.isAdFreeVip = true;
      if ('adFreeVipExpireTime' in data) data.adFreeVipExpireTime = expiryValue(data.adFreeVipExpireTime, config.expires);
    }
    if (typeof data.removeWatermarkCounts === 'number') data.removeWatermarkCounts = config.count;
    if (config.vipLevel !== null && typeof data.vipLevel === 'number') data.vipLevel = config.vipLevel;
    if (data.aiVip && typeof data.aiVip.isAiVip === 'boolean') {
      data.aiVip.isAiVip = true;
      if ('aiVipExpireTime' in data.aiVip) data.aiVip.aiVipExpireTime = expiryValue(data.aiVip.aiVipExpireTime, config.expires);
    }
    if (Array.isArray(data.vips)) data.vips.forEach(function (vip) {
      if (!vip || typeof vip !== 'object' || typeof vip.isVip !== 'boolean') return;
      vip.isVip = true;
      if ('expireTime' in vip) vip.expireTime = expiryValue(vip.expireTime, config.expires);
    });
    return true;
  }
  function processBody(url, body, argument) {
    if (!TARGET.test(url)) return { changed: false, reason: 'unmatched URL' };
    if (typeof body !== 'string' || !body) return { changed: false, reason: 'empty or non-text response' };
    var envelope = JSON.parse(body), config = options(argument), decoded, object;
    if (envelope && typeof envelope.result === 'string') {
      decoded = decodeResult(envelope.result); object = decoded.object;
      if (!patchMembership(object, config)) return { changed: false, reason: 'not a successful member response' };
      envelope.result = encodeResult(object, decoded.innerBase64);
      return { changed: true, body: JSON.stringify(envelope), encrypted: true };
    }
    if (!patchMembership(envelope, config)) return { changed: false, reason: 'not a successful member response' };
    return { changed: true, body: JSON.stringify(envelope), encrypted: false };
  }
  function cleanHeaders(headers) {
    var output = {}, key;
    for (key in headers) if (Object.prototype.hasOwnProperty.call(headers, key)) {
      if (!/^(content-length|content-encoding|transfer-encoding|etag|content-md5|digest|content-digest)$/i.test(key)) output[key] = headers[key];
    }
    var contentType;
    for (key in output) if (/^content-type$/i.test(key)) contentType = key;
    output[contentType || 'Content-Type'] = 'application/json; charset=utf-8';
    return output;
  }
  return {
    processBody: processBody, decodeResult: decodeResult, encodeResult: encodeResult,
    encrypt: encrypt, decrypt: decrypt, block: block,
    base64Encode: base64Encode, base64Decode: base64Decode,
    utf8Encode: utf8Encode, utf8Decode: utf8Decode,
    cleanHeaders: cleanHeaders, defaultExpires: DEFAULT_EXPIRES
  };
}());

(function () {
  'use strict';
  if (typeof $done !== 'function') return;
  var completion = {}, message, probe = '';
  try {
    if (typeof $request === 'undefined' || typeof $response === 'undefined') throw new Error('Requires an HTTP response trigger');
    var code = Number($response.statusCode || $response.status || 200);
    var rawBody = typeof $response.body === 'string' ? $response.body : '';
    var headers = $response.headers || {}, ctype = '', key;
    for (key in headers) if (Object.prototype.hasOwnProperty.call(headers, key) && /^content-type$/i.test(key)) ctype = headers[key];
    probe = '[XCamera VIP] PROBE ' + ($request.method || 'GET') + ' ' + $request.url +
      ' | ' + code + ' | ' + ctype + ' | len=' + rawBody.length +
      ' | ' + rawBody.substring(0, 360).replace(/\s+/g, ' ');
    var scanText = '';
    try {
      if (rawBody && rawBody.indexOf('"result"') !== -1) {
        var envelope = JSON.parse(rawBody);
        if (envelope && typeof envelope.result === 'string') {
          var inner = XCameraVipRewrite.decodeResult(envelope.result);
          scanText = JSON.stringify(inner.object);
          probe += ' || AES' + (inner.innerBase64 ? '+B64' : '');
        }
      } else if (rawBody && rawBody.indexOf('__NEXT_DATA__') !== -1) {
        scanText = rawBody;
        probe += ' || NEXT_DATA';
      }
    } catch (decodeError) { probe += ' || DECODE_ERR ' + decodeError.message; }
    if (scanText) {
      var hits = [], fieldRe = /"([A-Za-z0-9_]*(?:vip|member|expire|adfree|watermark)[A-Za-z0-9_]*)"\s*:\s*("(?:[^"\\]|\\.){0,40}"|-?\d{1,15}|true|false|null)/gi, mm;
      while ((mm = fieldRe.exec(scanText)) !== null && hits.length < 40) hits.push(mm[1] + '=' + mm[2]);
      probe += ' || FIELDS(' + hits.length + ') ' + hits.join(' ; ');
    }
    if (!isFinite(code) || code < 200 || code >= 300) {
      message = '原样放行：HTTP 状态非 2xx';
    } else {
      var result = XCameraVipRewrite.processBody($request.url, $response.body, typeof $argument === 'string' ? $argument : '');
      if (result.changed) {
        completion = { body: result.body, headers: XCameraVipRewrite.cleanHeaders($response.headers || {}) };
        message = '已改写会员响应：个人会员 / 免广告 / AI / 去水印次数；' + (result.encrypted ? 'AES 已重新加密' : '明文 JSON');
      } else message = '原样放行：' + result.reason;
    }
  } catch (error) { message = '原样放行：' + error.message; }
  try { console.log(probe); } catch (ignored) {}
  try { console.log('[XCamera VIP] ' + message); } catch (ignored) {}
  $done(completion);
}());


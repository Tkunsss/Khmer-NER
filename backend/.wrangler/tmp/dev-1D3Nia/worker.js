var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err2) => function __init() {
  if (err2) throw err2[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err2 = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_modules_watch_stub();
  }
});

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// node-built-in-modules:crypto
import libDefault from "crypto";
var require_crypto = __commonJS({
  "node-built-in-modules:crypto"(exports, module) {
    init_modules_watch_stub();
    module.exports = libDefault;
  }
});

// node_modules/bcryptjs/dist/bcrypt.js
var require_bcrypt = __commonJS({
  "node_modules/bcryptjs/dist/bcrypt.js"(exports, module) {
    init_modules_watch_stub();
    (function(global, factory) {
      if (typeof define === "function" && define["amd"])
        define([], factory);
      else if (typeof __require === "function" && typeof module === "object" && module && module["exports"])
        module["exports"] = factory();
      else
        (global["dcodeIO"] = global["dcodeIO"] || {})["bcrypt"] = factory();
    })(exports, function() {
      "use strict";
      var bcrypt2 = {};
      var randomFallback = null;
      function random(len) {
        if (typeof module !== "undefined" && module && module["exports"])
          try {
            return require_crypto()["randomBytes"](len);
          } catch (e) {
          }
        try {
          var a;
          (self["crypto"] || self["msCrypto"])["getRandomValues"](a = new Uint32Array(len));
          return Array.prototype.slice.call(a);
        } catch (e) {
        }
        if (!randomFallback)
          throw Error("Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative");
        return randomFallback(len);
      }
      __name(random, "random");
      var randomAvailable = false;
      try {
        random(1);
        randomAvailable = true;
      } catch (e) {
      }
      randomFallback = null;
      bcrypt2.setRandomFallback = function(random2) {
        randomFallback = random2;
      };
      bcrypt2.genSaltSync = function(rounds, seed_length) {
        rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
        if (typeof rounds !== "number")
          throw Error("Illegal arguments: " + typeof rounds + ", " + typeof seed_length);
        if (rounds < 4)
          rounds = 4;
        else if (rounds > 31)
          rounds = 31;
        var salt = [];
        salt.push("$2a$");
        if (rounds < 10)
          salt.push("0");
        salt.push(rounds.toString());
        salt.push("$");
        salt.push(base64_encode(random(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
        return salt.join("");
      };
      bcrypt2.genSalt = function(rounds, seed_length, callback) {
        if (typeof seed_length === "function")
          callback = seed_length, seed_length = void 0;
        if (typeof rounds === "function")
          callback = rounds, rounds = void 0;
        if (typeof rounds === "undefined")
          rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
        else if (typeof rounds !== "number")
          throw Error("illegal arguments: " + typeof rounds);
        function _async(callback2) {
          nextTick(function() {
            try {
              callback2(null, bcrypt2.genSaltSync(rounds));
            } catch (err2) {
              callback2(err2);
            }
          });
        }
        __name(_async, "_async");
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err2, res) {
              if (err2) {
                reject(err2);
                return;
              }
              resolve(res);
            });
          });
      };
      bcrypt2.hashSync = function(s, salt) {
        if (typeof salt === "undefined")
          salt = GENSALT_DEFAULT_LOG2_ROUNDS;
        if (typeof salt === "number")
          salt = bcrypt2.genSaltSync(salt);
        if (typeof s !== "string" || typeof salt !== "string")
          throw Error("Illegal arguments: " + typeof s + ", " + typeof salt);
        return _hash(s, salt);
      };
      bcrypt2.hash = function(s, salt, callback, progressCallback) {
        function _async(callback2) {
          if (typeof s === "string" && typeof salt === "number")
            bcrypt2.genSalt(salt, function(err2, salt2) {
              _hash(s, salt2, callback2, progressCallback);
            });
          else if (typeof s === "string" && typeof salt === "string")
            _hash(s, salt, callback2, progressCallback);
          else
            nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof salt)));
        }
        __name(_async, "_async");
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err2, res) {
              if (err2) {
                reject(err2);
                return;
              }
              resolve(res);
            });
          });
      };
      function safeStringCompare(known, unknown) {
        var right = 0, wrong = 0;
        for (var i = 0, k = known.length; i < k; ++i) {
          if (known.charCodeAt(i) === unknown.charCodeAt(i))
            ++right;
          else
            ++wrong;
        }
        if (right < 0)
          return false;
        return wrong === 0;
      }
      __name(safeStringCompare, "safeStringCompare");
      bcrypt2.compareSync = function(s, hash) {
        if (typeof s !== "string" || typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof s + ", " + typeof hash);
        if (hash.length !== 60)
          return false;
        return safeStringCompare(bcrypt2.hashSync(s, hash.substr(0, hash.length - 31)), hash);
      };
      bcrypt2.compare = function(s, hash, callback, progressCallback) {
        function _async(callback2) {
          if (typeof s !== "string" || typeof hash !== "string") {
            nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof hash)));
            return;
          }
          if (hash.length !== 60) {
            nextTick(callback2.bind(this, null, false));
            return;
          }
          bcrypt2.hash(s, hash.substr(0, 29), function(err2, comp) {
            if (err2)
              callback2(err2);
            else
              callback2(null, safeStringCompare(comp, hash));
          }, progressCallback);
        }
        __name(_async, "_async");
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err2, res) {
              if (err2) {
                reject(err2);
                return;
              }
              resolve(res);
            });
          });
      };
      bcrypt2.getRounds = function(hash) {
        if (typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof hash);
        return parseInt(hash.split("$")[2], 10);
      };
      bcrypt2.getSalt = function(hash) {
        if (typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof hash);
        if (hash.length !== 60)
          throw Error("Illegal hash length: " + hash.length + " != 60");
        return hash.substring(0, 29);
      };
      var nextTick = typeof process !== "undefined" && process && typeof process.nextTick === "function" ? typeof setImmediate === "function" ? setImmediate : process.nextTick : setTimeout;
      function stringToBytes(str) {
        var out = [], i = 0;
        utfx.encodeUTF16toUTF8(function() {
          if (i >= str.length) return null;
          return str.charCodeAt(i++);
        }, function(b) {
          out.push(b);
        });
        return out;
      }
      __name(stringToBytes, "stringToBytes");
      var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
      var BASE64_INDEX = [
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        0,
        1,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62,
        63,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        -1,
        -1,
        -1,
        -1,
        -1
      ];
      var stringFromCharCode = String.fromCharCode;
      function base64_encode(b, len) {
        var off = 0, rs = [], c1, c2;
        if (len <= 0 || len > b.length)
          throw Error("Illegal len: " + len);
        while (off < len) {
          c1 = b[off++] & 255;
          rs.push(BASE64_CODE[c1 >> 2 & 63]);
          c1 = (c1 & 3) << 4;
          if (off >= len) {
            rs.push(BASE64_CODE[c1 & 63]);
            break;
          }
          c2 = b[off++] & 255;
          c1 |= c2 >> 4 & 15;
          rs.push(BASE64_CODE[c1 & 63]);
          c1 = (c2 & 15) << 2;
          if (off >= len) {
            rs.push(BASE64_CODE[c1 & 63]);
            break;
          }
          c2 = b[off++] & 255;
          c1 |= c2 >> 6 & 3;
          rs.push(BASE64_CODE[c1 & 63]);
          rs.push(BASE64_CODE[c2 & 63]);
        }
        return rs.join("");
      }
      __name(base64_encode, "base64_encode");
      function base64_decode(s, len) {
        var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
        if (len <= 0)
          throw Error("Illegal len: " + len);
        while (off < slen - 1 && olen < len) {
          code = s.charCodeAt(off++);
          c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          code = s.charCodeAt(off++);
          c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          if (c1 == -1 || c2 == -1)
            break;
          o = c1 << 2 >>> 0;
          o |= (c2 & 48) >> 4;
          rs.push(stringFromCharCode(o));
          if (++olen >= len || off >= slen)
            break;
          code = s.charCodeAt(off++);
          c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          if (c3 == -1)
            break;
          o = (c2 & 15) << 4 >>> 0;
          o |= (c3 & 60) >> 2;
          rs.push(stringFromCharCode(o));
          if (++olen >= len || off >= slen)
            break;
          code = s.charCodeAt(off++);
          c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          o = (c3 & 3) << 6 >>> 0;
          o |= c4;
          rs.push(stringFromCharCode(o));
          ++olen;
        }
        var res = [];
        for (off = 0; off < olen; off++)
          res.push(rs[off].charCodeAt(0));
        return res;
      }
      __name(base64_decode, "base64_decode");
      var utfx = (function() {
        "use strict";
        var utfx2 = {};
        utfx2.MAX_CODEPOINT = 1114111;
        utfx2.encodeUTF8 = function(src, dst) {
          var cp = null;
          if (typeof src === "number")
            cp = src, src = /* @__PURE__ */ __name(function() {
              return null;
            }, "src");
          while (cp !== null || (cp = src()) !== null) {
            if (cp < 128)
              dst(cp & 127);
            else if (cp < 2048)
              dst(cp >> 6 & 31 | 192), dst(cp & 63 | 128);
            else if (cp < 65536)
              dst(cp >> 12 & 15 | 224), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
            else
              dst(cp >> 18 & 7 | 240), dst(cp >> 12 & 63 | 128), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
            cp = null;
          }
        };
        utfx2.decodeUTF8 = function(src, dst) {
          var a, b, c, d, fail = /* @__PURE__ */ __name(function(b2) {
            b2 = b2.slice(0, b2.indexOf(null));
            var err2 = Error(b2.toString());
            err2.name = "TruncatedError";
            err2["bytes"] = b2;
            throw err2;
          }, "fail");
          while ((a = src()) !== null) {
            if ((a & 128) === 0)
              dst(a);
            else if ((a & 224) === 192)
              (b = src()) === null && fail([a, b]), dst((a & 31) << 6 | b & 63);
            else if ((a & 240) === 224)
              ((b = src()) === null || (c = src()) === null) && fail([a, b, c]), dst((a & 15) << 12 | (b & 63) << 6 | c & 63);
            else if ((a & 248) === 240)
              ((b = src()) === null || (c = src()) === null || (d = src()) === null) && fail([a, b, c, d]), dst((a & 7) << 18 | (b & 63) << 12 | (c & 63) << 6 | d & 63);
            else throw RangeError("Illegal starting byte: " + a);
          }
        };
        utfx2.UTF16toUTF8 = function(src, dst) {
          var c1, c2 = null;
          while (true) {
            if ((c1 = c2 !== null ? c2 : src()) === null)
              break;
            if (c1 >= 55296 && c1 <= 57343) {
              if ((c2 = src()) !== null) {
                if (c2 >= 56320 && c2 <= 57343) {
                  dst((c1 - 55296) * 1024 + c2 - 56320 + 65536);
                  c2 = null;
                  continue;
                }
              }
            }
            dst(c1);
          }
          if (c2 !== null) dst(c2);
        };
        utfx2.UTF8toUTF16 = function(src, dst) {
          var cp = null;
          if (typeof src === "number")
            cp = src, src = /* @__PURE__ */ __name(function() {
              return null;
            }, "src");
          while (cp !== null || (cp = src()) !== null) {
            if (cp <= 65535)
              dst(cp);
            else
              cp -= 65536, dst((cp >> 10) + 55296), dst(cp % 1024 + 56320);
            cp = null;
          }
        };
        utfx2.encodeUTF16toUTF8 = function(src, dst) {
          utfx2.UTF16toUTF8(src, function(cp) {
            utfx2.encodeUTF8(cp, dst);
          });
        };
        utfx2.decodeUTF8toUTF16 = function(src, dst) {
          utfx2.decodeUTF8(src, function(cp) {
            utfx2.UTF8toUTF16(cp, dst);
          });
        };
        utfx2.calculateCodePoint = function(cp) {
          return cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
        };
        utfx2.calculateUTF8 = function(src) {
          var cp, l = 0;
          while ((cp = src()) !== null)
            l += utfx2.calculateCodePoint(cp);
          return l;
        };
        utfx2.calculateUTF16asUTF8 = function(src) {
          var n = 0, l = 0;
          utfx2.UTF16toUTF8(src, function(cp) {
            ++n;
            l += utfx2.calculateCodePoint(cp);
          });
          return [n, l];
        };
        return utfx2;
      })();
      Date.now = Date.now || function() {
        return +/* @__PURE__ */ new Date();
      };
      var BCRYPT_SALT_LEN = 16;
      var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
      var BLOWFISH_NUM_ROUNDS = 16;
      var MAX_EXECUTION_TIME = 100;
      var P_ORIG = [
        608135816,
        2242054355,
        320440878,
        57701188,
        2752067618,
        698298832,
        137296536,
        3964562569,
        1160258022,
        953160567,
        3193202383,
        887688300,
        3232508343,
        3380367581,
        1065670069,
        3041331479,
        2450970073,
        2306472731
      ];
      var S_ORIG = [
        3509652390,
        2564797868,
        805139163,
        3491422135,
        3101798381,
        1780907670,
        3128725573,
        4046225305,
        614570311,
        3012652279,
        134345442,
        2240740374,
        1667834072,
        1901547113,
        2757295779,
        4103290238,
        227898511,
        1921955416,
        1904987480,
        2182433518,
        2069144605,
        3260701109,
        2620446009,
        720527379,
        3318853667,
        677414384,
        3393288472,
        3101374703,
        2390351024,
        1614419982,
        1822297739,
        2954791486,
        3608508353,
        3174124327,
        2024746970,
        1432378464,
        3864339955,
        2857741204,
        1464375394,
        1676153920,
        1439316330,
        715854006,
        3033291828,
        289532110,
        2706671279,
        2087905683,
        3018724369,
        1668267050,
        732546397,
        1947742710,
        3462151702,
        2609353502,
        2950085171,
        1814351708,
        2050118529,
        680887927,
        999245976,
        1800124847,
        3300911131,
        1713906067,
        1641548236,
        4213287313,
        1216130144,
        1575780402,
        4018429277,
        3917837745,
        3693486850,
        3949271944,
        596196993,
        3549867205,
        258830323,
        2213823033,
        772490370,
        2760122372,
        1774776394,
        2652871518,
        566650946,
        4142492826,
        1728879713,
        2882767088,
        1783734482,
        3629395816,
        2517608232,
        2874225571,
        1861159788,
        326777828,
        3124490320,
        2130389656,
        2716951837,
        967770486,
        1724537150,
        2185432712,
        2364442137,
        1164943284,
        2105845187,
        998989502,
        3765401048,
        2244026483,
        1075463327,
        1455516326,
        1322494562,
        910128902,
        469688178,
        1117454909,
        936433444,
        3490320968,
        3675253459,
        1240580251,
        122909385,
        2157517691,
        634681816,
        4142456567,
        3825094682,
        3061402683,
        2540495037,
        79693498,
        3249098678,
        1084186820,
        1583128258,
        426386531,
        1761308591,
        1047286709,
        322548459,
        995290223,
        1845252383,
        2603652396,
        3431023940,
        2942221577,
        3202600964,
        3727903485,
        1712269319,
        422464435,
        3234572375,
        1170764815,
        3523960633,
        3117677531,
        1434042557,
        442511882,
        3600875718,
        1076654713,
        1738483198,
        4213154764,
        2393238008,
        3677496056,
        1014306527,
        4251020053,
        793779912,
        2902807211,
        842905082,
        4246964064,
        1395751752,
        1040244610,
        2656851899,
        3396308128,
        445077038,
        3742853595,
        3577915638,
        679411651,
        2892444358,
        2354009459,
        1767581616,
        3150600392,
        3791627101,
        3102740896,
        284835224,
        4246832056,
        1258075500,
        768725851,
        2589189241,
        3069724005,
        3532540348,
        1274779536,
        3789419226,
        2764799539,
        1660621633,
        3471099624,
        4011903706,
        913787905,
        3497959166,
        737222580,
        2514213453,
        2928710040,
        3937242737,
        1804850592,
        3499020752,
        2949064160,
        2386320175,
        2390070455,
        2415321851,
        4061277028,
        2290661394,
        2416832540,
        1336762016,
        1754252060,
        3520065937,
        3014181293,
        791618072,
        3188594551,
        3933548030,
        2332172193,
        3852520463,
        3043980520,
        413987798,
        3465142937,
        3030929376,
        4245938359,
        2093235073,
        3534596313,
        375366246,
        2157278981,
        2479649556,
        555357303,
        3870105701,
        2008414854,
        3344188149,
        4221384143,
        3956125452,
        2067696032,
        3594591187,
        2921233993,
        2428461,
        544322398,
        577241275,
        1471733935,
        610547355,
        4027169054,
        1432588573,
        1507829418,
        2025931657,
        3646575487,
        545086370,
        48609733,
        2200306550,
        1653985193,
        298326376,
        1316178497,
        3007786442,
        2064951626,
        458293330,
        2589141269,
        3591329599,
        3164325604,
        727753846,
        2179363840,
        146436021,
        1461446943,
        4069977195,
        705550613,
        3059967265,
        3887724982,
        4281599278,
        3313849956,
        1404054877,
        2845806497,
        146425753,
        1854211946,
        1266315497,
        3048417604,
        3681880366,
        3289982499,
        290971e4,
        1235738493,
        2632868024,
        2414719590,
        3970600049,
        1771706367,
        1449415276,
        3266420449,
        422970021,
        1963543593,
        2690192192,
        3826793022,
        1062508698,
        1531092325,
        1804592342,
        2583117782,
        2714934279,
        4024971509,
        1294809318,
        4028980673,
        1289560198,
        2221992742,
        1669523910,
        35572830,
        157838143,
        1052438473,
        1016535060,
        1802137761,
        1753167236,
        1386275462,
        3080475397,
        2857371447,
        1040679964,
        2145300060,
        2390574316,
        1461121720,
        2956646967,
        4031777805,
        4028374788,
        33600511,
        2920084762,
        1018524850,
        629373528,
        3691585981,
        3515945977,
        2091462646,
        2486323059,
        586499841,
        988145025,
        935516892,
        3367335476,
        2599673255,
        2839830854,
        265290510,
        3972581182,
        2759138881,
        3795373465,
        1005194799,
        847297441,
        406762289,
        1314163512,
        1332590856,
        1866599683,
        4127851711,
        750260880,
        613907577,
        1450815602,
        3165620655,
        3734664991,
        3650291728,
        3012275730,
        3704569646,
        1427272223,
        778793252,
        1343938022,
        2676280711,
        2052605720,
        1946737175,
        3164576444,
        3914038668,
        3967478842,
        3682934266,
        1661551462,
        3294938066,
        4011595847,
        840292616,
        3712170807,
        616741398,
        312560963,
        711312465,
        1351876610,
        322626781,
        1910503582,
        271666773,
        2175563734,
        1594956187,
        70604529,
        3617834859,
        1007753275,
        1495573769,
        4069517037,
        2549218298,
        2663038764,
        504708206,
        2263041392,
        3941167025,
        2249088522,
        1514023603,
        1998579484,
        1312622330,
        694541497,
        2582060303,
        2151582166,
        1382467621,
        776784248,
        2618340202,
        3323268794,
        2497899128,
        2784771155,
        503983604,
        4076293799,
        907881277,
        423175695,
        432175456,
        1378068232,
        4145222326,
        3954048622,
        3938656102,
        3820766613,
        2793130115,
        2977904593,
        26017576,
        3274890735,
        3194772133,
        1700274565,
        1756076034,
        4006520079,
        3677328699,
        720338349,
        1533947780,
        354530856,
        688349552,
        3973924725,
        1637815568,
        332179504,
        3949051286,
        53804574,
        2852348879,
        3044236432,
        1282449977,
        3583942155,
        3416972820,
        4006381244,
        1617046695,
        2628476075,
        3002303598,
        1686838959,
        431878346,
        2686675385,
        1700445008,
        1080580658,
        1009431731,
        832498133,
        3223435511,
        2605976345,
        2271191193,
        2516031870,
        1648197032,
        4164389018,
        2548247927,
        300782431,
        375919233,
        238389289,
        3353747414,
        2531188641,
        2019080857,
        1475708069,
        455242339,
        2609103871,
        448939670,
        3451063019,
        1395535956,
        2413381860,
        1841049896,
        1491858159,
        885456874,
        4264095073,
        4001119347,
        1565136089,
        3898914787,
        1108368660,
        540939232,
        1173283510,
        2745871338,
        3681308437,
        4207628240,
        3343053890,
        4016749493,
        1699691293,
        1103962373,
        3625875870,
        2256883143,
        3830138730,
        1031889488,
        3479347698,
        1535977030,
        4236805024,
        3251091107,
        2132092099,
        1774941330,
        1199868427,
        1452454533,
        157007616,
        2904115357,
        342012276,
        595725824,
        1480756522,
        206960106,
        497939518,
        591360097,
        863170706,
        2375253569,
        3596610801,
        1814182875,
        2094937945,
        3421402208,
        1082520231,
        3463918190,
        2785509508,
        435703966,
        3908032597,
        1641649973,
        2842273706,
        3305899714,
        1510255612,
        2148256476,
        2655287854,
        3276092548,
        4258621189,
        236887753,
        3681803219,
        274041037,
        1734335097,
        3815195456,
        3317970021,
        1899903192,
        1026095262,
        4050517792,
        356393447,
        2410691914,
        3873677099,
        3682840055,
        3913112168,
        2491498743,
        4132185628,
        2489919796,
        1091903735,
        1979897079,
        3170134830,
        3567386728,
        3557303409,
        857797738,
        1136121015,
        1342202287,
        507115054,
        2535736646,
        337727348,
        3213592640,
        1301675037,
        2528481711,
        1895095763,
        1721773893,
        3216771564,
        62756741,
        2142006736,
        835421444,
        2531993523,
        1442658625,
        3659876326,
        2882144922,
        676362277,
        1392781812,
        170690266,
        3921047035,
        1759253602,
        3611846912,
        1745797284,
        664899054,
        1329594018,
        3901205900,
        3045908486,
        2062866102,
        2865634940,
        3543621612,
        3464012697,
        1080764994,
        553557557,
        3656615353,
        3996768171,
        991055499,
        499776247,
        1265440854,
        648242737,
        3940784050,
        980351604,
        3713745714,
        1749149687,
        3396870395,
        4211799374,
        3640570775,
        1161844396,
        3125318951,
        1431517754,
        545492359,
        4268468663,
        3499529547,
        1437099964,
        2702547544,
        3433638243,
        2581715763,
        2787789398,
        1060185593,
        1593081372,
        2418618748,
        4260947970,
        69676912,
        2159744348,
        86519011,
        2512459080,
        3838209314,
        1220612927,
        3339683548,
        133810670,
        1090789135,
        1078426020,
        1569222167,
        845107691,
        3583754449,
        4072456591,
        1091646820,
        628848692,
        1613405280,
        3757631651,
        526609435,
        236106946,
        48312990,
        2942717905,
        3402727701,
        1797494240,
        859738849,
        992217954,
        4005476642,
        2243076622,
        3870952857,
        3732016268,
        765654824,
        3490871365,
        2511836413,
        1685915746,
        3888969200,
        1414112111,
        2273134842,
        3281911079,
        4080962846,
        172450625,
        2569994100,
        980381355,
        4109958455,
        2819808352,
        2716589560,
        2568741196,
        3681446669,
        3329971472,
        1835478071,
        660984891,
        3704678404,
        4045999559,
        3422617507,
        3040415634,
        1762651403,
        1719377915,
        3470491036,
        2693910283,
        3642056355,
        3138596744,
        1364962596,
        2073328063,
        1983633131,
        926494387,
        3423689081,
        2150032023,
        4096667949,
        1749200295,
        3328846651,
        309677260,
        2016342300,
        1779581495,
        3079819751,
        111262694,
        1274766160,
        443224088,
        298511866,
        1025883608,
        3806446537,
        1145181785,
        168956806,
        3641502830,
        3584813610,
        1689216846,
        3666258015,
        3200248200,
        1692713982,
        2646376535,
        4042768518,
        1618508792,
        1610833997,
        3523052358,
        4130873264,
        2001055236,
        3610705100,
        2202168115,
        4028541809,
        2961195399,
        1006657119,
        2006996926,
        3186142756,
        1430667929,
        3210227297,
        1314452623,
        4074634658,
        4101304120,
        2273951170,
        1399257539,
        3367210612,
        3027628629,
        1190975929,
        2062231137,
        2333990788,
        2221543033,
        2438960610,
        1181637006,
        548689776,
        2362791313,
        3372408396,
        3104550113,
        3145860560,
        296247880,
        1970579870,
        3078560182,
        3769228297,
        1714227617,
        3291629107,
        3898220290,
        166772364,
        1251581989,
        493813264,
        448347421,
        195405023,
        2709975567,
        677966185,
        3703036547,
        1463355134,
        2715995803,
        1338867538,
        1343315457,
        2802222074,
        2684532164,
        233230375,
        2599980071,
        2000651841,
        3277868038,
        1638401717,
        4028070440,
        3237316320,
        6314154,
        819756386,
        300326615,
        590932579,
        1405279636,
        3267499572,
        3150704214,
        2428286686,
        3959192993,
        3461946742,
        1862657033,
        1266418056,
        963775037,
        2089974820,
        2263052895,
        1917689273,
        448879540,
        3550394620,
        3981727096,
        150775221,
        3627908307,
        1303187396,
        508620638,
        2975983352,
        2726630617,
        1817252668,
        1876281319,
        1457606340,
        908771278,
        3720792119,
        3617206836,
        2455994898,
        1729034894,
        1080033504,
        976866871,
        3556439503,
        2881648439,
        1522871579,
        1555064734,
        1336096578,
        3548522304,
        2579274686,
        3574697629,
        3205460757,
        3593280638,
        3338716283,
        3079412587,
        564236357,
        2993598910,
        1781952180,
        1464380207,
        3163844217,
        3332601554,
        1699332808,
        1393555694,
        1183702653,
        3581086237,
        1288719814,
        691649499,
        2847557200,
        2895455976,
        3193889540,
        2717570544,
        1781354906,
        1676643554,
        2592534050,
        3230253752,
        1126444790,
        2770207658,
        2633158820,
        2210423226,
        2615765581,
        2414155088,
        3127139286,
        673620729,
        2805611233,
        1269405062,
        4015350505,
        3341807571,
        4149409754,
        1057255273,
        2012875353,
        2162469141,
        2276492801,
        2601117357,
        993977747,
        3918593370,
        2654263191,
        753973209,
        36408145,
        2530585658,
        25011837,
        3520020182,
        2088578344,
        530523599,
        2918365339,
        1524020338,
        1518925132,
        3760827505,
        3759777254,
        1202760957,
        3985898139,
        3906192525,
        674977740,
        4174734889,
        2031300136,
        2019492241,
        3983892565,
        4153806404,
        3822280332,
        352677332,
        2297720250,
        60907813,
        90501309,
        3286998549,
        1016092578,
        2535922412,
        2839152426,
        457141659,
        509813237,
        4120667899,
        652014361,
        1966332200,
        2975202805,
        55981186,
        2327461051,
        676427537,
        3255491064,
        2882294119,
        3433927263,
        1307055953,
        942726286,
        933058658,
        2468411793,
        3933900994,
        4215176142,
        1361170020,
        2001714738,
        2830558078,
        3274259782,
        1222529897,
        1679025792,
        2729314320,
        3714953764,
        1770335741,
        151462246,
        3013232138,
        1682292957,
        1483529935,
        471910574,
        1539241949,
        458788160,
        3436315007,
        1807016891,
        3718408830,
        978976581,
        1043663428,
        3165965781,
        1927990952,
        4200891579,
        2372276910,
        3208408903,
        3533431907,
        1412390302,
        2931980059,
        4132332400,
        1947078029,
        3881505623,
        4168226417,
        2941484381,
        1077988104,
        1320477388,
        886195818,
        18198404,
        3786409e3,
        2509781533,
        112762804,
        3463356488,
        1866414978,
        891333506,
        18488651,
        661792760,
        1628790961,
        3885187036,
        3141171499,
        876946877,
        2693282273,
        1372485963,
        791857591,
        2686433993,
        3759982718,
        3167212022,
        3472953795,
        2716379847,
        445679433,
        3561995674,
        3504004811,
        3574258232,
        54117162,
        3331405415,
        2381918588,
        3769707343,
        4154350007,
        1140177722,
        4074052095,
        668550556,
        3214352940,
        367459370,
        261225585,
        2610173221,
        4209349473,
        3468074219,
        3265815641,
        314222801,
        3066103646,
        3808782860,
        282218597,
        3406013506,
        3773591054,
        379116347,
        1285071038,
        846784868,
        2669647154,
        3771962079,
        3550491691,
        2305946142,
        453669953,
        1268987020,
        3317592352,
        3279303384,
        3744833421,
        2610507566,
        3859509063,
        266596637,
        3847019092,
        517658769,
        3462560207,
        3443424879,
        370717030,
        4247526661,
        2224018117,
        4143653529,
        4112773975,
        2788324899,
        2477274417,
        1456262402,
        2901442914,
        1517677493,
        1846949527,
        2295493580,
        3734397586,
        2176403920,
        1280348187,
        1908823572,
        3871786941,
        846861322,
        1172426758,
        3287448474,
        3383383037,
        1655181056,
        3139813346,
        901632758,
        1897031941,
        2986607138,
        3066810236,
        3447102507,
        1393639104,
        373351379,
        950779232,
        625454576,
        3124240540,
        4148612726,
        2007998917,
        544563296,
        2244738638,
        2330496472,
        2058025392,
        1291430526,
        424198748,
        50039436,
        29584100,
        3605783033,
        2429876329,
        2791104160,
        1057563949,
        3255363231,
        3075367218,
        3463963227,
        1469046755,
        985887462
      ];
      var C_ORIG = [
        1332899944,
        1700884034,
        1701343084,
        1684370003,
        1668446532,
        1869963892
      ];
      function _encipher(lr, off, P, S) {
        var n, l = lr[off], r = lr[off + 1];
        l ^= P[0];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[1];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[2];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[3];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[4];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[5];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[6];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[7];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[8];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[9];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[10];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[11];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[12];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[13];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[14];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[15];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[16];
        lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
        lr[off + 1] = l;
        return lr;
      }
      __name(_encipher, "_encipher");
      function _streamtoword(data, offp) {
        for (var i = 0, word = 0; i < 4; ++i)
          word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
        return { key: word, offp };
      }
      __name(_streamtoword, "_streamtoword");
      function _key(key, P, S) {
        var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
        for (var i = 0; i < plen; i++)
          sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
        for (i = 0; i < plen; i += 2)
          lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
        for (i = 0; i < slen; i += 2)
          lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
      }
      __name(_key, "_key");
      function _ekskey(data, key, P, S) {
        var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
        for (var i = 0; i < plen; i++)
          sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
        offp = 0;
        for (i = 0; i < plen; i += 2)
          sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
        for (i = 0; i < slen; i += 2)
          sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
      }
      __name(_ekskey, "_ekskey");
      function _crypt(b, salt, rounds, callback, progressCallback) {
        var cdata = C_ORIG.slice(), clen = cdata.length, err2;
        if (rounds < 4 || rounds > 31) {
          err2 = Error("Illegal number of rounds (4-31): " + rounds);
          if (callback) {
            nextTick(callback.bind(this, err2));
            return;
          } else
            throw err2;
        }
        if (salt.length !== BCRYPT_SALT_LEN) {
          err2 = Error("Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN);
          if (callback) {
            nextTick(callback.bind(this, err2));
            return;
          } else
            throw err2;
        }
        rounds = 1 << rounds >>> 0;
        var P, S, i = 0, j;
        if (Int32Array) {
          P = new Int32Array(P_ORIG);
          S = new Int32Array(S_ORIG);
        } else {
          P = P_ORIG.slice();
          S = S_ORIG.slice();
        }
        _ekskey(salt, b, P, S);
        function next() {
          if (progressCallback)
            progressCallback(i / rounds);
          if (i < rounds) {
            var start = Date.now();
            for (; i < rounds; ) {
              i = i + 1;
              _key(b, P, S);
              _key(salt, P, S);
              if (Date.now() - start > MAX_EXECUTION_TIME)
                break;
            }
          } else {
            for (i = 0; i < 64; i++)
              for (j = 0; j < clen >> 1; j++)
                _encipher(cdata, j << 1, P, S);
            var ret = [];
            for (i = 0; i < clen; i++)
              ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
            if (callback) {
              callback(null, ret);
              return;
            } else
              return ret;
          }
          if (callback)
            nextTick(next);
        }
        __name(next, "next");
        if (typeof callback !== "undefined") {
          next();
        } else {
          var res;
          while (true)
            if (typeof (res = next()) !== "undefined")
              return res || [];
        }
      }
      __name(_crypt, "_crypt");
      function _hash(s, salt, callback, progressCallback) {
        var err2;
        if (typeof s !== "string" || typeof salt !== "string") {
          err2 = Error("Invalid string / salt: Not a string");
          if (callback) {
            nextTick(callback.bind(this, err2));
            return;
          } else
            throw err2;
        }
        var minor, offset;
        if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
          err2 = Error("Invalid salt version: " + salt.substring(0, 2));
          if (callback) {
            nextTick(callback.bind(this, err2));
            return;
          } else
            throw err2;
        }
        if (salt.charAt(2) === "$")
          minor = String.fromCharCode(0), offset = 3;
        else {
          minor = salt.charAt(2);
          if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
            err2 = Error("Invalid salt revision: " + salt.substring(2, 4));
            if (callback) {
              nextTick(callback.bind(this, err2));
              return;
            } else
              throw err2;
          }
          offset = 4;
        }
        if (salt.charAt(offset + 2) > "$") {
          err2 = Error("Missing salt rounds");
          if (callback) {
            nextTick(callback.bind(this, err2));
            return;
          } else
            throw err2;
        }
        var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
        s += minor >= "a" ? "\0" : "";
        var passwordb = stringToBytes(s), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
        function finish(bytes) {
          var res = [];
          res.push("$2");
          if (minor >= "a")
            res.push(minor);
          res.push("$");
          if (rounds < 10)
            res.push("0");
          res.push(rounds.toString());
          res.push("$");
          res.push(base64_encode(saltb, saltb.length));
          res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
          return res.join("");
        }
        __name(finish, "finish");
        if (typeof callback == "undefined")
          return finish(_crypt(passwordb, saltb, rounds));
        else {
          _crypt(passwordb, saltb, rounds, function(err3, bytes) {
            if (err3)
              callback(err3, null);
            else
              callback(null, finish(bytes));
          }, progressCallback);
        }
      }
      __name(_hash, "_hash");
      bcrypt2.encodeBase64 = base64_encode;
      bcrypt2.decodeBase64 = base64_decode;
      return bcrypt2;
    });
  }
});

// .wrangler/tmp/bundle-ECPkMM/middleware-loader.entry.ts
init_modules_watch_stub();

// .wrangler/tmp/bundle-ECPkMM/middleware-insertion-facade.js
init_modules_watch_stub();

// worker.js
init_modules_watch_stub();
var import_bcryptjs = __toESM(require_bcrypt());

// auth.js
init_modules_watch_stub();
var ITERATIONS = 6e5;
var HASH_BYTES = 32;
var SALT_BYTES = 16;
var FORMAT = "pbkdf2-sha256";
function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(toBase64Url, "toBase64Url");
function fromBase64Url(value) {
  if (!/^[\w-]+$/.test(value)) throw new Error("Invalid base64url value.");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(fromBase64Url, "fromBase64Url");
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}
__name(derive, "derive");
async function hashPassword(password) {
  if (typeof password !== "string") {
    throw new TypeError("Password must be a string.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${FORMAT}$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== FORMAT) return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1e5 || iterations > 1e6) {
    return false;
  }
  try {
    const salt = fromBase64Url(parts[2]);
    const expected = fromBase64Url(parts[3]);
    if (salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) return false;
    const actual = await derive(password, salt, iterations);
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i];
    return difference === 0;
  } catch {
    return false;
  }
}
__name(verifyPassword, "verifyPassword");
function isLegacyBcrypt(stored) {
  return typeof stored === "string" && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(stored);
}
__name(isLegacyBcrypt, "isLegacyBcrypt");

// worker.js
var API_WINDOW_MS = 15 * 60 * 1e3;
var API_LIMIT = 600;
var LOGIN_LIMIT = 10;
var BODY_LIMIT = 2 * 1024 * 1024;
var apiHits = /* @__PURE__ */ new Map();
var loginHits = /* @__PURE__ */ new Map();
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var errorCode = /* @__PURE__ */ __name((error) => typeof error?.code === "string" ? error.code : typeof error?.message === "string" && error.message.includes("constraint failed") ? "SQLITE_CONSTRAINT" : "UNKNOWN", "errorCode");
var isDuplicateError = /* @__PURE__ */ __name((error) => errorCode(error) === "ER_DUP_ENTRY" || /unique constraint failed|primary key/i.test(error?.message || ""), "isDuplicateError");
var isForeignKeyError = /* @__PURE__ */ __name((error) => ["ER_NO_REFERENCED_ROW_2", "ER_ROW_IS_REFERENCED_2"].includes(errorCode(error)) || /foreign key constraint failed/i.test(error?.message || ""), "isForeignKeyError");
var json = /* @__PURE__ */ __name((body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers }
}), "json");
var err = /* @__PURE__ */ __name((status, message) => json({ error: message }, status), "err");
var noContent = /* @__PURE__ */ __name(() => new Response(null, { status: 204 }), "noContent");
function decodeCookie(request, name) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return "";
    }
  }
  return "";
}
__name(decodeCookie, "decodeCookie");
function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(base64UrlDecode, "base64UrlDecode");
async function jwtKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
__name(jwtKey, "jwtKey");
async function signToken(username, secret) {
  const now = Math.floor(Date.now() / 1e3);
  const header = base64UrlEncode(encoder.encode('{"alg":"HS256","typ":"JWT"}'));
  const payload = base64UrlEncode(
    encoder.encode(JSON.stringify({ u: username, iat: now, exp: now + 12 * 60 * 60 }))
  );
  const content = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await jwtKey(secret),
    encoder.encode(content)
  );
  return `${content}.${base64UrlEncode(new Uint8Array(signature))}`;
}
__name(signToken, "signToken");
async function verifyToken(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(decoder.decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(decoder.decode(base64UrlDecode(parts[1])));
    if (header.alg !== "HS256" || typeof payload.u !== "string" || typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1e3))
      return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await jwtKey(secret),
      base64UrlDecode(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`)
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}
__name(verifyToken, "verifyToken");
function consumeLimit(map, key, limit, now) {
  const recent = (map.get(key) || []).filter((time) => now - time < API_WINDOW_MS);
  if (recent.length >= limit) {
    map.set(key, recent);
    return false;
  }
  recent.push(now);
  map.set(key, recent);
  if (map.size > 1e4) {
    for (const [storedKey, times] of map) {
      if (!times.some((time) => now - time < API_WINDOW_MS)) map.delete(storedKey);
    }
  }
  return true;
}
__name(consumeLimit, "consumeLimit");
function rowForOffset(text, offset) {
  let row = 1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\r") {
      row++;
      if (text[i + 1] === "\n") i++;
    } else if (text[i] === "\n") row++;
  }
  return row;
}
__name(rowForOffset, "rowForOffset");
function maskUnassignedRows(text, assignments) {
  let row = 1;
  let assignmentIndex = 0;
  let position = 0;
  let chunkLength = 0;
  let parts = [];
  const chunks = [];
  const append = /* @__PURE__ */ __name((part) => {
    if (!part.length) return;
    parts.push(part);
    chunkLength += part.length;
    if (chunkLength >= 16 * 1024) {
      chunks.push(parts.join(""));
      parts = [];
      chunkLength = 0;
    }
  }, "append");
  while (position < text.length) {
    let lineEnd = position;
    while (lineEnd < text.length && text[lineEnd] !== "\n" && text[lineEnd] !== "\r")
      lineEnd++;
    while (assignmentIndex < assignments.length && assignments[assignmentIndex].end < row)
      assignmentIndex++;
    const assignment = assignments[assignmentIndex];
    append(
      assignment && row >= assignment.start && row <= assignment.end ? text.slice(position, lineEnd) : "\u2022".repeat(lineEnd - position)
    );
    if (lineEnd === text.length) break;
    if (text[lineEnd] === "\r" && text[lineEnd + 1] === "\n") {
      append("\r\n");
      position = lineEnd + 2;
    } else {
      append(text[lineEnd]);
      position = lineEnd + 1;
    }
    row++;
  }
  if (parts.length) chunks.push(parts.join(""));
  return { text: chunks.join(""), rowCount: row };
}
__name(maskUnassignedRows, "maskUnassignedRows");
async function execute(database, sql, params = []) {
  const prepared = database.prepare(sql);
  const statement = params.length ? prepared.bind(...params) : prepared;
  if (/^\s*select\b/i.test(sql)) {
    const result2 = await statement.all();
    return { rows: result2.results, rowCount: result2.results.length };
  }
  const result = await statement.run();
  return {
    rows: [],
    rowCount: result.meta.changes,
    insertId: result.meta.last_row_id
  };
}
__name(execute, "execute");
async function deleteImportChunks(database, uploadId, username) {
  return execute(
    database,
    "delete from import_chunks where upload_id=? and username=?",
    [uploadId, username]
  );
}
__name(deleteImportChunks, "deleteImportChunks");
var importChunkKey = /* @__PURE__ */ __name((username, uploadId, index) => `imports/${encodeURIComponent(username)}/${uploadId}/${String(index).padStart(4, "0")}`, "importChunkKey");
function documentRowCount(text) {
  return countLineBreaks(text) + 1;
}
__name(documentRowCount, "documentRowCount");
function countLineBreaks(text) {
  let lineBreaks = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\r") {
      lineBreaks++;
      if (text[index + 1] === "\n") index++;
    } else if (text[index] === "\n") {
      lineBreaks++;
    }
  }
  return lineBreaks;
}
__name(countLineBreaks, "countLineBreaks");
async function readDocument(bucket, key) {
  const object = await bucket.get(key);
  if (!object) throw new Error("Document body is missing from object storage");
  return object.text();
}
__name(readDocument, "readDocument");
async function cleanupImportObjects(bucket, username, uploadId, chunks) {
  if (chunks.length)
    await bucket.delete(
      chunks.map((chunk) => importChunkKey(username, uploadId, chunk.chunk_index))
    );
}
__name(cleanupImportObjects, "cleanupImportObjects");
function importedDocumentStats(chunks) {
  let byteCount = 0;
  let lineBreaks = 0;
  let previousEndedWithCarriageReturn = false;
  for (const chunk of chunks) {
    byteCount += Number(chunk.byte_count);
    lineBreaks += Number(chunk.line_break_count);
    if (previousEndedWithCarriageReturn && Number(chunk.starts_with_lf))
      lineBreaks--;
    previousEndedWithCarriageReturn = !!Number(chunk.ends_with_cr);
  }
  return { byteCount, rowCount: lineBreaks + 1 };
}
__name(importedDocumentStats, "importedDocumentStats");
function importedDocumentStream(bucket, username, uploadId, chunks) {
  let chunkIndex = 0;
  let reader;
  return new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          if (!reader) {
            if (chunkIndex >= chunks.length) {
              controller.close();
              return;
            }
            const object = await bucket.get(
              importChunkKey(username, uploadId, chunks[chunkIndex].chunk_index)
            );
            if (!object) throw new Error("An uploaded import chunk is missing");
            reader = object.body.getReader();
          }
          const result = await reader.read();
          if (result.done) {
            reader.releaseLock();
            reader = void 0;
            chunkIndex++;
            continue;
          }
          controller.enqueue(result.value);
          return;
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (reader) await reader.cancel(reason);
    }
  });
}
__name(importedDocumentStream, "importedDocumentStream");
async function putImportedDocument(bucket, key, username, uploadId, chunks, byteCount) {
  const fixedLength = new FixedLengthStream(byteCount);
  await Promise.all([
    bucket.put(key, fixedLength.readable, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" }
    }),
    importedDocumentStream(bucket, username, uploadId, chunks).pipeTo(fixedLength.writable)
  ]);
}
__name(putImportedDocument, "putImportedDocument");
async function storeDocument(bucket, key, text) {
  const byteCount = encoder.encode(text).byteLength;
  const rowCount = documentRowCount(text);
  await bucket.put(key, text, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" }
  });
  return { bodyKey: key, byteCount, rowCount };
}
__name(storeDocument, "storeDocument");
function parsePath(pathname) {
  try {
    return pathname.split("/").map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
}
__name(parsePath, "parsePath");
async function readBody(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > BODY_LIMIT) return { error: "too-large" };
  const text = await request.text();
  if (encoder.encode(text).byteLength > BODY_LIMIT) return { error: "too-large" };
  try {
    return { body: text ? JSON.parse(text) : {} };
  } catch {
    return { error: "invalid-json" };
  }
}
__name(readBody, "readBody");
function cookieHeaders(token) {
  return {
    "set-cookie": `sid=${encodeURIComponent(token)}; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Strict`
  };
}
__name(cookieHeaders, "cookieHeaders");
function clearedCookieHeaders() {
  return { "set-cookie": "sid=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict" };
}
__name(clearedCookieHeaders, "clearedCookieHeaders");
function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowedOrigin = env.ALLOWED_ORIGIN;
  if (!origin || !allowedOrigin || origin !== allowedOrigin) return {};
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type, X-Requested-With",
    vary: "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
async function matchesHealthCheckToken(expected, provided) {
  const [expectedHash, providedHash] = await Promise.all(
    [expected, provided].map(
      (value) => crypto.subtle.digest("SHA-256", encoder.encode(value))
    )
  );
  const expectedBytes = new Uint8Array(expectedHash);
  const providedBytes = new Uint8Array(providedHash);
  let difference = 0;
  for (let i = 0; i < expectedBytes.length; i++)
    difference |= expectedBytes[i] ^ providedBytes[i];
  return difference === 0;
}
__name(matchesHealthCheckToken, "matchesHealthCheckToken");
async function handleApi(request, env, connection, body, user, setStage = () => {
}) {
  const method = request.method;
  const path = parsePath(new URL(request.url).pathname);
  if (!path) return err(400, "Invalid path.");
  const parts = path;
  const username = user.u;
  const isAdmin = user.role === "admin";
  if (method === "GET" && parts.length === 3 && parts[2] === "me")
    return json({ user });
  if ((method === "GET" || method === "PUT") && parts.length === 5 && parts[2] === "docs" && parts[4] === "progress") {
    const id = Number(parts[3]);
    if (!Number.isSafeInteger(id) || id < 1)
      return err(400, "Invalid document.");
    const doc = (await execute(
      connection,
      `select id,assignee,row_count as rowCount from docs
         where id=? ${isAdmin ? "" : "and (exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?))"}`,
      isAdmin ? [id] : [id, username, username, username]
    )).rows[0];
    if (!doc) return err(404, "Document not found.");
    if (method === "GET") {
      const progress = (await execute(
        connection,
        "select row_position as saved_row from annotation_progress where doc_id=? and username=?",
        [id, username]
      )).rows[0];
      return json({ row: progress ? Number(progress.saved_row) : null });
    }
    const row = body?.row;
    if (!Number.isInteger(row) || row < 1 || row > Number(doc.rowCount))
      return err(400, "Choose a valid document row.");
    if (!isAdmin) {
      const assignments = await execute(
        connection,
        "select row_start as start,row_end as end from row_assignments where doc_id=? and username=?",
        [id, username]
      );
      const fullAccess = !assignments.rowCount && (doc.assignee === username || (await execute(
        connection,
        "select 1 from doc_assignments where doc_id=? and username=?",
        [id, username]
      )).rowCount);
      if (!fullAccess && !assignments.rows.some(
        (assignment) => row >= assignment.start && row <= assignment.end
      ))
        return err(403, "This row is not assigned to you.");
    }
    await execute(
      connection,
      `insert into annotation_progress(doc_id,username,row_position)
       values(?,?,?)
       on conflict(doc_id,username) do update set
         row_position=excluded.row_position,
         updated_at=current_timestamp`,
      [id, username, row]
    );
    return json({ ok: 1, row });
  }
  if (method === "POST" && parts.length === 3 && parts[2] === "password") {
    const { old, nw } = body || {};
    const result = await execute(
      connection,
      "select pass from users where username=?",
      [username]
    );
    const current = result.rows[0];
    const currentPassword = typeof old === "string" ? old : "";
    let currentPasswordValid = current && await verifyPassword(currentPassword, current.pass);
    if (!currentPasswordValid && current && isLegacyBcrypt(current.pass)) {
      currentPasswordValid = await import_bcryptjs.default.compare(currentPassword, current.pass);
    }
    if (!currentPasswordValid)
      return err(400, "Current password is wrong.");
    if (typeof nw !== "string" || nw.length < 8)
      return err(400, "Use at least 8 characters.");
    await execute(connection, "update users set pass=? where username=?", [
      await hashPassword(nw),
      username
    ]);
    return json({ ok: 1 });
  }
  if (method === "PATCH" && parts.length === 4 && parts[2] === "anns") {
    const id = +parts[3];
    const annotation = (await execute(
      connection,
      "select a.doc_id,a.s,d.body_key,d.assignee from anns a join docs d on d.id=a.doc_id where a.id=?",
      [id]
    )).rows[0];
    if (!annotation) return err(404, "Annotation not found.");
    annotation.body = await readDocument(env.DOCS, annotation.body_key);
    if (!isAdmin) {
      const assignedRows = await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [annotation.doc_id, username]
      );
      const fullAccess = !assignedRows.rowCount && (annotation.assignee === username || (await execute(
        connection,
        "select 1 from doc_assignments where doc_id=? and username=?",
        [annotation.doc_id, username]
      )).rowCount);
      const row = rowForOffset(annotation.body, annotation.s);
      if (!fullAccess && !(await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? and row_start<=? and row_end>=?",
        [annotation.doc_id, username, row, row]
      )).rowCount)
        return err(403, "This row is not assigned to you.");
    }
    try {
      await execute(connection, "update anns set label=? where id=?", [
        body.label,
        id
      ]);
      return json({ ok: 1 });
    } catch (error) {
      if (isForeignKeyError(error)) return err(400, "Unknown label.");
      throw error;
    }
  }
  if (parts.length === 3 && parts[2] === "users") {
    if (!isAdmin) return err(403, "Admins only.");
    if (method === "GET") {
      return json(
        (await execute(
          connection,
          "select username u,user_role as role from users order by username"
        )).rows
      );
    }
    if (method === "POST") {
      const { u, p, role } = body || {};
      if (!/^[\w.-]{3,32}$/.test(u || "") || typeof p !== "string" || p.length < 8 || !["admin", "annotator"].includes(role))
        return err(
          400,
          "Username: 3-32 letters, digits, . _ - and password: at least 8 characters."
        );
      try {
        await execute(
          connection,
          "insert into users(username,pass,user_role) values(?,?,?)",
          [u, await hashPassword(p), role]
        );
        return json({ ok: 1 });
      } catch (error) {
        if (isDuplicateError(error))
          return err(409, "That username is taken.");
        throw error;
      }
    }
  }
  if (method === "DELETE" && parts.length === 4 && parts[2] === "users") {
    if (!isAdmin) return err(403, "Admins only.");
    if (parts[3] === username) return err(400, "You cannot delete yourself.");
    await execute(connection, "delete from users where username=?", [parts[3]]);
    return json({ ok: 1 });
  }
  if (parts.length === 3 && parts[2] === "labels") {
    if (method === "GET") {
      return json(
        (await execute(connection, "select name n,color c from labels order by name")).rows
      );
    }
    if (method === "POST") {
      if (!isAdmin) return err(403, "Admins only.");
      const name = String(body.n || "").trim().toUpperCase();
      if (!name || name.length > 30 || !/^#[0-9a-f]{6}$/i.test(body.c || "#888888"))
        return err(400, "Enter a label name (max 30) and a valid color.");
      const result = await execute(
        connection,
        "insert or ignore into labels(name,color) values(?,?)",
        [name, body.c || "#888"]
      );
      return result.rowCount ? json({ ok: 1 }) : err(409, "That label already exists.");
    }
  }
  if (method === "DELETE" && parts.length === 4 && parts[2] === "labels") {
    if (!isAdmin) return err(403, "Admins only.");
    try {
      await execute(connection, "delete from labels where name=?", [parts[3]]);
      return json({ ok: 1 });
    } catch (error) {
      if (isForeignKeyError(error))
        return err(409, "This label is used by annotations. Remove those first.");
      throw error;
    }
  }
  if (method === "GET" && parts.length === 3 && parts[2] === "docs") {
    const docs = await execute(
      connection,
      `select id,title,assignee,done,review,note,row_count as rowCount,
              (select count(*) from anns x where x.doc_id=docs.id) as annCount
       from docs
       ${isAdmin ? "" : "where exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?)"} order by id`,
      isAdmin ? [] : [username, username, username]
    );
    const assignments = await execute(
      connection,
      "select doc_id,username from doc_assignments order by username"
    );
    const assignedByDoc = /* @__PURE__ */ new Map();
    for (const row of assignments.rows) {
      const key = String(row.doc_id);
      if (!assignedByDoc.has(key)) assignedByDoc.set(key, []);
      assignedByDoc.get(key).push(row.username);
    }
    const rowAssignments = await execute(
      connection,
      `select doc_id,username,row_start as start,row_end as end from row_assignments
       ${isAdmin ? "" : "where username=?"} order by doc_id,row_start`,
      isAdmin ? [] : [username]
    );
    const progressRows = await execute(
      connection,
      `select doc_id,username,row_position as saved_row from annotation_progress
       ${isAdmin ? "" : "where username=?"}`,
      isAdmin ? [] : [username]
    );
    const progressByDoc = /* @__PURE__ */ new Map();
    for (const progress of progressRows.rows) {
      const key = String(progress.doc_id);
      if (!progressByDoc.has(key)) progressByDoc.set(key, {});
      progressByDoc.get(key)[progress.username] = Number(progress.saved_row);
    }
    const rowAssignmentsByDoc = /* @__PURE__ */ new Map();
    for (const row of rowAssignments.rows) {
      const key = String(row.doc_id);
      if (!rowAssignmentsByDoc.has(key)) rowAssignmentsByDoc.set(key, []);
      rowAssignmentsByDoc.get(key).push({
        username: row.username,
        start: row.start,
        end: row.end
      });
    }
    const result = docs.rows.map((doc) => {
      const docId = String(doc.id);
      const rowLimited = !isAdmin && rowAssignmentsByDoc.has(docId);
      const assignees = [
        .../* @__PURE__ */ new Set([
          ...assignedByDoc.get(docId) || [],
          ...doc.assignee ? [doc.assignee] : []
        ])
      ];
      return {
        id: docId,
        title: doc.title,
        assignees,
        as: assignees.join(", "),
        rowAssignments: rowAssignmentsByDoc.get(docId) || [],
        progressByUser: progressByDoc.get(docId) || {},
        rowCount: Number(doc.rowCount),
        annCount: rowLimited ? null : Number(doc.annCount),
        done: !!doc.done,
        review: doc.review,
        note: doc.note
      };
    });
    return json(result);
  }
  if (method === "GET" && parts.length === 5 && parts[2] === "docs" && parts[4] === "row-count") {
    const id = Number(parts[3]);
    if (!Number.isSafeInteger(id) || id < 1)
      return err(400, "Invalid document.");
    const result = await execute(
      connection,
      `select row_count as rowCount from docs
       where id=? ${isAdmin ? "" : "and (exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?))"}`,
      isAdmin ? [id] : [id, username, username, username]
    );
    if (!result.rows.length) return err(404, "Document not found.");
    return json({ rowCount: Number(result.rows[0].rowCount) });
  }
  if (method === "GET" && parts.length === 4 && parts[2] === "docs") {
    const id = Number(parts[3]);
    if (!Number.isSafeInteger(id) || id < 1) return err(400, "Invalid document.");
    setStage("document detail lookup");
    const doc = (await execute(
      connection,
      `select id,title,body_key,assignee,done,review,note,
                row_count as rowCount
         from docs
         where id=? ${isAdmin ? "" : "and (exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?) or assignee=? or exists(select 1 from row_assignments ra where ra.doc_id=docs.id and ra.username=?))"}`,
      isAdmin ? [id] : [id, username, username, username]
    )).rows[0];
    if (!doc) return err(404, "Document not found.");
    doc.body = await readDocument(env.DOCS, doc.body_key);
    setStage("document assignments lookup");
    const assignments = await execute(
      connection,
      "select username from doc_assignments where doc_id=? order by username",
      [id]
    );
    const assignees = [
      .../* @__PURE__ */ new Set([
        ...assignments.rows.map((row) => row.username),
        ...doc.assignee ? [doc.assignee] : []
      ])
    ];
    setStage("document row assignments lookup");
    const rowAssignments = await execute(
      connection,
      `select username,row_start as start,row_end as end from row_assignments
       where doc_id=? ${isAdmin ? "" : "and username=?"} order by row_start`,
      isAdmin ? [id] : [id, username]
    );
    const assignedRows = rowAssignments.rows;
    setStage("document annotations lookup");
    const annotations = await execute(
      connection,
      "select id,s,e,label l,author `by` from anns where doc_id=? order by s",
      [id]
    );
    let visibleAnnotations = annotations.rows;
    if (!isAdmin) {
      const fullAccess = !assignedRows.length && (doc.assignee === username || assignments.rows.some((row) => row.username === username));
      if (!fullAccess) {
        let position = 0;
        let row = 1;
        let assignmentIndex = 0;
        let nextLineBreak = null;
        let nextLineEnd = 0;
        visibleAnnotations = [];
        for (const annotation of annotations.rows) {
          while (position < annotation.s) {
            if (nextLineBreak === null) {
              const lineFeed = doc.body.indexOf("\n", position);
              const carriageReturn = doc.body.indexOf("\r", position);
              nextLineBreak = lineFeed < 0 || carriageReturn >= 0 && carriageReturn < lineFeed ? carriageReturn : lineFeed;
              nextLineEnd = nextLineBreak < 0 ? doc.body.length : nextLineBreak + (doc.body[nextLineBreak] === "\r" && doc.body[nextLineBreak + 1] === "\n" ? 2 : 1);
            }
            if (nextLineBreak < 0 || nextLineBreak >= annotation.s) {
              position = annotation.s;
              break;
            }
            position = nextLineEnd;
            nextLineBreak = null;
            row++;
          }
          while (assignmentIndex < assignedRows.length && assignedRows[assignmentIndex].end < row)
            assignmentIndex++;
          const assignment = assignedRows[assignmentIndex];
          if (assignment && row >= assignment.start && row <= assignment.end)
            visibleAnnotations.push(annotation);
        }
      }
    }
    setStage("document response construction");
    const maskedDocument = !isAdmin && assignedRows.length ? maskUnassignedRows(doc.body, assignedRows) : null;
    return json({
      id: String(doc.id),
      title: doc.title,
      text: maskedDocument ? maskedDocument.text : doc.body,
      assignees,
      as: assignees.join(", "),
      rowAssignments: assignedRows,
      rowCount: Number(maskedDocument?.rowCount ?? doc.rowCount),
      done: !!doc.done,
      review: doc.review,
      note: doc.note,
      anns: visibleAnnotations.map((annotation) => ({
        id: String(annotation.id),
        s: annotation.s,
        e: annotation.e,
        l: annotation.l,
        by: annotation.by
      }))
    });
  }
  if (method === "PATCH" && parts.length === 4 && parts[2] === "docs") {
    const { assignee, done, review, note } = body;
    const id = +parts[3];
    if (assignee !== void 0) {
      if (!isAdmin) return err(403, "Admins only.");
      if (assignee !== null && typeof assignee !== "string")
        return err(400, "Choose an annotator or unassign the document.");
      if (assignee) {
        const annotator = await execute(
          connection,
          "select 1 from users where username=? and user_role='annotator'",
          [assignee]
        );
        if (!annotator.rowCount)
          return err(400, "Choose an annotator or unassign the document.");
        if ((await execute(
          connection,
          "select 1 from row_assignments where doc_id=? and username<>? limit 1",
          [id, assignee]
        )).rowCount)
          return err(409, "Rows are already assigned to another annotator.");
      }
      if (!(await execute(connection, "select 1 from docs where id=?", [id])).rowCount)
        return err(404, "Document not found.");
      await execute(connection, "update docs set assignee=? where id=?", [
        assignee || null,
        id
      ]);
    }
    if (body.assignees !== void 0) {
      if (!isAdmin || !Array.isArray(body.assignees) || body.assignees.some((value) => typeof value !== "string"))
        return err(400, "Choose one or more annotators.");
      const chosen = [...new Set(body.assignees)];
      for (const name of chosen) {
        if (!(await execute(
          connection,
          "select 1 from users where username=? and user_role='annotator'",
          [name]
        )).rowCount)
          return err(400, "Choose valid annotators.");
      }
      if (chosen.length && (await execute(
        connection,
        `select 1 from row_assignments where doc_id=? and username not in (${chosen.map(() => "?").join(",")}) limit 1`,
        [id, ...chosen]
      )).rowCount)
        return err(409, "Rows are already assigned to another annotator.");
      const statements = [
        connection.prepare("delete from doc_assignments where doc_id=?").bind(id),
        ...chosen.map(
          (name) => connection.prepare("insert into doc_assignments(doc_id,username) values(?,?)").bind(id, name)
        ),
        connection.prepare("update docs set assignee=null where id=?").bind(id)
      ];
      await connection.batch(statements);
    }
    if (body.rowAssignment !== void 0) {
      const { username: assignedUser, start, end } = body.rowAssignment || {};
      if (!isAdmin || typeof assignedUser !== "string" || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start)
        return err(400, "Choose an annotator and a valid row range.");
      const annotator = await execute(
        connection,
        "select 1 from users where username=? and user_role='annotator'",
        [assignedUser]
      );
      if (!annotator.rowCount) return err(400, "Choose a valid annotator.");
      try {
        const doc = await execute(
          connection,
          "select row_count as rowCount from docs where id=?",
          [id]
        );
        if (!doc.rowCount) return err(404, "Document not found.");
        const rowCount = Number(doc.rows[0].rowCount);
        if (end > rowCount) return err(400, "The row range exceeds the document.");
        const overlap = await execute(
          connection,
          "select username from row_assignments where doc_id=? and row_start<=? and row_end>=? and username<>? union select username from doc_assignments where doc_id=? and username<>? union select assignee as username from docs where id=? and assignee is not null and assignee<>? limit 1",
          [id, end, start, assignedUser, id, assignedUser, id, assignedUser]
        );
        if (overlap.rowCount)
          return err(409, "Some rows in this range are already assigned to another annotator.");
        const inserted = await execute(
          connection,
          `insert into row_assignments(doc_id,username,row_start,row_end)
           select ?,?,?,?
           where not exists(
             select 1 from row_assignments
             where doc_id=? and row_start<=? and row_end>=? and username<>?
           )
           and not exists(
             select 1 from doc_assignments where doc_id=? and username<>?
           )
           and not exists(
             select 1 from docs where id=? and assignee is not null and assignee<>?
           )`,
          [
            id,
            assignedUser,
            start,
            end,
            id,
            end,
            start,
            assignedUser,
            id,
            assignedUser,
            id,
            assignedUser
          ]
        );
        if (!inserted.rowCount)
          return err(409, "Some rows in this range are already assigned to another annotator.");
      } catch (error) {
        if (isDuplicateError(error))
          return err(409, "This row range is already assigned.");
        throw error;
      }
    }
    if (body.removeRowAssignment !== void 0) {
      const { username: assignedUser, start, end } = body.removeRowAssignment || {};
      if (!isAdmin || typeof assignedUser !== "string" || !Number.isInteger(start) || !Number.isInteger(end))
        return err(400, "Choose a valid row assignment.");
      await execute(
        connection,
        "delete from row_assignments where doc_id=? and username=? and row_start=? and row_end=?",
        [id, assignedUser, start, end]
      );
    }
    if (done !== void 0) {
      const rowLimited = !isAdmin && (await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [id, username]
      )).rowCount;
      if (isAdmin || !rowLimited && (await execute(
        connection,
        "select 1 from docs d where d.id=? and (d.assignee=? or exists(select 1 from doc_assignments da where da.doc_id=d.id and da.username=?))",
        [id, username, username]
      )).rowCount)
        await execute(
          connection,
          "update docs set done=?,review=case when ? then '' else review end where id=?",
          [!!done, !!done, id]
        );
      else
        return err(403, "Only a document assignee can change document status.");
    }
    if (review !== void 0) {
      if (!isAdmin) return err(403, "Admins only.");
      await execute(
        connection,
        "update docs set review=?,note=?,done=case when ?='returned' then false else done end where id=?",
        [review, note || "", review, id]
      );
    }
    return json({ ok: 1 });
  }
  if (method === "DELETE" && parts.length === 4 && parts[2] === "docs") {
    const doc = (await execute(
      connection,
      "select id,body_key from docs where id=? and (? or assignee=? or exists(select 1 from doc_assignments da where da.doc_id=docs.id and da.username=?))",
      [+parts[3], isAdmin ? 1 : 0, username, username]
    )).rows[0];
    if (!doc) return err(404, "Document not found.");
    await execute(
      connection,
      "delete from docs where id=?",
      [doc.id]
    );
    try {
      await env.DOCS.delete(doc.body_key);
    } catch (error) {
      console.error("Failed to remove document body from R2", {
        code: errorCode(error)
      });
    }
    return json({ ok: 1 });
  }
  if (method === "POST" && parts.length === 5 && parts[2] === "docs" && parts[4] === "anns") {
    const id = +parts[3];
    const { start: startOffset, end: endOffset, label } = body;
    const doc = (await execute(connection, "select body_key,assignee from docs where id=?", [id])).rows[0];
    if (!doc) return err(404, "Document not found.");
    doc.body = await readDocument(env.DOCS, doc.body_key);
    if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0 || endOffset <= startOffset || endOffset > doc.body.length)
      return err(400, "Invalid selection.");
    if (!isAdmin) {
      const assignedRows = await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [id, username]
      );
      const fullAccess = !assignedRows.rowCount && (doc.assignee === username || (await execute(
        connection,
        "select 1 from doc_assignments where doc_id=? and username=?",
        [id, username]
      )).rowCount);
      const startRow = rowForOffset(doc.body, startOffset);
      const endRow = rowForOffset(doc.body, endOffset - 1);
      if (!fullAccess && (startRow !== endRow || !(await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? and row_start<=? and row_end>=?",
        [id, username, startRow, startRow]
      )).rowCount))
        return err(403, "This row is not assigned to you.");
    }
    if ((await execute(connection, "select 1 from anns where doc_id=? and ?<e and ?>s", [
      id,
      startOffset,
      endOffset
    ])).rowCount)
      return err(409, "That text overlaps an existing entity. Remove it first.");
    try {
      const inserted = await execute(
        connection,
        "insert into anns(doc_id,s,e,label,author) values(?,?,?,?,?)",
        [id, startOffset, endOffset, label, username]
      );
      return json({ ok: 1, id: String(inserted.insertId) });
    } catch (error) {
      if (isForeignKeyError(error)) return err(400, "Unknown label.");
      throw error;
    }
  }
  if (method === "DELETE" && parts.length === 4 && parts[2] === "anns") {
    const id = +parts[3];
    const annotation = (await execute(
      connection,
      "select a.doc_id,a.s,d.body_key,d.assignee from anns a join docs d on d.id=a.doc_id where a.id=?",
      [id]
    )).rows[0];
    if (!annotation) return json({ ok: 1 });
    annotation.body = await readDocument(env.DOCS, annotation.body_key);
    if (!isAdmin) {
      const assignedRows = await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? limit 1",
        [annotation.doc_id, username]
      );
      const fullAccess = !assignedRows.rowCount && (annotation.assignee === username || (await execute(
        connection,
        "select 1 from doc_assignments where doc_id=? and username=?",
        [annotation.doc_id, username]
      )).rowCount);
      const row = rowForOffset(annotation.body, annotation.s);
      if (!fullAccess && !(await execute(
        connection,
        "select 1 from row_assignments where doc_id=? and username=? and row_start<=? and row_end>=?",
        [annotation.doc_id, username, row, row]
      )).rowCount)
        return err(403, "This row is not assigned to you.");
    }
    await execute(connection, "delete from anns where id=?", [id]);
    return json({ ok: 1 });
  }
  if (method === "POST" && parts.length === 4 && parts[2] === "import" && parts[3] === "chunk") {
    const { uploadId, index, chunk } = body || {};
    if (typeof uploadId !== "string" || !/^[0-9a-f-]{36}$/i.test(uploadId) || !Number.isInteger(index) || index < 0 || index >= 4096 || typeof chunk !== "string" || chunk.length > 12e5)
      return err(400, "Invalid import chunk.");
    if (index === 0)
      await execute(
        connection,
        "delete from import_chunks where username=? and datetime(created_at)<datetime('now','-1 day')",
        [username]
      );
    const key = importChunkKey(username, uploadId, index);
    const bytes = encoder.encode(chunk);
    const lineBreakCount = countLineBreaks(chunk);
    const startsWithLf = chunk.startsWith("\n") ? 1 : 0;
    const endsWithCr = chunk.endsWith("\r") ? 1 : 0;
    await env.DOCS.put(key, bytes, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" }
    });
    try {
      await execute(
        connection,
        `insert into import_chunks(
           upload_id,username,chunk_index,byte_count,line_break_count,starts_with_lf,ends_with_cr
         ) values(?,?,?,?,?,?,?)
         on conflict(upload_id,username,chunk_index)
         do update set byte_count=excluded.byte_count,
           line_break_count=excluded.line_break_count,
           starts_with_lf=excluded.starts_with_lf,
           ends_with_cr=excluded.ends_with_cr,
           created_at=current_timestamp`,
        [
          uploadId,
          username,
          index,
          bytes.byteLength,
          lineBreakCount,
          startsWithLf,
          endsWithCr
        ]
      );
    } catch (error) {
      await env.DOCS.delete(key);
      throw error;
    }
    return json({ ok: 1 });
  }
  if (method === "POST" && parts.length === 4 && parts[2] === "import" && parts[3] === "finish") {
    const { uploadId, chunks, title } = body || {};
    if (typeof uploadId !== "string" || !/^[0-9a-f-]{36}$/i.test(uploadId) || !Number.isInteger(chunks) || chunks < 1 || chunks > 4096)
      return err(400, "Invalid import upload.");
    let createdBodyKey;
    try {
      const found = await execute(
        connection,
        `select chunk_index,byte_count,line_break_count,starts_with_lf,ends_with_cr
         from import_chunks where upload_id=? and username=? order by chunk_index`,
        [uploadId, username]
      );
      const uploadChunks = found.rows;
      if (uploadChunks.length !== chunks || uploadChunks.some((chunk, index) => Number(chunk.chunk_index) !== index)) {
        await deleteImportChunks(connection, uploadId, username);
        await cleanupImportObjects(env.DOCS, username, uploadId, uploadChunks);
        return err(400, "The upload is incomplete. Please select the file again.");
      }
      const stats = importedDocumentStats(uploadChunks);
      createdBodyKey = `docs/${crypto.randomUUID()}`;
      await putImportedDocument(
        env.DOCS,
        createdBodyKey,
        username,
        uploadId,
        uploadChunks,
        stats.byteCount
      );
      await connection.batch([
        connection.prepare(
          `insert into docs(title,body_key,byte_count,row_count,assignee,done,review,note)
             values(?,?,?,?,?,0,'','')`
        ).bind(
          String(title || "Untitled").slice(0, 1e3),
          createdBodyKey,
          stats.byteCount,
          stats.rowCount,
          isAdmin ? null : username
        ),
        connection.prepare("delete from import_chunks where upload_id=? and username=?").bind(uploadId, username)
      ]);
      try {
        await cleanupImportObjects(env.DOCS, username, uploadId, uploadChunks);
      } catch (cleanupError) {
        console.error("Failed to clean up imported R2 chunks", {
          code: errorCode(cleanupError)
        });
      }
      return json({ count: 1 });
    } catch (error) {
      if (createdBodyKey) await env.DOCS.delete(createdBodyKey);
      throw error;
    }
  }
  if (method === "POST" && parts.length === 3 && parts[2] === "import") {
    const { labels = [], docs = [] } = body;
    let count = 0;
    const bodyKeys = [];
    try {
      const statements = [];
      for (const label of labels)
        if (label.n && isAdmin)
          statements.push(
            connection.prepare("insert or ignore into labels(name,color) values(?,?)").bind(label.n, label.c || "#888")
          );
      for (const doc of docs) {
        if (typeof doc.text !== "string" || !doc.text) continue;
        let assignee = isAdmin ? doc.assignee : username;
        if (isAdmin && assignee && !(await execute(
          connection,
          "select 1 from users where username=? and user_role='annotator'",
          [assignee]
        )).rowCount)
          assignee = null;
        const key = `docs/${crypto.randomUUID()}`;
        const stats = await storeDocument(env.DOCS, key, doc.text);
        bodyKeys.push(key);
        statements.push(
          connection.prepare(
            `insert into docs(title,body_key,byte_count,row_count,assignee,done,review,note)
               values(?,?,?,?,?,?, '','')`
          ).bind(
            doc.title || "Untitled",
            stats.bodyKey,
            stats.byteCount,
            stats.rowCount,
            assignee || null,
            isAdmin && !!doc.done ? 1 : 0
          )
        );
        for (const annotation of doc.annotations || []) {
          if (!annotation.label || !Number.isInteger(annotation.start) || !Number.isInteger(annotation.end) || annotation.start < 0 || annotation.end <= annotation.start || annotation.end > doc.text.length)
            continue;
          statements.push(
            connection.prepare("insert or ignore into labels(name,color) values(?,'#888')").bind(annotation.label),
            connection.prepare(
              `insert into anns(doc_id,s,e,label,author)
                 values((select id from docs where body_key=?),?,?,?,?)`
            ).bind(
              key,
              annotation.start,
              annotation.end,
              annotation.label,
              annotation.by || null
            )
          );
        }
        count++;
      }
      if (statements.length) await connection.batch(statements);
      return json({ count });
    } catch (error) {
      if (bodyKeys.length) await env.DOCS.delete(bodyKeys);
      throw error;
    }
  }
  return err(404, "Not found.");
}
__name(handleApi, "handleApi");
var worker_default = {
  async fetch(request, env) {
    const headers = {
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "cache-control": "no-store",
      ...corsHeaders(request, env)
    };
    const withHeaders = /* @__PURE__ */ __name((response) => {
      const responseHeaders = new Headers(response.headers);
      for (const [name, value] of Object.entries(headers))
        if (value) responseHeaders.set(name, value);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    }, "withHeaders");
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return withHeaders(
        env.ALLOWED_ORIGIN && request.headers.get("origin") === env.ALLOWED_ORIGIN ? noContent() : err(403, "Origin is not allowed.")
      );
    }
    if (request.method === "GET" && url.pathname === "/health/db") {
      const authorization = request.headers.get("authorization") || "";
      const providedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!env.HEALTH_CHECK_TOKEN || !await matchesHealthCheckToken(env.HEALTH_CHECK_TOKEN, providedToken))
        return withHeaders(err(404, "Not found."));
      if (!env.DB) {
        console.error("Database health check failed: DB binding is missing");
        return withHeaders(err(503, "Database connection unavailable."));
      }
      try {
        const result = await execute(env.DB, "select 1 as ok");
        if (Number(result.rows[0]?.ok) !== 1)
          throw new Error("Health query returned an unexpected result");
        return withHeaders(json({ status: "ok" }));
      } catch (error) {
        console.error("Database health check failed", {
          code: errorCode(error)
        });
        return withHeaders(err(503, "Database connection unavailable."));
      }
    }
    if (request.method === "GET" && url.pathname === "/health")
      return withHeaders(new Response("ok", { headers: { "content-type": "text/plain" } }));
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/api")
      return withHeaders(err(404, "Not found."));
    const now = Date.now();
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (!consumeLimit(apiHits, ip, API_LIMIT, now))
      return withHeaders(err(429, "Too many requests, please try again later."));
    if (request.method !== "GET" && request.headers.get("x-requested-with") !== "khner")
      return withHeaders(err(403, "Blocked request."));
    let body = {};
    if (request.method !== "GET" && request.method !== "HEAD") {
      const parsed = await readBody(request);
      if (parsed.error === "too-large")
        return withHeaders(
          err(413, "Request is too large. Large files are uploaded in smaller chunks.")
        );
      if (parsed.error)
        return withHeaders(err(400, "Invalid JSON request body."));
      body = parsed.body;
    }
    if (request.method === "POST" && url.pathname === "/api/login") {
      if (!env.JWT_SECRET) {
        console.error("JWT_SECRET is required");
        return withHeaders(err(500, "Server error"));
      }
      if (!env.DB) {
        console.error("DB binding is required");
        return withHeaders(err(500, "Server error"));
      }
      const attempts = loginHits.get(ip) || [];
      const recent = attempts.filter((time) => now - time < API_WINDOW_MS);
      if (recent.length >= LOGIN_LIMIT) {
        loginHits.set(ip, recent);
        return withHeaders(
          err(429, "Too many failed attempts. Try again in 15 minutes.")
        );
      }
      const connection = env.DB;
      let loginStage = "database connection";
      try {
        loginStage = "user lookup";
        const { u, p } = body || {};
        const result = await execute(
          connection,
          "select username,pass,user_role as role from users where username=?",
          [u]
        );
        const record = result.rows[0];
        const password = typeof p === "string" ? p : "";
        loginStage = "password verification";
        let valid = record && await verifyPassword(password, record.pass);
        if (!valid && record && isLegacyBcrypt(record.pass)) {
          loginStage = "legacy password verification";
          valid = await import_bcryptjs.default.compare(password, record.pass);
        }
        if (!valid) {
          recent.push(now);
          loginHits.set(ip, recent);
          return withHeaders(err(401, "Wrong username or password."));
        }
        loginStage = "session creation";
        const response = json(
          {
            user: { u: record.username, role: record.role },
            weak: password === "admin123" || password.length < 8
          },
          200,
          cookieHeaders(await signToken(record.username, env.JWT_SECRET))
        );
        return withHeaders(response);
      } catch (error) {
        console.error("Login request failed", {
          stage: loginStage,
          code: errorCode(error)
        });
        return withHeaders(err(500, "Server error"));
      }
    }
    if (request.method === "POST" && url.pathname === "/api/logout")
      return withHeaders(json({ ok: 1 }, 200, clearedCookieHeaders()));
    if (!env.JWT_SECRET) {
      console.error("JWT_SECRET is required");
      return withHeaders(err(500, "Server error"));
    }
    if (!env.DB || !env.DOCS) {
      console.error("DB and DOCS bindings are required");
      return withHeaders(err(500, "Server error"));
    }
    const token = await verifyToken(decodeCookie(request, "sid"), env.JWT_SECRET);
    if (!token) return withHeaders(err(401, "Please sign in again."));
    let stage = "current user lookup";
    try {
      const currentUser = (await execute(
        env.DB,
        "select username,user_role as role from users where username=?",
        [token.u]
      )).rows[0];
      if (!currentUser) return withHeaders(err(401, "Please sign in again."));
      const response = await handleApi(
        request,
        env,
        env.DB,
        body,
        { u: currentUser.username, role: currentUser.role },
        (nextStage) => {
          stage = nextStage;
        }
      );
      return withHeaders(response);
    } catch (error) {
      console.error("API request failed", { stage, code: errorCode(error) });
      return withHeaders(err(500, "Server error"));
    }
  }
};

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
init_modules_watch_stub();
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_modules_watch_stub();
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-ECPkMM/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
init_modules_watch_stub();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-ECPkMM/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
/*! Bundled license information:

bcryptjs/dist/bcrypt.js:
  (**
   * @license bcrypt.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
   * Released under the Apache License, Version 2.0
   * see: https://github.com/dcodeIO/bcrypt.js for details
   *)
*/
//# sourceMappingURL=worker.js.map

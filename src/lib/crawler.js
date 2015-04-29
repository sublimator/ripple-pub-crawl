'use strict';

/* -------------------------------- REQUIRES -------------------------------- */

var _ = require('lodash');
var util = require('util');
var request = require('request');
var EventEmitter = require('events').EventEmitter;
var RL = require('ripple-lib');

/* --------------------------------- CONFIG --------------------------------- */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/* --------------------------------- CONSTS --------------------------------- */

var DEBUG = false;

var request_status = {
  QUEUED: 1,
  REQUESTING: 2
};

/* --------------------------------- HELPERS -------------------------------- */

function abortIfNot(expression, message) {
  if (!expression) {
    if (!DEBUG) {
      throw new Error(message);
    } else {
      console.error(message);
      process.exit();
    }
  }
}

function withDefaultPort(domainOrIp) {
  return domainOrIp.indexOf(':') !== -1 ? domainOrIp :
                                          domainOrIp + ':51235';

}

function crawlUrl(domainOrIp) {
  return 'https://' + withDefaultPort(domainOrIp) + '/crawl';
}

function normalizePubKey(base64) {
  var bits = RL.sjcl.codec.base64.toBits(base64);
  var bytes = RL.sjcl.codec.bytes.fromBits(bits);
  return RL.Base.encode_check(RL.Base.VER_NODE_PUBLIC, bytes);
}

/**
* @param {Object} resp - response from a /crawl request
*/
function normalise(resp) {
  var active = [];

  resp.overlay.active.forEach(function(p) {
    var copy = _.cloneDeep(p);
    copy.public_key = normalizePubKey(p.public_key);
    active.push(copy);
    var ip = p.ip;

    if (ip) {
      var split = ip.split(':'),
                  splitIp = split[0],
                  port = split[1];

      copy.ip = splitIp;
      copy.port = port ? port : 51235;

      if (p.type === 'peer') {
        copy.type = port ? 'out' : 'in';
      }

      copy.ip_and_port = copy.ip + ':' + copy.port;
    }
  });
  resp.overlay.active = active;
  return resp;
}

/* --------------------------------- CRAWLER -------------------------------- */

function Crawler(maxRequests, logger) {
  EventEmitter.call(this);
  this.maxRequests = maxRequests ? maxRequests : 30;
  this.currentRequests = 0;
  this.responses = {};
  this.queued = {};
  this.errors = {};
  this.logger = logger || console;
  this.byPub = {};
}

util.inherits(Crawler, EventEmitter);

Crawler.prototype.enter = function(ip) {
  this.crawl(withDefaultPort(ip), 0);
};

Crawler.prototype.saveData = function(pk, data, defaults) {
  var map = this.byPub[pk] !== undefined ? this.byPub[pk] : this.byPub[pk] = {};

  _.forOwn(data, function(v, k) {
    if (defaults && map[k] !== undefined ) {
      // We want better data than this
      if (!(k === 'type' && map[k] === 'peer')) {
        return;
      }
    }
    map[k] = v;
  });
};

/**
* @param {String} ipp - (including port) to crawl
* @param {Number} hops - from initial entryPoint
*/
Crawler.prototype.crawl = function(ipp, hops) {
  var self = this;
  self.logger.log('entering ' + ipp);
  self.queued[ipp] = request_status.REQUESTING;

  self.crawlOne(ipp, function(err, resp) {
    self.dequeue(ipp);

    if (err) {
      self.logger.error(ipp + ' has err ', err);
      self.errors[ipp] = err.code;
    } else {
      resp = normalise(resp);
      self.responses[ipp] = resp;
      resp.overlay.active.forEach(function(entry) {
        self.saveData(entry.public_key, entry, true);
        self.saveData(entry.public_key, {hops: hops}, true);
        self.enqueueIfNeeded(entry.ip_and_port);
      });
    }

    if (!self.requestMore(hops)) {
      self.emit('done', {responses: self.responses,
                         byPub: self.byPub});
    }
  });
};

Crawler.prototype.enqueueIfNeeded = function(ipp) {
  if (ipp) {
    if ((this.responses[ipp] === undefined) &&
        (this.queued[ipp] === undefined) &&
        (this.errors[ipp] === undefined)) {
      this.enqueue(ipp);
    }
  }
}

Crawler.prototype.requestMore = function(hops) {
  var self = this;
  var ips = Object.keys(self.queued);

  ips.forEach(function(queuedIp) {
    if (self.currentRequests < self.maxRequests) {
      if (self.queued[queuedIp] === request_status.QUEUED) {
        self.crawl(queuedIp, hops + 1);
      }
    } else {
      return false;
    }
  });

  return ips.length !== 0;
}

Crawler.prototype.enqueue = function(ip) {
  abortIfNot(this.queued[ip] === undefined, 'queued already');
  this.queued[ip] = request_status.QUEUED;
};

Crawler.prototype.dequeue = function(ip) {
  abortIfNot(this.queued[ip] !== undefined, 'not queued already');
  delete this.queued[ip];
};

Crawler.prototype.crawlOne = function(ip, cb) {
  var self;
  this.currentRequests++;
  self = this;
  self.crawlSingle(ip, function(err, json) {
    self.currentRequests--;
    self.emit('request', err, json);
    cb(err, json);
  });
};

Crawler.prototype.crawlSingle = function(ip, onResponse) {
  var options = {url: crawlUrl(ip), timeout: 5000};
  request(options, function(err, response, body) {
    onResponse(err, body ? JSON.parse(body) : null);
  });
}

exports.Crawler = Crawler;
exports.normalizePubKey = normalizePubKey;
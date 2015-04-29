'use strict';

/*eslint no-shadow:0*/

/* -------------------------------- REQUIRES -------------------------------- */

var extend = require('extend');
var geoip = require('geoip-lite');
var fs = require('fs');
var Sequelize = require('sequelize');
var Promise = Sequelize.Promise;
var _ = require('lodash');

var modelsFactory = require('./lib/models');
var Crawler = require('./lib/crawler').Crawler;

/* --------------------------------- CONSTS --------------------------------- */

function isSet(env) { return env !== undefined; }

var config = {
  DROP_TABLES :  isSet(process.env.DROP_TABLES),
  LOG_SQL : isSet(process.env.LOG_SQL),
  LOG_CRAWL: isSet(process.env.LOG_CRAWL),
}

/* --------------------------------- HELPERS -------------------------------- */

function prettyJSON(o) {
  return JSON.stringify(o, undefined, 2);
}

var saveDB = exports.saveDB = function saveDB(rawCrawl, entryIp, dbUrl, onDone) {
  var sql = new Sequelize(dbUrl, {logging: config.LOG_SQL});
  var models = modelsFactory(sql, Sequelize);
  // our context var
  var $ = {};

  sql
  .sync({force: config.DROP_TABLES})
  .then(sql.transaction.bind(sql))
  .then(function(tx) {
    $.tx = {transaction: tx};
    return models.Crawl.create({entry_ip: entryIp}, $.tx);
  })
  .then(function(crawl) {
    $.crawl = crawl;
    var peers = _.map(rawCrawl.peersData, function(data, public_key) {
      var geo = data.ip ? geoip.lookup(data.ip) : {};
      var reachable = (data.ip !== undefined &&
                       rawCrawl.responses[data.ip_and_port] !== undefined);
      return {
         crawl_id: crawl.id,
         city: geo.city,
         region: geo.region,
         reachable: reachable,
         country: geo.country,
         hops_from_entry: data.hops,
         version: data.version,
         ip: data.ip,
         port: data.port,
         public_key: public_key};
    });
    return models.Peer.bulkCreate(peers, {returning: true,
                                          transaction: $.tx.transaction});
  })
  .then(function(peers) {
    $.peers = peers;
    var indexed = _.indexBy(peers, 'public_key');
    var edgeMap = {};

    peers.forEach(function(peerModel) {
      if (!peerModel.reachable) {
        return;
      };
      // We can some times see sockets going from `from`, to `to` more than
      // once. We need to dedupe these.
      rawCrawl.responses[peerModel.ip_and_port].overlay.active
                                            .forEach(function(active) {
        if (indexed[active.public_key]) {
          var data = rawCrawl.peersData[active.public_key];
          var edge_type = data.type;
          var directed = true;

          if (edge_type === 'peer' || edge_type === undefined) {
            // We'll just have to say `out` for the moment We could add
            // something on the Edge model that indicates the direction is not
            // really known, and color them accordingly when drawing the graph.
            edge_type = 'out';
            directed = false;
          };

          var other = indexed[active.public_key];
          var from_ = edge_type === 'in' ? other : peerModel;
          var to_ = edge_type === 'out' ? other : peerModel;

          var id = from_.id + ':' + to_.id;
          if (!edgeMap[id]) {
            var edge = {from: from_.id,
                        directed: directed,
                        to: to_.id,
                        crawl_id: $.crawl.id};
            edgeMap[id] = edge;
          }
        }
      });
    });
    return models.Edge.bulkCreate(_.values(edgeMap), $.tx);

  }).then(function(edges) {
    $.edges = edges;
    return $.tx.transaction.commit();
  }).then(function() {
    return Promise.all([
      models.Peer.count({where: {crawl_id: $.crawl.id}}),
      models.Edge.count({where: {crawl_id: $.crawl.id}})
    ]);
  })
  .spread(function(peers, edges) {
    onDone(null, $.crawl.id, peers, edges);
  })
  .catch(function(e) {
    onDone(e);
  });
}


/* ---------------------------------- MAIN ---------------------------------- */

function main(entryIp, dbUrl) {
  if (config.DROP_TABLES) {
    console.warn('DROP_TABLES', config.DROP_TABLES);
  }

  var noopLogger = {log: _.noop, error: _.noop};
  var crawler = new Crawler(100, config.LOG_CRAWL ? undefined : noopLogger);

  crawler
    .on('request', function() {
      process.stdout.write('.');
    })
    .once('done', function() { console.log(); })
    .once('done', function(rawCrawl) {
      // Save results to the db
      saveDB(rawCrawl, entryIp, dbUrl, function(err, crawl_id, peers, edges) {
        if (err) {
          console.error(err);
          process.exit(1);
        } else {
          fs.writeFileSync('crawl.json', prettyJSON(rawCrawl.responses));
          console.log('Queried: crawl_id/num_peers/num_edges',
                                crawl_id, peers, edges);
          process.exit(0);
        }
      });

    }).
    enter(entryIp);
}

var argv = process.argv.slice(2);

if (argv.length == 2) {
  main(argv[0], argv[1]);
} else {
  console.error('eg: `node src/crawl.js '+
                '192.170.145.67 '+
                'postgres://postgres:zxccxz@localhost:5432/crawl`');
  process.exit(1);
}
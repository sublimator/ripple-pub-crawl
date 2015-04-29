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

var config = {};

['DROP_TABLES', 'LOG_SQL', 'LOG_CRAWL'].forEach(function(k) {
  config[k] = process.env[k] !== undefined;
});

/* --------------------------------- HELPERS -------------------------------- */

function prettyJSON(o) {
  return JSON.stringify(o, undefined, 2);
}

var saveDB = exports.saveDB = function saveDB(crawlJson, entryIp, dbUrl, onDone) {
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

    var peers = _.map(crawlJson.peersData, function(data, public_key) {
      var geo = data.ip ? geoip.lookup(data.ip) : {};
      var reachable = (data.ip !== undefined &&
                       crawlJson.responses[data.ip_and_port] !== undefined);
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
    function eachReachablePeersActives(func) {
      peers.forEach(function(peerModel) {
        if (!peerModel.reachable) {
          // We don't have any data from them, so ... moving on.
          return;
        };
        // We can some times see sockets going from `from`, to `to` more than
        // once. We need to dedupe these.
        crawlJson.responses[peerModel.ip_and_port].overlay.active
                                              .forEach(function(active) {
            func(peerModel, active);
        });
      });
    }

    $.peers = peers;
    var indexed = _.indexBy(peers, 'public_key');
    var edgeMap = {};

    // We can some times see sockets going from `from`, to `to` more than once.
    // We need to dedupe these.
    eachReachablePeersActives(function(peerModel, active) {
      if (indexed[active.public_key]) {
        var edge_type = active.type;
        var directed = true;

        if (edge_type === 'peer' || edge_type === undefined) {
          // We may know the link from another direction, so sit tight. We need
          // to go through all the peers, and all their `actives` first until
          // below we can check if the edge is already there.
          return;
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
    eachReachablePeersActives(function(peerModel, active) {
      if (indexed[active.public_key]) {
        var other = indexed[active.public_key];
        var edge_type = active.type;

        if (edge_type === 'peer' || edge_type === undefined) {
          var in_key = other.id +':' + peerModel.id;
          var out_key = peerModel.id +':' + other.id;

          // We may already have the link
          if (!edgeMap[in_key] && !edgeMap[out_key]) {
            // Create an undirected edge. `from` and `to` are meaningless when
            // directed == false.
            var edge = {from: peerModel.id,
                        directed: false,
                        to: other.id,
                        crawl_id: $.crawl.id};
            edgeMap[out_key] = edge;
          };
        };
      }
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
    .once('done', function(crawlJson) {
      // Save results to the db
      saveDB(crawlJson, entryIp, dbUrl, function(err, crawl_id, peers, edges) {
        if (err) {
          console.error(err);
          process.exit(1);
        } else {
          fs.writeFileSync('raw-crawl-' + crawl_id +'.json', 
                           JSON.stringify(crawler.rawResponses));
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
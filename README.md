# ripple-pub-crawl

This crawls the ripple network, via making requests to the /crawl endpoint of
each peer it can connect to, starting from an entry point. Some peers may know,
and publish (perhaps errantly .. ), the ip associated with a peer, while others
don't. We merge the points of view of each peer, collecting a dict of data,
keyed by public key (the uid for nodes).

There is a nodejs script that will do a crawl, saving the data into a postgresql
database. Currently graph analysis can be done by a hacky python script
(bin/souped.py) that uses sqlsoup and networkx to load a given crawl by id from
postgres. It can export the graph to dot format for rendering by graphviz.

The graph of the network is a directed graph, with the direction going from the
peer opening a port `outbound` to the peer listening for `inbound` connections.
However, due to old versions of rippled on the network, which don't always
report the connection type of connected peers, many of the peers are of
indeterminate direction.

## Questions this strives to answer

- What is the total number of unique node public keys (== network size) ?
- How many nodes on the network are taking incoming connections ?
- What's the average in degree, out degree ?
- How many different versions of rippled are on the network ?
- How many DEBUG versions of rippled are on the network ?
- How many private rippled instances are on the network ?
- What is the most number of instances behind the same IP ?
- Total number of unique port numbers ?
- Network diameter (max hops, could be fractional) ?
- Number of distinct public keys per unique IP ?

## /crawl response format

As of the time of writing, there were various versions of rippled on the network
and not all of them return information formatted in the same way, so some
normalisation must be done. Also, some fields aren't always published (like in
the case of `ip`). The public_key is returned in base64, so to match public keys
encoded in base58 and saved as a string elsewhere, they must be normalised.

The top level structure of the response is as so:

```json
    {
      "overlay" : {
        "active"  : [
          ...
        ]
      }
    }
```

And there are various forms for each element (connected peer) in `active`:

* With `"ip"` and `"type" : "in"`
```json
    {
      "ip": "24.234.130.12",
      "public_key": "A2JwZ1y3iHno7/faxWfuhLF1skYPhMeLgURxyUzLT93B",
      "type": "in",
      "version": "rippled-0.28.0-b21"
    },
```

* With `"ip"` and `"type" : "out"` and `"port"`
```json
    {
      "ip": "54.186.73.52",
      "port": "51235",
      "public_key": "AjikFnq0P2XybCyREr2KPiqXqJteqwPwVRVbVK+93+3o",
      "type": "out",
      "version": "rippled-0.28.0-rc3"
    },
```

* With `"ip"` and `"type": "peer``
  * Without a port packed in `ip`, the `type` is actually `"in"`
```json
    {
      "ip": "54.164.144.101",
      "public_key": "A8vPtayIaLdyV/2gLkWigyr1vwK2qqrre8ABRh2sXmMT",
      "type": "peer",
      "version": "rippled-0.28.0"
    },
```

* With `"ip"` (with a port)  and `"type": "peer``
  * With a port packed in `ip`, the `type` is  `"out"`
```json
    {
      "ip": "23.239.3.247:51235",
      "public_key": "An366bc/eRsF01nmfnz6j2JnBA7gpSr7BCVygePEoWgs",
      "type": "peer",
      "version": "rippled-0.28.1-b5"
    },
```

* With only `"public_key"" to identify node.

  * Unfortunately we don't know the direction of the connection in these cases
    but sometimes we have the direction information from another peers
    perspective. We may also have the ip from another peers POV.
```json
    {
      "public_key": "An2mhwWHnwzBehh88G+vpwwwqviFAqMl9rjU2PnDELr9",
      "type": "peer",
      "version": "rippled-0.28.0-rc3"
    },
```

See `src/lib/crawler.js@function normalise(resp)`

## Crawling the net and saving to postgresql

1. `node src/crawl.js $entry-ip postgres://postgres:$password@localhost:5432/crawl`

```
................................................................................
Queried: crawl_id/num_peers/num_edges 2 139 2130
```

### Settings (just set/unset env vars)

Boolean flags, set true by presence of environment variable:

* DROP_TABLES
  * Clear the database when connecting, and sync the tables

* LOG_SQL
  * Tell sequelize to log verbosely all queries and ddl

* LOG_CRAWL
  * Log crawl `stuff`

## PostgreSQL Schema

### crawls

|   Column   |           Type           |
|------------|--------------------------|
| entry_ip   | character varying        |
| id         | bigint                   |
| created_at | timestamp with time zone |
| updated_at | timestamp with time zone |

### peers

|     Column      |          Type          |
|-----------------|------------------------|
| id              | bigint                 |
| crawl_id        | bigint (crawls.id fk) |
| public_key      | character              |
| hops_from_entry | integer                |
| reachable       | boolean                |
| version         | character              |
| ip              | character              |
| port            | integer                |
| city            | character              |
| country         | character              |
| region          | character              |

### edges

|  Column  |  Type   |
|----------|---------|
| directed | boolean |
| id       | bigint  |
| crawl_id | bigint (crawls.id fk) |
| from     | bigint (peers.id fk) |
| to       | bigint (peers.id fk) |

## Example Queries

### Find distinct ports from all crawls

```
crawl=# select distinct(port) from peers where port is not null;
 port
-------
 51301
 51235
 19087
(3 rows)
```

### From crawl #6, find peers that have outbound connections to others running 28.0-rc3

```
crawl=#
crawl=# select ip, version, city, country, region from peers
crawl-#   inner join (
crawl(#     select distinct(edges.from) from peers inner join edges on
crawl(#       peers.id = edges.to where
crawl(#         peers.version like '%28.0-rc3%' and
crawl(#         peers.crawl_id = 6 and
crawl(#         edges.crawl_id = 6
crawl(#   )
crawl-#     as towards
crawl-#   on
crawl-#     towards.from = peers.id limit 10;
       ip       |         version         |    city     | country | region
----------------+-------------------------+-------------+---------+--------
 54.164.144.101 | rippled-0.28.0          | Ashburn     | US      | VA
 99.110.49.91   | rippled-0.28.1-b5       | Oakland     | US      | CA
 104.131.13.66  | rippled-0.28.1-b7       | New York    | US      | NY
 24.136.32.6    | rippled-0.28.1-b7+DEBUG | Gainesville | US      | FL
 85.127.255.84  | rippled-0.28.0          | Graz        | AT      | 06
 168.1.6.196    | rippled-0.28.0-rc3      | Sydney      | AU      | 02
 148.251.186.89 | rippled-0.28.0          |             | DE      |
 72.251.233.170 | rippled-0.28.1-b5       | New York    | US      | NY
 168.1.60.132   | rippled-0.27.4          | Sydney      | AU      | 02
 72.251.233.166 | rippled-0.28.0-rc3      | New York    | US      | NY
(10 rows)

```

## Graph analysis

### Use hacky python script to find (entry points view of) graph diameter from crawl #6

`$ python bin/souped.py postgres://postgres:$password@localhost:5432/crawl 6`

```
saved graph to crawl-1.dot
vertices with ip: 80
vertices with reachable ip: 71
vertices: 140
edges: 2194
average degree: 31
average in degree: 8
average out degree: 8
average unknown degree: 13
graph edges (as undirected graph): 2194
graph diameter (as undirected graph): 4
```

### draw a draph with graphviz' neato

The souped (should be called sauced on such a pub crawl) script will dump a
dot file.

1. Install graphviz (brew install graphviz or apt-get $bla)
2. `$ neato crawl-1.dot -Tpdf > crawl-1.pdf && open crawl-1.pdf`

## TODO

- Craft queries to anwser the questions

- Save summary
    - What nodejs graph libaries are there for graph analysis (diameter)?
      - cytoscape

## Done

- Gather peer data keyed by public key and merge all seen data before saving peers
- Use snake_case to play better with `psql`
- Use ip_and_port string as PORT identifier rather than simply ip

- Add database trim
  - very easy to delete, using cascade, via:
    - delete from crawls where created_at $bla;

- Find the actual graph diameter, not just max hop count from entry ip
  - Is that not the same?
    - No
      - V: 1,2,3,4,5  E: 1:*, 5:{4,1}.
    - If you `enter` from a certain point, and only see public keys, you
      can't go any further.
        - Only some nodes respond to /crawl, some timeout, some refuse connection
        - `select max(hops_from_entry) from peers` == 2
        - `networkx.diameter(G)` == 3
          - must convert directed (direction implies inbound/outbound) graph
            to undirected before finding diameter. Seems networkx can only
            move in the right direction.

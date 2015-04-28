# ripple-pub-crawl

This crawls the ripple network, via making requests to the /crawl endpoint of
each peer it can connect to.

## Overview

TODO

## Questions this strives to answer

- What is the total number of unique node public keys (== network size)
- How many nodes on the network are taking incoming connections
- What's the average in degree, out degree
- How many different versions of rippled are on the network
- How many DEBUG versions of rippled are on the network
- How many private rippled instances are on the network
- What is the most number of instances behind the same IP
- Total number of unique port numbers
- Network diameter (max hops, could be fractional)
- Number of distinct public keys per unique IP

TODO

## TODO

- Use ip_and_port string as PORT identifier rather than simply ip

- Craft queries to anwser the question

- Add database trim
  - very easy to delete, using cascade, via:
    - delete from crawls where created_at $bla;

- Save summary
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

    - What nodejs graph libaries are there?
      - cytoscape

## Done

- Gather peer data keyed by public key and merge all seen data before saving peers
- Use snake_case to play better with `psql`
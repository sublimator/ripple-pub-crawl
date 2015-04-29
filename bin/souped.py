from __future__ import print_function
import http_server
import sys
import json

from sqlsoup import SQLSoup
import networkx as nx
from networkx.readwrite import json_graph

def export_to_dot(G, peers, degrees, name):
  degrees = degrees['nodes']
  for n in G:
      G.node[n]['label'] = "%s:%s:%s:%s%s" % (degrees[n]['i'],
                                           degrees[n]['o'],
                                           degrees[n]['u'],
                                           G.degree(n),
                                          ':u' if not
                                               peers[n].reachable else '')

  nx.write_dot(G, name)

  with open(name) as fh:
    header = fh.readline()
    rest = fh.read()

  with open(name, 'w') as fh:
    fh.write(header)
    fh.write('\tgraph [splines=true overlap=false];\n')
    fh.write(rest)

  print('saved graph to', name)

def degree_avg(d):
  return sum(d.values()) / len(d)


def find_degrees(G):
  from collections import defaultdict
  d = defaultdict(lambda: {'i': 0, 'o': 0, 'u': 0})
  for (from_, to)  in G.edges():
    e = G.edge[from_][to]
    if e['directed']:
      d[from_]['o'] += 1
      d[to]['i'] += 1
    else:
      d[from_]['u'] += 1
      d[to]['u'] += 1

  ret = {'nodes': d}
  ret['in_degree_avg'] = sum([r['i'] for r in d.values()]) / len(d)
  ret['out_degree_avg'] = sum([r['o'] for r in d.values()]) / len(d)
  ret['unknown_degree_avg'] = sum([r['u'] for r in d.values()]) / len(d)
  return ret

def main(url, crawl_id):
  G = nx.DiGraph()
  soup = SQLSoup(url)

  peers_with_ip = 0
  reachable_peers = 0

  peers = dict((p.id, p) for p in soup.peers
                 .filter_by(crawl_id=crawl_id).all())
  edges = soup.edges.filter_by(crawl_id=crawl_id).all()

  for p in peers.values():
    if p.reachable: reachable_peers += 1
    if p.ip:        peers_with_ip += 1
    G.add_node(p.id, color= ('blue' if p.ip else
                             'red'  if not p.reachable else
                             'orange'))
  for e in edges:
    G.add_edge(getattr(e, 'from'), e.to,
               directed = e.directed,
               color = ('black' if e.directed else 'red'))

  degrees = find_degrees(G)
  export_to_dot(G, peers, degrees, 'crawl-%d.dot' % crawl_id)

  # TODO: find in degree, out degree, unknown degree for each node

  print('vertices with ip', peers_with_ip)
  print('vertices with reachable ip', peers_with_ip)
  print('vertices', len(G))
  print('edges', G.size())
  print('average degree', degree_avg(G.degree()))
  print('average in degree', degrees['in_degree_avg'])
  print('average out degree', degrees['out_degree_avg'])
  print('average unknown degree', degrees['unknown_degree_avg'])

  G = nx.Graph(G)
  print('graph edges (as undirected graph)', G.size())
  print('graph diameter (as undirected graph)', nx.diameter(G))

if __name__ == '__main__':
  argv = sys.argv[1:]
  main(argv[0], int(argv[1]))
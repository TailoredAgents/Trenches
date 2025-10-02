import http from "http";
import EventSource from "eventsource";
import { createSSEClient, createInMemoryLastEventIdStore } from "@trenches/util";

const port = 5858;
let connections = 0;

const server = http.createServer((req, res) => {
  if (!req.url?.startsWith("/events")) {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  connections += 1;
  const current = connections;
  setTimeout(() => {
    res.write(`data: {"conn":${current}}

`);
    if (current === 1) {
      res.end();
    } else {
      setTimeout(() => {
        res.write('data: {"conn":2,"final":true}

');
        setTimeout(() => {
          res.end();
          server.close();
        }, 50);
      }, 100);
    }
  }, 50);
});

server.listen(port, () => {
  const store = createInMemoryLastEventIdStore();
  const client = createSSEClient(`http://127.0.0.1:${port}/events`, {
    lastEventIdStore: store,
    eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }),
    onOpen: () => console.log('client connected'),
    onError: (err, attempt) => console.log('client error attempt', attempt, err ? (err as any).message ?? String(err) : 'unknown'),
    onEvent: (evt) => {
      console.log('client event', evt.data);
      if (evt.data.includes('final')) {
        client.dispose();
      }
    }
  });
});

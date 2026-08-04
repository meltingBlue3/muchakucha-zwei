import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';

const smtpPort = Number(process.env.TEST_MAILPIT_SMTP_PORT ?? 11025);
const httpPort = Number(process.env.TEST_MAILPIT_HTTP_PORT ?? 18025);
const messages = [];

function handleSmtp(socket) {
  let buffer = '';
  let data = '';
  let receivingData = false;
  socket.setEncoding('utf8');
  socket.write('220 muchakucha e2e mailbox\r\n');
  socket.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\r\n')) {
      const end = buffer.indexOf('\r\n');
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (receivingData) {
        if (line === '.') {
          messages.push(data);
          data = '';
          receivingData = false;
          socket.write('250 queued\r\n');
        } else data += `${line}\n`;
      } else if (/^EHLO /i.test(line)) socket.write('250-muchakucha\r\n250 PIPELINING\r\n');
      else if (/^HELO |^MAIL FROM:|^RCPT TO:|^RSET$/i.test(line)) socket.write('250 ok\r\n');
      else if (/^DATA$/i.test(line)) {
        receivingData = true;
        socket.write('354 end with <CRLF>.<CRLF>\r\n');
      } else if (/^QUIT$/i.test(line)) socket.end('221 bye\r\n');
      else socket.write('250 ok\r\n');
    }
  });
}

const smtpServer = createTcpServer(handleSmtp);
const httpServer = createHttpServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${httpPort}`);
  if (url.pathname === '/readyz') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ready');
    return;
  }
  if (url.pathname === '/messages') {
    if (request.method === 'DELETE') {
      messages.length = 0;
      response.writeHead(204).end();
      return;
    }
    const recipient = url.searchParams.get('recipient') ?? '';
    const path = url.searchParams.get('path') ?? '';
    const matching = messages.filter(
      (message) => message.includes(recipient) && (path === '' || message.includes(path)),
    );
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ messages: matching }));
    return;
  }
  response.writeHead(404).end();
});

smtpServer.listen(smtpPort, '127.0.0.1');
httpServer.listen(httpPort, '127.0.0.1');

function close() {
  smtpServer.close();
  httpServer.close();
}

process.on('SIGINT', close);
process.on('SIGTERM', close);

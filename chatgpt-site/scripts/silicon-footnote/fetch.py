"""Fetch public HTTPS evidence or media. Pin each hop to a validated address."""
import ipaddress
import socket
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

class Article(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript', 'svg'):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'svg'):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.text.append(data)

def retrieve(url, output, limit):
    with tempfile.TemporaryDirectory() as tmp:
        headers = Path(tmp, 'headers')
        for _ in range(6):
            u = urlsplit(url)
            if u.scheme != 'https' or not u.hostname or u.username or u.password or u.port not in (443, None):
                raise ValueError('Expected a public HTTPS URL')
            addresses = socket.getaddrinfo(u.hostname, 443, socket.AF_INET, socket.SOCK_STREAM)
            ip = addresses[0][4][0]
            if not ipaddress.ip_address(ip).is_global:
                raise ValueError('Private addresses cannot be sources')
            result = subprocess.check_output(['curl', '-sS', '--fail', '--noproxy', '*', '--proto', '=https',
                '--connect-timeout', '15', '--max-time', '150', '--max-filesize', str(limit),
                '--resolve', f'{u.hostname}:443:{ip}', '-D', str(headers), '-o', output,
                '-w', '%{response_code}', '--', url], text=True)
            if result == '200':
                return
            location = next((line.partition(':')[2].strip() for line in headers.read_text('latin1').splitlines()
                             if line.lower().startswith('location:')), '')
            if not result.startswith('3') or not location:
                raise ValueError('Unexpected HTTP response ' + result)
            url = urljoin(url, location)
        raise ValueError('Too many redirects')

if __name__ == '__main__':
    url, path, kind = sys.argv[1:]
    retrieve(url, path, 160_000_000 if kind == 'media' else 18_000_000 if kind == 'image' else 5_000_000)
    if kind == 'article':
        parser = Article()
        parser.feed(Path(path).read_text(errors='replace'))
        Path(path).write_text(' '.join(' '.join(parser.text).split()))

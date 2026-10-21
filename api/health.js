export default function handler(req, res) {
  res.status(200).setHeader('Content-Type', 'text/plain');
  res.send('ok');
}

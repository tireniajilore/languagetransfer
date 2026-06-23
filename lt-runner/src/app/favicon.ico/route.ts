const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#c9562c"/>
  <path d="M18 38c4 7 16 8 24 2" fill="none" stroke="#fff7ef" stroke-width="5" stroke-linecap="round"/>
  <path d="M22 24h20" stroke="#fff7ef" stroke-width="5" stroke-linecap="round"/>
</svg>`;

export function GET() {
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'public, max-age=86400'
    }
  });
}

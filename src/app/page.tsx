// src/app/page.tsx
// Root of the API host. It used to render the full endpoint catalogue to anyone
// (SEC-017); the catalogue is now at GET /api/docs for Super Admins only.
export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32, color: '#1f2937' }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>247HR API</h1>
      <p style={{ marginTop: 8 }}>This server provides the 247HR API. There is nothing to see here.</p>
    </main>
  )
}

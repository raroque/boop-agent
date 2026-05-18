import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e0e0e',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 80, marginBottom: 16 }}>🐶</div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#f0f0f0',
            marginBottom: 16,
          }}
        >
          Boop Agent
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#888888',
            textAlign: 'center',
            maxWidth: '800px',
          }}
        >
          A proactive iMessage-based agent built on the Claude Agent SDK
        </div>
        <div
          style={{
            marginTop: 32,
            background: '#f97316',
            color: 'white',
            borderRadius: 8,
            padding: '12px 32px',
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          github.com/raroque/boop-agent
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

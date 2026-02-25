import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
          borderRadius: '36px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {/* Globe circle */}
          <div
            style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontSize: '36px',
                color: 'white',
                fontWeight: 'bold',
                fontFamily: 'sans-serif',
              }}
            >
              G
            </div>
          </div>
          {/* Subtitle lines */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <div
              style={{
                width: '70px',
                height: '5px',
                borderRadius: '3px',
                background: 'rgba(255,255,255,0.9)',
              }}
            />
            <div
              style={{
                width: '50px',
                height: '5px',
                borderRadius: '3px',
                background: 'rgba(255,255,255,0.6)',
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

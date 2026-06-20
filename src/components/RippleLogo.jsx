// Renders the exact uploaded Ripple logo (icon + wordmark lockup PNG).
export default function RippleLogo({ size = 28 }) {
  return (
    <img
      src="/ripple-logo.png"
      alt="ripple"
      className="ripple-logo-img"
      style={{ height: size, width: 'auto' }}
    />
  );
}

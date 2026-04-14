interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = '', size }: LogoProps) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <img
      src="/logo.png"
      alt="Lana"
      className={className}
      style={style}
      draggable={false}
    />
  );
}

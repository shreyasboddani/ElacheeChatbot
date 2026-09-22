import Image from "next/image";

interface BrandLogoProps {
  className?: string;
  decorative?: boolean;
  priority?: boolean;
}

export function ElacheeLogo({
  className,
  decorative = false,
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src="/branding/elachee-logo.png"
      alt={decorative ? "" : "Elachee Nature Science Center"}
      width={524}
      height={182}
      className={className}
      priority={priority}
    />
  );
}

export function LearnAILogo({
  className,
  decorative = false,
}: Omit<BrandLogoProps, "priority">) {
  return (
    <Image
      src="/branding/learnai-logo.png"
      alt={decorative ? "" : "LearnAI"}
      width={1254}
      height={1254}
      className={className}
    />
  );
}
